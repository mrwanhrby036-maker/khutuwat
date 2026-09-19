"use strict";

const crypto = require("node:crypto");

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// Vercel rejects request bodies above 4.5 MB, and base64 adds ~33% overhead,
// so 3 MB of raw image data is the largest size that can actually arrive.
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_BASE64_LENGTH = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;
const MAX_TOKEN_LENGTH = 4096;
const MAX_UID_LENGTH = 128;

const EXTERNAL_REQUEST_TIMEOUT_MS = 15_000;
const CERT_REQUEST_TIMEOUT_MS = 5_000;
const CLOCK_SKEW_SECONDS = 60;
const MIN_CERT_REFETCH_INTERVAL_MS = 60_000;
const DEFAULT_CERT_CACHE_MS = 60 * 60 * 1000;

const GOOGLE_CERTS_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
const IMGBB_UPLOAD_URL = "https://api.imgbb.com/1/upload";
const TRUSTED_IMAGE_HOSTS = new Set(["i.ibb.co", "ibb.co"]);

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;
const BEARER_TOKEN_PATTERN = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/;

const asciiSlice = (buffer, start, end) => buffer.subarray(start, end).toString("latin1");

// The declared MIME type is client-controlled, so it is checked against the real file header.
const IMAGE_SIGNATURE_CHECKS = new Map([
  ["image/jpeg", (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff],
  ["image/png", (bytes) => bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
  ["image/gif", (bytes) => asciiSlice(bytes, 0, 4) === "GIF8"],
  ["image/webp", (bytes) => asciiSlice(bytes, 0, 4) === "RIFF" && asciiSlice(bytes, 8, 12) === "WEBP"],
  ["image/bmp", (bytes) => asciiSlice(bytes, 0, 2) === "BM"]
]);

class HttpError extends Error {
  constructor(status, code) {
    super(code);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function readConfig() {
  const projectId = (process.env.FIREBASE_PROJECT_ID || "").trim();
  const imgbbApiKey = (process.env.IMGBB_API_KEY || "").trim();
  const allowedOrigins = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);

  const missing = [];
  if (!projectId) missing.push("FIREBASE_PROJECT_ID");
  if (!imgbbApiKey) missing.push("IMGBB_API_KEY");
  if (allowedOrigins.size === 0) missing.push("ALLOWED_ORIGINS");
  if (missing.length > 0) {
    console.error("upload-image: missing or invalid configuration:", missing.join(", "));
    throw new HttpError(500, "SERVER_MISCONFIGURED");
  }
  return { projectId, imgbbApiKey, allowedOrigins };
}

function parseAllowedOrigins(rawValue) {
  const origins = new Set();
  for (const candidate of String(rawValue || "").split(",")) {
    const trimmedCandidate = candidate.trim();
    if (!trimmedCandidate) continue;
    try {
      const parsedOrigin = new URL(trimmedCandidate);
      if (parsedOrigin.protocol === "https:" || parsedOrigin.protocol === "http:") {
        origins.add(parsedOrigin.origin);
      }
    } catch {
      console.error("upload-image: ignoring an invalid entry in ALLOWED_ORIGINS");
    }
  }
  return origins;
}

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

function applyCors(request, response, allowedOrigins) {
  response.setHeader("Vary", "Origin");
  const requestOrigin = request.headers.origin;
  if (!requestOrigin) return;
  if (!allowedOrigins.has(requestOrigin)) throw new HttpError(403, "ORIGIN_NOT_ALLOWED");

  response.setHeader("Access-Control-Allow-Origin", requestOrigin);
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  response.setHeader("Access-Control-Max-Age", "600");
}

// ---------------------------------------------------------------------------
// Firebase ID token verification (manual procedure from the Firebase docs,
// so no service-account key or extra dependency is needed)
// ---------------------------------------------------------------------------

let certificateCache = { certificatesByKeyId: null, fetchedAt: 0, expiresAt: 0 };

function extractBearerToken(request) {
  const authorizationHeader = request.headers.authorization;
  if (typeof authorizationHeader !== "string") throw new HttpError(401, "AUTH_REQUIRED");

  const match = BEARER_TOKEN_PATTERN.exec(authorizationHeader);
  if (!match || match[1].length > MAX_TOKEN_LENGTH) throw new HttpError(401, "INVALID_TOKEN");
  return match[1];
}

function decodeJwtSection(section) {
  let parsedSection;
  try {
    parsedSection = JSON.parse(Buffer.from(section, "base64url").toString("utf8"));
  } catch {
    throw new HttpError(401, "INVALID_TOKEN");
  }
  if (!isPlainObject(parsedSection)) throw new HttpError(401, "INVALID_TOKEN");
  return parsedSection;
}

async function refreshGoogleCertificates() {
  let certificateResponse;
  try {
    certificateResponse = await fetch(GOOGLE_CERTS_URL, {
      signal: AbortSignal.timeout(CERT_REQUEST_TIMEOUT_MS)
    });
  } catch (error) {
    console.error("upload-image: could not fetch Google certificates:", error.name);
    throw new HttpError(503, "AUTH_SERVICE_UNAVAILABLE");
  }
  if (!certificateResponse.ok) {
    console.error("upload-image: Google certificates request returned", certificateResponse.status);
    throw new HttpError(503, "AUTH_SERVICE_UNAVAILABLE");
  }

  const certificates = await certificateResponse.json().catch(() => null);
  const isValidCertificateMap =
    isPlainObject(certificates) && Object.values(certificates).every((pem) => typeof pem === "string");
  if (!isValidCertificateMap) {
    console.error("upload-image: unexpected Google certificates payload");
    throw new HttpError(503, "AUTH_SERVICE_UNAVAILABLE");
  }

  const maxAgeMatch = /max-age=(\d+)/.exec(certificateResponse.headers.get("cache-control") || "");
  const cacheDurationMs = maxAgeMatch ? Number(maxAgeMatch[1]) * 1000 : DEFAULT_CERT_CACHE_MS;
  const now = Date.now();
  certificateCache = {
    certificatesByKeyId: new Map(Object.entries(certificates)),
    fetchedAt: now,
    expiresAt: now + cacheDurationMs
  };
}

async function getSigningCertificate(keyId) {
  const now = Date.now();
  const cacheIsEmptyOrExpired = !certificateCache.certificatesByKeyId || now >= certificateCache.expiresAt;
  const mayCheckForRotatedKey =
    certificateCache.certificatesByKeyId &&
    !certificateCache.certificatesByKeyId.has(keyId) &&
    now - certificateCache.fetchedAt >= MIN_CERT_REFETCH_INTERVAL_MS;

  if (cacheIsEmptyOrExpired || mayCheckForRotatedKey) await refreshGoogleCertificates();
  return certificateCache.certificatesByKeyId.get(keyId) || null;
}

function hasValidSignature(signedContent, signature, certificatePem) {
  try {
    return crypto.createVerify("RSA-SHA256").update(signedContent).verify(certificatePem, signature);
  } catch (error) {
    console.error("upload-image: signature verification error:", error.name);
    return false;
  }
}

function assertValidClaims(claims, projectId) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const claimsAreValid =
    Number.isFinite(claims.exp) && claims.exp > nowSeconds &&
    Number.isFinite(claims.iat) && claims.iat <= nowSeconds + CLOCK_SKEW_SECONDS &&
    Number.isFinite(claims.auth_time) && claims.auth_time <= nowSeconds + CLOCK_SKEW_SECONDS &&
    claims.aud === projectId &&
    claims.iss === `https://securetoken.google.com/${projectId}` &&
    typeof claims.sub === "string" && claims.sub.length > 0 && claims.sub.length <= MAX_UID_LENGTH;
  if (!claimsAreValid) throw new HttpError(401, "INVALID_TOKEN");
}

async function verifyFirebaseIdToken(idToken, projectId) {
  const [encodedHeader, encodedPayload, encodedSignature] = idToken.split(".");
  const header = decodeJwtSection(encodedHeader);
  if (header.alg !== "RS256" || typeof header.kid !== "string" || header.kid.length > 128) {
    throw new HttpError(401, "INVALID_TOKEN");
  }

  const certificatePem = await getSigningCertificate(header.kid);
  if (!certificatePem) throw new HttpError(401, "INVALID_TOKEN");

  const signature = Buffer.from(encodedSignature, "base64url");
  if (!hasValidSignature(`${encodedHeader}.${encodedPayload}`, signature, certificatePem)) {
    throw new HttpError(401, "INVALID_TOKEN");
  }

  const claims = decodeJwtSection(encodedPayload);
  assertValidClaims(claims, projectId);
  return { uid: claims.sub };
}

// ---------------------------------------------------------------------------
// Admin authorization (reads admins/{uid} using the caller's own token, so the
// decision is enforced by firestore.rules and no privileged key is required)
// ---------------------------------------------------------------------------

async function assertActiveAdmin({ projectId, uid, idToken }) {
  const adminDocumentUrl =
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}` +
    `/databases/(default)/documents/admins/${encodeURIComponent(uid)}`;

  let adminResponse;
  try {
    adminResponse = await fetch(adminDocumentUrl, {
      headers: { Authorization: `Bearer ${idToken}` },
      signal: AbortSignal.timeout(EXTERNAL_REQUEST_TIMEOUT_MS)
    });
  } catch (error) {
    console.error("upload-image: admin lookup failed:", error.name);
    throw new HttpError(503, "ADMIN_CHECK_UNAVAILABLE");
  }

  if (adminResponse.status === 401) throw new HttpError(401, "INVALID_TOKEN");
  if (adminResponse.status === 403 || adminResponse.status === 404) throw new HttpError(403, "ADMIN_REQUIRED");
  if (!adminResponse.ok) {
    console.error("upload-image: admin lookup returned", adminResponse.status);
    throw new HttpError(503, "ADMIN_CHECK_UNAVAILABLE");
  }

  const adminDocument = await adminResponse.json().catch(() => null);
  if (adminDocument?.fields?.active?.booleanValue !== true) throw new HttpError(403, "ADMIN_REQUIRED");
}

// ---------------------------------------------------------------------------
// Image validation and upload
// ---------------------------------------------------------------------------

function parseImagePayload(requestBody) {
  if (!isPlainObject(requestBody)) throw new HttpError(400, "INVALID_IMAGE");
  const { image: base64Image, type: declaredType } = requestBody;

  if (typeof base64Image !== "string" || typeof declaredType !== "string" || base64Image.length === 0) {
    throw new HttpError(400, "INVALID_IMAGE");
  }
  const signatureCheck = IMAGE_SIGNATURE_CHECKS.get(declaredType);
  if (!signatureCheck) throw new HttpError(400, "INVALID_IMAGE");

  if (base64Image.length > MAX_BASE64_LENGTH) throw new HttpError(413, "IMAGE_TOO_LARGE");
  if (base64Image.length % 4 !== 0 || !BASE64_PATTERN.test(base64Image)) throw new HttpError(400, "INVALID_IMAGE");

  const imageBytes = Buffer.from(base64Image, "base64");
  if (imageBytes.length > MAX_IMAGE_BYTES) throw new HttpError(413, "IMAGE_TOO_LARGE");
  if (!signatureCheck(imageBytes)) throw new HttpError(400, "INVALID_IMAGE");

  return { base64Image, byteLength: imageBytes.length };
}

function toTrustedImageUrl(rawUrl) {
  let parsedUrl;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw new HttpError(502, "IMAGE_UPLOAD_FAILED");
  }
  const isTrusted = parsedUrl.protocol === "https:" && TRUSTED_IMAGE_HOSTS.has(parsedUrl.hostname);
  if (!isTrusted) {
    console.error("upload-image: ImgBB returned an unexpected image host");
    throw new HttpError(502, "IMAGE_UPLOAD_FAILED");
  }
  return parsedUrl.toString();
}

async function uploadToImgBB({ apiKey, base64Image }) {
  let imgbbResponse;
  try {
    imgbbResponse = await fetch(IMGBB_UPLOAD_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ key: apiKey, image: base64Image }),
      signal: AbortSignal.timeout(EXTERNAL_REQUEST_TIMEOUT_MS)
    });
  } catch (error) {
    console.error("upload-image: ImgBB request failed:", error.name);
    throw new HttpError(502, "IMAGE_UPLOAD_FAILED");
  }

  const result = await imgbbResponse.json().catch(() => null);
  if (!imgbbResponse.ok || !result?.success || typeof result?.data?.url !== "string") {
    console.error("upload-image: ImgBB rejected the upload, status", imgbbResponse.status);
    throw new HttpError(502, "IMAGE_UPLOAD_FAILED");
  }
  return toTrustedImageUrl(result.data.url);
}

// ---------------------------------------------------------------------------
// Request handler
// ---------------------------------------------------------------------------

function sendError(response, error) {
  if (error instanceof HttpError) {
    if (error.status === 401) response.setHeader("WWW-Authenticate", "Bearer");
    return response.status(error.status).json({ success: false, error: error.code });
  }
  console.error("upload-image: unexpected error:", error?.name, error?.message);
  return response.status(500).json({ success: false, error: "INTERNAL_ERROR" });
}

module.exports = async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");

  try {
    const config = readConfig();
    applyCors(request, response, config.allowedOrigins);

    if (request.method === "OPTIONS") return response.status(204).end();
    if (request.method !== "POST") {
      response.setHeader("Allow", "POST, OPTIONS");
      throw new HttpError(405, "METHOD_NOT_ALLOWED");
    }

    // Authentication first, so unauthenticated callers learn nothing about payload validation.
    const idToken = extractBearerToken(request);
    const { uid } = await verifyFirebaseIdToken(idToken, config.projectId);
    await assertActiveAdmin({ projectId: config.projectId, uid, idToken });

    if (!/^application\/json\b/i.test(request.headers["content-type"] || "")) {
      throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE");
    }
    const { base64Image, byteLength } = parseImagePayload(request.body);
    const imageUrl = await uploadToImgBB({ apiKey: config.imgbbApiKey, base64Image });

    console.info("upload-image: image uploaded by admin", uid, `${byteLength} bytes`);
    return response.status(200).json({ success: true, data: { url: imageUrl } });
  } catch (error) {
    return sendError(response, error);
  }
};
