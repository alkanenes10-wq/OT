-- =====================================================================
-- GÜNCELLEME 13 — Günlük takip rozetleri ve sınırsız rozet seviyeleri
-- Supabase → SQL Editor'de BİR KEZ çalıştırın. guncelleme-11.sql ve guncelleme-12.sql daha önce çalıştırılmış olmalı.
--   • Günlük serisi: günlük takibin üst üste doldurulduğu gün sayısı
--   • Eksiksiz günlük: uyku, telefon, kaygı, enerji, motivasyon, erteleme ve plan değişikliği alanlarının hepsi dolu
-- =====================================================================

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


notify pgrst, 'reload schema';
