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

-- =====================================================================
--  GÜNCELLEME 2 (guncelleme-2.sql ile aynı)
-- =====================================================================
-- 1) Program görevlerine konu, görev türü ve soru sayıları
alter table public.plan_tasks add column if not exists topic_id text check (char_length(topic_id) <= 80);
alter table public.plan_tasks add column if not exists task_type text not null default 'diger'
  check (task_type in ('konu', 'soru', 'tekrar', 'deneme', 'diger'));
alter table public.plan_tasks add column if not exists target_questions int check (target_questions between 0 and 2000);
alter table public.plan_tasks add column if not exists solved int check (solved between 0 and 2000);
alter table public.plan_tasks add column if not exists correct int check (correct between 0 and 2000);
alter table public.plan_tasks add column if not exists wrong int check (wrong between 0 and 2000);
alter table public.plan_tasks add column if not exists sort smallint not null default 0;
-- Aynı gün aynı derse birden fazla görev (farklı konular) eklenebilsin
alter table public.plan_tasks drop constraint if exists plan_tasks_plan_id_day_index_subject_key;
create index if not exists plan_tasks_plan_day_idx on public.plan_tasks (plan_id, day_index);

-- 2) Haftalık programda günlük müsaitlik (kapalı / hafif / normal / yoğun)
alter table public.weekly_plans add column if not exists day_levels jsonb not null default '[]'::jsonb;

-- 3) Deneme analizleri (kazanım karnesi)
create table if not exists public.exam_analyses (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.profiles (id) on delete cascade,
  exam_date   date not null default current_date,
  title       text not null check (char_length(title) between 1 and 120),
  exam_type   text not null default 'TYT' check (exam_type in ('TYT', 'AYT', 'BRANS')),
  nets        jsonb not null default '{}'::jsonb,   -- {"Türkçe": {"d": 30, "y": 6}, ...}
  results     jsonb not null default '[]'::jsonb,   -- [{"topic_id": "...", "wrong": 2, "empty": 1}]
  file_path   text,
  notes       text not null default '' check (char_length(notes) <= 2000),
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists exam_analyses_student_idx on public.exam_analyses (student_id, exam_date desc);

alter table public.weekly_plans add column if not exists analysis_id uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'weekly_plans_analysis_id_fkey') then
    alter table public.weekly_plans
      add constraint weekly_plans_analysis_id_fkey foreign key (analysis_id)
      references public.exam_analyses (id) on delete set null;
  end if;
end $$;

alter table public.exam_analyses enable row level security;
drop policy if exists exam_analyses_all on public.exam_analyses;
create policy exam_analyses_all on public.exam_analyses for all to authenticated
  using (public.can_access_student(student_id))
  with check (public.can_access_student(student_id));
revoke all on public.exam_analyses from anon, authenticated;
grant select, insert, update, delete on public.exam_analyses to authenticated;

-- 4) Hedef soru sayısına ulaşılınca görev otomatik tamamlansın
create or replace function public.auto_done_from_solved()
returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(new.target_questions, 0) > 0 and coalesce(new.solved, 0) >= new.target_questions
     and (tg_op = 'INSERT' or new.solved is distinct from old.solved) then
    new.done := true;
  end if;
  return new;
end;
$$;
drop trigger if exists plan_tasks_autodone on public.plan_tasks;
create trigger plan_tasks_autodone before insert or update on public.plan_tasks
  for each row execute function public.auto_done_from_solved();

-- 5) Görev tamamlanınca KONU TAKİBİ otomatik güncellensin (hiçbir zaman geriye almaz)
--    Konu çalışma → Bitti · Soru çözümü → en az Çalışılıyor · Tekrar → Tekrar edildi
create or replace function public.sync_topic_from_task()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  target text;
  cur text;
  r_cur int;
  r_new int;
begin
  if new.topic_id is null or not new.done then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.done and old.topic_id is not distinct from new.topic_id
     and old.task_type = new.task_type then
    return new;
  end if;
  target := case new.task_type
    when 'konu' then 'done'
    when 'tekrar' then 'reviewed'
    when 'deneme' then null
    else 'in_progress'
  end;
  if target is null then
    return new;
  end if;
  select tp.status into cur from public.topic_progress tp
    where tp.student_id = new.student_id and tp.topic_id = new.topic_id;
  r_new := array_position(array['not_started', 'in_progress', 'done', 'reviewed'], target);
  r_cur := coalesce(array_position(array['not_started', 'in_progress', 'done', 'reviewed'], cur), 0);
  if cur is null then
    insert into public.topic_progress (student_id, topic_id, status, updated_by)
    values (new.student_id, new.topic_id, target, auth.uid())
    on conflict (student_id, topic_id) do nothing;
  elsif r_new > r_cur then
    update public.topic_progress
      set status = target, updated_at = now(), updated_by = coalesce(auth.uid(), updated_by)
      where student_id = new.student_id and topic_id = new.topic_id;
  end if;
  return new;
end;
$$;
drop trigger if exists plan_tasks_topic_sync on public.plan_tasks;
create trigger plan_tasks_topic_sync after insert or update on public.plan_tasks
  for each row execute function public.sync_topic_from_task();

-- 6) Kazanım karnesi PDF'leri için özel dosya deposu ("karneler")
--    Dosya yolu: <öğrenci id>/<dosya adı>. Yalnızca öğrencinin kendisi ve danışmanı erişebilir.
create or replace function public.can_access_student_path(p text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  sid uuid;
begin
  begin
    sid := split_part(p, '/', 1)::uuid;
  exception when others then
    return false;
  end;
  return public.can_access_student(sid);
end;
$$;
revoke execute on function public.can_access_student_path(text) from anon, public;
grant execute on function public.can_access_student_path(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('karneler', 'karneler', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;

drop policy if exists karneler_select on storage.objects;
create policy karneler_select on storage.objects for select to authenticated
  using (bucket_id = 'karneler' and public.can_access_student_path(name));
drop policy if exists karneler_insert on storage.objects;
create policy karneler_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'karneler' and public.can_access_student_path(name));
drop policy if exists karneler_delete on storage.objects;
create policy karneler_delete on storage.objects for delete to authenticated
  using (bucket_id = 'karneler' and public.can_access_student_path(name));

-- Supabase'in tablo listesini yenile
notify pgrst, 'reload schema';

-- Tamamlandı ✔

-- =====================================================================
-- GÜNCELLEME 3 — Çalışma saatleri + saatli program blokları
-- =====================================================================
-- 1) Öğrencinin haftalık çalışma saatleri (yalnızca danışman düzenler, öğrenci görür)
--    slots: 7 elemanlı dizi (0 = Pazartesi … 6 = Pazar), her gün [{ "s": "17:00", "e": "19:30" }, …]
create table if not exists public.study_schedules (
  student_id  uuid primary key references public.profiles (id) on delete cascade,
  slots       jsonb not null default '[[],[],[],[],[],[],[]]'::jsonb check (jsonb_typeof(slots) = 'array'),
  block_min   int not null default 40 check (block_min between 20 and 120),
  break_min   int not null default 10 check (break_min between 0 and 60),
  updated_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists study_schedules_touch on public.study_schedules;
create trigger study_schedules_touch before insert or update on public.study_schedules
  for each row execute function public.touch_row();

alter table public.study_schedules enable row level security;
drop policy if exists study_schedules_select on public.study_schedules;
create policy study_schedules_select on public.study_schedules for select to authenticated
  using (public.can_access_student(student_id));
drop policy if exists study_schedules_insert on public.study_schedules;
create policy study_schedules_insert on public.study_schedules for insert to authenticated
  with check (public.is_counselor_of(student_id));
drop policy if exists study_schedules_update on public.study_schedules;
create policy study_schedules_update on public.study_schedules for update to authenticated
  using (public.is_counselor_of(student_id)) with check (public.is_counselor_of(student_id));
drop policy if exists study_schedules_delete on public.study_schedules;
create policy study_schedules_delete on public.study_schedules for delete to authenticated
  using (public.is_counselor_of(student_id));
revoke all on public.study_schedules from anon, authenticated;
grant select, insert, update, delete on public.study_schedules to authenticated;

-- 2) Program görevlerine saat ve süre
alter table public.plan_tasks add column if not exists start_time text
  check (start_time is null or start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
alter table public.plan_tasks add column if not exists duration_min int
  check (duration_min is null or duration_min between 5 and 600);

notify pgrst, 'reload schema';

-- =====================================================================
-- GÜNCELLEME 4 — Destek / risk yönlendirmesi
-- =====================================================================
-- 1) Destek uyarıları (otomatik veya öğrencinin "Konuşmak istiyorum" isteği)
create table if not exists public.support_alerts (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.profiles (id) on delete cascade,
  source        text not null check (source in ('auto', 'student')),
  reasons       jsonb not null default '[]'::jsonb check (jsonb_typeof(reasons) = 'array'),
  student_note  text check (char_length(student_note) <= 1000),
  status        text not null default 'open' check (status in ('open', 'seen', 'contacted', 'closed')),
  student_dismissed_at timestamptz,          -- öğrenci destek kartını "şimdilik iyiyim" ile kapattı
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.profiles (id) on delete set null default auth.uid()
);
create index if not exists support_alerts_student_idx on public.support_alerts (student_id, created_at desc);

-- 2) Danışmanın yaptığı adımlar (tarihli kayıt)
create table if not exists public.support_actions (
  id          uuid primary key default gen_random_uuid(),
  alert_id    uuid not null references public.support_alerts (id) on delete cascade,
  student_id  uuid not null references public.profiles (id) on delete cascade,
  action      text not null check (action in ('seen', 'contacted', 'parent', 'school', 'referred', 'note', 'closed')),
  note        text not null default '' check (char_length(note) <= 2000),
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists support_actions_alert_idx on public.support_actions (alert_id, created_at);

drop trigger if exists support_alerts_touch on public.support_alerts;
create trigger support_alerts_touch before update on public.support_alerts
  for each row execute function public.touch_row();

-- Yalnızca öğrencinin kendi danışmanı görür ve işlem yapar. Öğrenci tabloları doğrudan göremez;
-- aşağıdaki fonksiyonlarla (request_support, support_prompt, dismiss_support_prompt) çalışır.
alter table public.support_alerts enable row level security;
alter table public.support_actions enable row level security;
drop policy if exists support_alerts_counselor on public.support_alerts;
create policy support_alerts_counselor on public.support_alerts for all to authenticated
  using (public.is_counselor_of(student_id)) with check (public.is_counselor_of(student_id));
drop policy if exists support_actions_counselor on public.support_actions;
create policy support_actions_counselor on public.support_actions for all to authenticated
  using (public.is_counselor_of(student_id)) with check (public.is_counselor_of(student_id));
revoke all on public.support_alerts, public.support_actions from anon, authenticated;
grant select, insert, update, delete on public.support_alerts, public.support_actions to authenticated;

-- 3) Otomatik kural: günlük takip kaydedildikçe son 3 kayıt (son 7 gün) incelenir.
--    Eşikleri buradan değiştirebilirsiniz.
create or replace function public.check_support_risk()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  n int;
  anx_hi int;
  low_mood int;
  bad_night int;
  v_reasons jsonb := '[]'::jsonb;
  existing uuid;
