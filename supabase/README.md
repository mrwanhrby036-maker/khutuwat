# إعداد Supabase مع خطوات نحو التميز (وضع Firebase + Supabase معًا)

الهدف: ننقل **القراءة والكتابة** من Firestore إلى Supabase Postgres للهروب من حدود
القراءة/الكتابة في Firebase، بينما نبقى على **Firebase Auth** و**Firebase Storage**
زي ما هما. الطالب بيدخل بـ Firebase، وبعدين بياخد توكن Supabase مؤقت عشان يتكلم
قاعدة البيانات، وسياسات الأمان (RLS) بتتعامل معاه كأنه داخل من Supabase.

---

## ٠) بيانات مشروعك (موجودة عندك)
- **Project URL:** `https://dqfgkqzrtfqchxnlsmbo.supabase.co`
- **Project ref:** `dqfgkqzrtfqchxnlsmbo`
- **DB (للـ psql المحلي فقط، لو احتجت):** `postgresql://postgres:[YOUR-PASSWORD]@db.dqfgkqzrtfqchxnlsmbo.supabase.co:5432/postgres`
  (استبدل `[YOUR-PASSWORD]` بكلمة سر قاعدة البيانات من Dashboard → Database → Connection string)
- **Publishable key (للواجهة):** `sb_publishable_NZTysv7Xu9zvvpyLm5CLvw_3BD2-ypf`

