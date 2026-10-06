"use strict";
// Shared browser/server module: Node uses the crypto package, while browsers use Web Crypto.
const crypto = typeof require === "function" ? require("node:crypto") : globalThis.crypto;
const TRUSTED_IMAGE_HOSTS = new Set([
  "i.postimg.cc", "postimg.cc", "postimages.org", "i.ibb.co", "ibb.co"
]);
const MAX_IMAGE_URL_LENGTH = 2048;

function cleanImageUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw || raw.length > MAX_IMAGE_URL_LENGTH) return "";
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const trustedHost = TRUSTED_IMAGE_HOSTS.has(host)
      || [...TRUSTED_IMAGE_HOSTS].some((trusted) => host.endsWith(`.${trusted}`));
    if (url.protocol !== "https:" || url.username || url.password || url.port || !trustedHost) return "";
    return url.toString();
  } catch {
    return "";
  }
}
const DIRECT_HOSTS = new Set(["i.postimg.cc", "i.ibb.co"]);
const PAGE_HOSTS = new Set(["postimg.cc", "postimages.org", "www.postimages.org", "ibb.co"]);
function fail(code) { throw new Error(code); }
function trustedUrl(raw, hosts) {
  let url;
  try { url = new URL(raw); } catch { fail("INVALID_IMAGE_URL"); }
  if (url.protocol !== "https:" || url.username || url.password || url.port || !hosts.has(url.hostname)) fail("INVALID_IMAGE_URL");
  return url.href;
}
function decodeHtml(value) {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}
async function resolveImageLink(raw) {
  try { return trustedUrl(raw, DIRECT_HOSTS); } catch {}
  const page = trustedUrl(raw, PAGE_HOSTS);
  const response = await fetch(page, { redirect: "error", signal: AbortSignal.timeout(15000) });
  if (!response.ok) fail("IMAGE_LINK_FAILED");
  const html = await response.text();
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    if (!/(?:property|name)\s*=\s*["']og:image["']/i.test(tag)) continue;
    const content = tag.match(/content\s*=\s*(["'])(.*?)\1/i);
    if (content) return trustedUrl(decodeHtml(content[2]), DIRECT_HOSTS);
  }
  fail("IMAGE_LINK_FAILED");
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
const imageHostApi = { cleanImageUrl, resolveImageLink, uploadToPostimages };
if (typeof module !== "undefined" && module.exports) {
  module.exports = imageHostApi;
} else {
  // Browser pages import this file for the shared URL validator only.
  globalThis.KhutuwatImageHost = Object.freeze({ cleanImageUrl });
}
