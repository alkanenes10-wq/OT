-- =====================================================================
--  YKS Takip — Supabase veritabanı şeması
--  Supabase → SQL Editor → New query → bu dosyanın TAMAMINI yapıştırıp
--  "Run" deyin. Dosya tekrar çalıştırılabilir (mevcut verileri silmez).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) TABLOLAR
-- ---------------------------------------------------------------------

-- Kullanıcı profilleri (danışman + öğrenci)
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  role          text not null check (role in ('counselor', 'student')),
  full_name     text not null check (char_length(full_name) between 1 and 120),
  username      text unique,
  counselor_id  uuid references public.profiles (id) on delete set null,
  field         text,           -- Alan: SAY / EA / SÖZ / DİL / TYT
  grade         text,           -- 11. sınıf / 12. sınıf / Mezun
  exam_year     int,
  target        text,           -- Hedef (bölüm / sıralama)
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists profiles_counselor_idx on public.profiles (counselor_id);

-- Haftalık program (şablondaki 1. sayfa). 7 gün, başlangıç tarihinden itibaren.
create table if not exists public.weekly_plans (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.profiles (id) on delete cascade,
  start_date  date not null,
  title       text,
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (student_id, start_date)
);

-- Programdaki ders görevleri (gün × ders hücresi + tamamlandı kutucuğu)
create table if not exists public.plan_tasks (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references public.weekly_plans (id) on delete cascade,
  student_id  uuid not null references public.profiles (id) on delete cascade,
  day_index   smallint not null check (day_index between 0 and 6),
  subject     text not null check (char_length(subject) between 1 and 60),
  content     text not null default '' check (char_length(content) <= 500),
  done        boolean not null default false,
  done_at     timestamptz,
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (plan_id, day_index, subject)
);
create index if not exists plan_tasks_student_idx on public.plan_tasks (student_id);

-- Programdaki gün bilgileri (notlar, zaman aralıkları, toplam süre / soru)
create table if not exists public.plan_days (
  plan_id         uuid not null references public.weekly_plans (id) on delete cascade,
  day_index       smallint not null check (day_index between 0 and 6),
  student_id      uuid not null references public.profiles (id) on delete cascade,
  notes           text not null default '' check (char_length(notes) <= 2000),
  time_blocks     jsonb not null default '[]'::jsonb check (jsonb_typeof(time_blocks) = 'array'),
  study_minutes   int check (study_minutes between 0 and 1440),
  question_count  int check (question_count between 0 and 5000),
  updated_by      uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_at      timestamptz not null default now(),
  primary key (plan_id, day_index)
);
create index if not exists plan_days_student_idx on public.plan_days (student_id);

-- Günlük takip (şablondaki 2. sayfa)
create table if not exists public.daily_logs (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references public.profiles (id) on delete cascade,
  log_date         date not null,
  sleep_hours      numeric(3,1) check (sleep_hours between 0 and 24),
  procrastinated   boolean,
  phone_minutes    int check (phone_minutes between 0 and 1440),
  replanned        boolean,
  anxiety          smallint check (anxiety between 1 and 5),
  energy           smallint check (energy between 1 and 5),
  motivation       smallint check (motivation between 1 and 5),
  obstacle         text check (char_length(obstacle) <= 1000),
  action_taken     text check (char_length(action_taken) <= 1000),
  what_worked      text check (char_length(what_worked) <= 1000),
  tomorrow_change  text check (char_length(tomorrow_change) <= 1000),
  updated_by       uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (student_id, log_date)
);

-- Konu takibi (şablondaki ders sayfaları). Konu listesi uygulama içinde sabittir;
-- burada yalnızca öğrencinin her konudaki durumu tutulur.
create table if not exists public.topic_progress (
  student_id  uuid not null references public.profiles (id) on delete cascade,
  topic_id    text not null check (char_length(topic_id) <= 80),
  status      text not null default 'not_started'
              check (status in ('not_started', 'in_progress', 'done', 'reviewed')),
  note        text not null default '' check (char_length(note) <= 1000),
  updated_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_at  timestamptz not null default now(),
  primary key (student_id, topic_id)
);