begin
  select count(*),
         count(*) filter (where anxiety >= 4),
         count(*) filter (where motivation <= 2 and energy <= 2),
         count(*) filter (where anxiety >= 4 and sleep_hours < 5)
    into n, anx_hi, low_mood, bad_night
    from (
      select anxiety, motivation, energy, sleep_hours from public.daily_logs
      where student_id = new.student_id and log_date > current_date - 7
      order by log_date desc limit 3
    ) t;
  if n < 3 then return new; end if;
  if anx_hi = 3 then v_reasons := v_reasons || to_jsonb('Son 3 kayıtta kaygı 4-5/5'::text); end if;
  if low_mood = 3 then v_reasons := v_reasons || to_jsonb('Son 3 kayıtta motivasyon ve enerji çok düşük (1-2/5)'::text); end if;
  if bad_night >= 2 then v_reasons := v_reasons || to_jsonb('Yüksek kaygıyla birlikte 5 saatten az uyku (2+ gün)'::text); end if;
  if jsonb_array_length(v_reasons) = 0 then return new; end if;

  select id into existing from public.support_alerts
    where student_id = new.student_id and source = 'auto' and status <> 'closed' and created_at > now() - interval '7 days'
    order by created_at desc limit 1;
  if existing is null then
    insert into public.support_alerts (student_id, source, reasons, updated_by) values (new.student_id, 'auto', v_reasons, null);
  else
    update public.support_alerts set reasons = v_reasons, updated_at = now() where id = existing;
  end if;
  return new;
end;
$$;
drop trigger if exists daily_logs_support_risk on public.daily_logs;
create trigger daily_logs_support_risk after insert or update on public.daily_logs
  for each row execute function public.check_support_risk();

-- 4) Öğrenci: "Konuşmak istiyorum"
create or replace function public.request_support(p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  existing uuid;
begin
  if not exists (select 1 from public.profiles where id = me and role = 'student' and is_active) then
    raise exception 'Yalnızca öğrenci hesabı destek isteyebilir';
  end if;
  select id into existing from public.support_alerts
    where student_id = me and source = 'student' and status <> 'closed' and created_at > now() - interval '24 hours'
    order by created_at desc limit 1;
  if existing is not null then
    update public.support_alerts
      set student_note = left(coalesce(nullif(trim(p_note), ''), student_note), 1000), status = 'open', updated_at = now()
      where id = existing;
  else
    insert into public.support_alerts (student_id, source, student_note, reasons)
    values (me, 'student', left(nullif(trim(p_note), ''), 1000), '["Öğrenci konuşmak istedi"]'::jsonb);
  end if;
  -- açık otomatik kart varsa öğrenci için kapat
  update public.support_alerts set student_dismissed_at = now()
    where student_id = me and source = 'auto' and student_dismissed_at is null;
end;
$$;

-- 5) Öğrenci: destek kartı gösterilsin mi? (uyarı nedenleri öğrenciye gösterilmez)
create or replace function public.support_prompt()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'show', exists (
      select 1 from public.support_alerts
      where student_id = auth.uid() and source = 'auto' and status <> 'closed'
        and student_dismissed_at is null and created_at > now() - interval '7 days'),
    'requested_at', (
      select max(created_at) from public.support_alerts
      where student_id = auth.uid() and source = 'student' and status <> 'closed')
  );
$$;

create or replace function public.dismiss_support_prompt()
returns void language sql security definer set search_path = '' as $$
  update public.support_alerts set student_dismissed_at = now()
  where student_id = auth.uid() and source = 'auto' and student_dismissed_at is null;
$$;

revoke all on function public.check_support_risk(), public.request_support(text), public.support_prompt(), public.dismiss_support_prompt() from anon, public;
grant execute on function public.request_support(text), public.support_prompt(), public.dismiss_support_prompt() to authenticated;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- Ayrıntılı uyarılar, görüşme takvimi, soru bankası (güncelleme 5 ile aynı)
-- ---------------------------------------------------------------------
-- 1) Ayrıntı sütunu
alter table public.support_alerts add column if not exists details jsonb not null default '[]'::jsonb;
do $$ begin
  alter table public.support_alerts add constraint support_alerts_details_is_array check (jsonb_typeof(details) = 'array');
exception when duplicate_object then null;
end $$;

-- Yardımcı: son 3 kaydın (son 7 gün) değerlerini "12.10: 4/5 · 13.10: 5/5" biçiminde verir
create or replace function public.support_evidence(sid uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with t as (
    select log_date, anxiety, motivation, energy, sleep_hours, phone_minutes, procrastinated, obstacle
    from public.daily_logs
    where student_id = sid and log_date > current_date - 7
    order by log_date desc limit 3
  )
  select jsonb_build_object(
    'anxiety',    string_agg(to_char(log_date, 'DD.MM') || ': ' || coalesce(anxiety::text || '/5', '—'), ' · ' order by log_date),
    'motivation', string_agg(to_char(log_date, 'DD.MM') || ': ' || coalesce(motivation::text || '/5', '—'), ' · ' order by log_date),
    'energy',     string_agg(to_char(log_date, 'DD.MM') || ': ' || coalesce(energy::text || '/5', '—'), ' · ' order by log_date),
    'sleep',      string_agg(to_char(log_date, 'DD.MM') || ': ' || coalesce(replace(to_char(sleep_hours, 'FM990.0'), '.', ',') || ' sa', '—'), ' · ' order by log_date),
    'phone',      string_agg(to_char(log_date, 'DD.MM') || ': ' || coalesce(phone_minutes::text || ' dk', '—'), ' · ' order by log_date),
    'procrastinated', string_agg(to_char(log_date, 'DD.MM') || ': ' || case when procrastinated then 'evet' when procrastinated = false then 'hayır' else '—' end, ' · ' order by log_date),
    'obstacles',  string_agg(case when length(trim(coalesce(obstacle, ''))) > 2
                              then to_char(log_date, 'DD.MM') || ': “' || left(trim(obstacle), 120) || '”' end, ' · ' order by log_date),
    'n', count(*)
  ) from t;
$$;

-- 2) Otomatik kural (aynı eşikler) + ayrıntılar
create or replace function public.check_support_risk()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  n int;
  anx_hi int;
  low_mood int;
  bad_night int;
  ev jsonb;
  v_reasons jsonb := '[]'::jsonb;
  v_details jsonb := '[]'::jsonb;
  existing uuid;
begin
  select count(*),
         count(*) filter (where anxiety >= 4),
         count(*) filter (where motivation <= 2 and energy <= 2),
         count(*) filter (where anxiety >= 4 and sleep_hours < 5)
    into n, anx_hi, low_mood, bad_night
    from (
      select anxiety, motivation, energy, sleep_hours from public.daily_logs
      where student_id = new.student_id and log_date > current_date - 7
      order by log_date desc limit 3
    ) t;
  if n < 3 then return new; end if;

  ev := public.support_evidence(new.student_id);

  if anx_hi = 3 then
    v_reasons := v_reasons || to_jsonb('Son 3 kayıtta kaygı 4-5/5'::text);
    v_details := v_details || jsonb_build_array(jsonb_build_object(
      'title', 'Kaygı üç kayıt üst üste yüksek (4-5/5)',
      'evidence', to_jsonb(array_remove(array[
        'Kaygı: ' || (ev->>'anxiety'),
        'Uyku: ' || (ev->>'sleep'),
        case when ev->>'obstacles' is not null then 'Öğrencinin yazdığı engeller: ' || (ev->>'obstacles') end], null)),
      'why', 'Yüksek kaygı dikkati ve çalışma belleğini daraltır. Üç gün sürmesi, geçici bir sınav gerginliğinden fazlası olabileceğini gösterir.',
      'next_step', 'Kısa bir görüşme planlayın; kaygının hangi durumlarda yükseldiğini ve aklından geçen düşünceleri birlikte yazın. Uyku da düşükse önce uykuyu ele alın. Günlük işlevsellik belirgin bozulduysa uzmana yönlendirmeyi değerlendirin.',
      'student_text', 'Son 3 kaydındaki kaygı puanların: ' || (ev->>'anxiety') || '. Kaygı art arda yüksek kaldığında dikkat daralır ve çalışmak zorlaşır; bu yetersiz olduğun anlamına gelmez, zorlandığını gösterir.'
    ));
  end if;

  if low_mood = 3 then
    v_reasons := v_reasons || to_jsonb('Son 3 kayıtta motivasyon ve enerji çok düşük (1-2/5)'::text);
    v_details := v_details || jsonb_build_array(jsonb_build_object(
      'title', 'Motivasyon ve enerji üç kayıt üst üste çok düşük (1-2/5)',
      'evidence', jsonb_build_array(
        'Motivasyon: ' || (ev->>'motivation'),
        'Enerji: ' || (ev->>'energy'),
        'Uyku: ' || (ev->>'sleep'),
        'Erteleme: ' || (ev->>'procrastinated')),
      'why', 'Birlikte ve birkaç gün süren düşük enerji ve motivasyon, yorgunluğun ya da duygu durumunda düşüşün işareti olabilir; yalnızca çalışma alışkanlığıyla açıklanmayabilir.',
      'next_step', 'Öğrenciye nasıl olduğunu sorun; uyku, iştah, keyif alma ve arkadaş ilişkilerindeki değişiklikleri dinleyin. Programın yükünü geçici olarak azaltın. İki haftadan uzun sürerse veli ve uzmanla iş birliğini değerlendirin.',
      'student_text', 'Son 3 kaydındaki motivasyon puanların: ' || (ev->>'motivation') || '; enerji puanların: ' || (ev->>'energy') || '. Birkaç gün üst üste böyle hissetmek yorucu olabilir; programı biraz hafifletmek ve konuşmak iyi gelebilir.'
    ));
  end if;

  if bad_night >= 2 then
    v_reasons := v_reasons || to_jsonb('Yüksek kaygıyla birlikte 5 saatten az uyku (2+ gün)'::text);
    v_details := v_details || jsonb_build_array(jsonb_build_object(
      'title', 'Yüksek kaygıyla birlikte 5 saatten az uyku (' || bad_night || ' gün)',
      'evidence', jsonb_build_array(
        'Uyku: ' || (ev->>'sleep'),
        'Kaygı: ' || (ev->>'anxiety'),
        'Telefon: ' || (ev->>'phone')),
      'why', 'Az uyku kaygıyı artırır, kaygı da uykuyu bozar. Bu döngü birkaç gün içinde dikkat, bellek ve duygu düzenlemeyi belirgin biçimde etkiler.',
      'next_step', 'Uykuyu önceliklendirin: geç saatteki çalışma bloklarını kaldırın, sabit kalkış saati ve yatmadan önce ekransız 1 saat belirleyin. Uykusuzluk sürerse aileyle paylaşın ve sağlık desteği önerin.',
      'student_text', 'Son kayıtlarındaki uyku sürelerin: ' || (ev->>'sleep') || '; kaygı puanların: ' || (ev->>'anxiety') || '. Az uyku kaygıyı artırır; bu gece erken yatmak bugünkü en önemli işin olabilir.'
    ));
  end if;

  if jsonb_array_length(v_reasons) = 0 then return new; end if;

  select id into existing from public.support_alerts
    where student_id = new.student_id and source = 'auto' and status <> 'closed' and created_at > now() - interval '7 days'
    order by created_at desc limit 1;
  if existing is null then
    insert into public.support_alerts (student_id, source, reasons, details, updated_by)
    values (new.student_id, 'auto', v_reasons, v_details, null);
  else
    update public.support_alerts set reasons = v_reasons, details = v_details, updated_at = now() where id = existing;
  end if;
  return new;
