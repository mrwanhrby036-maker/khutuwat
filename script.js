// ===== استيراد Firebase =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  get,
  push,
  query,
  orderByChild,
  limitToLast,
  remove,
  onChildAdded,
  equalTo,
  update,
  off
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  reauthenticateWithCredential,
  EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

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
const storage = getStorage(app);
const auth = getAuth(app);
const database = getDatabase(app);

// ===== المتغيرات العامة =====
let currentUser = null;
let sections = ["home", "courses", "features", "forum", "adminPanel"];
let currentSectionIndex = 0;

// ===== متغيرات مسجل الصوت =====
let mediaRecorder = null;
let audioChunks = [];
let recordingSeconds = 0;
let recordingInterval = null;
let audioBlob = null;

// ===== دوال شاشة التحميل والترحيب =====
function hideLoadingScreen() {
  const ls = document.getElementById("loadingScreenNew");
  if (ls) {
    ls.style.transition = "opacity 0.6s ease, visibility 0.6s ease";
    ls.style.opacity = "0";
    ls.style.visibility = "hidden";
    ls.style.pointerEvents = "none";
    setTimeout(() => {
      if (ls) ls.style.display = "none";
    }, 600);
  }
}

function showWelcomeScreen() {
  const ws = document.getElementById("welcomeScreen");
  if (ws) ws.classList.add("show");
}

// ===== بداية التشغيل =====
window.addEventListener("load", () => {
  // إخفاء شاشة التحميل بعد 2.5 ثانية
  setTimeout(() => {
    hideLoadingScreen();
  }, 2500);

  // إظهار شاشة الترحيب بعد 2.5 ثانية
  setTimeout(() => {
    showWelcomeScreen();
  }, 2500);

  // تشغيل باقي الوظائف فوراً
  initObserver();
  createParticles();
  initVoiceRecorder();
});

// إخفاء إجباري بعد 5 ثوانٍ كحد أقصى للطوارئ
setTimeout(() => {
  const ls = document.getElementById("loadingScreenNew");
  if (ls && ls.style.display !== "none") {
    ls.style.display = "none";
    document.getElementById("welcomeScreen").classList.add("show");
  }
}, 5000);

document.getElementById("welcomeContinueBtn")?.addEventListener("click", () => {
  const ws = document.getElementById("welcomeScreen");
  ws.classList.remove("show");
  setTimeout(() => (ws.style.display = "none"), 800);
  showToast("info", "👋 أهلاً وسهلاً!", "مرحباً بك في خطوات نحو التميز");
});

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