## ١) أنشئ مشروع Supabase
(لو لسه معملتش) ادخل [supabase.com](https://supabase.com) → New Project، واختَر الاسم وكمّل.
من **Project Settings → API** هتاخد:
- **Project URL** → `SUPABASE_URL` (ده `https://dqfgkqzrtfqchxnlsmbo.supabase.co`)
- **anon / publishable key** → `SUPABASE_ANON_KEY` (ده `sb_publishable_NZTysv7Xu9zvvpyLm5CLvw_3BD2-ypf`)

## ٢) طبّق مخطط قاعدة البيانات + سياسات الأمان
لازم تتعمل على مشروعك (مش من الساندبوكس). طريقتان:

### الطريقة أ — SQL Editor (الأسهل، بدون CLI)
1. افتح **SQL Editor** في مشروعك.
2. الصق محتوى `supabase/schema.sql` كامل ونفّذه.
ده بيعمل: الجداول `admins`, `courses`, `videos`, `student_profiles`, `progress`, `reviews` +
القيود (CHECK) + دوال المساعدة + تفعيل RLS + السياسات.

### الطريقة ب — Supabase CLI (اللي إنت كتبها)
نفّذ على جهازك (فيه إنترنت وصلاحيات):
```bash
npm i -g supabase
supabase login                       # بيفتح المتصفح للدخول
supabase init                        # بينشئ supabase/ (migrations/ فاضية)
supabase link --project-ref dqfgkqzrtfqchxnlsmbo
cp supabase/schema.sql supabase/migrations/0001_init.sql   # انسخ المخطط داخل migrations
supabase db push                     # بيطبّق المخطط على المشروع المربوط
```
> ملاحظة: `supabase db push` شغّال بالـ API (محتاج login + link بس، **محتاجش** كلمة سر قاعدة البيانات).

> ملاحظة: سمّينا عمود `order` بـ `sort_order` لأن `order` كلمة محجوزة في SQL.
> وبقية الأسماء snake_case (مثال: `imageUrl` → `image_url`).

## ٣) اضبط سر JWT المخصص (مهم جدًا)
ملف `/api/supabase-session` بيعمل توكن **HS256** بالسر `SUPABASE_JWT_SECRET`. عشان Supabase يتأكد
من التوكن، لازم السر ده = الـ **HS256 (Shared Secret)** بتاع المشروع.

في صفحة **Settings → JWT Keys**:
1. اضغط **Create Standby Key** واختَر **HS256 (Shared Secret)** (عملت ده ✓ — ظهر عندك كـ Previous).
2. (ينصح بيه) اضغط على مفتاح HS256 الجديد واختَر **Switch to** عشان يبقى هو **Current**
   بدل ECC. (لو مسويتش، التوكنات بتتأكد برضه لأن الـ HS256 موجود في "Previously used".)
3. اضغط على قسم **Legacy JWT Secret** وافتحه عشان **تكشف السر (Reveal)**، وانسخ نص السر ده بالضبط.
4. ضعه في `SUPABASE_JWT_SECRET` (خطوة ٤). **لازم يتطابق تمامًا** مع السر اللي بيوقّع بيه الـ API،
   وإلا التوكن هيُرفض.

> ملاحظة: سر JWT ده **خادم فقط** — متحطش في JavaScript ولا ترفعه على Git.

## ٤) متغيرات البيئة على Vercel
في **Vercel → Environment Variables** أضف (وفّرها في جميع البيئات):
```
SUPABASE_URL=https://dqfgkqzrtfqchxnlsmbo.supabase.co
SUPABASE_ANON_KEY=sb_publishable_NZTysv7Xu9zvvpyLm5CLvw_3BD2-ypf
SUPABASE_JWT_SECRET=<نفس السر من الخطوة ٣ — لازم يطابق JWT Secret في الداشبورد>
```
(المتغيرات القديمة `FIREBASE_PROJECT_ID`, `ALLOWED_ORIGINS`, `POSTIMAGES_API_KEY` تفضل موجودة.)

## ٥) أضف أول أدمن (Bootstrap)
افتح **SQL Editor** ونفّذ (بيشتغل كمالك وبي bypass الـ RLS):
```sql
insert into public.admins (id, active, email)
values ('FIREBASE_UID_OF_ADMIN', true, 'admin@example.com');
```
استبدل `FIREBASE_UID_OF_ADMIN` بـ UID بتاعك في Firebase (من `firebase.auth().currentUser.uid`).

بعد كده أي أدمن يقدر يضيف غيره من لوحة الإدارة.

---

## ٦) ربط الواجهة الأمامية (الخطوة الجاية — لسه متعملناش)
الخطوات اللي فوق جهّزت **القاعدة والقواعد**. عشان الموقع يستخدمها:

1. بعد تسجيل الدخول بـ Firebase، اجلب الـ ID token:
   ```js
   const firebaseIdToken = await firebase.auth().currentUser.getIdToken();
   ```
2. ابعته لواجهتنا عشان تاخد توكن Supabase:
   ```js
   const res = await fetch('/api/supabase-session', {
     method: 'POST',
     headers: { Authorization: `Bearer ${firebaseIdToken}` },
   });
   const { data } = await res.json(); // data.token
   ```
3. شغّل عميل Supabase بالتوكن ده:
   ```js
   import { createClient } from '@supabase/supabase-js';
   const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
   await supabase.auth.setSession({ access_token: data.token, refresh_token: '' });
   ```
4. التوكن بيعيش ساعة؛ قبل ما ينتهي ارجع نفّذ الخطوات 1–3 تاني.

وده بيخلي قراءة الكورسات/الدروس/التقدّم تتم من Supabase بدل Firestore،
فتبطل Firebase تحسبها ضد حدودك.

---

## تعيين الحقول (Firestore → Supabase)
| Firestore (collection / field)        | Supabase (table / column)        |
|--------------------------------------|----------------------------------|
| `admins/{uid}`                       | `admins` (id = Firebase UID)     |
| `courses/{id}`                       | `courses`                        |
| `courses/{id}/videos/{id}`           | `videos` (course_id FK)          |
| `studentProfiles/{uid}`              | `student_profiles`               |
| `progress/{uid_courseId}`            | `progress` (id يبدأ بـ `uid_`)   |
| `reviews/{id}`                       | `reviews`                        |
| `order`                              | `sort_order`                     |
| `videoUrl`, `imageUrl` …             | `video_url`, `image_url` …       |

## ملاحظات أمنية
- `SUPABASE_JWT_SECRET` سر **خادم فقط** — متحطش في JavaScript ولا ترفعه على Git.
- `SUPABASE_ANON_KEY` عام وآمن للاستخدام في المتصفح **بشرط إن RLS شغّالة** (وهي شغالة بالسياسات دي).
- أي زائر يقدر يقرأ الكورسات (عامة)، لكن الدروس والتقدّم والتقييمات مقيدة بالطالب/الأدمن.
