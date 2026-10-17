// ============================================================================
//  lib/supabase-data.js — طبقة قراءة/كتابة Supabase (بديل/موازي لـ Firestore)
//  Khutuwat — Supabase data adapter (used alongside Firebase Auth + Storage)
// ----------------------------------------------------------------------------
//  - متصل بـ Supabase Postgres اللي مخططه في supabase/schema.sql.
//  - بياخد التوكن من /api/supabase-session (اللي بيحوّل Firebase token لـ Supabase JWT).
//  - مرتبط بـ Firebase Auth: الـ UID هو نفسه Firebase UID (محفوظ كنص في الجداول).
//  - كل الدوال بترجّع null عند الخطأ عشان اللي بيستدعيها يعمل fallback لـ Firebase.
//
//  ملاحظة: السيرفر (api/supabase-session) بيوقّع توكن HS256 بالـ SUPABASE_JWT_SECRET،
//  ولازم السر ده يتطابق مع HS256 Shared Secret بتاع المشروع في Supabase (Settings → JWT Keys).
// ============================================================================

const SUPABASE_JS_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

let supabaseClient = null;
let initPromise = null;

// كائن الإعداد بيتحط في script.js قبل استدعاء initSupabase():
//   window.SUPABASE_CONFIG = { url: "https://xxxx.supabase.co", anonKey: "sb_publishable_..." }
export function initSupabase() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const cfg = typeof window !== "undefined" ? window.SUPABASE_CONFIG : null;
    if (!cfg || !cfg.url || !cfg.anonKey) {
      console.warn("[supabase] SUPABASE_CONFIG غير مضبوط — هتستخدم Firebase كبديل.");
      return false;
    }
    try {
      const { createClient } = await import(/* @vite-ignore */ SUPABASE_JS_URL);
      supabaseClient = createClient(cfg.url, cfg.anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      return true;
    } catch (err) {
      console.error("[supabase] فشل تهيئة العميل:", err);
      supabaseClient = null;
      return false;
    }
  })();
  return initPromise;
}

export function getSupabase() {
  return supabaseClient;
}

export function isSupabaseReady() {
  return supabaseClient !== null;
}

// يحوّل Firebase ID token إلى Supabase JWT ويضبطه على العميل.
export async function bootstrapSession(firebaseIdToken) {
  if (!supabaseClient || !firebaseIdToken) return false;
  try {
    const res = await fetch("/api/supabase-session", {
      method: "POST",
      headers: { Authorization: `Bearer ${firebaseIdToken}` },
    });
    const json = await res.json();
    if (!json?.success || !json?.data?.token) return false;
    const { error } = await supabaseClient.auth.setSession({
      access_token: json.data.token,
      refresh_token: "",
    });
    return !error;
  } catch (err) {
    console.error("[supabase] فشل ضبط الجلسة:", err);
    return false;
  }
}

// ---- تحويل snake_case (قاعدة البيانات) → camelCase (اللي بيستخدمه باقي الكود) ----
const mapCourse = (r) => ({
  id: r.id,
  title: r.title ?? "",
  short: r.short ?? "",
  description: r.description ?? "",
  imageUrl: r.image_url ?? "",
  imagePositionX: r.image_position_x ?? 50,
  imagePositionY: r.image_position_y ?? 50,
  imageZoom: r.image_zoom ?? 100,
  videoCount: r.video_count ?? 0,
  sortOrder: r.sort_order ?? 0,
});

const mapVideo = (r) => ({
  id: r.id,
  title: r.title ?? "",
  instructor: r.instructor ?? "",
  duration: r.duration ?? "",
  imageUrl: r.image_url ?? "",
  imagePositionX: r.image_position_x ?? 50,
  imagePositionY: r.image_position_y ?? 50,
  imageZoom: r.image_zoom ?? 100,
  videoUrl: r.video_url ?? "",
  sortOrder: r.sort_order ?? 0,
});

// ---- قراءات عامة (الكورسات متاحة لـ anon حسب السياسات) ----
export async function getCourses() {
  if (!supabaseClient) return null;
  const { data, error } = await supabaseClient
    .from("courses")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) {
    console.error("[supabase] getCourses:", error.message);
    return null;
  }
  return (data || []).map(mapCourse);
}

export async function getLessons(courseId) {
  if (!supabaseClient || !courseId) return null;
  const { data, error } = await supabaseClient
    .from("videos")
    .select("*")
    .eq("course_id", courseId)
    .order("sort_order", { ascending: true });
  if (error) {
    console.error("[supabase] getLessons:", error.message);
    return null;
  }
  return (data || []).map(mapVideo);
}

// ---- تقدّم الطالب (محتاج جلسة مسجّل) ----
export async function getProgress(uid, courseId) {
  if (!supabaseClient || !uid || !courseId) return null;
  const { data, error } = await supabaseClient
    .from("progress")
    .select("*")
    .eq("student_uid", uid)
    .eq("course_id", courseId)
    .maybeSingle();
  if (error) {
    console.error("[supabase] getProgress:", error.message);
    return null;
  }
  return data
    ? {
        completedLessonIds: data.completed_lesson_ids ?? [],
        completedCount: data.completed_count ?? 0,
        totalLessons: data.total_lessons ?? 0,
        percent: data.percent ?? 0,
      }
    : null;
}

export async function saveProgress({
  uid,
  email,
  courseId,
  courseTitle,
  completedLessonIds,
  totalLessons,
  percent,
}) {
  if (!supabaseClient || !uid || !courseId) return false;
  const docId = `${uid}_${courseId}`;
  const { error } = await supabaseClient.from("progress").upsert(
    {
      id: docId,
      student_uid: uid,
      student_email: email ?? null,
      course_id: courseId,
      course_title: courseTitle ?? "",
      completed_lesson_ids: completedLessonIds ?? [],
      completed_count: completedLessonIds?.length ?? 0,
      total_lessons: totalLessons ?? 0,
      percent: percent ?? 0,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  if (error) {
    console.error("[supabase] saveProgress:", error.message);
    return false;
  }
  return true;
}

// ---- التقييمات (العامة approved، والكتابة للطالب المسجّل) ----
export async function getReviews() {
  if (!supabaseClient) return null;
  const { data, error } = await supabaseClient
    .from("reviews")
    .select("*")
    .eq("status", "approved")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[supabase] getReviews:", error.message);
    return null;
  }
  return (data || []).map((r) => ({
    id: r.id,
    studentUid: r.student_uid,
    studentEmail: r.student_email,
    rating: r.rating,
    comment: r.comment,
    status: r.status,
    createdAt: r.created_at,
  }));
}

export async function addReview({ uid, email, rating, comment }) {
  if (!supabaseClient || !uid) return false;
  const { error } = await supabaseClient.from("reviews").insert({
    id: `${uid}_${Date.now()}`,
    student_uid: uid,
    student_email: email ?? null,
    rating,
    comment,
    status: "pending",
    created_at: new Date().toISOString(),
  });
  if (error) {
    console.error("[supabase] addReview:", error.message);
    return false;
  }
  return true;
}
