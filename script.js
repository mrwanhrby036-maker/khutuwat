// ===== استيراد Firebase =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ===== إعدادات Firebase =====
const firebaseConfig = {
  apiKey: "AIzaSyD1QN_bG2U_eNJ-lH5xlCZK4qjxvbvJRU4",
  authDomain: "chatapp-e8283.firebaseapp.com",
  projectId: "chatapp-e8283",
  storageBucket: "chatapp-e8283.firebasestorage.app",
  messagingSenderId: "456910182070",
  appId: "1:456910182070:web:2976378ec5e206a3867817"
};

// ===== تهيئة Firebase =====
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ===== الكورسات بتتقرا من Firebase Firestore =====
// إدارة الكورسات والفيديوهات تتم من لوحة الأدمن (ملف محلي غير منشور)
// الحماية: بيانات الكورس العامة للعرض، والفيديوهات للمسجلين فقط (قواعد Firestore)
let COURSES = [];
// ===== المتغيرات العامة =====
let currentUser = null;
let sections = ["home", "courses", "features"];
let currentSectionIndex = 0;
let pendingCourseEnter = false;

// ===== بداية التشغيل =====
window.addEventListener("load", () => {
  createParticles();
  renderCourseShowcase();
  loadCoursesFromFirestore();
  runIntro();
});

// ===== مقدمة الفضاء الذهبي 3D (من 0 إلى 6 ثواني) =====
const INTRO_MS = 6000;
let introDone = false;
let introRAF = null;

function revealPlatform() {
  if (introDone) return;
  introDone = true;
  if (introRAF) cancelAnimationFrame(introRAF);
  const intro = document.getElementById("intro3d");
  if (intro) {
    intro.classList.add("out");
    setTimeout(() => (intro.style.display = "none"), 750);
  }
  document.body.classList.add("revealed");
  document.body.style.overflow = "";
  initObserver();
}

function runIntro() {
  const intro = document.getElementById("intro3d");
  if (!intro) {
    revealPlatform();
    return;
  }
  document.body.style.overflow = "hidden";
  document
    .getElementById("introSkipBtn")
    ?.addEventListener("click", revealPlatform);

  // احترام تفضيل تقليل الحركة في المتصفح
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    revealPlatform();
    return;
  }

  // أمان: لو حصل أي خطأ في المقدمة → المنصة تظهر عادي
  try {
    Promise.race([
      document.fonts?.ready || Promise.resolve(),
      new Promise((r) => setTimeout(r, 700))
    ]).then(() => {
      try {
        startIntroCanvas();
      } catch (e) {
        console.error(e);
      }
    });
  } catch (e) {
    console.error(e);
  }

  setTimeout(revealPlatform, INTRO_MS);
}

// عيّنات نقاط من نص العنوان عشان الجزيئات تكوّنه (مع حلقة احتياطية)
function sampleTitleTargets() {
  const pts = [];
  try {
    const w = 660, h = 150;
    const oc = document.createElement("canvas");
    oc.width = w;
    oc.height = h;
    const octx = oc.getContext("2d");
    octx.fillStyle = "#fff";
    octx.font = '900 74px "Reem Kufi", Tajawal, sans-serif';
    octx.textAlign = "center";
    octx.textBaseline = "middle";
    octx.fillText("خطوات نحو التميز", w / 2, h / 2);
    const data = octx.getImageData(0, 0, w, h).data;
    for (let y = 0; y < h; y += 4)
      for (let x = 0; x < w; x += 4)
        if (data[(y * w + x) * 4 + 3] > 130)
          pts.push({ x: x - w / 2, y: y - h / 2 });
  } catch (e) {}

  if (pts.length < 40) {
    pts.length = 0;
    for (let i = 0; i < 260; i++) {
      const a = (i / 260) * Math.PI * 2;
      pts.push({ x: Math.cos(a) * 175, y: Math.sin(a) * 72 });
    }
  }
  for (let i = pts.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [pts[i], pts[j]] = [pts[j], pts[i]];
  }
  return pts.slice(0, window.innerWidth < 600 ? 220 : 380);
}

