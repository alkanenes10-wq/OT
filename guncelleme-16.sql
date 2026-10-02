-- =====================================================================
-- GÜNCELLEME 16 — Diğer sınavlar (LGS, KPSS), haftalık rapor, veli paneli, yapay zekâ soru çözümü
-- Supabase → SQL Editor'de BİR KEZ çalıştırın (ya da guncelleme-hepsi.sql).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) LGS ve KPSS denemeleri
-- ---------------------------------------------------------------------
alter table public.exam_analyses drop constraint if exists exam_analyses_exam_type_check;
alter table public.exam_analyses add constraint exam_analyses_exam_type_check
  check (exam_type in ('TYT', 'AYT', 'BRANS', 'LGS', 'KPSS'));

-- Rozet verisine öğrencinin alanı da eklenir (ders tamamlama rozetleri sınava göre listelenir)
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
    'field', (select field from public.profiles where id = sid),
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
  select p.id, public.game_core(p.id, today) || jsonb_build_object('field', p.field)
    from public.profiles p
   where p.role = 'student' and p.counselor_id = auth.uid();
end;
$$;
revoke execute on function public.students_gamification() from anon, public;
grant execute on function public.students_gamification() to authenticated;

-- ---------------------------------------------------------------------
-- 2) HAFTALIK RAPOR
--    data    : öğrenci ve velinin görebileceği özet (psikolojik ayrıntı içermez)
--    private : yalnızca danışman (uyku, kaygı, motivasyon ortalamaları vb.)
-- ---------------------------------------------------------------------
create table if not exists public.weekly_reports (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references public.profiles (id) on delete cascade,
  week_start       date not null,
  data             jsonb not null default '{}'::jsonb,
  private          jsonb not null default '{}'::jsonb,
  counselor_note   text not null default '' check (char_length(counselor_note) <= 1500),
  parent_published boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (student_id, week_start)
);
create index if not exists weekly_reports_week_idx on public.weekly_reports (week_start desc);
alter table public.weekly_reports enable row level security;
drop policy if exists weekly_reports_counselor on public.weekly_reports;
create policy weekly_reports_counselor on public.weekly_reports for all to authenticated
  using (public.is_counselor_of(student_id)) with check (public.is_counselor_of(student_id));
revoke all on public.weekly_reports from anon;
grant select, insert, update, delete on public.weekly_reports to authenticated;

alter table public.notify_prefs add column if not exists haftalik boolean not null default true;   -- haftalık rapor bildirimi
alter table public.notify_prefs add column if not exists veli_rapor boolean not null default true; -- rapor veliye kendiliğinden yayınlansın (danışman)