// ===== مسجل الصوت =====
function initVoiceRecorder() {
  const toggle = document.getElementById("recorder-toggle");
  const vr = document.querySelector(".voice-recorder");
  const timerEl = document.getElementById("timerDisplay");
  const deleteBtn = document.querySelector(".delete-btn");
  const sendVoiceBtn = document.querySelector(".send-voice-btn");
  let waveInterval = null;

  function randomizeWaves() {
    if (!toggle.checked) return;
    document.querySelectorAll(".wave-bar").forEach((b) => {
      b.style.height = Math.floor(Math.random() * 26) + 6 + "px";
    });
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };
      mediaRecorder.onstop = () => {
        audioBlob = new Blob(audioChunks, { type: "audio/webm" });
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRecorder.start();
      recordingSeconds = 0;
      updateTimerDisplay();
      recordingInterval = setInterval(() => {
        recordingSeconds++;
        if (recordingSeconds >= 3599) recordingSeconds = 3599;
        updateTimerDisplay();
      }, 1000);
      waveInterval = setInterval(randomizeWaves, 280);
      showToast("success", "🎙️ بدأ التسجيل", "يتم تسجيل الصوت الآن...");
    } catch (e) {
      showToast("error", "⚠️ خطأ", "تعذر الوصول إلى الميكروفون");
      toggle.checked = false;
      vr.classList.remove("recording");
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== "inactive")
      mediaRecorder.stop();
    if (recordingInterval) {
      clearInterval(recordingInterval);
      recordingInterval = null;
    }
    if (waveInterval) {
      clearInterval(waveInterval);
      waveInterval = null;
    }
    document.querySelectorAll(".wave-bar").forEach((b, i) => {
      const h = [14, 22, 10, 28, 18, 12, 24, 16, 20];
      b.style.height = h[i] + "px";
    });
  }

  function updateTimerDisplay() {
    const m = Math.floor(recordingSeconds / 60);
    const s = recordingSeconds % 60;
    timerEl.textContent = `${m}:${s < 10 ? "0" : ""}${s}`;
  }

  function resetRecorder() {
    if (toggle.checked) {
      toggle.checked = false;
      vr.classList.remove("recording");
      stopRecording();
      recordingSeconds = 0;
      updateTimerDisplay();
      audioBlob = null;
    }
  }

  toggle.addEventListener("change", function () {
    if (this.checked) {
      if (!currentUser) {
        showToast("error", "⚠️ تنبيه", "يجب تسجيل الدخول لاستخدام مسجل الصوت");
        this.checked = false;
        return;
      }
      vr.classList.add("recording");
      startRecording();
    } else {
      vr.classList.remove("recording");
      stopRecording();
    }
  });

  deleteBtn.addEventListener("click", (e) => {
    e.preventDefault();
    resetRecorder();
    showToast("info", "🗑️ تم الحذف", "تم حذف التسجيل الصوتي");
  });

  if (!sendVoiceBtn) return;
  sendVoiceBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    if (!currentUser) {
      showToast("error", "⚠️ تنبيه", "يجب تسجيل الدخول لإرسال رسالة صوتية");
      openAuthModal();
      return;
    }

    if (!audioBlob || audioBlob.size === 0) {
      showToast("error", "⚠️ خطأ", "لا يوجد تسجيل صوتي للإرسال");
      return;
    }

    if (audioBlob.size > 5 * 1024 * 1024) {
      showToast("error", "⚠️ خطأ", "حجم التسجيل كبير جداً (الحد 5MB)");
      return;
    }

    const sb = document.getElementById("forumSendBtn");
    sb.disabled = true;
    sb.innerHTML = '<span class="send-button-text">⏳ جاري الرفع...</span>';

    try {
      const fileName = `voice_${Date.now()}_${currentUser.uid}.webm`;
      const fileRef = storageRef(storage, `voiceMessages/${fileName}`);
      await uploadBytes(fileRef, audioBlob);
      const audioUrl = await getDownloadURL(fileRef);

      const refMsg = push(ref(database, "forumMessages"));
      const data = {
        id: refMsg.key,
        text: `🎤 رسالة صوتية (${formatTime(recordingSeconds)})`,
        audioUrl: audioUrl,
        audioDuration: recordingSeconds,
        senderId: currentUser.uid,
        senderName: currentUser.name,
        timestamp: Date.now(),
        isAdmin: currentUser.isAdmin === true,
        messageType: "voice"
      };
      await set(refMsg, data);
      resetRecorder();
      showToast("success", "✅ تم الإرسال", "تم إرسال الرسالة الصوتية بنجاح");
      await loadMessages();
    } catch (er) {
      console.error(er);
      showToast("error", "⚠️ خطأ", "حدث خطأ أثناء رفع الملف الصوتي");
    } finally {
      sb.disabled = false;
      sb.innerHTML = '<span class="send-button-text">إرسال</span>';
    }
  });

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  }
}

// ===== دوال المنتدى =====
async function deleteMessage(id, div) {
  if (!currentUser) {
    showToast("error", "⚠️ تنبيه", "يجب تسجيل الدخول للحذف");
    return;
  }
  const isAdmin = currentUser.isAdmin === true;
  if (!isAdmin) {
    showToast("error", "⚠️ تنبيه", "المشرف فقط من يمكنه حذف الرسائل");
    return;
  }
  if (confirm("🗑️ هل تريد حذف هذه الرسالة نهائياً؟")) {
    try {
      await remove(ref(database, `forumMessages/${id}`));
      div.remove();
      showToast("success", "🗑️ تم الحذف", "تم حذف الرسالة بنجاح");
    } catch (e) {
      showToast("error", "⚠️ خطأ", "حدث خطأ أثناء حذف الرسالة");
    }
  }
}