end;
$$;

-- 3) Öğrenci "Konuşmak istiyorum" dediğinde son 3 günün özeti de danışmana gider
create or replace function public.request_support(p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  existing uuid;
  ev jsonb;
  v_details jsonb := '[]'::jsonb;
begin
  if not exists (select 1 from public.profiles where id = me and role = 'student' and is_active) then
    raise exception 'Yalnızca öğrenci hesabı destek isteyebilir';
  end if;
  ev := public.support_evidence(me);
  if coalesce((ev->>'n')::int, 0) > 0 then
    v_details := jsonb_build_array(jsonb_build_object(
      'title', 'İstek anındaki son günlük kayıtlar',
      'evidence', to_jsonb(array_remove(array[
        'Kaygı: ' || (ev->>'anxiety'),
        'Motivasyon: ' || (ev->>'motivation'),
        'Enerji: ' || (ev->>'energy'),
        'Uyku: ' || (ev->>'sleep'),
        'Telefon: ' || (ev->>'phone'),
        'Erteleme: ' || (ev->>'procrastinated'),
        case when ev->>'obstacles' is not null then 'Yazdığı engeller: ' || (ev->>'obstacles') end], null)),
      'why', 'Öğrenci desteği kendisi istedi; bu, otomatik uyarılardan daha güçlü bir sinyaldir.',
      'next_step', 'Mümkün olan en kısa sürede öğrenciyle iletişime geçin ve dinleyin. Kendine zarar verme düşüncesi ya da acil bir risk sezerseniz veliyi bilgilendirin ve profesyonel yardıma yönlendirin.'
    ));
  else
    v_details := jsonb_build_array(jsonb_build_object(
      'title', 'Son 7 günde günlük kayıt yok',
      'evidence', '[]'::jsonb,
      'why', 'Öğrenci desteği kendisi istedi; bu, otomatik uyarılardan daha güçlü bir sinyaldir.',
      'next_step', 'Mümkün olan en kısa sürede öğrenciyle iletişime geçin ve dinleyin.'
    ));
  end if;

  select id into existing from public.support_alerts
    where student_id = me and source = 'student' and status <> 'closed' and created_at > now() - interval '24 hours'
    order by created_at desc limit 1;
  if existing is not null then
    update public.support_alerts
      set student_note = left(coalesce(nullif(trim(p_note), ''), student_note), 1000), status = 'open', details = v_details, updated_at = now()
      where id = existing;
  else
    insert into public.support_alerts (student_id, source, student_note, reasons, details)
    values (me, 'student', left(nullif(trim(p_note), ''), 1000), '["Öğrenci konuşmak istedi"]'::jsonb, v_details);
  end if;
  update public.support_alerts set student_dismissed_at = now()
    where student_id = me and source = 'auto' and student_dismissed_at is null;
end;
$$;

-- 4) Öğrencinin destek kartı: kendi verisine dayanan açıklamalar da döner
--    (danışmanın notları ve attığı adımlar öğrenciye gösterilmez)
create or replace function public.support_prompt()
returns jsonb language sql stable security definer set search_path = '' as $$
  with a as (
    select details from public.support_alerts
    where student_id = auth.uid() and source = 'auto' and status <> 'closed'
      and student_dismissed_at is null and created_at > now() - interval '7 days'
    order by created_at desc limit 1
  )
  select jsonb_build_object(
    'show', exists (select 1 from a),
    'details', coalesce((select jsonb_agg(d->>'student_text') filter (where d ? 'student_text') from a, jsonb_array_elements(a.details) d), '[]'::jsonb),
    'requested_at', (
      select max(created_at) from public.support_alerts
      where student_id = auth.uid() and source = 'student' and status <> 'closed')
  );
$$;

revoke all on function public.support_evidence(uuid), public.check_support_risk(), public.request_support(text), public.support_prompt() from anon, public;
grant execute on function public.request_support(text), public.support_prompt() to authenticated;

-- 5) Görüşme takvimi
create table if not exists public.counseling_sessions (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.profiles (id) on delete cascade,
  counselor_id uuid references public.profiles (id) on delete set null default auth.uid(),
  starts_at    timestamptz not null,
  duration_min int not null default 45 check (duration_min between 10 and 240),
  mode         text not null default 'online' check (mode in ('online', 'yuz_yuze', 'telefon')),
  link         text check (char_length(link) <= 500),
  topic        text not null default '' check (char_length(topic) <= 200),
  status       text not null default 'planned' check (status in ('planned', 'done', 'cancelled')),
  notes        text not null default '' check (char_length(notes) <= 3000), -- yalnızca danışman görür
  reminded_at  timestamptz,                                                 -- hatırlatma gönderildi
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references public.profiles (id) on delete set null default auth.uid()
);
alter table public.counseling_sessions add column if not exists reminded_at timestamptz;
create index if not exists counseling_sessions_student_idx on public.counseling_sessions (student_id, starts_at);

drop trigger if exists counseling_sessions_touch on public.counseling_sessions;
create trigger counseling_sessions_touch before update on public.counseling_sessions
  for each row execute function public.touch_row();

alter table public.counseling_sessions enable row level security;
drop policy if exists counseling_sessions_counselor on public.counseling_sessions;
create policy counseling_sessions_counselor on public.counseling_sessions for all to authenticated
  using (public.is_counselor_of(student_id)) with check (public.is_counselor_of(student_id));
revoke all on public.counseling_sessions from anon, authenticated;
grant select, insert, update, delete on public.counseling_sessions to authenticated;

-- Öğrenci kendi görüşmelerini notlar OLMADAN görür
create or replace function public.my_sessions()
returns table (id uuid, starts_at timestamptz, duration_min int, mode text, link text, topic text, status text)
language sql stable security definer set search_path = '' as $$
  select s.id, s.starts_at, s.duration_min, s.mode, s.link, s.topic, s.status
  from public.counseling_sessions s
  where s.student_id = auth.uid() and s.starts_at > now() - interval '30 days'
  order by s.starts_at;
$$;
revoke all on function public.my_sessions() from anon, public;
grant execute on function public.my_sessions() to authenticated;

-- 6) Soru bankası: öğrencinin çözemediği sorular (fotoğraf) ve bunlardan hazırlanan testler
create table if not exists public.question_items (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references public.profiles (id) on delete cascade,
  image_path     text not null check (char_length(image_path) <= 300),
  subject        text not null default '' check (char_length(subject) <= 60),
  topic_id       text check (char_length(topic_id) <= 80),
  source         text not null default '' check (char_length(source) <= 120),
  note           text not null default '' check (char_length(note) <= 1000),
  answer         text check (answer in ('A', 'B', 'C', 'D', 'E')),
  solution_path  text check (char_length(solution_path) <= 300),
  solution_note  text not null default '' check (char_length(solution_note) <= 2000),
  status         text not null default 'open' check (status in ('open', 'learned')),
  attempts       int not null default 0 check (attempts >= 0),
  correct_count  int not null default 0 check (correct_count >= 0),
  last_result    text check (last_result in ('correct', 'wrong', 'empty')),
  created_by     uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references public.profiles (id) on delete set null default auth.uid()
);
create index if not exists question_items_student_idx on public.question_items (student_id, created_at desc);

create table if not exists public.question_tests (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.profiles (id) on delete cascade,
  title        text not null default '' check (char_length(title) <= 120),
  question_ids uuid[] not null default '{}',
  answers      jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  correct      int,
  total        int,
  created_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  finished_at  timestamptz
);
create index if not exists question_tests_student_idx on public.question_tests (student_id, created_at desc);

drop trigger if exists question_items_touch on public.question_items;
create trigger question_items_touch before update on public.question_items
  for each row execute function public.touch_row();

alter table public.question_items enable row level security;
alter table public.question_tests enable row level security;
drop policy if exists question_items_access on public.question_items;
create policy question_items_access on public.question_items for all to authenticated
  using (public.can_access_student(student_id)) with check (public.can_access_student(student_id));
drop policy if exists question_tests_access on public.question_tests;
create policy question_tests_access on public.question_tests for all to authenticated
  using (public.can_access_student(student_id)) with check (public.can_access_student(student_id));
revoke all on public.question_items, public.question_tests from anon, authenticated;
grant select, insert, update, delete on public.question_items, public.question_tests to authenticated;

-- Fotoğraflar: özel depo, klasör = öğrenci kimliği (öğrenci ve danışmanı erişir)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sorular', 'sorular', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
drop policy if exists sorular_select on storage.objects;
create policy sorular_select on storage.objects for select to authenticated
  using (bucket_id = 'sorular' and public.can_access_student_path(name));
drop policy if exists sorular_insert on storage.objects;
create policy sorular_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'sorular' and public.can_access_student_path(name));
drop policy if exists sorular_delete on storage.objects;
create policy sorular_delete on storage.objects for delete to authenticated
  using (bucket_id = 'sorular' and public.can_access_student_path(name));

