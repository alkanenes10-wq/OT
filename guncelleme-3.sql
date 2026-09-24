-- =====================================================================
-- GÜNCELLEME 3 — Çalışma saatleri + saatli program blokları
-- Mevcut kurulumda Supabase → SQL Editor'de BİR KEZ çalıştırın (veri silmez,
-- tekrar çalıştırmak güvenlidir). guncelleme-2.sql daha önce çalıştırılmış olmalı.
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
