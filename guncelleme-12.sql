-- =====================================================================
-- GÜNCELLEME 12 — Öğrenci listesinde seri ve rozetler
-- Supabase → SQL Editor'de BİR KEZ çalıştırın. guncelleme-11.sql daha önce çalıştırılmış olmalı.
-- Danışmanın kendi öğrencilerinin seri/rozet sayılarını tek sorguda döndürür.
-- =====================================================================
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

notify pgrst, 'reload schema';
