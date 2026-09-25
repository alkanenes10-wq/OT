-- =====================================================================
-- GÜNCELLEME 4 — Destek / risk yönlendirmesi
-- Mevcut kurulumda Supabase → SQL Editor'de BİR KEZ çalıştırın (veri silmez,
-- tekrar çalıştırmak güvenlidir). guncelleme-3.sql daha önce çalıştırılmış olmalı.
--
-- Bu bir kriz müdahale sistemi DEĞİLDİR: uyarılar danışman uygulamayı açtığında görülür.
-- Öğrenciye her zaman acil durumda 112'yi araması söylenir.
-- =====================================================================

-- 1) Destek uyarıları (otomatik veya öğrencinin "Konuşmak istiyorum" isteği)
create table if not exists public.support_alerts (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.profiles (id) on delete cascade,
  source        text not null check (source in ('auto', 'student')),
  reasons       jsonb not null default '[]'::jsonb check (jsonb_typeof(reasons) = 'array'),
  student_note  text check (char_length(student_note) <= 1000),
  status        text not null default 'open' check (status in ('open', 'seen', 'contacted', 'closed')),
  student_dismissed_at timestamptz,          -- öğrenci destek kartını "şimdilik iyiyim" ile kapattı
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.profiles (id) on delete set null default auth.uid()
);
create index if not exists support_alerts_student_idx on public.support_alerts (student_id, created_at desc);

-- 2) Danışmanın yaptığı adımlar (tarihli kayıt)
create table if not exists public.support_actions (
  id          uuid primary key default gen_random_uuid(),
  alert_id    uuid not null references public.support_alerts (id) on delete cascade,
  student_id  uuid not null references public.profiles (id) on delete cascade,
  action      text not null check (action in ('seen', 'contacted', 'parent', 'school', 'referred', 'note', 'closed')),
  note        text not null default '' check (char_length(note) <= 2000),
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists support_actions_alert_idx on public.support_actions (alert_id, created_at);

drop trigger if exists support_alerts_touch on public.support_alerts;
create trigger support_alerts_touch before update on public.support_alerts
  for each row execute function public.touch_row();

-- Yalnızca öğrencinin kendi danışmanı görür ve işlem yapar. Öğrenci tabloları doğrudan göremez;
-- aşağıdaki fonksiyonlarla (request_support, support_prompt, dismiss_support_prompt) çalışır.
alter table public.support_alerts enable row level security;
alter table public.support_actions enable row level security;
drop policy if exists support_alerts_counselor on public.support_alerts;
create policy support_alerts_counselor on public.support_alerts for all to authenticated
  using (public.is_counselor_of(student_id)) with check (public.is_counselor_of(student_id));
drop policy if exists support_actions_counselor on public.support_actions;
create policy support_actions_counselor on public.support_actions for all to authenticated
  using (public.is_counselor_of(student_id)) with check (public.is_counselor_of(student_id));
revoke all on public.support_alerts, public.support_actions from anon, authenticated;
grant select, insert, update, delete on public.support_alerts, public.support_actions to authenticated;

-- 3) Otomatik kural: günlük takip kaydedildikçe son 3 kayıt (son 7 gün) incelenir.
--    Eşikleri buradan değiştirebilirsiniz.
create or replace function public.check_support_risk()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  n int;
  anx_hi int;
  low_mood int;
  bad_night int;
  v_reasons jsonb := '[]'::jsonb;
  existing uuid;
begin
  select count(*),
         count(*) filter (where anxiety >= 4),
         count(*) filter (where motivation <= 2 and energy <= 2),
         count(*) filter (where anxiety >= 4 and sleep_hours < 5)
    into n, anx_hi, low_mood, bad_night
    from (
      select anxiety, motivation, energy, sleep_hours from public.daily_logs
      where student_id = new.student_id and log_date > current_date - 7
      order by log_date desc limit 3
    ) t;
  if n < 3 then return new; end if;
  if anx_hi = 3 then v_reasons := v_reasons || to_jsonb('Son 3 kayıtta kaygı 4-5/5'::text); end if;
  if low_mood = 3 then v_reasons := v_reasons || to_jsonb('Son 3 kayıtta motivasyon ve enerji çok düşük (1-2/5)'::text); end if;
  if bad_night >= 2 then v_reasons := v_reasons || to_jsonb('Yüksek kaygıyla birlikte 5 saatten az uyku (2+ gün)'::text); end if;
  if jsonb_array_length(v_reasons) = 0 then return new; end if;

  select id into existing from public.support_alerts
    where student_id = new.student_id and source = 'auto' and status <> 'closed' and created_at > now() - interval '7 days'
    order by created_at desc limit 1;
  if existing is null then
    insert into public.support_alerts (student_id, source, reasons, updated_by) values (new.student_id, 'auto', v_reasons, null);
  else
    update public.support_alerts set reasons = v_reasons, updated_at = now() where id = existing;
  end if;
  return new;
end;
$$;
drop trigger if exists daily_logs_support_risk on public.daily_logs;
create trigger daily_logs_support_risk after insert or update on public.daily_logs
  for each row execute function public.check_support_risk();

-- 4) Öğrenci: "Konuşmak istiyorum"
create or replace function public.request_support(p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  existing uuid;
begin
  if not exists (select 1 from public.profiles where id = me and role = 'student' and is_active) then
    raise exception 'Yalnızca öğrenci hesabı destek isteyebilir';
  end if;
  select id into existing from public.support_alerts
    where student_id = me and source = 'student' and status <> 'closed' and created_at > now() - interval '24 hours'
    order by created_at desc limit 1;
  if existing is not null then
    update public.support_alerts
      set student_note = left(coalesce(nullif(trim(p_note), ''), student_note), 1000), status = 'open', updated_at = now()
      where id = existing;
  else
    insert into public.support_alerts (student_id, source, student_note, reasons)
    values (me, 'student', left(nullif(trim(p_note), ''), 1000), '["Öğrenci konuşmak istedi"]'::jsonb);
  end if;
  -- açık otomatik kart varsa öğrenci için kapat
  update public.support_alerts set student_dismissed_at = now()
    where student_id = me and source = 'auto' and student_dismissed_at is null;
end;
$$;

-- 5) Öğrenci: destek kartı gösterilsin mi? (uyarı nedenleri öğrenciye gösterilmez)
create or replace function public.support_prompt()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'show', exists (
      select 1 from public.support_alerts
      where student_id = auth.uid() and source = 'auto' and status <> 'closed'
        and student_dismissed_at is null and created_at > now() - interval '7 days'),
    'requested_at', (
      select max(created_at) from public.support_alerts
      where student_id = auth.uid() and source = 'student' and status <> 'closed')
  );
$$;

create or replace function public.dismiss_support_prompt()
returns void language sql security definer set search_path = '' as $$
  update public.support_alerts set student_dismissed_at = now()
  where student_id = auth.uid() and source = 'auto' and student_dismissed_at is null;
$$;

revoke all on function public.check_support_risk(), public.request_support(text), public.support_prompt(), public.dismiss_support_prompt() from anon, public;
grant execute on function public.request_support(text), public.support_prompt(), public.dismiss_support_prompt() to authenticated;

notify pgrst, 'reload schema';
