-- =====================================================================
-- GÜNCELLEME 14 — Aylık hedefler, konu bitirme rozetleri, özel gün rozetleri
-- Supabase → SQL Editor'de BİR KEZ çalıştırın. guncelleme-11, 12 ve 13 daha önce çalıştırılmış olmalı.
--   • monthly_goals: danışmanın öğrenci için elle belirlediği aylık hedef (boşsa otomatik hedef kullanılır)
--   • game_core: tüm rozet verisini tek JSON olarak üretir (öğrenci, veli değil; danışman listesi aynı veriyi kullanır)
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

notify pgrst, 'reload schema';