function startIntroCanvas() {
  const cv = document.getElementById("introCanvas");
  if (!cv) return;
  const ctx = cv.getContext("2d");
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  let W = window.innerWidth, H = window.innerHeight;

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    cv.width = W * DPR;
    cv.height = H * DPR;
    cv.style.width = W + "px";
    cv.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  resize();
  window.addEventListener("resize", resize);

  const GOLD = ["255,215,0", "255,165,0", "255,229,92", "255,255,255"];
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = () => GOLD[(Math.random() * GOLD.length) | 0];
  const t0 = performance.now();
  const FLY_START = 1200, HOLD_END = 5400;

  // غبار خلفي بعمق (بارالاكس) بيتحرك على مهله
  const dust = Array.from(
    { length: Math.round((W * H) / 16000) + 40 },
    () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      z: rnd(0.25, 1),
      r: rnd(0.6, 1.9),
      vx: rnd(-0.1, 0.1),
      vy: rnd(-0.22, -0.05),
      tw: Math.random() * Math.PI * 2,
      c: pick()
    })
  );

  // جزيئات التكوين: بتنطلق من أطراف الفضاء نحو عيّنات نص العنوان
  const formers = sampleTitleTargets().map((t) => {
    const a = Math.random() * Math.PI * 2;
    const r = Math.max(W, H) * rnd(0.6, 0.95);
    return {
      sx: W / 2 + Math.cos(a) * r,
      sy: H * 0.47 + Math.sin(a) * r,
      tx: W / 2 + t.x,
      ty: H * 0.47 + t.y,
      d: rnd(1100, 2100),
      delay: rnd(0, 650),
      size: rnd(0.9, 2.3),
      tw: Math.random() * Math.PI * 2,
      c: pick()
    };
  });

  const ease = (p) =>
    p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

  function frame(now) {
    if (introDone) return;
    const t = now - t0;
    ctx.clearRect(0, 0, W, H);

    // الغبار الخلفي
    for (const p of dust) {
      p.x += p.vx * p.z * 2;
      p.y += p.vy * p.z * 2;
      if (p.y < -10) { p.y = H + 10; p.x = Math.random() * W; }
      if (p.x < -10) p.x = W + 10;
      if (p.x > W + 10) p.x = -10;
      const a = (0.12 + 0.3 * p.z) * (0.6 + 0.4 * Math.sin(t * 0.002 + p.tw));
      ctx.beginPath();
      ctx.fillStyle = `rgba(${p.c},${a})`;
      ctx.arc(p.x, p.y, p.r * p.z, 0, 7);
      ctx.fill();
    }

    // جزيئات التكوين: طيران ← تجمع ولمعان ← تحرر
    for (const p of formers) {
      const raw = (t - FLY_START - p.delay) / p.d;
      if (raw < 0) continue;
      const e = ease(Math.min(raw, 1));
      let x = p.sx + (p.tx - p.sx) * e;
      let y = p.sy + (p.ty - p.sy) * e;
      let a;
      if (raw < 1) {
        a = Math.min(raw * 4, 1) * 0.95;
      } else if (t < HOLD_END) {
        x += Math.cos(p.tw + t * 0.0012) * 3;
        y += Math.sin(p.tw + t * 0.0011) * 3;
        a = 0.6 + 0.35 * Math.sin(t * 0.006 + p.tw);
      } else {
        const k = Math.min((t - HOLD_END) / 700, 1);
        const dx = p.tx - W / 2;
        const dy = p.ty - H * 0.47;
        const len = Math.hypot(dx, dy) || 1;
        x += (dx / len) * k * 90;
        y += (dy / len) * k * 90;
        a = 0.95 * (1 - k);
      }
      const sz = p.size * (1 - 0.35 * (1 - e));
      ctx.beginPath();
      ctx.fillStyle = `rgba(${p.c},${Math.max(a, 0)})`;
      ctx.arc(x, y, sz, 0, 7);
      ctx.fill();
    }

    // نبضة حلقة ذهبية عند لحظة اللمعة
    if (t > 4500 && t < 5200) {
      const k = (t - 4500) / 700;
      ctx.beginPath();
      ctx.strokeStyle = `rgba(255,215,0,${0.5 * (1 - k)})`;
      ctx.lineWidth = 2;
      ctx.arc(W / 2, H * 0.47, 60 + k * Math.max(W, H) * 0.55, 0, 7);
      ctx.stroke();
    }

    introRAF = requestAnimationFrame(frame);
  }
  introRAF = requestAnimationFrame(frame);
}

