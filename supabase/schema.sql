-- =============================================================================
--  خطوات نحو التميز — مخطط Supabase (Postgres) + سياسات الأمان RLS
--  Khutuwat — Supabase schema + Row Level Security policies
-- -----------------------------------------------------------------------------
--  الهدف: ننقل قراءة/كتابة البيانات من Firestore إلى Supabase Postgres للهروب
--  من حدود القراءة/الكتابة في Firebase، مع إبقاء Firebase Auth + Storage كما هما.
--
--  كيف تعمل الهوية (RLS)؟
--  - الموقع بيدخل بـ Firebase Auth، وبعدين بيروح لـ /api/supabase-session
--    اللي بيأكد Firebase token ويصدر Supabase JWT (موقّع بـ SUPABASE_JWT_SECRET).
--  - الـ JWT ده بيحط Firebase UID جوه claim اسمه `sub`.
--  - دالة public.uid() بترجّع قيمة `sub` كنص (text) عشان Firebase UID مش بصيغة uuid.
--  - سياسات RLS تستعمل public.uid() و is_admin() و is_enrolled_student().
--
--  ترتيب التنفيذ مهم: الجداول أولاً، ثم الدوال (اللي بتشير للجداول)، ثم السياسات.
--  شغّل الملف ده كاملًا من SQL Editor في مشروع Supabase بتاعك.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) الجداول (Tables) — تقابل مجموعات Firestore
--    أسماء الأعمدة snake_case، وكل القيود (CHECK) تقابل دوال التحقق في firestore.rules
-- ---------------------------------------------------------------------------

-- المدرسون/المشرفون (admins/{adminUid})
create table if not exists public.admins (
  id          text primary key,                 -- Firebase UID
  active      boolean not null default true,
  email       text,
  created_at  timestamptz not null default now(),
  constraint admins_email_len     check (email is null or length(email) <= 254)
);

-- الكورسات العامة (courses/{courseId}) — متاحة لأي زائر (read: true)
create table if not exists public.courses (
  id                text primary key,           -- معرّف الكورس (يحدده التطبيق)
  title             text not null,
  short             text,
  description       text,
  image_url         text not null default '',
  image_position_x  integer not null default 50,
  image_position_y  integer not null default 50,
  image_zoom        integer not null default 100,
  sort_order        integer not null default 0,-- كان اسمه "order" في Firestore (محجوز في SQL)
  video_count       integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint courses_title_len        check (length(title) between 1 and 120),
  constraint courses_short_len        check (short is null or length(short) <= 220),
  constraint courses_description_len  check (description is null or length(description) <= 1200),
  constraint courses_image_url        check (length(image_url) <= 2048 and (image_url = '' or image_url ~ '^https://[^[:space:]]+$')),
  constraint courses_pos_x            check (image_position_x between 0 and 100),
  constraint courses_pos_y            check (image_position_y between 0 and 100),
  constraint courses_zoom             check (image_zoom between 100 and 220),
  constraint courses_order            check (sort_order between 0 and 9999),
  constraint courses_video_count      check (video_count between 0 and 9999)
);

-- الدروس/الفيديوهات (courses/{courseId}/videos/{videoId})
create table if not exists public.videos (
  id                text primary key,
  course_id         text not null references public.courses(id) on delete cascade,
  title             text not null,
  instructor        text,
  duration          text,
  sort_order        integer not null default 0,
  image_url         text not null default '',
  image_position_x  integer not null default 50,
  image_position_y  integer not null default 50,
  image_zoom        integer not null default 100,
  video_url         text not null,

  constraint videos_title_len       check (length(title) between 1 and 120),
  constraint videos_instructor_len check (instructor is null or length(instructor) <= 90),
  constraint videos_duration_len   check (duration is null or length(duration) <= 40),
  constraint videos_order          check (sort_order between 0 and 9999),
  constraint videos_image_url      check (length(image_url) <= 2048 and (image_url = '' or image_url ~ '^https://[^[:space:]]+$')),
  constraint videos_pos_x          check (image_position_x between 0 and 100),
  constraint videos_pos_y          check (image_position_y between 0 and 100),
  constraint videos_zoom           check (image_zoom between 100 and 220),
  constraint videos_video_url      check (length(video_url) between 12 and 2048 and video_url ~ '^https://[^[:space:]]+$')
);

-- ملفات الطلاب (studentProfiles/{studentUid})
create table if not exists public.student_profiles (
  id             text primary key,             -- Firebase UID
  email          text,
  online         boolean,
  last_login_at  timestamptz,
  last_seen      timestamptz,
  created_at     timestamptz not null default now(),

  constraint student_profiles_email_len check (email is null or length(email) <= 254)
);