-- =====================================================================
-- GÜNCELLEME 5 — Danışmanın öğrenciyle paylaştığı notlar
-- =====================================================================
create table if not exists public.shared_notes (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.profiles (id) on delete cascade,
  counselor_id  uuid references public.profiles (id) on delete set null default auth.uid(),
  body          text not null check (char_length(body) between 1 and 4000),
  alert_id      uuid references public.support_alerts (id) on delete set null, -- destek isteğine yanıt ise
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists shared_notes_student_idx on public.shared_notes (student_id, created_at desc);

alter table public.shared_notes enable row level security;
-- Öğrenci kendi notlarını, danışman kendi öğrencilerinin notlarını görür
drop policy if exists shared_notes_select on public.shared_notes;
create policy shared_notes_select on public.shared_notes for select to authenticated
  using (public.can_access_student(student_id));
-- Yalnızca danışman yazar / düzenler / siler
drop policy if exists shared_notes_insert on public.shared_notes;
create policy shared_notes_insert on public.shared_notes for insert to authenticated
  with check (public.is_counselor_of(student_id));
drop policy if exists shared_notes_update on public.shared_notes;
create policy shared_notes_update on public.shared_notes for update to authenticated
  using (public.is_counselor_of(student_id)) with check (public.is_counselor_of(student_id));
drop policy if exists shared_notes_delete on public.shared_notes;
create policy shared_notes_delete on public.shared_notes for delete to authenticated
  using (public.is_counselor_of(student_id));
revoke all on public.shared_notes from anon, authenticated;
grant select, insert, update, delete on public.shared_notes to authenticated;

-- Öğrenci notları "okundu" yapar (yalnızca okunma zamanını değiştirebilir)
create or replace function public.mark_shared_notes_read()
returns void language sql security definer set search_path = '' as $$
  update public.shared_notes set read_at = now()
  where student_id = auth.uid() and read_at is null;
$$;
revoke all on function public.mark_shared_notes_read() from anon, public;
grant execute on function public.mark_shared_notes_read() to authenticated;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- Kişisel görünüm (güncelleme 7 ile aynı)
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists accent text not null default 'petrol';
alter table public.profiles add column if not exists color_mode text not null default 'auto';

do $$ begin
  alter table public.profiles add constraint profiles_accent_check
    check (accent in ('petrol', 'okyanus', 'mor', 'gul', 'gunbatimi', 'orman', 'grafit'));
exception when duplicate_object then null;
end $$;
do $$ begin
  alter table public.profiles add constraint profiles_color_mode_check
    check (color_mode in ('auto', 'light', 'dark'));
exception when duplicate_object then null;
end $$;

create or replace function public.set_my_theme(p_accent text, p_mode text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Giriş gerekli'; end if;
  update public.profiles
     set accent = coalesce(p_accent, accent),
         color_mode = coalesce(p_mode, color_mode)
   where id = auth.uid();
end;
$$;

revoke all on function public.set_my_theme(text, text) from public;
grant execute on function public.set_my_theme(text, text) to authenticated;

-- ---------------------------------------------------------------------
-- Öğrenci iletişim bilgileri ve kaynak (kitap) takibi (güncelleme 8 ile aynı)
-- ---------------------------------------------------------------------
-- 1) Öğrenci iletişim bilgileri — YALNIZCA danışman görür (öğrenci göremez/değiştiremez)
create table if not exists public.student_contacts (
  student_id    uuid primary key references public.profiles (id) on delete cascade,
  phone         text not null default '' check (char_length(phone) <= 30),
  parent_phone  text not null default '' check (char_length(parent_phone) <= 30),
  updated_at    timestamptz not null default now()
);
alter table public.student_contacts enable row level security;
drop policy if exists student_contacts_counselor on public.student_contacts;
create policy student_contacts_counselor on public.student_contacts for all to authenticated
  using (public.is_counselor_of(student_id)) with check (public.is_counselor_of(student_id));
grant select, insert, update, delete on public.student_contacts to authenticated;

-- 2) Kaynaklar: öğrencinin kullandığı kitaplar / soru bankaları
create table if not exists public.resources (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.profiles (id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 120),
  publisher    text not null default '' check (char_length(publisher) <= 80),
  subject      text not null default '' check (char_length(subject) <= 60),
  kind         text not null default 'soru_bankasi'
               check (kind in ('soru_bankasi', 'konu_anlatim', 'fasikul', 'deneme', 'diger')),
  total_tests  int not null default 0 check (total_tests between 0 and 1000),
  status       text not null default 'active' check (status in ('active', 'done', 'paused')),
  created_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);
create index if not exists resources_student_idx on public.resources (student_id, created_at desc);

-- Her testin sonucu (bir kaynakta bir test numarası bir kez)
create table if not exists public.resource_progress (
  id           uuid primary key default gen_random_uuid(),
  resource_id  uuid not null references public.resources (id) on delete cascade,
  student_id   uuid not null references public.profiles (id) on delete cascade,
  test_no      int not null check (test_no between 1 and 1000),
  topic_id     text check (char_length(topic_id) <= 80),
  correct      int check (correct between 0 and 500),
  wrong        int check (wrong between 0 and 500),
  empty        int check (empty between 0 and 500),
  done_on      date not null default current_date,
  task_id      uuid references public.plan_tasks (id) on delete set null,
  created_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  unique (resource_id, test_no)
);
create index if not exists resource_progress_student_idx on public.resource_progress (student_id, done_on desc);

alter table public.resources enable row level security;
alter table public.resource_progress enable row level security;
drop policy if exists resources_access on public.resources;
create policy resources_access on public.resources for all to authenticated
  using (public.can_access_student(student_id)) with check (public.can_access_student(student_id));
drop policy if exists resource_progress_access on public.resource_progress;
create policy resource_progress_access on public.resource_progress for all to authenticated
  using (public.can_access_student(student_id)) with check (public.can_access_student(student_id));
grant select, insert, update, delete on public.resources, public.resource_progress to authenticated;

-- 3) Program görevine kaynak bağlama: "Karekök Soru Bankası · Test 12-14"
alter table public.plan_tasks add column if not exists resource_id uuid references public.resources (id) on delete set null;
alter table public.plan_tasks add column if not exists resource_tests text check (char_length(resource_tests) <= 40);

-- Görev tamamlanınca bağlı testler kaynakta da "çözüldü" olarak işaretlenir.
-- Tek test bağlıysa görevin doğru/yanlış sayısı o teste yazılır (sonradan girilirse güncellenir).
create or replace function public.task_to_resource()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  part text;
  a int;
  b int;
  nums int[] := '{}';
  n int;
begin
  if new.resource_id is null or not new.done then
    return new;
  end if;
  if not exists (select 1 from public.resources r where r.id = new.resource_id and r.student_id = new.student_id) then
    return new;
  end if;
  foreach part in array regexp_split_to_array(coalesce(new.resource_tests, ''), '\s*,\s*') loop
    if part ~ '^\d{1,4}\s*-\s*\d{1,4}$' then
      a := split_part(part, '-', 1)::int;
      b := split_part(part, '-', 2)::int;
      if b >= a and b - a < 60 then
        for n in a..b loop nums := nums || n; end loop;
      end if;
    elsif part ~ '^\d{1,4}$' then
      nums := nums || part::int;
    end if;
  end loop;
  foreach n in array nums loop
    if n between 1 and 1000 then
      insert into public.resource_progress (resource_id, student_id, test_no, topic_id, correct, wrong, done_on, task_id, created_by)
      values (
        new.resource_id, new.student_id, n, new.topic_id,
        case when array_length(nums, 1) = 1 then new.correct end,
        case when array_length(nums, 1) = 1 then new.wrong end,
        current_date, new.id, auth.uid()
      )
      on conflict (resource_id, test_no) do update
        set correct = coalesce(excluded.correct, public.resource_progress.correct),
            wrong = coalesce(excluded.wrong, public.resource_progress.wrong)
        where public.resource_progress.task_id = excluded.task_id;
    end if;
  end loop;
  return new;
end;
$$;
drop trigger if exists plan_tasks_resource on public.plan_tasks;
create trigger plan_tasks_resource after insert or update of done, correct, wrong, resource_id, resource_tests on public.plan_tasks
  for each row execute function public.task_to_resource();

-- ---------------------------------------------------------------------
-- Ortak soru forumu (güncelleme 9 ile aynı)
-- ---------------------------------------------------------------------
create table if not exists public.forum_posts (
  id           uuid primary key default gen_random_uuid(),
  author_id    uuid not null references public.profiles (id) on delete cascade,
  question_id  uuid references public.question_items (id) on delete set null,
  subject      text not null default '' check (char_length(subject) <= 60),
  topic_id     text check (char_length(topic_id) <= 80),
  note         text not null default '' check (char_length(note) <= 1000),
  image_path   text not null check (image_path like 'forum/%' and char_length(image_path) <= 200),
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'hidden')),
  solved       boolean not null default false,
  reported     boolean not null default false,
  moderated_by uuid references public.profiles (id) on delete set null,
  moderated_at timestamptz,
  created_at   timestamptz not null default now()
);
create unique index if not exists forum_posts_question_uidx on public.forum_posts (question_id) where question_id is not null;
create index if not exists forum_posts_feed_idx on public.forum_posts (status, created_at desc);
create index if not exists forum_posts_author_idx on public.forum_posts (author_id);

create table if not exists public.forum_answers (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid not null references public.forum_posts (id) on delete cascade,
  author_id    uuid not null references public.profiles (id) on delete cascade,
  body         text not null check (char_length(body) between 1 and 2000),
  image_path   text check (image_path like 'forum/%' and char_length(image_path) <= 200),
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'hidden')),
  helpful      boolean not null default false,
  reported     boolean not null default false,
  moderated_by uuid references public.profiles (id) on delete set null,
  moderated_at timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists forum_answers_post_idx on public.forum_answers (post_id, created_at);
create index if not exists forum_answers_author_idx on public.forum_answers (author_id);

alter table public.forum_posts enable row level security;
alter table public.forum_answers enable row level security;
revoke all on public.forum_posts, public.forum_answers from anon, authenticated;

-- Yardımcılar ----------------------------------------------------------
create or replace function public.forum_role()
returns text language sql stable security definer set search_path = '' as $$
  select case
    when p.role = 'counselor' then 'counselor'
    when p.role = 'student' and p.is_active then 'student'
    else null end
  from public.profiles p where p.id = (select auth.uid());
$$;

-- Akış: onaylı sorular + kendi sorularım
create or replace function public.forum_feed(p_subject text default null, p_mine boolean default false, p_limit int default 30, p_before timestamptz default null)
returns table (id uuid, subject text, topic_id text, note text, image_path text, status text, solved boolean, created_at timestamptz, answer_count int, mine boolean)
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := auth.uid(); r text := public.forum_role();
begin
  if r is null then raise exception 'Giriş gerekli'; end if;
  return query
    select f.id, f.subject, f.topic_id, f.note, f.image_path, f.status, f.solved, f.created_at,
           (select count(*)::int from public.forum_answers a where a.post_id = f.id and a.status = 'approved'),
           f.author_id = me
      from public.forum_posts f
     where (f.status = 'approved' or f.author_id = me)
       and (not p_mine or f.author_id = me)
       and (p_subject is null or p_subject = '' or f.subject = p_subject)
       and (p_before is null or f.created_at < p_before)
     order by f.created_at desc
     limit least(greatest(coalesce(p_limit, 30), 1), 60);
end;
$$;

-- Bir sorunun cevapları: onaylılar + kendi cevaplarım
create or replace function public.forum_thread(p_post uuid)
returns table (id uuid, body text, image_path text, status text, helpful boolean, created_at timestamptz, mine boolean, by_counselor boolean)
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if public.forum_role() is null then raise exception 'Giriş gerekli'; end if;
  if not exists (select 1 from public.forum_posts f where f.id = p_post and (f.status = 'approved' or f.author_id = me)) then
    raise exception 'Soru bulunamadı';
  end if;
  return query
    select a.id, a.body, a.image_path, a.status, a.helpful, a.created_at, a.author_id = me,
           exists (select 1 from public.profiles p where p.id = a.author_id and p.role = 'counselor')
      from public.forum_answers a
     where a.post_id = p_post and (a.status = 'approved' or a.author_id = me)
     order by a.helpful desc, a.created_at;
end;
$$;

