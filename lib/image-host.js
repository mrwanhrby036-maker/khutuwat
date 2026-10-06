"use strict";
// Shared browser/server module: Node uses the crypto package, while browsers use Web Crypto.
const crypto = typeof require === "function" ? require("node:crypto") : globalThis.crypto;

// Direct hosts serve the image bytes themselves, so they are the only hosts that may sit
// inside an <img src>. Page hosts serve an HTML page that *contains* the image; using them
// as an image source is exactly what produces a broken-image icon.
const DIRECT_IMAGE_HOSTS = new Set(["i.postimg.cc", "i.ibb.co"]);
const PAGE_IMAGE_HOSTS = new Set(["postimg.cc", "postimages.org", "ibb.co"]);
const TRUSTED_IMAGE_HOSTS = new Set([...DIRECT_IMAGE_HOSTS, ...PAGE_IMAGE_HOSTS]);
const MAX_IMAGE_URL_LENGTH = 2048;

function isTrustedHost(host, hosts) {
  return hosts.has(host) || [...hosts].some((trusted) => host.endsWith(`.${trusted}`));
}

// Returns { href, host, isDirect } for a trusted image URL, or null when it is not allowed.
function parseTrustedImageUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw || raw.length > MAX_IMAGE_URL_LENGTH) return null;
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    if (!isTrustedHost(host, TRUSTED_IMAGE_HOSTS)) return null;
    return { href: url.toString(), host, isDirect: isTrustedHost(host, DIRECT_IMAGE_HOSTS) };
  } catch {
    return null;
  }
}

function cleanImageUrl(value) {
  return parseTrustedImageUrl(value)?.href || "";
}

function isDirectImageUrl(value) {
  return parseTrustedImageUrl(value)?.isDirect === true;
}

// Same-origin address that streams a trusted image through our own server, so a blocked,
// hotlink-protected, or temporarily unreachable image host can never break the pages.
function buildImageProxyUrl(value) {
  const parsed = parseTrustedImageUrl(value);
  return parsed ? `/api/image?u=${encodeURIComponent(parsed.href)}` : "";
}

function decodeHtml(value) {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

// Reads the og:image address that image hosts publish for their photo pages.
function extractPageImageUrl(html) {
  for (const tag of String(html || "").match(/<meta\b[^>]*>/gi) || []) {
    if (!/(?:property|name)\s*=\s*["']og:image["']/i.test(tag)) continue;
    const content = tag.match(/content\s*=\s*(["'])(.*?)\1/i);
    if (content) return decodeHtml(content[2]);
  }
  return "";
}

// ---------------------------------------------------------------------------
// Server-side helpers (upload route and image proxy)
// ---------------------------------------------------------------------------

function fail(code) { throw new Error(code); }

function trustedUrl(raw, hosts) {
  const parsed = parseTrustedImageUrl(raw);
  if (!parsed || !isTrustedHost(parsed.host, hosts)) fail("INVALID_IMAGE_URL");
  return parsed.href;
}

// Turns a trusted photo-page link into the direct image address published on that page.
async function resolveImageLink(raw) {
  try { return trustedUrl(raw, DIRECT_IMAGE_HOSTS); } catch {}
  const page = trustedUrl(raw, PAGE_IMAGE_HOSTS);
  const response = await fetch(page, { redirect: "error", signal: AbortSignal.timeout(15000) });
  if (!response.ok) fail("IMAGE_LINK_FAILED");
  const imageUrl = extractPageImageUrl(await response.text());
  if (!imageUrl) fail("IMAGE_LINK_FAILED");
  return trustedUrl(imageUrl, DIRECT_IMAGE_HOSTS);
}

async function uploadToPostimages({ apiKey, gallery, base64Image, type }) {
  if (!apiKey) fail("POSTIMAGES_NOT_CONFIGURED");
  const extension = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp", "image/bmp": "bmp" }[type];
  const response = await fetch("https://api.postimage.org/1/upload", {
    method: "POST", redirect: "error",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
    body: new URLSearchParams({ key: apiKey, gallery: gallery || "", o: "2b819584285c102318568238c7d4a4c7", m: "59c2ad4b46b0c1e12d5703302bff0120", version: "1.0.1", portable: "1", name: crypto.randomUUID(), type: extension, image: base64Image }),
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) fail("IMAGE_UPLOAD_FAILED");
  const text = await response.text();
  // Postimages desktop-compatible API returns an XML page link, not ImgBB JSON.
  const page = text.match(/<page>\s*(https:\/\/postimg\.cc\/[A-Za-z0-9]+)\s*<\/page>/i)?.[1];
  if (!page) fail("IMAGE_UPLOAD_FAILED");
  return resolveImageLink(page);
}

const imageHostApi = {
  cleanImageUrl,
  isDirectImageUrl,
  buildImageProxyUrl,
  parseTrustedImageUrl,
  extractPageImageUrl,
  resolveImageLink,
  uploadToPostimages
};
if (typeof module !== "undefined" && module.exports) {
  module.exports = imageHostApi;
} else {
  // Browser pages import this file for the shared URL validator and proxy-URL builder.
  globalThis.KhutuwatImageHost = Object.freeze({ cleanImageUrl, isDirectImageUrl, buildImageProxyUrl });
}