function updateCurrentSection() {
  const pos = window.scrollY + 150;
  for (let i = 0; i < sections.length; i++) {
    const s = document.getElementById(sections[i]);
    if (s) {
      const top = s.offsetTop;
      const bottom = top + s.offsetHeight;
      if (pos >= top && pos < bottom) {
        currentSectionIndex = i;
        break;
      }
    }
  }
}

window.addEventListener("scroll", () => {
  updateCurrentSection();
  const nav = document.getElementById("navbar");
  nav.classList.toggle("scrolled", window.scrollY > 50);
  document
    .getElementById("scrollTopBtn")
    .classList.toggle("visible", window.scrollY > 400);
  updateActiveLink();
});

// ===== دالة مساعدة =====
function escapeHtml(t) {
  const d = document.createElement("div");
  d.textContent = t;
  return d.innerHTML;
}

// ===== أيقونة/صورة الكورس: بتعرض imageUrl لو موجودة، وإلا إيموجي افتراضي =====
// (الكورسات القديمة كانت بتتخزن بحقل icon، دلوقتي بتتخزن بحقل imageUrl)
function courseThumbHtml(c) {
  return c.imageUrl
    ? `<img class="course-thumb-img" src="${escapeHtml(c.imageUrl)}" alt="" loading="lazy">`
    : "📚";
}

// ===== تحويل لينكات الفيديو لصيغة التشغيل (يوتيوب / درايف) =====
function toEmbedUrl(url) {
  try {
    const u = new URL(url);
    const h = u.hostname.replace(/^www\./, "");
    // يوتيوب
    if (h === "youtu.be") {
      return "https://www.youtube.com/embed" + u.pathname;
    }
    if (h.endsWith("youtube.com")) {
      if (u.pathname === "/watch") {
        return (
          "https://www.youtube.com/embed/" + (u.searchParams.get("v") || "")
        );
      }
      if (u.pathname.startsWith("/shorts/")) {
        return "https://www.youtube.com/embed/" + u.pathname.split("/")[2];
      }
      if (u.pathname.startsWith("/live/")) {
        return "https://www.youtube.com/embed/" + u.pathname.split("/")[2];
      }
      if (u.pathname.startsWith("/embed/")) {
        return url;
      }
    }
    // جوجل درايف
    if (h.endsWith("drive.google.com")) {
      const m = url.match(/\/file\/d\/([^/]+)/) || url.match(/[?&]id=([^&]+)/);
      if (m) {
        return "https://drive.google.com/file/d/" + m[1] + "/preview";
      }
    }
    // Gumlet
    if (h === "play.gumlet.io" && u.pathname.startsWith("/embed/")) {
      return url;
    }
    if (h.endsWith("gumlet.tv") && u.pathname.startsWith("/watch/")) {
      return "https://play.gumlet.io/embed/" + u.pathname.split("/")[2];
    }
    return null; // مش لينك تشغيل مباشر → هنستخدم مشغل فيديو عادي
  } catch {
    return null;
  }
}

// ===== تحميل الكورسات من Firestore (بيانات العرض العامة) =====
async function loadCoursesFromFirestore() {
  try {
    const snap = await getDocs(
      query(collection(db, "courses"), orderBy("order"))
    );
    COURSES = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      videos: null
    }));
    renderCourseShowcase();
  } catch (e) {
    console.error("تعذر تحميل الكورسات من Firestore:", e);
  }
}