-- Bir öğrencinin bir haftasını (ws = pazartesi) hesaplayıp kaydeder. Not ve yayın durumu korunur.
create or replace function public.build_weekly_report(sid uuid, ws date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  we date := ws + 6;
  d jsonb;
  pr jsonb;
  auto_pub boolean;
begin
  with tk as (
    select t.*, (w.start_date + t.day_index) as dt
      from public.plan_tasks t join public.weekly_plans w on w.id = t.plan_id
     where t.student_id = sid and (w.start_date + t.day_index) between ws - 7 and we
       and (t.topic_id is not null or length(trim(t.content)) > 0 or t.target_questions is not null)
  ),
  cur as (select * from tk where dt >= ws),
  prev as (select * from tk where dt < ws)
  select jsonb_build_object(
    'tasks_total', (select count(*) from cur),
    'tasks_done', (select count(*) from cur where done),
    'solved', coalesce((select sum(coalesce(solved, 0)) from cur where done), 0),
    'correct', coalesce((select sum(coalesce(correct, 0)) from cur), 0),
    'wrong', coalesce((select sum(coalesce(wrong, 0)) from cur), 0),
    'minutes', coalesce((select sum(coalesce(pd.study_minutes, 0)) from public.plan_days pd join public.weekly_plans w on w.id = pd.plan_id
                          where pd.student_id = sid and (w.start_date + pd.day_index) between ws and we), 0),
    'active_days', (select count(*) from public.activity_days(sid) a where a.d between ws and we),
    'log_days', (select count(*) from public.daily_logs l where l.student_id = sid and l.log_date between ws and we),
    'topics_done', (select count(*) from public.topic_progress tp where tp.student_id = sid and tp.status in ('done', 'reviewed')
                     and (tp.updated_at at time zone 'Europe/Istanbul')::date between ws and we),
    'streak', public.streak_of(sid, least(we, (now() at time zone 'Europe/Istanbul')::date)),
    'subjects', coalesce((select jsonb_agg(jsonb_build_object('s', subject, 'n', n, 'd', dn, 'q', q) order by q desc, n desc)
                            from (select subject, count(*) as n, count(*) filter (where done) as dn,
                                         coalesce(sum(coalesce(solved, 0)) filter (where done), 0) as q
                                    from cur group by subject) x), '[]'::jsonb),
    'exams', coalesce((select jsonb_agg(jsonb_build_object('title', a.title, 'date', a.exam_date, 'type', a.exam_type,
                         'net', (select round(coalesce(sum(coalesce((v->>'d')::numeric, 0) - coalesce((v->>'y')::numeric, 0)
                                          / (case when a.exam_type = 'LGS' then 3 else 4 end)), 0), 2)
                                   from jsonb_each(a.nets) as e(k, v))) order by a.exam_date)
                         from public.exam_analyses a where a.student_id = sid and a.exam_date between ws and we), '[]'::jsonb),
    'prev', jsonb_build_object(
      'tasks_total', (select count(*) from prev),
      'tasks_done', (select count(*) from prev where done),
      'solved', coalesce((select sum(coalesce(solved, 0)) from prev where done), 0))
  ) into d;

  select jsonb_build_object(
    'sleep', round(avg(sleep_hours)::numeric, 1),
    'phone', round(avg(phone_minutes)::numeric),
    'anxiety', round(avg(anxiety)::numeric, 1),
    'energy', round(avg(energy)::numeric, 1),
    'motivation', round(avg(motivation)::numeric, 1),
    'procrastinated', count(*) filter (where procrastinated),
    'replanned', count(*) filter (where replanned)
  ) into pr from public.daily_logs where student_id = sid and log_date between ws and we;

  select coalesce(np.veli_rapor, true) into auto_pub
    from public.profiles s left join public.notify_prefs np on np.user_id = s.counselor_id where s.id = sid;

  insert into public.weekly_reports (student_id, week_start, data, private, parent_published)
  values (sid, ws, d, coalesce(pr, '{}'::jsonb), coalesce(auto_pub, true))
  on conflict (student_id, week_start) do update set data = excluded.data, private = excluded.private, updated_at = now();
  return d;
end;
$$;
revoke execute on function public.build_weekly_report(uuid, date) from anon, public, authenticated;

-- Danışman: kendi öğrencilerinin raporlarını istediği hafta için (yeniden) oluşturur
create or replace function public.generate_weekly_reports(p_week date default null)
returns int language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'Europe/Istanbul')::date;
  ws date := coalesce(p_week, today) - ((extract(isodow from coalesce(p_week, today)))::int - 1);
  r record;
  n int := 0;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'counselor') then
    raise exception 'Yalnızca danışmanlar';
  end if;
  for r in select id from public.profiles where role = 'student' and is_active and counselor_id = auth.uid() loop
    perform public.build_weekly_report(r.id, ws);
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function public.generate_weekly_reports(date) from anon, public;
grant execute on function public.generate_weekly_reports(date) to authenticated;

-- Sunucu (pazar akşamı): tüm aktif öğrenciler
create or replace function public.generate_weekly_reports_all()
returns table (student_id uuid, counselor_id uuid, full_name text, data jsonb)
language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'Europe/Istanbul')::date;
  ws date := today - ((extract(isodow from today))::int - 1);
  r record;
begin
  for r in select p.id, p.counselor_id, p.full_name from public.profiles p where p.role = 'student' and p.is_active loop
    student_id := r.id;
    counselor_id := r.counselor_id;
    full_name := r.full_name;
    data := public.build_weekly_report(r.id, ws);
    return next;
  end loop;
end;
$$;
revoke execute on function public.generate_weekly_reports_all() from anon, public, authenticated;
grant execute on function public.generate_weekly_reports_all() to service_role;

-- Öğrenci kendi raporlarını okur (danışmana özel "private" bölümü ve not olmadan)
create or replace function public.my_weekly_reports()
returns table (week_start date, data jsonb)
language sql stable security definer set search_path = '' as $$
  select w.week_start, w.data from public.weekly_reports w where w.student_id = auth.uid() order by w.week_start desc limit 12;
$$;
revoke execute on function public.my_weekly_reports() from anon, public;
grant execute on function public.my_weekly_reports() to authenticated;

-- ---------------------------------------------------------------------
-- 3) VELİ PANELİ: yayınlanan raporlar, yaklaşan görüşmeler, danışmanla mesajlaşma
-- ---------------------------------------------------------------------
create table if not exists public.parent_messages (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.profiles (id) on delete cascade,
  from_parent boolean not null,
  body        text not null check (char_length(body) between 1 and 1500),
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);
create index if not exists parent_messages_student_idx on public.parent_messages (student_id, created_at);
alter table public.parent_messages enable row level security;
drop policy if exists parent_messages_counselor on public.parent_messages;
create policy parent_messages_counselor on public.parent_messages for all to authenticated
  using (public.is_counselor_of(student_id)) with check (public.is_counselor_of(student_id));
