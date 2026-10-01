-- =====================================================================
-- GÜNCELLEME 10 — Kaynak kataloğu (kitaplar sistemde tanımlı, öğrenci yalnızca seçer)
-- Supabase → SQL Editor'de BİR KEZ çalıştırın. Veri silmez, tekrar çalıştırmak güvenlidir.
-- guncelleme-8.sql daha önce çalıştırılmış olmalı.
--
--   • Danışmanlar ortak bir kaynak kataloğu tutar (yayınevi, kitap, ders, test sayısı,
--     hangi testin hangi konu olduğu). Katalog tüm danışmanlar arasında ortaktır.
--   • Öğrenci kendi listesine yalnızca katalogdan kaynak ekler; kitap bilgilerini değiştiremez.
--   • Test sonucu girilince konu, katalogdaki test → konu eşleşmesinden kendiliğinden yazılır.
-- =====================================================================

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

notify pgrst, 'reload schema';
