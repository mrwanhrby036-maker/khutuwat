const MAX_IMAGE_BYTES = 32 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/bmp"
]);

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ success: false, error: "METHOD_NOT_ALLOWED" });
  }

  const { image, type } = request.body || {};
  if (typeof image !== "string" || !ALLOWED_TYPES.has(type)) {
    return response.status(400).json({ success: false, error: "INVALID_IMAGE" });
  }

  const imageBytes = Math.ceil((image.length * 3) / 4);
  if (imageBytes > MAX_IMAGE_BYTES || image.length > 45 * 1024 * 1024) {
    return response.status(413).json({ success: false, error: "IMAGE_TOO_LARGE" });
  }

  const body = new URLSearchParams({
    key: process.env.IMGBB_API_KEY || "",
    image
  });
  const imgbbResponse = await fetch("https://api.imgbb.com/1/upload", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const result = await imgbbResponse.json().catch(() => null);

  if (!imgbbResponse.ok || !result?.success || !result?.data?.url) {
    return response.status(502).json({ success: false, error: "IMAGE_UPLOAD_FAILED" });
  }

  return response.status(200).json({
    success: true,
    data: { url: result.data.url }
  });
}
