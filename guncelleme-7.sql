-- =====================================================================
-- GÜNCELLEME 7 — Kişisel görünüm (renk paleti + açık/koyu tema)
-- Supabase → SQL Editor'de BİR KEZ çalıştırın. Veri silmez, tekrar çalıştırmak güvenlidir.
-- Her kullanıcı (öğrenci ve danışman) yalnızca KENDİ görünüm seçimini değiştirebilir.
-- =====================================================================

alter table public.profiles add column if not exists accent text not null default 'petrol';
alter table public.profiles add column if not exists color_mode text not null default 'auto';

do $$ begin
  alter table public.profiles add constraint profiles_accent_check
    check (accent in ('petrol', 'okyanus', 'mor', 'gul', 'gunbatimi', 'orman', 'grafit'));
exception when duplicate_object then null;
end $$;
do $$ begin
  alter table public.profiles add constraint profiles_color_mode_check
    check (color_mode in ('auto', 'light', 'dark'));
exception when duplicate_object then null;
end $$;

create or replace function public.set_my_theme(p_accent text, p_mode text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Giriş gerekli'; end if;
  update public.profiles
     set accent = coalesce(p_accent, accent),
         color_mode = coalesce(p_mode, color_mode)
   where id = auth.uid();
end;
$$;

revoke all on function public.set_my_theme(text, text) from public;
grant execute on function public.set_my_theme(text, text) to authenticated;