// ===== عارضة الكورسات المقفولة (في قسم الكورسات) =====
function renderCourseShowcase() {
  const wrap = document.getElementById("courseCards");
  if (!wrap) return;
  if (!COURSES.length) {
    wrap.innerHTML =
      '<div class="ca-empty" style="grid-column:1/-1;">📚 الكورسات قريباً.. تابعونا!</div>';
    return;
  }
  wrap.innerHTML = COURSES.map(
    (c) => `
        <div class="course-lock-card">
          <div class="course-lock-badge">🔒 كورس مغلق</div>
          <div class="course-lock-icon">${courseThumbHtml(c)}</div>
          <h3 class="course-lock-title">${escapeHtml(c.title)}</h3>
          <p class="course-lock-desc">${escapeHtml(c.short)}</p>
          <div class="course-lock-meta">🎬 ${c.videoCount ?? 0} فيديو</div>
          <button class="btn btn-gold course-enter-btn" data-course="${c.id}">
            <i class="fas fa-lock-open"></i>دخول الكورس
          </button>
        </div>
    `
  ).join("");
  wrap.querySelectorAll(".course-enter-btn").forEach((btn) => {
    btn.addEventListener("click", enterCourse);
  });
}

function enterCourse() {
  if (!currentUser) {
    showToast(
      "info",
      "🔐 كورس مغلق",
      "ادخل بالبريد وكلمة المرور اللي وصلولك من الإدارة"
    );
    openAuthModal();
    return;
  }
  openCourseArea();
}

// ===== منطقة الكورسات الخاصة (معزولة عن المنصة) =====
// حالة التنقل جوه المنطقة: قائمة الكورسات ← دروس الكورس ← تشغيل فيديو
const caState = { demo: false, courseIdx: null, videoIdx: null };

function openCourseArea(demo = false) {
  const area = document.getElementById("courseArea");
  if (!area) return;
  caState.demo = demo;
  renderCoursesList();
  area.classList.add("open");
  document.body.style.overflow = "hidden";
  area.scrollTop = 0;
}

function caRender(html) {
  const area = document.getElementById("courseArea");
  const main = document.getElementById("caMain");
  if (!area || !main) return;
  const who = caState.demo
    ? '🧪 وضع المعاينة التجريبية — <span class="ca-user-email">بدون تسجيل دخول</span>'
    : `مسجّل دخول باسم: <span class="ca-user-email">${escapeHtml(
        currentUser?.email || ""
      )}</span>`;
  main.innerHTML = `
      <div class="ca-welcome">
        <h1>🎓 كورساتك الخاصة</h1>
        <p>${who}</p>
      </div>${html}`;
  area.scrollTop = 0;
}

// 1) شاشة اختيار الكورس
function renderCoursesList() {
  caState.courseIdx = null;
  caState.videoIdx = null;
  const html = COURSES.length
    ? `<div class="ca-grid">` +
      COURSES.map(
        (c, i) => `
        <div class="ca-pick-card">
          <div class="ca-pick-icon">${courseThumbHtml(c)}</div>
          <h3>${escapeHtml(c.title)}</h3>
          <p>${escapeHtml(c.short)}</p>
          <div class="ca-pick-meta">🎬 ${c.videoCount ?? 0} فيديو</div>
          <button class="btn btn-gold ca-open-course" data-idx="${i}">عرض الدروس</button>
        </div>`
      ).join("") +
      `</div>`
    : '<div class="ca-empty">📭 لا توجد كورسات متاحة حالياً</div>';
  caRender(html);
  document.querySelectorAll(".ca-open-course").forEach((b) =>
    b.addEventListener("click", () =>
      renderCourseLessons(Number(b.dataset.idx))
    )
  );
}

// 2) شاشة دروس الكورس (الفيديوهات بتتقرا من Firestore - للمسجلين فقط)
function renderCourseLessons(idx) {
  const c = COURSES[idx];
  if (!c) return;
  caState.courseIdx = idx;
  caState.videoIdx = null;
  if (!c.videos) {
    caRender(
      lessonsShell(c, '<div class="ca-empty">⏳ جاري تحميل الدروس...</div>')
    );
    loadLessons(idx);
    return;
  }
  paintLessons(idx);
}

async function loadLessons(idx) {
  const c = COURSES[idx];
  if (!c) return;
  try {
    const snap = await getDocs(
      query(collection(db, "courses", c.id, "videos"), orderBy("order"))
    );
    c.videos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    c.loadError = false;
  } catch (e) {
    console.error(e);
    c.videos = [];
    c.loadError = true;
  }
  if (caState.courseIdx === idx) paintLessons(idx);
}