-- تقدّم الطالب في الكورس (progress/{progressId})
create table if not exists public.progress (
  id                   text primary key,       -- يبدأ بـ uid_  (مثال: uid_courseId)
  student_uid          text not null,
  student_email        text,
  course_id            text not null,
  course_title         text not null,
  completed_lesson_ids text[] not null default '{}',
  completed_count      integer not null default 0,
  total_lessons        integer not null default 0,
  percent              integer not null default 0,
  updated_at           timestamptz not null default now(),

  constraint progress_student_email_len check (student_email is null or length(student_email) <= 254),
  constraint progress_course_id_len    check (length(course_id) between 1 and 160),
  constraint progress_course_title_len check (length(course_title) between 1 and 120),
  constraint progress_lessons_arr      check (coalesce(array_length(completed_lesson_ids, 1), 0) <= 1000),
  constraint progress_completed        check (completed_count between 0 and 9999),
  constraint progress_total            check (total_lessons between 0 and 9999),
  constraint progress_percent          check (percent between 0 and 100),
  constraint progress_balance          check (completed_count <= total_lessons)
);

-- تقييمات الطلاب (reviews/{reviewId})
create table if not exists public.reviews (
  id            text primary key,
  student_uid   text not null,
  student_email text,
  rating        integer not null,
  comment       text not null,
  status        text not null default 'pending',
  created_at    timestamptz not null default now(),

  constraint reviews_student_email_len check (student_email is null or length(student_email) <= 254),
  constraint reviews_rating           check (rating between 1 and 5),
  constraint reviews_comment_len      check (length(comment) between 1 and 1000),
  constraint reviews_status           check (status in ('pending', 'approved', 'rejected'))
);

-- ---------------------------------------------------------------------------
-- 2) دوال مساعدة (Helpers) — تقابل الدوال في firestore.rules
--    (موضوعة بعد الجداول عشان جسم الدالة يلاقي الجداول موجودة وقت التعريف)
-- ---------------------------------------------------------------------------

-- يرجع Firebase UID من الـ JWT ( claim: sub ). نرجّعه كنص لأن Firebase UID مش UUID.
-- SECURITY DEFINER + search_path: يقرأ الـ JWT من سياق الطلب بأمان وبدون تكرار RLS.
create or replace function public.uid() returns text
language sql
stable
security definer
set search_path = public
as $$
  select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '');
$$;

-- هل المستخدم الحالي أدمن نشط؟ (يقابل isAdmin في firestore.rules)
-- SECURITY DEFINER ضروري: الدالة بتسأل جدول admins اللي عليه سياسة بتستدعي is_admin()،
-- فلولا ده هيحصل infinite recursion وقت الاستعلام.
create or replace function public.is_admin() returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins a
    where a.id = public.uid() and a.active = true
  );
$$;

-- هل المستخدم الحالي طالب مسجّل (له ملف studentProfiles)؟ (يقابل isEnrolledStudent)
-- SECURITY DEFINER لنفس السبب: يتجاوز RLS على student_profiles ويمنع التكرار.
create or replace function public.is_enrolled_student() returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.student_profiles s
    where s.id = public.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- 3) فهارس (Indexes) لتسريع الاستعلامات الشائعة
-- ---------------------------------------------------------------------------
create index if not exists idx_videos_course_id      on public.videos(course_id);
create index if not exists idx_progress_student_uid  on public.progress(student_uid);
create index if not exists idx_reviews_student_uid   on public.reviews(student_uid);
create index if not exists idx_reviews_status        on public.reviews(status);
create index if not exists idx_student_profiles_email on public.student_profiles(email);

-- ---------------------------------------------------------------------------
-- 4) مزامنة video_count تلقائيًا مع عدد الدروس الفعلية (كان محسوبًا في Firestore)
-- ---------------------------------------------------------------------------
create or replace function public.sync_course_video_count() returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    update public.courses
       set video_count = (select count(*) from public.videos where course_id = old.course_id)
     where id = old.course_id;
    return old;
  else
    update public.courses
       set video_count = (select count(*) from public.videos where course_id = new.course_id)
     where id = new.course_id;
    return new;
  end if;
end;
$$;

drop trigger if exists trg_videos_sync on public.videos;
create trigger trg_videos_sync
  after insert or update or delete on public.videos
  for each row execute function public.sync_course_video_count();

-- تحديث updated_at تلقائيًا عند تعديل الكورس
create or replace function public.touch_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_courses_touch on public.courses;
create trigger trg_courses_touch
  before update on public.courses
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 5) الصلاحيات (Grants) — نعطي الأدوار حق الوصول، وRLS هو اللي يرشّح الصفوف
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated, anon;