function displayMessage(msg) {
  const c = document.getElementById("forumMessages");
  if (!c) return;
  if (c.querySelector(".forum-empty")) c.innerHTML = "";
  const div = document.createElement("div");
  div.className = "forum-message";
  div.dataset.messageId = msg.id;
  div.dataset.senderId = msg.senderId;
  if (currentUser && msg.senderId === currentUser.uid)
    div.classList.add("own-message");
  const av = msg.senderName ? msg.senderName.charAt(0).toUpperCase() : "?";
  const time = new Date(msg.timestamp).toLocaleTimeString("ar-EG", {
    hour: "2-digit",
    minute: "2-digit"
  });
  const date = new Date(msg.timestamp).toLocaleDateString("ar-EG", {
    day: "numeric",
    month: "numeric"
  });
  const badge = msg.isAdmin
    ? ' <span class="verified-badge" title="مشرف موثوق"><span class="checkmark"></span></span>'
    : "";
  let content = "";
  if (msg.messageType === "voice" && msg.audioUrl) {
    content = `<div class="voice-message"><audio controls src="${msg.audioUrl}"></audio><span class="voice-duration">🎤 ${msg.text}</span></div>`;
  } else {
    content = escapeHtml(msg.text);
  }
  div.innerHTML = `<div class="forum-message-avatar">${av}</div><div class="forum-message-content"><div class="forum-message-name"><span>${escapeHtml(
    msg.senderName
  )}${badge}</span><span class="forum-message-time">${date} ${time}</span></div><div class="forum-message-text">${content}</div></div>`;
  if (
    currentUser &&
    (currentUser.isAdmin || currentUser.uid === msg.senderId)
  ) {
    const btn = document.createElement("button");
    btn.innerHTML = "🗑️";
    btn.className = "delete-msg-btn";
    btn.onclick = (e) => {
      e.stopPropagation();
      deleteMessage(msg.id, div);
    };
    div.appendChild(btn);
  }
  c.appendChild(div);
  c.scrollTop = c.scrollHeight;
}

async function loadMessages() {
  const c = document.getElementById("forumMessages");
  if (!c) return;
  try {
    const snap = await get(
      query(
        ref(database, "forumMessages"),
        orderByChild("timestamp"),
        limitToLast(30)
      )
    );
    const msgs = [];
    snap.forEach((s) => {
      const m = s.val();
      if (m && m.id) msgs.push(m);
    });
    msgs.sort((a, b) => a.timestamp - b.timestamp);
    if (msgs.length === 0) {
      c.innerHTML =
        '<div class="forum-empty">✨ لا توجد رسائل بعد... كن أول من يكتب!</div>';
    } else {
      c.innerHTML = "";
      msgs.forEach((m) => displayMessage(m));
    }
  } catch (e) {
    c.innerHTML = '<div class="forum-error">⚠️ حدث خطأ في تحميل الرسائل</div>';
  }
}

let lastSendTime = 0;

async function sendForumMessage() {
  if (Date.now() - lastSendTime < 2000) {
    showToast("error", "⏳ استنى شوية", "ممنوع إرسال رسائل بسرعة");
    return;
  }
  if (!currentUser) {
    showToast(
      "error",
      "⚠️ تنبيه",
      "يجب تسجيل الدخول أولاً للمشاركة في المنتدى"
    );
    return;
  }
  if (currentUser && currentUser.approved === false) {
    showToast(
      "warning",
      "⏳ في انتظار التفعيل",
      "حسابك لم يتم تفعيله بعد من المشرف"
    );
    return;
  }
  const inp = document.getElementById("forumMessageInput");
  const text = inp.value.trim();
  if (!text) {
    showToast("error", "⚠️ خطأ", "لا يمكن إرسال رسالة فارغة");
    return;
  }
  if (text.length > 500) {
    showToast("error", "⚠️ خطأ", "الرسالة طويلة جداً (حد أقصى 500 حرف)");
    return;
  }
  const sb = document.getElementById("forumSendBtn");
  sb.disabled = true;
  sb.innerHTML = '<span class="send-button-text">جاري الإرسال...</span>';
  try {
    const refMsg = push(ref(database, "forumMessages"));
    const data = {
      id: refMsg.key,
      text: text,
      senderId: currentUser.uid,
      senderName: currentUser.name,
      timestamp: Date.now(),
      isAdmin: currentUser.isAdmin === true,
      messageType: "text"
    };
    await set(refMsg, data);
    lastSendTime = Date.now();
    inp.value = "";
    document.getElementById("charCount").innerHTML = "0";
    showToast("success", "✅ تم الإرسال", "تم إرسال رسالتك بنجاح");
    await loadMessages();
  } catch (e) {
    showToast("error", "⚠️ خطأ", "حدث خطأ أثناء إرسال الرسالة");
  } finally {
    sb.disabled = false;
    sb.innerHTML = '<span class="send-button-text">إرسال</span>';
  }
}