function lessonsShell(c, inner) {
  return `
    <button class="ca-back">← كل الكورسات</button>
    <div class="ca-course">
      <h2 class="ca-course-title">${courseThumbHtml(c)} ${escapeHtml(c.title)}</h2>
      <p class="ca-course-desc">${escapeHtml(c.description)}</p>
      ${inner}
    </div>`;
}

function paintLessons(idx) {
  const c = COURSES[idx];
  if (!c) return;
  let inner;
  if (c.loadError) {
    inner =
      '<div class="ca-empty">🔒 الدروس محمية — سجل الدخول بالبيانات اللي وصلولك لتشاهدها</div>';
  } else if (!c.videos || !c.videos.length) {
    inner = '<div class="ca-empty">📭 لا توجد فيديوهات في الكورس ده لسه</div>';
  } else {
    inner =
      '<div class="lesson-list">' +
      c.videos
        .map(
          (v, i) => `
          <div class="lesson-row" data-c="${idx}" data-v="${i}">
            <div class="lesson-thumb"><span>▶</span><small>شاهد</small></div>
            <div class="lesson-info">
              <div class="lesson-title">
                <span class="lesson-num">${i + 1}</span>${escapeHtml(v.title)}
              </div>
              <div class="lesson-meta">
                <span>👤 ${escapeHtml(v.instructor || "غير محدد")}</span>
                <span>⏱ ${escapeHtml(v.duration || "—")}</span>
              </div>
            </div>
          </div>`
        )
        .join("") +
      '</div>';
  }
  caRender(lessonsShell(c, inner));
  document
    .querySelector(".ca-back")
    ?.addEventListener("click", renderCoursesList);
  document.querySelectorAll(".lesson-row").forEach((r) =>
    r.addEventListener("click", () =>
      openLesson(Number(r.dataset.c), Number(r.dataset.v))
    )
  );
}

// 3) شاشة تشغيل الدرس
function openLesson(ci, vi) {
  const c = COURSES[ci];
  const v = c?.videos?.[vi];
  if (!c || !v) return;
  caState.videoIdx = vi;

  let embed = toEmbedUrl(v.videoUrl);
  // علامة مائية بإيميل الطالب على مشغل Gumlet (لو مفعّلتها من إعدادات Gumlet)
  if (
    embed &&
    embed.includes("play.gumlet.io/embed") &&
    currentUser?.email &&
    !caState.demo
  ) {
    embed +=
      (embed.includes("?") ? "&" : "?") +
      "watermark_text=" +
      encodeURIComponent(currentUser.email);
  }
  const player = embed
    ? `<iframe src="${embed}" title="${escapeHtml(
        v.title
      )}" referrerpolicy="origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen></iframe>`
    : `<video controls preload="metadata" src="${v.videoUrl}"></video>`;

  const html = `
    <button class="ca-back">← دروس الكورس</button>
    <div class="ca-course">
      <h2 class="ca-course-title">🎬 ${escapeHtml(v.title)}</h2>
      <div class="lesson-meta" style="margin-bottom:15px;">
        <span>👤 ${escapeHtml(v.instructor || "غير محدد")}</span>
        <span>⏱ ${escapeHtml(v.duration || "—")}</span>
      </div>
      <div class="ca-video" id="caVideoBox">${player}</div>
      <div class="ca-video-tools">
        <button class="ca-fs-btn" id="caFsBtn">⛶ ملء الشاشة</button>
      </div>
    </div>`;
  caRender(html);
  document
    .querySelector(".ca-back")
    ?.addEventListener("click", () => renderCourseLessons(ci));
  document
    .getElementById("caFsBtn")
    ?.addEventListener("click", toggleVideoFullscreen);
}

