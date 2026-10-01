-- =====================================================================
-- GÜNCELLEME 5 — Danışmanın öğrenciyle paylaştığı notlar
-- Mevcut kurulumda Supabase → SQL Editor'de BİR KEZ çalıştırın (veri silmez,
-- tekrar çalıştırmak güvenlidir). guncelleme-4.sql daha önce çalıştırılmış olmalı.
-- (Danışmanın ÖZEL görüşme notları ayrı tablodadır ve öğrenciye hiçbir zaman görünmez.)
-- =====================================================================

create table if not exists public.shared_notes (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.profiles (id) on delete cascade,
  counselor_id  uuid references public.profiles (id) on delete set null default auth.uid(),
  body          text not null check (char_length(body) between 1 and 4000),
  alert_id      uuid references public.support_alerts (id) on delete set null, -- destek isteğine yanıt ise
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists shared_notes_student_idx on public.shared_notes (student_id, created_at desc);

alter table public.shared_notes enable row level security;
-- Öğrenci kendi notlarını, danışman kendi öğrencilerinin notlarını görür
drop policy if exists shared_notes_select on public.shared_notes;
create policy shared_notes_select on public.shared_notes for select to authenticated
  using (public.can_access_student(student_id));
-- Yalnızca danışman yazar / düzenler / siler
drop policy if exists shared_notes_insert on public.shared_notes;
create policy shared_notes_insert on public.shared_notes for insert to authenticated
  with check (public.is_counselor_of(student_id));
drop policy if exists shared_notes_update on public.shared_notes;
create policy shared_notes_update on public.shared_notes for update to authenticated
  using (public.is_counselor_of(student_id)) with check (public.is_counselor_of(student_id));
drop policy if exists shared_notes_delete on public.shared_notes;
create policy shared_notes_delete on public.shared_notes for delete to authenticated
  using (public.is_counselor_of(student_id));
revoke all on public.shared_notes from anon, authenticated;
grant select, insert, update, delete on public.shared_notes to authenticated;

-- Öğrenci notları "okundu" yapar (yalnızca okunma zamanını değiştirebilir)
create or replace function public.mark_shared_notes_read()
returns void language sql security definer set search_path = '' as $$
  update public.shared_notes set read_at = now()
  where student_id = auth.uid() and read_at is null;
$$;
revoke all on function public.mark_shared_notes_read() from anon, public;
grant execute on function public.mark_shared_notes_read() to authenticated;

notify pgrst, 'reload schema';