let forumListenerRef = null;
let forumCallback = null;

function startAutoRefresh() {
  if (forumListenerRef) return;
  const messagesRef = query(
    ref(database, "forumMessages"),
    orderByChild("timestamp"),
    limitToLast(50)
  );
  forumCallback = (snapshot) => {
    const newMsg = snapshot.val();
    if (newMsg && newMsg.id) {
      const existing = document.querySelector(
        `.forum-message[data-message-id="${newMsg.id}"]`
      );
      if (!existing) {
        displayMessage(newMsg);
      }
    }
  };
  onChildAdded(messagesRef, forumCallback);
  forumListenerRef = messagesRef;
}

function stopAutoRefresh() {
  if (forumListenerRef && forumCallback) {
    off(forumListenerRef, "child_added", forumCallback);
    forumListenerRef = null;
    forumCallback = null;
  }
}

function initForum() {
  loadMessages();
  startAutoRefresh();
  updateForumUI();
}

function updateForumUI() {
  const inp = document.getElementById("forumInputArea");
  const warn = document.getElementById("forumLoginWarning");

  if (currentUser) {
    if (inp) inp.style.display = "flex";
    if (warn) warn.style.display = "none";

    const textarea = document.getElementById("forumMessageInput");
    const sendBtn = document.getElementById("forumSendBtn");

    if (currentUser.approved === false) {
      if (textarea) {
        textarea.disabled = true;
        textarea.placeholder = "⏳ حسابك في انتظار تفعيل المشرف...";
      }
      if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.style.opacity = "0.5";
      }
    } else {
      if (textarea) {
        textarea.disabled = false;
        textarea.placeholder = "اكتب رسالتك هنا...";
      }
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.style.opacity = "1";
      }
    }
  } else {
    if (inp) inp.style.display = "none";
    if (warn) warn.style.display = "block";
  }
}

// ===== إظهار لوحة المشرف للمشرف فقط =====
function updateAdminPanelVisibility() {
  const adminPanel = document.getElementById("adminPanel");
  const isAdmin = currentUser?.isAdmin === true;
  if (adminPanel) {
    adminPanel.style.display = isAdmin ? "block" : "none";
  }
  if (isAdmin) {
    loadPendingUsers();
    loadAdminStats();
    loadAdminNotifications();
  }
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

  const loginForm = document.getElementById("loginFormElement");
  const registerForm = document.getElementById("registerFormElement");

  if (loginForm) loginForm.style.display = "flex";
  if (registerForm) registerForm.style.display = "none";

  document.getElementById("loginEmail").value = "";
  document.getElementById("loginPassword").value = "";
}

function closeAuthModal() {
  const m = document.getElementById("authModalOverlay");
  m.style.display = "none";
  m.classList.remove("active");
  document.body.style.overflow = "";
}

function updateHeroButton() {
  const container = document.getElementById("heroBtnsContainer");
  if (currentUser) {
    container.innerHTML = `<button class="btn btn-gold btn-lg" id="heroLogoutBtn"><i class="fas fa-sign-out-alt"></i>تسجيل الخروج</button>`;
    document
      .getElementById("heroLogoutBtn")
      ?.addEventListener("click", async () => {
        await signOut(auth);
        showToast("success", "👋 وداعاً!", "تم تسجيل الخروج بنجاح");
      });
  } else {
    container.innerHTML = `<button class="btn btn-gold btn-lg" id="startBtn"><i class="fas fa-rocket"></i>ابدأ رحلتك الآن</button>`;
    document
      .getElementById("startBtn")
      ?.addEventListener("click", openAuthModal);
  }
}