// ===== ملء الشاشة لمشغل الفيديو =====
function toggleVideoFullscreen() {
  const box = document.getElementById("caVideoBox");
  if (!box) return;

  const isFs =
    document.fullscreenElement || document.webkitFullscreenElement;
  if (isFs) {
    (
      document.exitFullscreen || document.webkitExitFullscreen
    )?.call(document);
    return;
  }

  const fsEnabled =
    document.fullscreenEnabled || document.webkitFullscreenEnabled;
  if (!fsEnabled) {
    showToast(
      "info",
      "⛶ ملء الشاشة",
      "النافذة الحالية بتمنع التكبير — افتح الموقع في تاب جديد لوحده وهيشتغل 100%"
    );
    return;
  }

  const req = box.requestFullscreen || box.webkitRequestFullscreen;
  if (req) {
    const p = req.call(box);
    if (p && p.catch)
      p.catch(() =>
        showToast("error", "⚠️ خطأ", "المتصفح رفض ملء الشاشة.. جرب تاني")
      );
  }
}

// ===== احتفال نجاح الدخول للكورسات =====
let confettiRAF = null;

function playEnterCelebration() {
  const ov = document.getElementById("caCelebrate");
  if (!ov) {
    openCourseArea();
    return;
  }
  ov.classList.add("show");
  try {
    startConfetti();
  } catch (e) {
    console.error(e);
  }
  setTimeout(() => {
    ov.classList.remove("show");
    stopConfetti();
    openCourseArea();
    showToast("success", "✅ أهلاً بيك!", "تم تسجيل الدخول بنجاح");
  }, 2300);
}

