"use strict";

// ---------------------------------------------------------------------------
// Same-origin image proxy.
//
// Course and lesson images live on external free image hosts (Postimages/ImgBB).
// Those hosts can be blocked by the visitor's network or an ad-blocker, can answer
// with a hotlink-protection page instead of the image bytes, or can drop a redirect
// in front of the file — every one of those cases shows up in the browser as a
// broken image. Serving the bytes from our own domain removes all of them at once.
// ---------------------------------------------------------------------------

const { parseTrustedImageUrl, extractPageImageUrl } = require("../lib/image-host");

// Vercel caps serverless responses at 4.5 MB, so bigger originals are rejected and the
// page keeps its fallback (the direct link, then a placeholder icon).
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
// Only a little HTML is needed to read the og:image address of a photo page.
const MAX_HTML_BYTES = 512 * 1024;
const FETCH_TIMEOUT_MS = 10_000;
const SUCCESS_CACHE_HEADER = "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=604800";
const ERROR_CACHE_HEADER = "no-store";

const IMAGE_REQUEST_HEADERS = {
  Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
  "User-Agent": "KhutuwatImageProxy/1.0 (+https://khutuwat.vercel.app)"
};

// The declared content type of an external host is not trusted: the real file header decides
// whether these bytes are an image we are willing to hand back to the browser.
const IMAGE_SIGNATURES = [
  { mimeType: "image/jpeg", matches: (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  { mimeType: "image/png", matches: (bytes) => bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mimeType: "image/gif", matches: (bytes) => bytes.subarray(0, 4).toString("latin1") === "GIF8" },
  { mimeType: "image/webp", matches: (bytes) => bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP" },
  { mimeType: "image/bmp", matches: (bytes) => bytes.subarray(0, 2).toString("latin1") === "BM" }
];

function detectImageMimeType(bytes) {
  const signature = IMAGE_SIGNATURES.find((candidate) => candidate.matches(bytes));
  return signature ? signature.mimeType : "";
}

function readRequestedUrl(request) {
  const query = request.query && typeof request.query === "object" ? request.query.u : undefined;
  if (typeof query === "string" && query) return query;
  if (Array.isArray(query) && typeof query[0] === "string") return query[0];
  try {
    return new URL(String(request.url || ""), "https://khutuwat.local").searchParams.get("u") || "";
  } catch {
    return "";
  }
}

// Fetches one trusted address. When the host answers with a photo page instead of the
// image (page links, hotlink protection, redirect in front of the file), the og:image
// address published on that page is fetched once more before giving up.
async function fetchImageBytes(url, allowPageResolve = true) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: IMAGE_REQUEST_HEADERS,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  });
  if (!response.ok) throw new Error("IMAGE_FETCH_FAILED");

  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  const declaredSize = Number(response.headers.get("content-length") || 0);

  if (contentType.startsWith("image/") || (!contentType && !allowPageResolve)) {
    if (declaredSize > MAX_IMAGE_BYTES) throw new Error("IMAGE_TOO_LARGE");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error(bytes.length ? "IMAGE_TOO_LARGE" : "IMAGE_FETCH_FAILED");
    const mimeType = detectImageMimeType(bytes);
    if (!mimeType) throw new Error("IMAGE_FETCH_FAILED");
    return { bytes, mimeType };
  }

  if (!allowPageResolve || !contentType.includes("html") || declaredSize > MAX_HTML_BYTES) {
    throw new Error("IMAGE_FETCH_FAILED");
  }

  const pageImageUrl = parseTrustedImageUrl(extractPageImageUrl(await response.text()));
  if (!pageImageUrl?.isDirect || pageImageUrl.href === url) throw new Error("IMAGE_FETCH_FAILED");
  return fetchImageBytes(pageImageUrl.href, false);
}

function sendJson(response, status, payload, cacheHeader) {
  response.setHeader("Cache-Control", cacheHeader);
  return response.status(status).json(payload);
}

module.exports = async function handler(request, response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    return sendJson(response, 405, { success: false, error: "METHOD_NOT_ALLOWED" }, ERROR_CACHE_HEADER);
  }

  // Only the trusted image hosts may be proxied, so this route can never be used
  // to reach an internal or arbitrary address.
  const requestedUrl = parseTrustedImageUrl(readRequestedUrl(request));
  if (!requestedUrl) {
    return sendJson(response, 400, { success: false, error: "INVALID_IMAGE_URL" }, ERROR_CACHE_HEADER);
  }

  try {
    const { bytes, mimeType } = await fetchImageBytes(requestedUrl.href);
    response.statusCode = 200;
    response.setHeader("Content-Type", mimeType);
    response.setHeader("Content-Length", bytes.length);
    response.setHeader("Cache-Control", SUCCESS_CACHE_HEADER);
    response.setHeader("Content-Disposition", "inline");
    return response.end(bytes);
  } catch (error) {
    console.error("image-proxy: failed for", requestedUrl.host, error?.message);
    return sendJson(response, 502, { success: false, error: "IMAGE_FETCH_FAILED" }, ERROR_CACHE_HEADER);
  }
};