function updateUserUI() {
  const area = document.getElementById("userInfoArea");
  const out = document.getElementById("logoutBtnNav");
  if (currentUser) {
    const badge = currentUser.isAdmin
      ? ' <span class="verified-badge" title="مشرف موثوق"><span class="checkmark"></span></span>'
      : "";
    if (area)
      area.innerHTML = `
            <span id="userNameDisplay">👤 ${currentUser.name}${badge}</span>
            <button class="btn btn-outline" id="deleteAccountBtn" style="border-color:#ff6464; color:#ff6464; margin-right:8px;">
                <i class="fas fa-trash-alt"></i>حذف الحساب
            </button>
        `;
    document
      .getElementById("deleteAccountBtn")
      ?.addEventListener("click", confirmDeleteAccount);
    if (out) out.style.display = "flex";
    updateHeroButton();
    if (document.getElementById("forum")) {
      setTimeout(() => {
        stopAutoRefresh();
        initForum();
      }, 500);
    }
  } else {
    if (area) {
      area.innerHTML = `
                <button class="btn btn-outline" id="loginBtn"><i class="fas fa-sign-in-alt"></i><span>دخول</span></button>
                <button class="btn btn-gold" id="registerBtn"><i class="fas fa-user-plus"></i><span>ابدأ مجاناً</span></button>
            `;

      const loginBtn = document.getElementById("loginBtn");
      const registerBtn = document.getElementById("registerBtn");

      if (loginBtn) {
        loginBtn.addEventListener("click", (e) => {
          e.preventDefault();
          openAuthModal();
        });
      }

      if (registerBtn) {
        registerBtn.addEventListener("click", (e) => {
          e.preventDefault();
          openAuthModal();
          document.getElementById("loginFormElement").style.display = "none";
          document.getElementById("registerFormElement").style.display = "flex";
        });
      }
    }

    if (out) out.style.display = "none";
    updateHeroButton();
  }
}

document
  .getElementById("closeAuthModalBtn")
  ?.addEventListener("click", closeAuthModal);
document.getElementById("authModalOverlay")?.addEventListener("click", (e) => {
  if (e.target === document.getElementById("authModalOverlay"))
    closeAuthModal();
});
document
  .getElementById("switchToRegisterBtn")
  ?.addEventListener("click", () => {
    document.getElementById("loginFormElement").style.display = "none";
    document.getElementById("registerFormElement").style.display = "flex";
  });
document.getElementById("switchToLoginBtn")?.addEventListener("click", () => {
  document.getElementById("registerFormElement").style.display = "none";
  document.getElementById("loginFormElement").style.display = "flex";
});
document.getElementById("logoutBtnNav")?.addEventListener("click", async () => {
  await signOut(auth);
  showToast("success", "👋 وداعاً!", "تم تسجيل الخروج بنجاح");
  if (document.getElementById("forum")) {
    stopAutoRefresh();
    initForum();
  }
});

document
  .getElementById("forumSendBtn")
  ?.addEventListener("click", sendForumMessage);
document
  .getElementById("forumMessageInput")
  ?.addEventListener("input", function () {
    const c = this.value.length;
    document.getElementById("charCount").innerHTML = c;
    this.style.borderColor = c >= 480 ? "#ff6464" : "";
  });
document.getElementById("notifyMeBtn")?.addEventListener("click", () => {
  showToast("info", "📢 قريباً!", "سيتم إضافة الكورسات خلال أيام");
});
document
  .getElementById("openAuthFromForumBtn")
  ?.addEventListener("click", (e) => {
    e.preventDefault();
    openAuthModal();
  });
document.getElementById("toastCloseBtn")?.addEventListener("click", closeToast);
document
  .getElementById("loginSubmitBtn2")
  ?.addEventListener("click", handleLogin);
document
  .getElementById("registerSubmitBtn2")
  ?.addEventListener("click", handleRegister);

onAuthStateChanged(auth, async (u) => {
  if (u) {
    const snap = await get(ref(database, "users/" + u.uid));
    if (snap.exists()) {
      const d = snap.val();

      if (d.approved === false && d.isAdmin !== true) {
        showToast(
          "warning",
          "⏳ في انتظار التفعيل",
          "تم تسجيل الدخول لكن حسابك لم يتم تفعيله بعد"
        );

        currentUser = {
          uid: u.uid,
          email: u.email,
          name: d.name || "مستخدم",
          phone: d.phone || "",
          isAdmin: false,
          approved: false
        };

        updateUserUI();
        updateAdminPanelVisibility();
        closeAuthModal();
        return;
      }

      currentUser = {
        uid: u.uid,
        email: u.email,
        name: d.name || "مستخدم",
        phone: d.phone || "",
        isAdmin: d.isAdmin === true,
        approved: d.approved === true
      };
    } else {
      await set(ref(database, "users/" + u.uid), {
        email: u.email,
        name: "مستخدم",
        phone: "",
        isAdmin: false,
        approved: false,
        createdAt: new Date().toISOString()
      });

      await signOut(auth);
      showToast(
        "warning",
        "⏳ في انتظار الموافقة",
        "حسابك في انتظار موافقة المشرف"
      );

      currentUser = null;
      updateUserUI();
      updateAdminPanelVisibility();
      closeAuthModal();
      return;
    }

    updateUserUI();
    updateAdminPanelVisibility();
    if (document.getElementById("forum")) {
      setTimeout(() => {
        stopAutoRefresh();
        initForum();
      }, 500);
    }
    closeAuthModal();
  } else {
    currentUser = null;
    updateUserUI();
    updateAdminPanelVisibility();
    if (document.getElementById("forum")) {
      stopAutoRefresh();
      initForum();
    }
  }
});