-- Öğrenci kendi sorusunu paylaşır (danışman onayına düşer)
create or replace function public.forum_share(p_question uuid, p_image_path text, p_note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); q record; new_id uuid;
begin
  if public.forum_role() is distinct from 'student' then raise exception 'Yalnızca öğrenciler soru paylaşabilir'; end if;
  select * into q from public.question_items where id = p_question and student_id = me;
  if not found then raise exception 'Soru bulunamadı'; end if;
  if (select count(*) from public.forum_posts where author_id = me and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Bugün en fazla 10 soru paylaşabilirsin';
  end if;
  insert into public.forum_posts (author_id, question_id, subject, topic_id, note, image_path)
  values (me, p_question, coalesce(q.subject, ''), q.topic_id, left(coalesce(p_note, ''), 1000), p_image_path)
  returning id into new_id;
  return new_id;
end;
$$;

-- Cevap yaz (öğrenci → onaya düşer, danışman → hemen yayınlanır)
create or replace function public.forum_reply(p_post uuid, p_body text, p_image_path text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); r text := public.forum_role(); new_id uuid;
begin
  if r is null then raise exception 'Giriş gerekli'; end if;
  if not exists (select 1 from public.forum_posts f where f.id = p_post and (f.status = 'approved' or f.author_id = me)) then
    raise exception 'Soru bulunamadı';
  end if;
  if r = 'student' and (select count(*) from public.forum_answers where author_id = me and created_at > now() - interval '1 day') >= 30 then
    raise exception 'Bugün en fazla 30 cevap yazabilirsin';
  end if;
  insert into public.forum_answers (post_id, author_id, body, image_path, status, moderated_by, moderated_at)
  values (p_post, me, left(trim(p_body), 2000), nullif(p_image_path, ''),
          case when r = 'counselor' then 'approved' else 'pending' end,
          case when r = 'counselor' then me end,
          case when r = 'counselor' then now() end)
  returning id into new_id;
  return new_id;
end;
$$;

-- Soru sahibi: "Bu cevap işime yaradı"
create or replace function public.forum_mark_helpful(p_answer uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); pid uuid;
begin
  select a.post_id into pid from public.forum_answers a join public.forum_posts f on f.id = a.post_id
   where a.id = p_answer and a.status = 'approved' and f.author_id = me;
  if pid is null then raise exception 'Yalnızca soruyu soran işaretleyebilir'; end if;
  update public.forum_answers set helpful = true where id = p_answer;
  update public.forum_posts set solved = true where id = pid;
end;
$$;

-- Uygunsuz içeriği bildir
create or replace function public.forum_report(p_kind text, p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.forum_role() is null then raise exception 'Giriş gerekli'; end if;
  if p_kind = 'post' then update public.forum_posts set reported = true where id = p_id and status = 'approved';
  elsif p_kind = 'answer' then update public.forum_answers set reported = true where id = p_id and status = 'approved';
  end if;
end;
$$;

-- Kendi gönderimi sil
create or replace function public.forum_delete_own(p_kind text, p_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); img text;
begin
  if p_kind = 'post' then
    delete from public.forum_posts where id = p_id and author_id = me returning image_path into img;
  elsif p_kind = 'answer' then
    delete from public.forum_answers where id = p_id and author_id = me returning image_path into img;
  end if;
  return img;
end;
$$;

-- Danışman: kendi öğrencilerinin onay bekleyen ve bildirilen gönderileri
create or replace function public.forum_queue()
returns table (kind text, id uuid, post_id uuid, author_name text, body text, image_path text, status text, reported boolean, created_at timestamptz, post_note text, post_image text, post_subject text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.forum_role() is distinct from 'counselor' then raise exception 'Yalnızca danışmanlar'; end if;
  return query
    select 'post'::text, f.id, f.id, p.full_name, f.note, f.image_path, f.status, f.reported, f.created_at, f.note, f.image_path, f.subject
      from public.forum_posts f join public.profiles p on p.id = f.author_id
     where public.is_counselor_of(f.author_id) and (f.status = 'pending' or (f.reported and f.status = 'approved'))
    union all
    select 'answer'::text, a.id, a.post_id, p.full_name, a.body, a.image_path, a.status, a.reported, a.created_at, f.note, f.image_path, f.subject
      from public.forum_answers a join public.forum_posts f on f.id = a.post_id join public.profiles p on p.id = a.author_id
     where public.is_counselor_of(a.author_id) and (a.status = 'pending' or (a.reported and a.status = 'approved'))
    order by 9;
end;
$$;

-- Danışman kararı: approve / reject / hide / keep (bildirimi kapat)
create or replace function public.forum_moderate(p_kind text, p_id uuid, p_action text)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); author uuid; cur text;
begin
  if public.forum_role() is distinct from 'counselor' then raise exception 'Yalnızca danışmanlar'; end if;
  if p_kind = 'post' then select author_id, status into author, cur from public.forum_posts where id = p_id;
  else select author_id, status into author, cur from public.forum_answers where id = p_id; end if;
  if author is null then raise exception 'Bulunamadı'; end if;
  -- Kendi öğrencisi değilse yalnızca yayındaki içeriği gizleyebilir
  if not public.is_counselor_of(author) and author <> me and not (p_action = 'hide' and cur = 'approved') then
    raise exception 'Bu öğrenci sizin öğrenciniz değil';
  end if;
  if p_action not in ('approve', 'reject', 'hide', 'keep') then raise exception 'Geçersiz işlem'; end if;
  if p_kind = 'post' then
    update public.forum_posts
       set status = case p_action when 'approve' then 'approved' when 'reject' then 'rejected' when 'hide' then 'hidden' else status end,
           reported = false, moderated_by = me, moderated_at = now()
     where id = p_id;
  else
    update public.forum_answers
       set status = case p_action when 'approve' then 'approved' when 'reject' then 'rejected' when 'hide' then 'hidden' else status end,
           reported = false, moderated_by = me, moderated_at = now()
     where id = p_id;
  end if;
end;
$$;

revoke execute on function public.forum_role(), public.forum_feed(text, boolean, int, timestamptz), public.forum_thread(uuid),
  public.forum_share(uuid, text, text), public.forum_reply(uuid, text, text), public.forum_mark_helpful(uuid),
  public.forum_report(text, uuid), public.forum_delete_own(text, uuid), public.forum_queue(), public.forum_moderate(text, uuid, text)
  from anon, public;
grant execute on function public.forum_role(), public.forum_feed(text, boolean, int, timestamptz), public.forum_thread(uuid),
  public.forum_share(uuid, text, text), public.forum_reply(uuid, text, text), public.forum_mark_helpful(uuid),
  public.forum_report(text, uuid), public.forum_delete_own(text, uuid), public.forum_queue(), public.forum_moderate(text, uuid, text)
  to authenticated;

-- Fotoğraflar: "sorular" deposunda forum/ klasörü. Dosya adları tahmin edilemez (rastgele kimlik).
drop policy if exists sorular_forum_select on storage.objects;
create policy sorular_forum_select on storage.objects for select to authenticated
  using (bucket_id = 'sorular' and name like 'forum/%' and public.forum_role() is not null);
drop policy if exists sorular_forum_insert on storage.objects;
create policy sorular_forum_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'sorular' and name like 'forum/%' and public.forum_role() is not null);
drop policy if exists sorular_forum_delete on storage.objects;
create policy sorular_forum_delete on storage.objects for delete to authenticated
  using (bucket_id = 'sorular' and name like 'forum/%' and public.forum_role() = 'counselor');


-- ---------------------------------------------------------------------
-- Kaynak kataloğu (güncelleme 10 ile aynı)
-- ---------------------------------------------------------------------
create or replace function public.am_counselor()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'counselor');
$$;
revoke execute on function public.am_counselor() from anon, public;
grant execute on function public.am_counselor() to authenticated;

create table if not exists public.resource_catalog (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(title) between 1 and 120),
  publisher    text not null default '' check (char_length(publisher) <= 80),
  subject      text not null default '' check (char_length(subject) <= 60),
  kind         text not null default 'soru_bankasi'
               check (kind in ('soru_bankasi', 'konu_anlatim', 'fasikul', 'deneme', 'diger')),
  total_tests  int not null default 0 check (total_tests between 0 and 1000),
  -- [{"from":1,"to":6,"topic_id":"tyt-matematik.temel-kavramlar"}, …]
  test_topics  jsonb not null default '[]'::jsonb check (jsonb_typeof(test_topics) = 'array'),
  is_active    boolean not null default true,
  created_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists resource_catalog_subject_idx on public.resource_catalog (subject, publisher, title);

alter table public.resource_catalog enable row level security;
drop policy if exists resource_catalog_read on public.resource_catalog;
create policy resource_catalog_read on public.resource_catalog for select to authenticated using (true);
drop policy if exists resource_catalog_write on public.resource_catalog;
create policy resource_catalog_write on public.resource_catalog for all to authenticated
  using (public.am_counselor()) with check (public.am_counselor());
revoke all on public.resource_catalog from anon;
grant select, insert, update, delete on public.resource_catalog to authenticated;

alter table public.resources add column if not exists catalog_id uuid references public.resource_catalog (id) on delete set null;
create index if not exists resources_catalog_idx on public.resources (catalog_id);
create unique index if not exists resources_student_catalog_uidx on public.resources (student_id, catalog_id) where catalog_id is not null;

-- Öğrenci kaynak eklerken/değiştirirken: yalnızca katalogdan, bilgiler katalogdan kopyalanır.
create or replace function public.resources_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c record; has_cat boolean := false; is_student boolean;
begin
  is_student := exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'student');
  if tg_op = 'DELETE' then
    if is_student then raise exception 'Kaynakları danışmanın kaldırabilir'; end if;
    return old;
  end if;
  if new.catalog_id is not null then
    select * into c from public.resource_catalog where id = new.catalog_id;
    has_cat := found;
    if has_cat then
      new.title := c.title; new.publisher := c.publisher; new.subject := c.subject;
      new.kind := c.kind; new.total_tests := c.total_tests;
    end if;
  end if;
  if is_student then
    if tg_op = 'INSERT' then
      if not has_cat then raise exception 'Kaynaklar katalogdan seçilmelidir'; end if;
      if not c.is_active then raise exception 'Bu kaynak artık katalogda değil'; end if;
    end if;
    if tg_op = 'UPDATE' then
      -- Öğrenci yalnızca durumu (devam / ara / bitti) değiştirebilir
      new.catalog_id := old.catalog_id; new.title := old.title; new.publisher := old.publisher;
      new.subject := old.subject; new.kind := old.kind; new.total_tests := old.total_tests;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists resources_guard on public.resources;
create trigger resources_guard before insert or update or delete on public.resources
  for each row execute function public.resources_guard();

-- Katalog güncellenince öğrencilerdeki kopyalar da güncellenir
create or replace function public.resource_catalog_touch()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists resource_catalog_touch on public.resource_catalog;
create trigger resource_catalog_touch before update on public.resource_catalog
  for each row execute function public.resource_catalog_touch();

create or replace function public.resource_catalog_sync()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.resources r
     set title = new.title, publisher = new.publisher, subject = new.subject, kind = new.kind, total_tests = new.total_tests
   where r.catalog_id = new.id;
  return null;
