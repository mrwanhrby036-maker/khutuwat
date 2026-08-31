const admin = require("firebase-admin");

const DOC_ID_PATTERN = /^[A-Za-z0-9_-]{1,160}$/;
const MAX_REQUEST_BODY_BYTES = 2048;

function initializeFirebaseAdmin() {
  if (admin.apps.length) return;

  const encodedServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!encodedServiceAccount) {
    throw new Error("Missing Firebase service account configuration");
  }

  const serviceAccountJson = Buffer.from(encodedServiceAccount, "base64").toString("utf8");
  const serviceAccount = JSON.parse(serviceAccountJson);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

function sendJson(response, statusCode, responseBody) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.status(statusCode).send(JSON.stringify(responseBody));
}

function parseRequestBody(request) {
  if (typeof request.body === "object" && request.body !== null) return request.body;
  if (typeof request.body !== "string") return {};
  if (Buffer.byteLength(request.body, "utf8") > MAX_REQUEST_BODY_BYTES) {
    throw new Error("REQUEST_TOO_LARGE");
  }
  return JSON.parse(request.body);
}

function getBearerToken(request) {
  const authorizationHeader = request.headers.authorization || "";
  const [scheme, token] = authorizationHeader.split(" ");
  if (scheme !== "Bearer" || !token) return "";
  return token;
}

function isSafeDocumentId(value) {
  return DOC_ID_PATTERN.test(String(value || ""));
}

function toSafeHttpsUrl(value) {
  const rawUrl = String(value || "").trim();
  if (!rawUrl || rawUrl.length > 2048) return "";
  try {
    const parsedUrl = new URL(rawUrl);
    if (parsedUrl.protocol !== "https:") return "";
    if (parsedUrl.username || parsedUrl.password) return "";
    return parsedUrl.toString();
  } catch {
    return "";
  }
}

function isGumletEmbedUrl(value) {
  try {
    const parsedUrl = new URL(value);
    return parsedUrl.hostname.toLowerCase() === "play.gumlet.io" && parsedUrl.pathname.startsWith("/embed/");
  } catch {
    return false;
  }
}

function addViewerWatermark(videoUrl, userEmail) {
  if (!isGumletEmbedUrl(videoUrl) || !userEmail) return videoUrl;
  const parsedUrl = new URL(videoUrl);
  parsedUrl.searchParams.set("watermark_text", userEmail);
  return parsedUrl.toString();
}

module.exports = async function getVideoAccess(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { error: "method_not_allowed" });
  }

  try {
    initializeFirebaseAdmin();

    const idToken = getBearerToken(request);
    if (!idToken) {
      return sendJson(response, 401, { error: "unauthorized" });
    }

    const decodedToken = await admin.auth().verifyIdToken(idToken, true);
    const requestBody = parseRequestBody(request);
    const courseId = String(requestBody.courseId || "");
    const videoId = String(requestBody.videoId || "");

    if (!isSafeDocumentId(courseId) || !isSafeDocumentId(videoId)) {
      return sendJson(response, 400, { error: "invalid_request" });
    }

    const firestore = admin.firestore();
    const publicLessonSnapshot = await firestore
      .doc(`courses/${courseId}/videos/${videoId}`)
      .get();

    if (!publicLessonSnapshot.exists) {
      return sendJson(response, 404, { error: "video_not_found" });
    }

    const secretVideoSnapshot = await firestore
      .doc(`videoSecrets/${courseId}/videos/${videoId}`)
      .get();

    const privateVideoUrl = toSafeHttpsUrl(secretVideoSnapshot.data()?.videoUrl);
    if (!secretVideoSnapshot.exists || !privateVideoUrl) {
      return sendJson(response, 404, { error: "video_not_found" });
    }

    const embedUrl = addViewerWatermark(privateVideoUrl, decodedToken.email || decodedToken.uid);
    return sendJson(response, 200, { embedUrl });
  } catch (error) {
    console.error("get-video-access failed", error?.code || error?.message || error);
    return sendJson(response, 500, { error: "internal_error" });
  }
};