function startConfetti() {
  const cv = document.getElementById("celebrateCanvas");
  if (!cv) return;
  const ctx = cv.getContext("2d");
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  const W = window.innerWidth, H = window.innerHeight;
  cv.width = W * DPR;
  cv.height = H * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  const COLORS = ["#ffd700", "#ffa500", "#ffe55c", "#ffffff", "#42abff"];
  const parts = Array.from({ length: 150 }, () => {
    const a = Math.random() * Math.PI * 2;
    const sp = Math.random() * 7 + 3;
    return {
      x: W / 2,
      y: H * 0.42,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 3.5,
      g: 0.13,
      w: Math.random() * 8 + 4,
      h: Math.random() * 4 + 2,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.25,
      c: COLORS[(Math.random() * COLORS.length) | 0]
    };
  });
  const t0 = performance.now();

  function frame(now) {
    const t = now - t0;
    ctx.clearRect(0, 0, W, H);
    for (const p of parts) {
      p.vy += p.g;
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.99;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = Math.max(0, 1 - t / 2200);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (t < 2300) confettiRAF = requestAnimationFrame(frame);
  }
  confettiRAF = requestAnimationFrame(frame);
}

function stopConfetti() {
  if (confettiRAF) cancelAnimationFrame(confettiRAF);
  const cv = document.getElementById("celebrateCanvas");
  if (cv) cv.getContext("2d").clearRect(0, 0, cv.width, cv.height);
}

function closeCourseArea() {
  const area = document.getElementById("courseArea");
  if (!area) return;
  area.classList.remove("open");
  document.body.style.overflow = "";
  // إيقاف الفيديو اللي كان شغال
  const main = document.getElementById("caMain");
  if (main) main.innerHTML = "";
}

// ===== القائمة المنسدلة =====
document.getElementById("hamburger")?.addEventListener("click", () => {
  document.getElementById("hamburger").classList.toggle("open");
  document.getElementById("navLinks").classList.toggle("open");
});

document.querySelectorAll(".nav-link").forEach((l) => {
  l.addEventListener("click", () => {
    document.getElementById("hamburger")?.classList.remove("open");
    document.getElementById("navLinks")?.classList.remove("open");
    const sec = l.dataset.section;
    if (sec) {
      const i = sections.indexOf(sec);
      if (i !== -1) currentSectionIndex = i;
    }
  });
});

function updateActiveLink() {
  const secs = document.querySelectorAll("section[id]");
  const links = document.querySelectorAll(".nav-link");
  let cur = "";
  secs.forEach((s) => {
    if (window.scrollY >= s.offsetTop - 100) cur = s.id;
  });
  links.forEach((l) => {
    l.classList.toggle("active", l.getAttribute("href") === `#${cur}`);
  });
}

document.getElementById("scrollTopBtn")?.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// ===== تأثيرات الظهور =====
function initObserver() {
  const obs = new IntersectionObserver(
    (es) => {
      es.forEach((e, i) => {
        if (e.isIntersecting) {
          setTimeout(() => e.target.classList.add("visible"), i * 120);
          obs.unobserve(e.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  document.querySelectorAll(".fade-up").forEach((el) => obs.observe(el));
}

// ===== الجسيمات =====
function createParticles() {
  const c = document.getElementById("particles");
  if (!c) return;
  const colors = ["#FFD700", "#FFA500", "#FFE55C", "#ffffff"];
  for (let i = 0; i < 8; i++) {
    const p = document.createElement("div");
    p.className = "particle";
    const s = Math.random() * 5 + 2;
    const col = colors[Math.floor(Math.random() * colors.length)];
    const l = Math.random() * 100;
    const d = Math.random() * 15 + 10;
    const del = Math.random() * 10;
    const op = Math.random() * 0.5 + 0.1;
    p.style.cssText = `width:${s}px;height:${s}px;background:${col};left:${l}%;bottom:-10px;opacity:${op};animation-duration:${d}s;animation-delay:${del}s;`;
    c.appendChild(p);
  }
}

// ===== دوال المصادقة =====
function openAuthModal() {
  const m = document.getElementById("authModalOverlay");
  if (!m) {
    console.error("❌ authModalOverlay مش موجود!");
    return;
  }

  m.style.display = "flex";
  m.classList.add("active");
  document.body.style.overflow = "hidden";

  const emailInput = document.getElementById("loginEmail");
  const passInput = document.getElementById("loginPassword");
  if (emailInput) emailInput.value = "";
  if (passInput) passInput.value = "";
  if (emailInput) emailInput.focus();
}

function closeAuthModal() {
  const m = document.getElementById("authModalOverlay");
  if (!m) return;
  m.style.display = "none";
  m.classList.remove("active");
  document.body.style.overflow = "";
}

// ===== واجهة المستخدم حسب حالة الدخول =====
function updateLoginUI() {
  const area = document.getElementById("userInfoArea");
  const out = document.getElementById("logoutBtnNav");
  const container = document.getElementById("heroBtnsContainer");

  if (currentUser) {
    if (area) {
      area.innerHTML = `<span id="userNameDisplay">👤 ${escapeHtml(
        currentUser.email
      )}</span>`;
    }
    if (out) out.style.display = "flex";
    if (container) {
      container.innerHTML = `<button class="btn btn-gold btn-lg" id="heroCoursesBtn"><i class="fas fa-graduation-cap"></i>دخول الكورسات</button>`;
      document
        .getElementById("heroCoursesBtn")
        ?.addEventListener("click", openCourseArea);
    }
  } else {
    if (area) {
      area.innerHTML = `<button class="btn btn-outline" id="loginBtn"><i class="fas fa-sign-in-alt"></i><span>دخول</span></button>`;
      document
        .getElementById("loginBtn")
        ?.addEventListener("click", openAuthModal);
    }
    if (out) out.style.display = "none";
    if (container) {
      container.innerHTML = `<button class="btn btn-gold btn-lg" id="startBtn"><i class="fas fa-rocket"></i>ابدأ رحلتك الآن</button>`;
      document.getElementById("startBtn")?.addEventListener("click", () => {
        document
          .getElementById("courses")
          ?.scrollIntoView({ behavior: "smooth" });
      });
    }
  }
}

// ===== مستمعي النوافذ =====
document
  .getElementById("closeAuthModalBtn")
  ?.addEventListener("click", closeAuthModal);
document.getElementById("authModalOverlay")?.addEventListener("click", (e) => {
  if (e.target === document.getElementById("authModalOverlay"))
    closeAuthModal();
});
document.getElementById("logoutBtnNav")?.addEventListener("click", handleLogout);
document.getElementById("caBackBtn")?.addEventListener("click", () => {
  closeCourseArea();
});
document.getElementById("caLogoutBtn")?.addEventListener("click", handleLogout);

document
  .getElementById("loginSubmitBtn2")
  ?.addEventListener("click", handleLogin);
["loginEmail", "loginPassword"].forEach((id) => {
  document.getElementById(id)?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleLogin();
  });
});

document.getElementById("notifyMeBtn")?.addEventListener("click", () => {
  showToast("info", "📢 قريباً!", "سيتم إضافة كورسات جديدة قريباً.. تابعونا!");
});

// 🧪 زرار المعاينة التجريبية المؤقت — هيتشال قبل النشر
document.getElementById("demoCourseBtn")?.addEventListener("click", () => {
  openCourseArea(true);
  showToast(
    "info",
    "🧪 معاينة تجريبية",
    "ده شكل صفحة الكورس — تسجيل الدخول الحقيقي بيانات Firebase"
  );
});

document.getElementById("toastCloseBtn")?.addEventListener("click", closeToast);

// ===== حالة تسجيل الدخول =====
onAuthStateChanged(auth, (u) => {
  currentUser = u ? { uid: u.uid, email: u.email || "" } : null;
  updateLoginUI();

  if (u) {
    closeAuthModal();
    // لو فتح تسجيل الدخول عشان يدخل كورس → دخّله على طول
    if (pendingCourseEnter) {
      pendingCourseEnter = false;
      playEnterCelebration();
    }
  }
});

async function handleLogin() {
  const emailInput = document.getElementById("loginEmail");
  const passInput = document.getElementById("loginPassword");
  const email = emailInput?.value.trim() || "";
  const pass = passInput?.value.trim() || "";
  if (!email || !pass) {
    showToast("error", "⚠️ خطأ", "يرجى إدخال البريد الإلكتروني وكلمة المرور");
    return;
  }
  const btn = document.getElementById("loginSubmitBtn2");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "جاري الدخول...";
  }
  try {
    pendingCourseEnter = true;
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (e) {
    pendingCourseEnter = false;
    showToast("error", "⚠️ خطأ", loginErrorMessage(e));
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "دخول";
    }
  }
}

function loginErrorMessage(e) {
  const map = {
    "auth/invalid-credential": "البريد الإلكتروني أو كلمة المرور غير صحيحة",
    "auth/wrong-password": "كلمة المرور غير صحيحة",
    "auth/user-not-found": "لا يوجد حساب بهذه البيانات",
    "auth/invalid-email": "صيغة البريد الإلكتروني غير صحيحة",
    "auth/too-many-requests":
      "محاولات كتير جداً.. استنى دقيقة وجرب تاني",
    "auth/operation-not-allowed":
      "تسجيل الدخول بالإيميل غير مفعل — فعّل Email/Password من Firebase Console",
    "auth/network-request-failed":
      "مشكلة في الاتصال بالإنترنت.. جرب تاني",
    "auth/invalid-api-key":
      "إعدادات Firebase غير صحيحة — راجع إعدادات المشروع"
  };
  return map[e?.code] || "حدث خطأ أثناء تسجيل الدخول.. جرب تاني";
}

async function handleLogout() {
  try {
    await signOut(auth);
    closeCourseArea();
    showToast("success", "👋 وداعاً!", "تم تسجيل الخروج بنجاح");
  } catch {
    showToast("error", "⚠️ خطأ", "حدث خطأ أثناء تسجيل الخروج");
  }
}

// ===== رسائل التنبيه =====
let toastTimer = null;

function showToast(type, title, msg) {
  const t = document.getElementById("toast");
  const icon = document.getElementById("toastIcon");
  const tTitle = document.getElementById("toastTitle");
  const tMsg = document.getElementById("toastMsg");
  if (!t || !icon || !tTitle || !tMsg) return;
  if (toastTimer) clearTimeout(toastTimer);
  tTitle.textContent = title;
  tMsg.textContent = msg;
  icon.className = "toast-icon";
  if (type === "success") {
    icon.classList.add("success");
    icon.innerHTML = '<i class="fas fa-check"></i>';
  } else if (type === "error") {
    icon.classList.add("error");
    icon.innerHTML = '<i class="fas fa-times"></i>';
  } else {
    icon.innerHTML = '<i class="fas fa-info"></i>';
  }
  t.classList.add("show");
  toastTimer = setTimeout(() => closeToast(), 4000);
}

function closeToast() {
  document.getElementById("toast")?.classList.remove("show");
}

// ===== روابط التنقل =====
document.querySelectorAll('a[href^="#"]').forEach((l) => {
  l.addEventListener("click", (e) => {
    e.preventDefault();
    const id = l.getAttribute("href").slice(1);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  });
});