revoke all on public.parent_messages from anon;
grant select, insert, update, delete on public.parent_messages to authenticated;

create or replace function public.parent_student(p_token text)
returns uuid language sql stable security definer set search_path = '' as $$
  select l.student_id from public.parent_links l join public.profiles p on p.id = l.student_id
   where p_token is not null and char_length(p_token) >= 32 and l.token = p_token and l.revoked_at is null
     and p.role = 'student' and p.is_active;
$$;
revoke execute on function public.parent_student(text) from anon, public, authenticated;

create or replace function public.parent_panel(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  sid uuid := public.parent_student(p_token);
  out jsonb;
begin
  if sid is null then return null; end if;
  select jsonb_build_object(
    'reports', coalesce((select jsonb_agg(jsonb_build_object('week_start', w.week_start, 'data', w.data, 'note', w.counselor_note) order by w.week_start desc)
                           from (select * from public.weekly_reports where student_id = sid and parent_published order by week_start desc limit 12) w), '[]'::jsonb),
    'sessions', coalesce((select jsonb_agg(jsonb_build_object('starts_at', s.starts_at, 'duration_min', s.duration_min, 'mode', s.mode) order by s.starts_at)
                            from public.counseling_sessions s
                           where s.student_id = sid and s.status = 'planned' and s.starts_at >= now() - interval '2 hours'), '[]'::jsonb),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'from_parent', m.from_parent, 'body', m.body, 'created_at', m.created_at) order by m.created_at)
                            from (select * from public.parent_messages where student_id = sid order by created_at desc limit 60) m), '[]'::jsonb)
  ) into out;
  -- Velinin açtığı an, danışmandan gelen mesajlar okunmuş sayılır
  update public.parent_messages set read_at = now() where student_id = sid and not from_parent and read_at is null;
  return out;
end;
$$;
revoke execute on function public.parent_panel(text) from public;
grant execute on function public.parent_panel(text) to anon, authenticated;

create or replace function public.parent_send(p_token text, p_body text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  sid uuid := public.parent_student(p_token);
  b text := trim(coalesce(p_body, ''));
begin
  if sid is null then raise exception 'Bağlantı geçersiz'; end if;
  if char_length(b) < 1 or char_length(b) > 1500 then raise exception 'Mesaj 1-1500 karakter olmalı'; end if;
  if (select count(*) from public.parent_messages where student_id = sid and from_parent and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Günlük mesaj sınırına ulaşıldı (10)';
  end if;
  insert into public.parent_messages (student_id, from_parent, body) values (sid, true, b);
  return true;
end;
$$;
revoke execute on function public.parent_send(text, text) from public;
grant execute on function public.parent_send(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 4) YAPAY ZEKÂ İLE SORU ÇÖZÜMÜ (önce ipucu, sonra çözüm)
--    Satırları yalnızca sunucu yazar; öğrenci ve danışmanı okur.
-- ---------------------------------------------------------------------
create table if not exists public.ai_questions (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.profiles (id) on delete cascade,
  image_path   text not null check (char_length(image_path) <= 300),
  subject      text not null default '' check (char_length(subject) <= 60),
  note         text not null default '' check (char_length(note) <= 500),
  hint         text,
  solution     text,
  solution_at  timestamptz,
  model        text,
  created_at   timestamptz not null default now()
);
create index if not exists ai_questions_student_idx on public.ai_questions (student_id, created_at desc);
alter table public.ai_questions enable row level security;
drop policy if exists ai_questions_read on public.ai_questions;
create policy ai_questions_read on public.ai_questions for select to authenticated
  using (public.can_access_student(student_id));
revoke all on public.ai_questions from anon;
grant select on public.ai_questions to authenticated;
grant all on public.ai_questions to service_role;

-- Günlük soru sınırı: danışman öğrenci bazında ayarlar (satır yoksa varsayılan 5; 0 = kapalı)
create table if not exists public.ai_settings (
  student_id  uuid primary key references public.profiles (id) on delete cascade,
  daily_limit int not null default 5 check (daily_limit between 0 and 50),
  updated_at  timestamptz not null default now()
);
alter table public.ai_settings enable row level security;
drop policy if exists ai_settings_read on public.ai_settings;
create policy ai_settings_read on public.ai_settings for select to authenticated
  using (public.can_access_student(student_id));
drop policy if exists ai_settings_write on public.ai_settings;
create policy ai_settings_write on public.ai_settings for all to authenticated
  using (public.is_counselor_of(student_id)) with check (public.is_counselor_of(student_id));
revoke all on public.ai_settings from anon;
grant select, insert, update, delete on public.ai_settings to authenticated;
grant all on public.ai_settings, public.weekly_reports, public.parent_messages to service_role;

notify pgrst, 'reload schema';