async function handleLogin() {
  const e = document.getElementById("loginEmail").value.trim();
  const p = document.getElementById("loginPassword").value.trim();
  if (!e || !p) {
    showToast("error", "⚠️ خطأ", "يرجى إدخال البريد الإلكتروني وكلمة المرور");
    return;
  }
  try {
    await signInWithEmailAndPassword(auth, e, p);
  } catch {
    showToast("error", "⚠️ خطأ", "البريد الإلكتروني أو كلمة المرور غير صحيحة");
  }
}

async function handleRegister() {
  const fn = document.getElementById("regFirstName").value.trim();
  const ln = document.getElementById("regLastName").value.trim();
  const e = document.getElementById("regEmail").value.trim();
  const p = document.getElementById("regPassword").value.trim();
  const cp = document.getElementById("regConfirmPassword").value.trim();
  const phone = document.getElementById("regPhone")?.value.trim() || "";

  if (!fn || !ln || !e || !p || !cp) {
    showToast("error", "⚠️ خطأ", "يرجى ملء جميع الحقول");
    return;
  }
  if (p !== cp) {
    showToast("error", "⚠️ خطأ", "كلمتا المرور غير متطابقتين");
    return;
  }
  if (p.length < 6) {
    showToast("error", "⚠️ خطأ", "كلمة المرور يجب أن تكون 6 أحرف على الأقل");
    return;
  }

  const emailKey = e.replace(/\./g, "_");
  const deletedCheck = await get(ref(database, `deletedEmails/${emailKey}`));
  if (deletedCheck.exists()) {
    showToast(
      "error",
      "⚠️ غير مسموح",
      "هذا البريد الإلكتروني تم حذفه من قبل ولا يمكن إعادة التسجيل به"
    );
    return;
  }

  try {
    const cred = await createUserWithEmailAndPassword(auth, e, p);
    const userData = {
      email: e,
      name: `${fn} ${ln}`,
      phone: phone,
      isAdmin: false,
      approved: false,
      createdAt: new Date().toISOString()
    };
    await set(ref(database, "users/" + cred.user.uid), userData);
    await signOut(auth);

    await sendAdminNotification({
      uid: cred.user.uid,
      name: `${fn} ${ln}`,
      email: e,
      phone: phone
    });

    showToast(
      "success",
      "✅ تم إنشاء الحساب",
      "تم إنشاء حسابك بنجاح! 🎉\nيرجى انتظار موافقة المشرف لتفعيل حسابك"
    );
    closeAuthModal();
  } catch (er) {
    showToast(
      "error",
      "⚠️ خطأ",
      er.code === "auth/email-already-in-use"
        ? "هذا البريد الإلكتروني مسجل بالفعل"
        : "حدث خطأ في إنشاء الحساب"
    );
  }
}

// ===== رسائل التنبيه =====
let toastTimer = null;

function showToast(type, title, msg) {
  const t = document.getElementById("toast");
  const icon = document.getElementById("toastIcon");
  const tTitle = document.getElementById("toastTitle");
  const tMsg = document.getElementById("toastMsg");
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
  document.getElementById("toast").classList.remove("show");
}

