"use strict";

// ---------------------------------------------------------------------------
// /api/supabase-session
// ---------------------------------------------------------------------------
// خادم Vercel صغير: بيأكد Firebase ID token وبيرجّع Supabase JWT موقّع بـ
// SUPABASE_JWT_SECRET. الموقع بيستخدم الـ JWT ده عشان يتكلم Supabase Postgres
// وبتشتغل سياسات RLS (اللي بتعتمد على Firebase UID جوه claim "sub").
//
// ده بيسمح بتشغيل Firebase (Auth + Storage) و Supabase (قاعدة البيانات) معًا،
// وبكده نهرب من حدود القراءة/الكتابة في Firestore.
//
// منطق التحقق من Firebase مقتبس من api/upload-image.js (نفس الطريقة بدون
// مفتاح service account).
// ---------------------------------------------------------------------------

const crypto = require("node:crypto");

const MAX_TOKEN_LENGTH = 4096;
const MAX_UID_LENGTH = 128;
const CERT_REQUEST_TIMEOUT_MS = 5_000;
const EXTERNAL_REQUEST_TIMEOUT_MS = 15_000;
const CLOCK_SKEW_SECONDS = 60;
const MIN_CERT_REFETCH_INTERVAL_MS = 60_000;
const DEFAULT_CERT_CACHE_MS = 60 * 60 * 1000;

// مدة صلاحية الـ Supabase JWT (ساعة). العميل يعيد الطلب قبل ما تنتهي.
const SUPABASE_TOKEN_TTL_SECONDS = 60 * 60;

const GOOGLE_CERTS_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

const BEARER_TOKEN_PATTERN = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/;

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

class HttpError extends Error {
  constructor(status, code) {
    super(code);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

function readConfig() {
  const projectId = (process.env.FIREBASE_PROJECT_ID || "").trim();
  const jwtSecret = (process.env.SUPABASE_JWT_SECRET || "").trim();
  const allowedOrigins = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);

  const missing = [];
  if (!projectId) missing.push("FIREBASE_PROJECT_ID");
  if (!jwtSecret) missing.push("SUPABASE_JWT_SECRET");
  if (allowedOrigins.size === 0) missing.push("ALLOWED_ORIGINS");
  if (missing.length > 0) {
    console.error("supabase-session: missing configuration:", missing.join(", "));
    throw new HttpError(500, "SERVER_MISCONFIGURED");
  }
  return { projectId, jwtSecret, allowedOrigins };
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
      console.error("supabase-session: ignoring an invalid entry in ALLOWED_ORIGINS");
    }
  }
  return origins;
}

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

// ----- Firebase ID token verification (manual, no service account needed) -----

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
      signal: AbortSignal.timeout(CERT_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    console.error("supabase-session: could not fetch Google certificates:", error.name);
    throw new HttpError(503, "AUTH_SERVICE_UNAVAILABLE");
  }
  if (!certificateResponse.ok) {
    console.error("supabase-session: Google certificates request returned", certificateResponse.status);
    throw new HttpError(503, "AUTH_SERVICE_UNAVAILABLE");
  }

  const certificates = await certificateResponse.json().catch(() => null);
  const isValidCertificateMap =
    isPlainObject(certificates) && Object.values(certificates).every((pem) => typeof pem === "string");
  if (!isValidCertificateMap) {
    console.error("supabase-session: unexpected Google certificates payload");
    throw new HttpError(503, "AUTH_SERVICE_UNAVAILABLE");
  }

  const maxAgeMatch = /max-age=(\d+)/.exec(certificateResponse.headers.get("cache-control") || "");
  const cacheDurationMs = maxAgeMatch ? Number(maxAgeMatch[1]) * 1000 : DEFAULT_CERT_CACHE_MS;
  const now = Date.now();
  certificateCache = {
    certificatesByKeyId: new Map(Object.entries(certificates)),
    fetchedAt: now,
    expiresAt: now + cacheDurationMs,
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
    console.error("supabase-session: signature verification error:", error.name);
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
  return { uid: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
}

// ----- Mint a Supabase-compatible JWT (HS256, signed with SUPABASE_JWT_SECRET) -----

function base64urlEncode(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function mintSupabaseToken({ uid, email, jwtSecret }) {
  const header = { alg: "HS256", typ: "JWT" };
  const nowSeconds = Math.floor(Date.now() / 1000);
  const expiresAt = nowSeconds + SUPABASE_TOKEN_TTL_SECONDS;

  const payload = {
    iss: process.env.SUPABASE_JWT_ISS || "khutuwat-firebase-bridge",
    sub: uid,
    role: "authenticated",
    email: email || null,
    aud: "authenticated",
    iat: nowSeconds,
    exp: expiresAt,
  };

  const signingInput = `${base64urlEncode(header)}.${base64urlEncode(payload)}`;
  const signature = crypto
    .createHmac("sha256", jwtSecret)
    .update(signingInput)
    .digest("base64url");

  return { token: `${signingInput}.${signature}`, expiresAt };
}

// ----- Response helpers -----

function sendError(response, error) {
  if (error instanceof HttpError) {
    if (error.status === 401) response.setHeader("WWW-Authenticate", "Bearer");
    return response.status(error.status).json({ success: false, error: error.code });
  }
  console.error("supabase-session: unexpected error:", error?.name, error?.message);
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

    const idToken = extractBearerToken(request);
    const { uid, email } = await verifyFirebaseIdToken(idToken, config.projectId);
    const { token, expiresAt } = mintSupabaseToken({ uid, email, jwtSecret: config.jwtSecret });

    return response.status(200).json({ success: true, data: { token, expiresAt, uid } });
  } catch (error) {
    return sendError(response, error);
  }
};