-- Danışman notları — YALNIZCA danışman görür, öğrenci göremez.
create table if not exists public.counselor_notes (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.profiles (id) on delete cascade,
  counselor_id  uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  note_date     date not null default current_date,
  content       text not null check (char_length(content) between 1 and 5000),
  created_at    timestamptz not null default now()
);
create index if not exists counselor_notes_student_idx on public.counselor_notes (student_id, note_date desc);

-- ---------------------------------------------------------------------
-- 2) YARDIMCI FONKSİYONLAR
-- ---------------------------------------------------------------------

-- Giriş yapan kişi bu öğrencinin danışmanı mı?
create or replace function public.is_counselor_of(sid uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = sid
      and p.role = 'student'
      and p.counselor_id = (select auth.uid())
  );
$$;

-- Giriş yapan kişi bu öğrencinin verisine erişebilir mi? (öğrencinin kendisi veya danışmanı)
create or replace function public.can_access_student(sid uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select
    exists (
      select 1 from public.profiles p
      where p.id = sid
        and p.id = (select auth.uid())
        and p.role = 'student'
        and p.is_active
    )
    or public.is_counselor_of(sid);
$$;

-- Giriş yapan öğrencinin danışmanının id'si
create or replace function public.my_counselor_id()
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select p.counselor_id from public.profiles p where p.id = (select auth.uid());
$$;

-- updated_at / updated_by alanlarını otomatik doldurur
create or replace function public.touch_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

-- Görev ve gün satırlarında student_id'yi her zaman planın sahibinden alır
-- (başka bir öğrencinin planına kayıt eklenmesini engeller)
create or replace function public.set_student_from_plan()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  owner uuid;
begin
  select wp.student_id into owner from public.weekly_plans wp where wp.id = new.plan_id;
  if owner is null then
    raise exception 'Plan bulunamadı';
  end if;
  new.student_id := owner;
  return new;
end;
$$;

-- Görev işaretlendiğinde tamamlanma zamanını kaydeder
create or replace function public.set_done_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.done and (tg_op = 'INSERT' or not old.done) then
    new.done_at := now();
  elsif not new.done then
    new.done_at := null;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 3) TETİKLEYİCİLER
-- ---------------------------------------------------------------------
drop trigger if exists weekly_plans_touch on public.weekly_plans;
create trigger weekly_plans_touch before update on public.weekly_plans
  for each row execute function public.touch_row();

drop trigger if exists plan_tasks_owner on public.plan_tasks;
create trigger plan_tasks_owner before insert or update on public.plan_tasks
  for each row execute function public.set_student_from_plan();
drop trigger if exists plan_tasks_touch on public.plan_tasks;
create trigger plan_tasks_touch before update on public.plan_tasks
  for each row execute function public.touch_row();
drop trigger if exists plan_tasks_done on public.plan_tasks;
create trigger plan_tasks_done before insert or update on public.plan_tasks
  for each row execute function public.set_done_at();

drop trigger if exists plan_days_owner on public.plan_days;
create trigger plan_days_owner before insert or update on public.plan_days
  for each row execute function public.set_student_from_plan();
drop trigger if exists plan_days_touch on public.plan_days;
create trigger plan_days_touch before update on public.plan_days
  for each row execute function public.touch_row();

drop trigger if exists daily_logs_touch on public.daily_logs;
create trigger daily_logs_touch before update on public.daily_logs
  for each row execute function public.touch_row();

drop trigger if exists topic_progress_touch on public.topic_progress;
create trigger topic_progress_touch before update on public.topic_progress
  for each row execute function public.touch_row();