async function confirmDeleteAccount() {
  const confirmed = confirm(
    "⚠️ تحذير خطير! هل أنت متأكد من حذف حسابك نهائياً؟\n\nسيتم حذف: \n- جميع رسائلك في المنتدى\n- بيانات حسابك بالكامل\n\nهذا الإجراء لا يمكن التراجع عنه!"
  );
  if (!confirmed) return;

  const password = prompt("لتأكيد الحذف، أدخل كلمة المرور الخاصة بك:");
  if (!password) {
    showToast("error", "❌ تم الإلغاء", "لم يتم حذف الحساب");
    return;
  }

  showToast("info", "⏳ جاري الحذف...", "يرجى الانتظار");

  try {
    const user = auth.currentUser;
    if (!user) throw new Error("لم يتم العثور على مستخدم");

    const credential = EmailAuthProvider.credential(user.email, password);
    await reauthenticateWithCredential(user, credential);

    const emailKey = user.email.replace(/\./g, "_");
    await set(ref(database, `deletedEmails/${emailKey}`), {
      deletedAt: new Date().toISOString(),
      uid: user.uid
    });

    await remove(ref(database, "users/" + user.uid));
    await user.delete();

    showToast("success", "✅ تم الحذف", "تم حذف حسابك وبياناتك بنجاح");
    setTimeout(() => window.location.reload(), 2000);
  } catch (er) {
    console.error(er);
    if (er.code === "auth/wrong-password") {
      showToast("error", "❌ خطأ", "كلمة المرور غير صحيحة");
    } else {
      showToast(
        "error",
        "⚠️ فشل الحذف",
        "حدث خطأ أو انتهت صلاحية الجلسة. حاول تسجيل الخروج والدخول ثانية."
      );
    }
  }
}

// ===== روابط التنقل =====
document.querySelectorAll('a[href^="#"]').forEach((l) => {
  l.addEventListener("click", (e) => {
    e.preventDefault();
    const id = l.getAttribute("href").slice(1);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  });
});

// ===== إرسال إشعار للمشرفين =====
async function sendAdminNotification(newUser) {
  try {
    const notificationRef = push(ref(database, "adminNotifications"));
    await set(notificationRef, {
      id: notificationRef.key,
      userId: newUser.uid,
      userName: newUser.name,
      userEmail: newUser.email,
      userPhone: newUser.phone || "غير مدخل",
      registeredAt: new Date().toISOString(),
      read: false,
      type: "new_user"
    });
  } catch (error) {
    console.error("خطأ في إرسال الإشعار:", error);
  }
}

// ===== ترقية المستخدم الحالي إلى مشرف =====
async function makeMeAdmin() {
  if (!currentUser) {
    showToast("error", "⚠️ خطأ", "يجب تسجيل الدخول أولاً");
    return;
  }
  try {
    await update(ref(database, `users/${currentUser.uid}`), { isAdmin: true });
    currentUser.isAdmin = true;
    showToast("success", "✅ تم الترقية", "تمت ترقيتك إلى مشرف بنجاح");
    updateAdminPanelVisibility();
    updateUserUI();
  } catch (error) {
    showToast("error", "⚠️ خطأ", error.message);
  }
}

// ===== قبول مستخدم جديد =====
async function approveUser(userId, userName) {
  try {
    await update(ref(database, `users/${userId}`), { approved: true });
    showToast("success", "✅ تم القبول", `تم قبول المستخدم ${userName} بنجاح`);
    loadPendingUsers();
    loadAdminStats();
  } catch (error) {
    showToast("error", "⚠️ خطأ", error.message);
  }
}

// ===== رفض مستخدم جديد =====
async function rejectUser(userId, userName, userEmail) {
  if (!confirm(`⚠️ هل تريد حذف حساب ${userName} نهائياً؟`)) return;

  try {
    const msgsSnap = await get(
      query(
        ref(database, "forumMessages"),
        orderByChild("senderId"),
        equalTo(userId)
      )
    );
    const deletePromises = [];
    msgsSnap.forEach((msg) => {
      deletePromises.push(remove(ref(database, `forumMessages/${msg.key}`)));
    });
    await Promise.all(deletePromises);

    await set(ref(database, `deletedEmails/${userEmail.replace(/\./g, "_")}`), {
      email: userEmail,
      deletedAt: new Date().toISOString(),
      userId: userId
    });

    await remove(ref(database, `users/${userId}`));

    showToast(
      "success",
      "🗑️ تم الحذف",
      `تم حذف حساب ${userName} ويمكنه التسجيل مرة أخرى`
    );
    loadPendingUsers();
    loadAdminStats();
  } catch (error) {
    showToast("error", "⚠️ خطأ", error.message);
  }
}

