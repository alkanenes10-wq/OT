-- =====================================================================
--  YKS Takip — GÜNCELLEME 2 (haftalık program, deneme analizi, karne PDF)
--  Supabase → SQL Editor → New query → bu dosyanın TAMAMINI yapıştır → Run
--  Mevcut verileri SİLMEZ. Birden fazla kez çalıştırılabilir.
--  (Yeni kurulumlarda schema.sql bu güncellemeyi zaten içerir.)
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