-- ---------------------------------------------------------------------
-- 4) SATIR DÜZEYİNDE GÜVENLİK (RLS)
--    Öğrenci yalnızca kendi verisini, danışman yalnızca kendi öğrencilerini görür.
-- ---------------------------------------------------------------------
alter table public.profiles        enable row level security;
alter table public.weekly_plans    enable row level security;
alter table public.plan_tasks      enable row level security;
alter table public.plan_days       enable row level security;
alter table public.daily_logs      enable row level security;
alter table public.topic_progress  enable row level security;
alter table public.counselor_notes enable row level security;

-- profiles
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or counselor_id = (select auth.uid())
    or id = public.my_counselor_id()
  );

drop policy if exists profiles_update_student on public.profiles;
create policy profiles_update_student on public.profiles for update to authenticated
  using (counselor_id = (select auth.uid()) and role = 'student')
  with check (counselor_id = (select auth.uid()) and role = 'student');

drop policy if exists profiles_update_self_counselor on public.profiles;
create policy profiles_update_self_counselor on public.profiles for update to authenticated
  using (id = (select auth.uid()) and role = 'counselor')
  with check (id = (select auth.uid()) and role = 'counselor');
-- (Profil ekleme/silme yalnızca sunucu tarafındaki API ile yapılır.)

-- weekly_plans
drop policy if exists weekly_plans_all on public.weekly_plans;
create policy weekly_plans_all on public.weekly_plans for all to authenticated
  using (public.can_access_student(student_id))
  with check (public.can_access_student(student_id));

-- plan_tasks
drop policy if exists plan_tasks_all on public.plan_tasks;
create policy plan_tasks_all on public.plan_tasks for all to authenticated
  using (public.can_access_student(student_id))
  with check (public.can_access_student(student_id));

-- plan_days
drop policy if exists plan_days_all on public.plan_days;
create policy plan_days_all on public.plan_days for all to authenticated
  using (public.can_access_student(student_id))
  with check (public.can_access_student(student_id));

-- daily_logs
drop policy if exists daily_logs_all on public.daily_logs;
create policy daily_logs_all on public.daily_logs for all to authenticated
  using (public.can_access_student(student_id))
  with check (public.can_access_student(student_id));

-- topic_progress
drop policy if exists topic_progress_all on public.topic_progress;
create policy topic_progress_all on public.topic_progress for all to authenticated
  using (public.can_access_student(student_id))
  with check (public.can_access_student(student_id));

-- counselor_notes (öğrenci erişemez)
drop policy if exists counselor_notes_all on public.counselor_notes;
create policy counselor_notes_all on public.counselor_notes for all to authenticated
  using (counselor_id = (select auth.uid()) and public.is_counselor_of(student_id))
  with check (counselor_id = (select auth.uid()) and public.is_counselor_of(student_id));

-- ---------------------------------------------------------------------
-- 5) YETKİLER
--    Giriş yapmamış (anon) kullanıcılar hiçbir tabloya erişemez.
-- ---------------------------------------------------------------------
revoke all on public.profiles, public.weekly_plans, public.plan_tasks, public.plan_days,
  public.daily_logs, public.topic_progress, public.counselor_notes from anon, authenticated;

grant select on public.profiles to authenticated;
-- Danışman yalnızca bu alanları güncelleyebilir (rol, kullanıcı adı vb. değiştirilemez)
grant update (full_name, field, grade, exam_year, target) on public.profiles to authenticated;

grant select, insert, update, delete on
  public.weekly_plans, public.plan_tasks, public.plan_days,
  public.daily_logs, public.topic_progress, public.counselor_notes
to authenticated;

revoke execute on function public.is_counselor_of(uuid), public.can_access_student(uuid),
  public.my_counselor_id() from anon, public;
grant execute on function public.is_counselor_of(uuid), public.can_access_student(uuid),
  public.my_counselor_id() to authenticated;

-- Tamamlandı ✔