grant select, insert, update, delete on public.admins            to authenticated;
grant select, insert, update, delete on public.courses           to authenticated;
grant select, insert, update, delete on public.videos            to authenticated;
grant select, insert, update, delete on public.student_profiles  to authenticated;
grant select, insert, update, delete on public.progress          to authenticated;
grant select, insert, update, delete on public.reviews           to authenticated;

-- الكورسات عامة (أي زائر يقدر يشوف القائمة قبل تسجيل الدخول — كان read: true)
grant select on public.courses to anon;

-- ---------------------------------------------------------------------------
-- 6) تفعيل Row Level Security على كل الجداول
-- ---------------------------------------------------------------------------
alter table public.admins            enable row level security;
alter table public.courses           enable row level security;
alter table public.videos            enable row level security;
alter table public.student_profiles  enable row level security;
alter table public.progress          enable row level security;
alter table public.reviews           enable row level security;

-- ---------------------------------------------------------------------------
-- 7) سياسات الأمان (RLS Policies) — تقابل match بلوكات firestore.rules تمامًا
-- ---------------------------------------------------------------------------

-- ----- admins -----
drop policy if exists admins_select on public.admins;
create policy admins_select on public.admins
  for select using (public.uid() = id or public.is_admin());

drop policy if exists admins_insert on public.admins;
create policy admins_insert on public.admins
  for insert with check (public.is_admin());

drop policy if exists admins_update on public.admins;
create policy admins_update on public.admins
  for update using (public.is_admin())
  with check (public.is_admin() and (public.uid() <> id or active = true));

drop policy if exists admins_delete on public.admins;
create policy admins_delete on public.admins
  for delete using (public.is_admin() and public.uid() <> id);

-- ----- courses (عامة للقراءة، يكتبها الأدمن فقط) -----
drop policy if exists courses_select on public.courses;
create policy courses_select on public.courses
  for select using (true);

drop policy if exists courses_write on public.courses;
create policy courses_write on public.courses
  for all using (public.is_admin()) with check (public.is_admin());

-- ----- videos (الأدمن أو طالب مسجّل يقرأ، الأدمن يكتب فقط) -----
drop policy if exists videos_select on public.videos;
create policy videos_select on public.videos
  for select using (public.is_admin() or public.is_enrolled_student());

drop policy if exists videos_write on public.videos;
create policy videos_write on public.videos
  for all using (public.is_admin()) with check (public.is_admin());

-- ----- student_profiles -----
drop policy if exists student_profiles_select on public.student_profiles;
create policy student_profiles_select on public.student_profiles
  for select using (public.is_admin() or public.uid() = id);

drop policy if exists student_profiles_insert on public.student_profiles;
create policy student_profiles_insert on public.student_profiles
  for insert with check (public.is_admin());

drop policy if exists student_profiles_update on public.student_profiles;
create policy student_profiles_update on public.student_profiles
  for update using (public.uid() = id) with check (public.uid() = id);

drop policy if exists student_profiles_delete on public.student_profiles;
create policy student_profiles_delete on public.student_profiles
  for delete using (public.is_admin());

-- ----- progress -----
drop policy if exists progress_select on public.progress;
create policy progress_select on public.progress
  for select using (public.is_admin() or student_uid = public.uid());

drop policy if exists progress_insert on public.progress;
create policy progress_insert on public.progress
  for insert with check (
    public.is_enrolled_student()
    and student_uid = public.uid()
    and substring(id from 1 for length(public.uid()) + 1) = public.uid() || '_'  -- id يبدأ بـ uid_
  );

drop policy if exists progress_update on public.progress;
create policy progress_update on public.progress
  for update using (public.is_enrolled_student() and student_uid = public.uid())
  with check (public.is_enrolled_student() and student_uid = public.uid());

drop policy if exists progress_delete on public.progress;
create policy progress_delete on public.progress
  for delete using (public.is_admin() or student_uid = public.uid());

-- ----- reviews -----
drop policy if exists reviews_select on public.reviews;
create policy reviews_select on public.reviews
  for select using (public.is_admin() or status = 'approved');

drop policy if exists reviews_insert on public.reviews;
create policy reviews_insert on public.reviews
  for insert with check (
    public.is_enrolled_student()
    and student_uid = public.uid()
    and status = 'pending'
  );

drop policy if exists reviews_write on public.reviews;
create policy reviews_write on public.reviews
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists reviews_delete on public.reviews;
create policy reviews_delete on public.reviews
  for delete using (public.is_admin());

-- =============================================================================
--  إضافة أول أدمن (Bootstrap)
--  شغّل هذا السطر من SQL Editor (بيشتغل كمالك، وبي bypass الـ RLS):
--    insert into public.admins (id, active, email)
--    values ('FIREBASE_UID_OF_ADMIN', true, 'admin@example.com');
--  استبدل FIREBASE_UID_OF_ADMIN بـ UID بتاعك في Firebase.
-- =============================================================================