end;
$$;
drop trigger if exists resource_catalog_sync on public.resource_catalog;
create trigger resource_catalog_sync after update on public.resource_catalog
  for each row execute function public.resource_catalog_sync();

-- Test sonucunda konu boşsa katalogdaki eşleşmeden doldur
create or replace function public.resource_progress_topic()
returns trigger language plpgsql security definer set search_path = '' as $$
declare t jsonb;
begin
  if new.topic_id is null then
    select x into t
      from public.resources r
      join public.resource_catalog c on c.id = r.catalog_id,
           jsonb_array_elements(c.test_topics) x
     where r.id = new.resource_id
       and new.test_no between coalesce((x->>'from')::int, 0) and coalesce((x->>'to')::int, (x->>'from')::int, 0)
     limit 1;
    if t is not null then new.topic_id := left(t->>'topic_id', 80); end if;
  end if;
  return new;
end;
$$;
drop trigger if exists resource_progress_topic on public.resource_progress;
create trigger resource_progress_topic before insert or update on public.resource_progress
  for each row execute function public.resource_progress_topic();


-- ---------------------------------------------------------------------
-- Veli bağlantısı, bildirimler, seri ve rozetler (güncelleme 11 ile aynı)
-- ---------------------------------------------------------------------
create table if not exists public.parent_links (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.profiles (id) on delete cascade,
  token        text not null unique check (char_length(token) >= 32),
  label        text not null default '' check (char_length(label) <= 60),
  created_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  revoked_at   timestamptz,
  last_seen_at timestamptz,
  view_count   int not null default 0
);
create index if not exists parent_links_student_idx on public.parent_links (student_id);
alter table public.parent_links enable row level security;
drop policy if exists parent_links_counselor on public.parent_links;
create policy parent_links_counselor on public.parent_links for all to authenticated
  using (public.is_counselor_of(student_id)) with check (public.is_counselor_of(student_id));
revoke all on public.parent_links from anon;
grant select, insert, update, delete on public.parent_links to authenticated;

-- Veli sayfasının verisi. Yalnızca bu fonksiyon üzerinden, yalnızca geçerli bağlantıyla.
-- Kaygı, motivasyon, notlar, destek kayıtları, soru fotoğrafları ASLA dönmez.
create or replace function public.parent_view(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  l record;
  sid uuid;
  since date := (now() at time zone 'Europe/Istanbul')::date - 84;
  out jsonb;
begin
  if p_token is null or char_length(p_token) < 32 then return null; end if;
  select * into l from public.parent_links where token = p_token and revoked_at is null;
  if not found then return null; end if;
  sid := l.student_id;
  if not exists (select 1 from public.profiles where id = sid and role = 'student' and is_active) then return null; end if;
  update public.parent_links set last_seen_at = now(), view_count = view_count + 1 where id = l.id;

  select jsonb_build_object(
    'student', (select jsonb_build_object('full_name', p.full_name, 'field', p.field, 'grade', p.grade, 'exam_year', p.exam_year, 'target', p.target)
                from public.profiles p where p.id = sid),
    'counselor', (select c.full_name from public.profiles s join public.profiles c on c.id = s.counselor_id where s.id = sid),
    'plans', coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'start_date', w.start_date) order by w.start_date)
                       from public.weekly_plans w where w.student_id = sid and w.start_date >= since - 6), '[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(jsonb_build_object(
                         'plan_id', t.plan_id, 'day_index', t.day_index, 'subject', t.subject, 'topic_id', t.topic_id,
                         'content', t.content, 'task_type', t.task_type, 'target_questions', t.target_questions,
                         'solved', t.solved, 'correct', t.correct, 'wrong', t.wrong, 'done', t.done,
                         'start_time', t.start_time, 'duration_min', t.duration_min))
                       from public.plan_tasks t join public.weekly_plans w on w.id = t.plan_id
                       where t.student_id = sid and w.start_date >= since - 6), '[]'::jsonb),
    'days', coalesce((select jsonb_agg(jsonb_build_object('plan_id', d.plan_id, 'day_index', d.day_index, 'study_minutes', d.study_minutes))
                      from public.plan_days d join public.weekly_plans w on w.id = d.plan_id
                      where d.student_id = sid and w.start_date >= since - 6), '[]'::jsonb),
    'exams', coalesce((select jsonb_agg(jsonb_build_object('exam_date', a.exam_date, 'exam_type', a.exam_type, 'title', a.title, 'nets', a.nets) order by a.exam_date)
                       from public.exam_analyses a where a.student_id = sid), '[]'::jsonb),
    'sleep_phone', coalesce((select jsonb_agg(jsonb_build_object('log_date', g.log_date, 'sleep_hours', g.sleep_hours, 'phone_minutes', g.phone_minutes) order by g.log_date)
                             from public.daily_logs g where g.student_id = sid and g.log_date >= since), '[]'::jsonb),
    'topics', coalesce((select jsonb_agg(jsonb_build_object('topic_id', tp.topic_id, 'status', tp.status))
                        from public.topic_progress tp where tp.student_id = sid), '[]'::jsonb)
  ) into out;
  return out;
end;
$$;
revoke execute on function public.parent_view(text) from public;
grant execute on function public.parent_view(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 2) OTOMATİK BİLDİRİMLER (web push)
-- ---------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  endpoint    text not null unique check (char_length(endpoint) <= 1000),
  p256dh      text not null check (char_length(p256dh) <= 200),
  auth        text not null check (char_length(auth) <= 100),
  user_agent  text not null default '' check (char_length(user_agent) <= 300),
  created_at  timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
drop policy if exists push_subscriptions_own on public.push_subscriptions;
create policy push_subscriptions_own on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.push_subscriptions from anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

create table if not exists public.notify_prefs (
  user_id  uuid primary key references public.profiles (id) on delete cascade default auth.uid(),
  gunluk   boolean not null default true,  -- akşam günlük hatırlatması (öğrenci)
  gorev    boolean not null default true,  -- kalan görev hatırlatması (öğrenci)
  ozet     boolean not null default true,  -- akşam özeti (danışman)
  updated_at timestamptz not null default now()
);
alter table public.notify_prefs enable row level security;
drop policy if exists notify_prefs_own on public.notify_prefs;
create policy notify_prefs_own on public.notify_prefs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.notify_prefs from anon;
grant select, insert, update, delete on public.notify_prefs to authenticated;

-- Aynı gün aynı bildirimin iki kez gitmemesi için (yalnızca sunucu yazar)
create table if not exists public.notify_log (
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind    text not null,
  day     date not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, kind, day)
);
alter table public.notify_log enable row level security;
revoke all on public.notify_log from anon, authenticated;

-- ---------------------------------------------------------------------
-- 3) SERİ VE ROZETLER (kişisel) + ANONİM SIRALAMA
--    Bir gün "seri günü" sayılır: günlük takip dolduruldu YA DA en az bir görev tamamlandı.
-- ---------------------------------------------------------------------
create or replace function public.activity_days(sid uuid)
returns table (d date) language sql stable security definer set search_path = '' as $$
  select log_date from public.daily_logs where student_id = sid
  union
  select (done_at at time zone 'Europe/Istanbul')::date from public.plan_tasks where student_id = sid and done and done_at is not null;
$$;
revoke execute on function public.activity_days(uuid) from anon, public, authenticated;

create or replace function public.streak_of(sid uuid, today date)
returns int language sql stable security definer set search_path = '' as $$
  with x as (select d, d - (row_number() over (order by d))::int as grp from public.activity_days(sid) where d <= today),
       l as (select d, grp from x order by d desc limit 1)
  select case when (select d from l) >= today - 1
              then (select count(*)::int from x where x.grp = (select grp from l)) else 0 end;
$$;
revoke execute on function public.streak_of(uuid, date) from anon, public, authenticated;

create or replace function public.gamification(p_student uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  sid uuid := coalesce(p_student, auth.uid());
  today date := (now() at time zone 'Europe/Istanbul')::date;
  wk date := today - ((extract(isodow from today))::int - 1);
  res jsonb;
begin
  if sid is null or not public.can_access_student(sid) then raise exception 'Erişim yok'; end if;

  with runs as (
    select min(d) as s, max(d) as e, count(*)::int as len
      from (select d, d - (row_number() over (order by d))::int as grp from public.activity_days(sid) where d <= today) x
     group by grp
  ),
  -- tüm aktif öğrencilerin güncel serisi ve bu haftaki soru sayısı (yalnızca sayılar, kimlik dönmez)
  everyone as (
    select p.id,
      public.streak_of(p.id, today) as streak,
      coalesce((select sum(coalesce(t.solved, 0))::int from public.plan_tasks t
                 where t.student_id = p.id and t.done and (t.done_at at time zone 'Europe/Istanbul')::date >= wk), 0) as week_q
      from public.profiles p where p.role = 'student' and p.is_active
  ),
  me as (
    select
      public.streak_of(sid, today) as streak,
      coalesce((select max(len) from runs), 0) as best,
      (select count(*)::int from public.daily_logs where student_id = sid) as logs,
      coalesce((select sum(coalesce(solved, 0))::int from public.plan_tasks where student_id = sid and done), 0) as solved,
      (select count(*)::int from public.plan_tasks where student_id = sid and done) as tasks_done,
      coalesce((select sum(coalesce(solved, 0))::int from public.plan_tasks where student_id = sid and done and (done_at at time zone 'Europe/Istanbul')::date >= wk), 0) as week_q,
      (select count(*)::int from (
         select w.id from public.weekly_plans w join public.plan_tasks t on t.plan_id = w.id
          where w.student_id = sid and w.start_date <= today - 6
            and (t.topic_id is not null or length(trim(t.content)) > 0 or t.target_questions is not null)
          group by w.id having count(*) > 0 and avg(case when t.done then 1.0 else 0 end) >= 0.8
       ) z) as good_weeks,
      (select count(*)::int from public.exam_analyses where student_id = sid) as exams,
      (select count(*)::int from public.resources where student_id = sid and status = 'done') as books_done,
      -- bu haftanın programı (bugünü içeren)
      (select count(*)::int from public.plan_tasks t join public.weekly_plans w on w.id = t.plan_id
        where w.student_id = sid and today between w.start_date and w.start_date + 6
          and (t.topic_id is not null or length(trim(t.content)) > 0 or t.target_questions is not null)) as week_total,
      (select count(*)::int from public.plan_tasks t join public.weekly_plans w on w.id = t.plan_id
        where w.student_id = sid and today between w.start_date and w.start_date + 6 and t.done
          and (t.topic_id is not null or length(trim(t.content)) > 0 or t.target_questions is not null)) as week_done
  )
  select jsonb_build_object(
    'streak', me.streak, 'best', greatest(me.best, me.streak), 'logs', me.logs, 'solved', me.solved,
    'tasks_done', me.tasks_done, 'week_q', me.week_q, 'good_weeks', me.good_weeks, 'exams', me.exams,
    'books_done', me.books_done, 'week_total', me.week_total, 'week_done', me.week_done,
    'n', (select count(*) from everyone),
    -- "ilk %X": kendisinden daha iyi olanların oranı (+1); 10'dan az öğrencide sıralama gösterilmez
    'streak_top', case when (select count(*) from everyone) >= 10 and me.streak > 0
                       then ceil(100.0 * ((select count(*) from everyone where streak > me.streak) + 1) / (select count(*) from everyone)) end,
    'week_top',   case when (select count(*) from everyone) >= 10 and me.week_q > 0
                       then ceil(100.0 * ((select count(*) from everyone where week_q > me.week_q) + 1) / (select count(*) from everyone)) end
  ) into res from me;
  return res;
end;
$$;
revoke execute on function public.gamification(uuid) from anon, public;
grant execute on function public.gamification(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- Öğrenci listesinde seri ve rozetler (güncelleme 12 ile aynı)
-- ---------------------------------------------------------------------
drop function if exists public.students_gamification();
create or replace function public.students_gamification()
returns table (
  student_id uuid, streak int, best int, logs int, solved int, tasks_done int,
  good_weeks int, exams int, books_done int, week_q int, week_total int, week_done int
) language plpgsql stable security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'Europe/Istanbul')::date;
  wk date := today - ((extract(isodow from today))::int - 1);
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'counselor') then
    raise exception 'Yalnızca danışmanlar';
  end if;
  return query
  select p.id,
    public.streak_of(p.id, today),
    coalesce((select max(len)::int from (
      select count(*) as len from (
        select d, d - (row_number() over (order by d))::int as grp from public.activity_days(p.id) where d <= today
      ) x group by grp) r), 0),
    (select count(*)::int from public.daily_logs where daily_logs.student_id = p.id),
    coalesce((select sum(coalesce(t.solved, 0))::int from public.plan_tasks t where t.student_id = p.id and t.done), 0),
    (select count(*)::int from public.plan_tasks t where t.student_id = p.id and t.done),
    (select count(*)::int from (
       select w.id from public.weekly_plans w join public.plan_tasks t on t.plan_id = w.id
        where w.student_id = p.id and w.start_date <= today - 6
          and (t.topic_id is not null or length(trim(t.content)) > 0 or t.target_questions is not null)
        group by w.id having avg(case when t.done then 1.0 else 0 end) >= 0.8) z),
    (select count(*)::int from public.exam_analyses a where a.student_id = p.id),
    (select count(*)::int from public.resources r where r.student_id = p.id and r.status = 'done'),
    coalesce((select sum(coalesce(t.solved, 0))::int from public.plan_tasks t
               where t.student_id = p.id and t.done and (t.done_at at time zone 'Europe/Istanbul')::date >= wk), 0),
    (select count(*)::int from public.plan_tasks t join public.weekly_plans w on w.id = t.plan_id
      where w.student_id = p.id and today between w.start_date and w.start_date + 6
        and (t.topic_id is not null or length(trim(t.content)) > 0 or t.target_questions is not null)),
    (select count(*)::int from public.plan_tasks t join public.weekly_plans w on w.id = t.plan_id
      where w.student_id = p.id and today between w.start_date and w.start_date + 6 and t.done
        and (t.topic_id is not null or length(trim(t.content)) > 0 or t.target_questions is not null))
  from public.profiles p
  where p.role = 'student' and p.counselor_id = auth.uid();
