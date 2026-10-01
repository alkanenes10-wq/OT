-- =====================================================================
-- GÜNCELLEME 15 — Rehber videoları (erteleme, sınav kaygısı, zaman yönetimi …)
-- Supabase → SQL Editor'de BİR KEZ çalıştırın.
--   • Danışman YouTube bağlantısı ekler; öğrenciler yalnızca kendi danışmanının videolarını görür.
--   • Öğrencinin günlüğüne göre öneri uygulamada hesaplanır (ek tablo gerekmez).
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

notify pgrst, 'reload schema';
