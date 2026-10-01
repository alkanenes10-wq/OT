-- =====================================================================
-- GÜNCELLEME 11 — Veli bağlantısı, otomatik bildirimler, seri ve rozetler
-- Supabase → SQL Editor'de BİR KEZ çalıştırın. Veri silmez, tekrar çalıştırmak güvenlidir.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) VELİ BAĞLANTISI: danışmanın oluşturduğu, tahmin edilemez, salt okunur bağlantı
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

notify pgrst, 'reload schema';