end;
$$;
revoke execute on function public.students_gamification() from anon, public;
grant execute on function public.students_gamification() to authenticated;

-- ---------------------------------------------------------------------
-- Günlük takip rozetleri (güncelleme 13 ile aynı)
-- ---------------------------------------------------------------------
create or replace function public.log_is_complete(l public.daily_logs)
returns boolean language sql immutable set search_path = '' as $$
  select l.sleep_hours is not null and l.phone_minutes is not null and l.anxiety is not null and l.energy is not null
     and l.motivation is not null and l.procrastinated is not null and l.replanned is not null;
$$;

-- Günlük takip serisi (yalnızca günlük kayıtları; bugün ya da dün dolduruldu ise sürer)
create or replace function public.log_streak_of(sid uuid, today date)
returns int language sql stable security definer set search_path = '' as $$
  with x as (select log_date as d, log_date - (row_number() over (order by log_date))::int as grp
               from public.daily_logs where student_id = sid and log_date <= today),
       l as (select d, grp from x order by d desc limit 1)
  select case when (select d from l) >= today - 1
              then (select count(*)::int from x where x.grp = (select grp from l)) else 0 end;
$$;
create or replace function public.log_best_of(sid uuid)
returns int language sql stable security definer set search_path = '' as $$
  select coalesce(max(len), 0)::int from (
    select count(*) as len from (
      select log_date - (row_number() over (order by log_date))::int as grp from public.daily_logs where student_id = sid
    ) x group by grp) r;
$$;
revoke execute on function public.log_streak_of(uuid, date), public.log_best_of(uuid) from anon, public, authenticated;

create or replace function public.gamification(p_student uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  sid uuid := coalesce(p_student, auth.uid());
  today date := (now() at time zone 'Europe/Istanbul')::date;
  wk date := today - ((extract(isodow from today))::int - 1);
  res jsonb;
begin
  if sid is null or not public.can_access_student(sid) then raise exception 'Erişim yok'; end if;

  with runs as (
    select min(d) as s, max(d) as e, count(*)::int as len
      from (select d, d - (row_number() over (order by d))::int as grp from public.activity_days(sid) where d <= today) x
     group by grp
  ),
  -- tüm aktif öğrencilerin güncel serisi ve bu haftaki soru sayısı (yalnızca sayılar, kimlik dönmez)
  everyone as (
    select p.id,
      public.streak_of(p.id, today) as streak,
      coalesce((select sum(coalesce(t.solved, 0))::int from public.plan_tasks t
                 where t.student_id = p.id and t.done and (t.done_at at time zone 'Europe/Istanbul')::date >= wk), 0) as week_q
      from public.profiles p where p.role = 'student' and p.is_active
  ),
  me as (
    select
      public.streak_of(sid, today) as streak,
      coalesce((select max(len) from runs), 0) as best,
      (select count(*)::int from public.daily_logs where student_id = sid) as logs,
      coalesce((select sum(coalesce(solved, 0))::int from public.plan_tasks where student_id = sid and done), 0) as solved,
      (select count(*)::int from public.plan_tasks where student_id = sid and done) as tasks_done,
      coalesce((select sum(coalesce(solved, 0))::int from public.plan_tasks where student_id = sid and done and (done_at at time zone 'Europe/Istanbul')::date >= wk), 0) as week_q,
      (select count(*)::int from (
         select w.id from public.weekly_plans w join public.plan_tasks t on t.plan_id = w.id
          where w.student_id = sid and w.start_date <= today - 6
            and (t.topic_id is not null or length(trim(t.content)) > 0 or t.target_questions is not null)
          group by w.id having count(*) > 0 and avg(case when t.done then 1.0 else 0 end) >= 0.8
       ) z) as good_weeks,
      (select count(*)::int from public.exam_analyses where student_id = sid) as exams,
      (select count(*)::int from public.resources where student_id = sid and status = 'done') as books_done,
      public.log_streak_of(sid, today) as log_streak,
      public.log_best_of(sid) as log_best,
      (select count(*)::int from public.daily_logs dl where dl.student_id = sid and public.log_is_complete(dl)) as complete_logs,
      -- bu haftanın programı (bugünü içeren)
      (select count(*)::int from public.plan_tasks t join public.weekly_plans w on w.id = t.plan_id
        where w.student_id = sid and today between w.start_date and w.start_date + 6
          and (t.topic_id is not null or length(trim(t.content)) > 0 or t.target_questions is not null)) as week_total,
      (select count(*)::int from public.plan_tasks t join public.weekly_plans w on w.id = t.plan_id
        where w.student_id = sid and today between w.start_date and w.start_date + 6 and t.done
          and (t.topic_id is not null or length(trim(t.content)) > 0 or t.target_questions is not null)) as week_done
  )
  select jsonb_build_object(
    'streak', me.streak, 'best', greatest(me.best, me.streak), 'logs', me.logs, 'solved', me.solved,
    'tasks_done', me.tasks_done, 'week_q', me.week_q, 'good_weeks', me.good_weeks, 'exams', me.exams,
    'books_done', me.books_done, 'week_total', me.week_total, 'week_done', me.week_done,
    'log_streak', me.log_streak, 'log_best', greatest(me.log_best, me.log_streak), 'complete_logs', me.complete_logs,
    'n', (select count(*) from everyone),
    -- "ilk %X": kendisinden daha iyi olanların oranı (+1); 10'dan az öğrencide sıralama gösterilmez
    'streak_top', case when (select count(*) from everyone) >= 10 and me.streak > 0
                       then ceil(100.0 * ((select count(*) from everyone where streak > me.streak) + 1) / (select count(*) from everyone)) end,
    'week_top',   case when (select count(*) from everyone) >= 10 and me.week_q > 0
                       then ceil(100.0 * ((select count(*) from everyone where week_q > me.week_q) + 1) / (select count(*) from everyone)) end
  ) into res from me;
  return res;
end;
$$;
revoke execute on function public.gamification(uuid) from anon, public;
grant execute on function public.gamification(uuid) to authenticated;


drop function if exists public.students_gamification();
create or replace function public.students_gamification()
returns table (
  student_id uuid, streak int, best int, logs int, solved int, tasks_done int,
  good_weeks int, exams int, books_done int, week_q int, week_total int, week_done int,
  log_streak int, log_best int, complete_logs int
) language plpgsql stable security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'Europe/Istanbul')::date;
  wk date := today - ((extract(isodow from today))::int - 1);
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'counselor') then
    raise exception 'Yalnızca danışmanlar';
  end if;
  return query
  select p.id,
    public.streak_of(p.id, today),
    coalesce((select max(len)::int from (
      select count(*) as len from (
        select d, d - (row_number() over (order by d))::int as grp from public.activity_days(p.id) where d <= today
      ) x group by grp) r), 0),
    (select count(*)::int from public.daily_logs where daily_logs.student_id = p.id),
    coalesce((select sum(coalesce(t.solved, 0))::int from public.plan_tasks t where t.student_id = p.id and t.done), 0),
    (select count(*)::int from public.plan_tasks t where t.student_id = p.id and t.done),
    (select count(*)::int from (
       select w.id from public.weekly_plans w join public.plan_tasks t on t.plan_id = w.id
        where w.student_id = p.id and w.start_date <= today - 6
          and (t.topic_id is not null or length(trim(t.content)) > 0 or t.target_questions is not null)
        group by w.id having avg(case when t.done then 1.0 else 0 end) >= 0.8) z),
    (select count(*)::int from public.exam_analyses a where a.student_id = p.id),
    (select count(*)::int from public.resources r where r.student_id = p.id and r.status = 'done'),
    coalesce((select sum(coalesce(t.solved, 0))::int from public.plan_tasks t
               where t.student_id = p.id and t.done and (t.done_at at time zone 'Europe/Istanbul')::date >= wk), 0),
    (select count(*)::int from public.plan_tasks t join public.weekly_plans w on w.id = t.plan_id
      where w.student_id = p.id and today between w.start_date and w.start_date + 6
        and (t.topic_id is not null or length(trim(t.content)) > 0 or t.target_questions is not null)),
    (select count(*)::int from public.plan_tasks t join public.weekly_plans w on w.id = t.plan_id
      where w.student_id = p.id and today between w.start_date and w.start_date + 6 and t.done
        and (t.topic_id is not null or length(trim(t.content)) > 0 or t.target_questions is not null)),
    public.log_streak_of(p.id, today),
    public.log_best_of(p.id),
    (select count(*)::int from public.daily_logs dl where dl.student_id = p.id and public.log_is_complete(dl))
  from public.profiles p
  where p.role = 'student' and p.counselor_id = auth.uid();