// ===== تحميل المستخدمين في انتظار الموافقة =====
async function loadPendingUsers() {
  const container = document.getElementById("pendingUsersContainer");
  if (!container) return;

  try {
    const snap = await get(ref(database, "users"));
    const pendingUsers = [];
    snap.forEach((s) => {
      const user = s.val();
      if (user.approved === false && user.isAdmin !== true) {
        pendingUsers.push({ id: s.key, ...user });
      }
    });

    if (pendingUsers.length === 0) {
      container.innerHTML =
        '<div class="empty-pending">✅ لا يوجد مستخدمون في انتظار الموافقة</div>';
      return;
    }

    container.innerHTML = `
            <div class="pending-users-list">
                <h4>👥 المستخدمون في انتظار الموافقة (${
                  pendingUsers.length
                })</h4>
                ${pendingUsers
                  .map(
                    (u) => `
                    <div class="pending-user-item">
                        <div class="pending-user-info">
                            <strong>${escapeHtml(u.name)}</strong>
                            <div>📧 ${escapeHtml(u.email)}</div>
                            <div>📞 ${escapeHtml(u.phone || "غير مدخل")}</div>
                            <div>🕐 ${new Date(u.createdAt).toLocaleString(
                              "ar-EG"
                            )}</div>
                        </div>
                        <div class="pending-user-actions">
                            <button class="approve-btn" data-id="${
                              u.id
                            }" data-name="${escapeHtml(
                      u.name
                    )}">✅ قبول</button>
                            <button class="reject-btn" data-id="${
                              u.id
                            }" data-name="${escapeHtml(
                      u.name
                    )}" data-email="${escapeHtml(u.email)}">❌ رفض</button>
                        </div>
                    </div>
                `
                  )
                  .join("")}
            </div>
        `;

    document.querySelectorAll(".approve-btn").forEach((btn) => {
      btn.addEventListener("click", () =>
        approveUser(btn.dataset.id, btn.dataset.name)
      );
    });
    document.querySelectorAll(".reject-btn").forEach((btn) => {
      btn.addEventListener("click", () =>
        rejectUser(btn.dataset.id, btn.dataset.name, btn.dataset.email)
      );
    });
  } catch (error) {
    container.innerHTML =
      '<div class="error">⚠️ حدث خطأ في تحميل المستخدمين</div>';
  }
}

// ===== تحميل إحصائيات المشرف =====
async function loadAdminStats() {
  try {
    const usersSnap = await get(ref(database, "users"));
    let usersCount = 0;
    usersSnap.forEach(() => usersCount++);

    const msgsSnap = await get(ref(database, "forumMessages"));
    let msgsCount = 0;
    msgsSnap.forEach(() => msgsCount++);

    console.log(`📊 إحصائيات: ${usersCount} مستخدم, ${msgsCount} رسالة`);
  } catch (error) {
    console.error("خطأ في تحميل الإحصائيات:", error);
  }
}

window.makeMeAdmin = function () {
  makeMeAdmin().catch((err) => console.error(err));
};

// ===== تحميل إشعارات المشرف =====
async function loadAdminNotifications() {
  const container = document.getElementById("adminNotificationsContainer");
  if (!container) return;

  try {
    const snap = await get(
      query(
        ref(database, "adminNotifications"),
        orderByChild("registeredAt"),
        limitToLast(20)
      )
    );
    const notifs = [];
    snap.forEach((s) => {
      const n = s.val();
      if (n) notifs.push(n);
    });
    notifs.reverse();

    if (notifs.length === 0) {
      container.innerHTML =
        '<div class="empty-notifications">📭 لا توجد إشعارات جديدة</div>';
      return;
    }

    container.innerHTML = notifs
      .map(
        (n) => `
            <div class="notification-item ${n.read ? "read" : "unread"}">
                <div class="notif-icon">🆕</div>
                <div class="notif-content">
                    <strong>${escapeHtml(n.userName)}</strong>
                    <div class="notif-details">
                        📧 ${escapeHtml(n.userEmail)}<br>
                        📞 ${escapeHtml(n.userPhone)}<br>
                        🕐 ${new Date(n.registeredAt).toLocaleString("ar-EG")}
                    </div>
                    <p class="notif-message">✉️ يطلب تفعيل حسابه</p>
                </div>
                <button class="mark-read-btn" data-id="${
                  n.id
                }">✅ تمت القراءة</button>
            </div>
        `
      )
      .join("");

    document.querySelectorAll(".mark-read-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        await update(ref(database, `adminNotifications/${id}`), { read: true });
        btn.remove();
        showToast("success", "✅ تم", "تم تحديث حالة الإشعار");
      });
    });
  } catch (error) {
    container.innerHTML =
      '<div class="error">⚠️ حدث خطأ في تحميل الإشعارات</div>';
  }
}
