-- =====================================================================
-- GÜNCELLEME 8 — Toplu hatırlatma (öğrenci telefonları) ve kaynak (kitap) takibi
-- Supabase → SQL Editor'de BİR KEZ çalıştırın. Veri silmez, tekrar çalıştırmak güvenlidir.
-- =====================================================================

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