end;
$$;
revoke execute on function public.students_gamification() from anon, public;
grant execute on function public.students_gamification() to authenticated;




-- =====================================================================
-- Aylık hedefler, konu bitirme ve özel gün rozetleri (güncelleme 14 ile aynı)
-- =====================================================================
create table if not exists public.monthly_goals (
  student_id   uuid not null references public.profiles (id) on delete cascade,
  month        date not null check (extract(day from month) = 1),
  questions    int  check (questions is null or questions between 0 and 100000),
  active_days  int  check (active_days is null or active_days between 1 and 31),
  updated_at   timestamptz not null default now(),
  primary key (student_id, month)
);
alter table public.monthly_goals enable row level security;
drop policy if exists monthly_goals_read on public.monthly_goals;
create policy monthly_goals_read on public.monthly_goals for select to authenticated
  using (public.can_access_student(student_id));
drop policy if exists monthly_goals_write on public.monthly_goals;
create policy monthly_goals_write on public.monthly_goals for all to authenticated
  using (public.is_counselor_of(student_id)) with check (public.is_counselor_of(student_id));

-- Özel günler (AA-GG). app/oyun.tsx içindeki OZEL_GUNLER listesiyle aynı olmalı.
create or replace function public.special_days()
returns text[] language sql immutable set search_path = '' as $$
  select array['01-01','03-14','04-23','05-19','08-30','10-29','11-24'];
$$;

-- Rozet verisinin tamamı (sıralama hariç)
create or replace function public.game_core(sid uuid, today date)
returns jsonb language sql stable security definer set search_path = '' as $$
  with ad as (select d from public.activity_days(sid) where d <= today),
  runs as (select count(*)::int as len from (select d, d - (row_number() over (order by d))::int as grp from ad) x group by grp),
  wk as (select today - ((extract(isodow from today))::int - 1) as w),
  months as (
    select to_char(m, 'YYYY-MM') as m,
           coalesce((select sum(coalesce(t.solved, 0))::int from public.plan_tasks t
                      where t.student_id = sid and t.done and t.done_at is not null
                        and date_trunc('month', (t.done_at at time zone 'Europe/Istanbul'))::date = mm.m), 0) as q,
           (select count(*)::int from ad where date_trunc('month', ad.d)::date = mm.m) as d
      from (select distinct date_trunc('month', d)::date as m from ad
            union select date_trunc('month', today)::date) mm(m)
  )
  select jsonb_build_object(
    'streak', public.streak_of(sid, today),
    'best', greatest(coalesce((select max(len) from runs), 0), public.streak_of(sid, today)),
    'logs', (select count(*)::int from public.daily_logs where student_id = sid),
    'solved', coalesce((select sum(coalesce(solved, 0))::int from public.plan_tasks where student_id = sid and done), 0),
    'tasks_done', (select count(*)::int from public.plan_tasks where student_id = sid and done),
    'week_q', coalesce((select sum(coalesce(solved, 0))::int from public.plan_tasks
                         where student_id = sid and done and (done_at at time zone 'Europe/Istanbul')::date >= (select w from wk)), 0),
    'good_weeks', (select count(*)::int from (
         select w.id from public.weekly_plans w join public.plan_tasks t on t.plan_id = w.id
          where w.student_id = sid and w.start_date <= today - 6
            and (t.topic_id is not null or length(trim(t.content)) > 0 or t.target_questions is not null)
          group by w.id having avg(case when t.done then 1.0 else 0 end) >= 0.8) z),
    'exams', (select count(*)::int from public.exam_analyses where student_id = sid),
    'books_done', (select count(*)::int from public.resources where student_id = sid and status = 'done'),
    'week_total', (select count(*)::int from public.plan_tasks t join public.weekly_plans w on w.id = t.plan_id
        where w.student_id = sid and today between w.start_date and w.start_date + 6
          and (t.topic_id is not null or length(trim(t.content)) > 0 or t.target_questions is not null)),
    'week_done', (select count(*)::int from public.plan_tasks t join public.weekly_plans w on w.id = t.plan_id
        where w.student_id = sid and today between w.start_date and w.start_date + 6 and t.done
          and (t.topic_id is not null or length(trim(t.content)) > 0 or t.target_questions is not null)),
    'log_streak', public.log_streak_of(sid, today),
    'log_best', greatest(public.log_best_of(sid), public.log_streak_of(sid, today)),
    'complete_logs', (select count(*)::int from public.daily_logs dl where dl.student_id = sid and public.log_is_complete(dl)),
    'today', to_char(today, 'YYYY-MM-DD'),
    'active_today', exists (select 1 from ad where d = today),
    'log_today', exists (select 1 from public.daily_logs where student_id = sid and log_date = today),
    'topics_done', coalesce((select jsonb_agg(topic_id) from public.topic_progress
                              where student_id = sid and status in ('done', 'reviewed')), '[]'::jsonb),
    'months', coalesce((select jsonb_agg(jsonb_build_object('m', m, 'q', q, 'd', d) order by m) from months), '[]'::jsonb),
    'goals', coalesce((select jsonb_agg(jsonb_build_object('m', to_char(month, 'YYYY-MM'), 'q', questions, 'd', active_days))
                         from public.monthly_goals where student_id = sid), '[]'::jsonb),
    'special', coalesce((select jsonb_agg(to_char(d, 'YYYY-MM-DD') order by d) from ad
                          where to_char(d, 'MM-DD') = any (public.special_days())), '[]'::jsonb)
  );
$$;
revoke execute on function public.game_core(uuid, date) from anon, public, authenticated;

create or replace function public.gamification(p_student uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  sid uuid := coalesce(p_student, auth.uid());
  today date := (now() at time zone 'Europe/Istanbul')::date;
  wk date := today - ((extract(isodow from today))::int - 1);
  core jsonb;
  extra jsonb;
begin
  if sid is null or not public.can_access_student(sid) then raise exception 'Erişim yok'; end if;
  core := public.game_core(sid, today);

  -- tüm aktif öğrencilerin güncel serisi ve bu haftaki soru sayısı (yalnızca sayılar, kimlik dönmez)
  with everyone as (
    select public.streak_of(p.id, today) as streak,
           coalesce((select sum(coalesce(t.solved, 0))::int from public.plan_tasks t
                      where t.student_id = p.id and t.done and (t.done_at at time zone 'Europe/Istanbul')::date >= wk), 0) as week_q
      from public.profiles p where p.role = 'student' and p.is_active
  ),
  me as (select (core->>'streak')::int as streak, (core->>'week_q')::int as week_q),
  cnt as (select count(*)::int as n from everyone)
  select jsonb_build_object(
    'n', cnt.n,
    -- "ilk %X": kendisinden daha iyi olanların oranı (+1); 10'dan az öğrencide sıralama gösterilmez
    'streak_top', case when cnt.n >= 10 and me.streak > 0
                       then ceil(100.0 * ((select count(*) from everyone e where e.streak > me.streak) + 1) / cnt.n) end,
    'week_top',   case when cnt.n >= 10 and me.week_q > 0
                       then ceil(100.0 * ((select count(*) from everyone e where e.week_q > me.week_q) + 1) / cnt.n) end
  ) into extra from me, cnt;
  return core || extra;
end;
$$;
revoke execute on function public.gamification(uuid) from anon, public;
grant execute on function public.gamification(uuid) to authenticated;

drop function if exists public.students_gamification();
create or replace function public.students_gamification()
returns table (student_id uuid, data jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'Europe/Istanbul')::date;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'counselor') then
    raise exception 'Yalnızca danışmanlar';
  end if;
  return query
  select p.id, public.game_core(p.id, today)
    from public.profiles p
   where p.role = 'student' and p.counselor_id = auth.uid();
end;
$$;
revoke execute on function public.students_gamification() from anon, public;
grant execute on function public.students_gamification() to authenticated;

-- Bildirimler (yalnızca sunucu / service_role): kazanç odaklı metin için güncel seriler
create or replace function public.notify_streaks(ids uuid[])
returns table (student_id uuid, streak int, log_streak int, active_today boolean, log_today boolean)
language sql stable security definer set search_path = '' as $$
  select p.id,
         public.streak_of(p.id, (now() at time zone 'Europe/Istanbul')::date),
         public.log_streak_of(p.id, (now() at time zone 'Europe/Istanbul')::date),
         exists (select 1 from public.activity_days(p.id) a where a.d = (now() at time zone 'Europe/Istanbul')::date),
         exists (select 1 from public.daily_logs l where l.student_id = p.id and l.log_date = (now() at time zone 'Europe/Istanbul')::date)
    from public.profiles p where p.id = any (ids) and p.role = 'student';
$$;
revoke execute on function public.notify_streaks(uuid[]) from anon, public, authenticated;
grant execute on function public.notify_streaks(uuid[]) to service_role;

grant select, insert, update, delete on public.monthly_goals to authenticated;



-- =====================================================================
-- Rehber videoları (güncelleme 15 ile aynı)
-- =====================================================================
create table if not exists public.guide_videos (
  id            uuid primary key default gen_random_uuid(),
  counselor_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  category      text not null check (category in ('erteleme', 'kaygi', 'zaman', 'motivasyon', 'uyku', 'telefon', 'diger')),
  title         text not null check (char_length(title) between 1 and 150),
  youtube_id    text not null check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  start_sec     int not null default 0 check (start_sec between 0 and 86400),
  sort          int not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists guide_videos_counselor_idx on public.guide_videos (counselor_id, category, sort);

-- Öğrencinin danışmanı (RLS içinde profiles'a özyinelemeden bakmak için)
create or replace function public.my_counselor_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select counselor_id from public.profiles where id = auth.uid();
$$;
revoke execute on function public.my_counselor_id() from anon, public;
grant execute on function public.my_counselor_id() to authenticated;

alter table public.guide_videos enable row level security;
drop policy if exists guide_videos_read on public.guide_videos;
create policy guide_videos_read on public.guide_videos for select to authenticated
  using (counselor_id = auth.uid() or counselor_id = public.my_counselor_id());
drop policy if exists guide_videos_write on public.guide_videos;
create policy guide_videos_write on public.guide_videos for all to authenticated
  using (counselor_id = auth.uid())
  with check (counselor_id = auth.uid() and exists (select 1 from public.profiles where id = auth.uid() and role = 'counselor'));
grant select, insert, update, delete on public.guide_videos to authenticated;

