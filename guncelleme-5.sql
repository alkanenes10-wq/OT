-- =====================================================================
-- GÜNCELLEME 5 — Ayrıntılı destek uyarıları, görüşme takvimi, soru bankası
-- Mevcut kurulumda Supabase → SQL Editor'de BİR KEZ çalıştırın (veri silmez,
-- tekrar çalıştırmak güvenlidir). guncelleme-4.sql daha önce çalıştırılmış olmalı.
--
-- Otomatik uyarılar artık yalnızca kısa bir neden değil, şunları da kaydeder:
--   • hangi günlerin hangi değerleri uyarıya yol açtı (kanıt)
--   • bunun neden önemli olduğu
--   • danışmana önerilen adım
--   • öğrenciye gösterilecek, kendi verisine dayanan açıklama
-- Ayrıca: danışman–öğrenci görüşme takvimi (öğrenci notları göremez) ve
-- öğrencinin çözemediği soruların fotoğraflarını sakladığı soru bankası + testler.
-- =====================================================================

-- 1) Ayrıntı sütunu
alter table public.support_alerts add column if not exists details jsonb not null default '[]'::jsonb;
do $$ begin
  alter table public.support_alerts add constraint support_alerts_details_is_array check (jsonb_typeof(details) = 'array');
exception when duplicate_object then null;
end $$;

-- Yardımcı: son 3 kaydın (son 7 gün) değerlerini "12.10: 4/5 · 13.10: 5/5" biçiminde verir
create or replace function public.support_evidence(sid uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with t as (
    select log_date, anxiety, motivation, energy, sleep_hours, phone_minutes, procrastinated, obstacle
    from public.daily_logs
    where student_id = sid and log_date > current_date - 7
    order by log_date desc limit 3
  )
  select jsonb_build_object(
    'anxiety',    string_agg(to_char(log_date, 'DD.MM') || ': ' || coalesce(anxiety::text || '/5', '—'), ' · ' order by log_date),
    'motivation', string_agg(to_char(log_date, 'DD.MM') || ': ' || coalesce(motivation::text || '/5', '—'), ' · ' order by log_date),
    'energy',     string_agg(to_char(log_date, 'DD.MM') || ': ' || coalesce(energy::text || '/5', '—'), ' · ' order by log_date),
    'sleep',      string_agg(to_char(log_date, 'DD.MM') || ': ' || coalesce(replace(to_char(sleep_hours, 'FM990.0'), '.', ',') || ' sa', '—'), ' · ' order by log_date),
    'phone',      string_agg(to_char(log_date, 'DD.MM') || ': ' || coalesce(phone_minutes::text || ' dk', '—'), ' · ' order by log_date),
    'procrastinated', string_agg(to_char(log_date, 'DD.MM') || ': ' || case when procrastinated then 'evet' when procrastinated = false then 'hayır' else '—' end, ' · ' order by log_date),
    'obstacles',  string_agg(case when length(trim(coalesce(obstacle, ''))) > 2
                              then to_char(log_date, 'DD.MM') || ': “' || left(trim(obstacle), 120) || '”' end, ' · ' order by log_date),
    'n', count(*)
  ) from t;
$$;

-- 2) Otomatik kural (aynı eşikler) + ayrıntılar
create or replace function public.check_support_risk()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  n int;
  anx_hi int;
  low_mood int;
  bad_night int;
  ev jsonb;
  v_reasons jsonb := '[]'::jsonb;
  v_details jsonb := '[]'::jsonb;
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

  ev := public.support_evidence(new.student_id);

  if anx_hi = 3 then
    v_reasons := v_reasons || to_jsonb('Son 3 kayıtta kaygı 4-5/5'::text);
    v_details := v_details || jsonb_build_array(jsonb_build_object(
      'title', 'Kaygı üç kayıt üst üste yüksek (4-5/5)',
      'evidence', to_jsonb(array_remove(array[
        'Kaygı: ' || (ev->>'anxiety'),
        'Uyku: ' || (ev->>'sleep'),
        case when ev->>'obstacles' is not null then 'Öğrencinin yazdığı engeller: ' || (ev->>'obstacles') end], null)),
      'why', 'Yüksek kaygı dikkati ve çalışma belleğini daraltır. Üç gün sürmesi, geçici bir sınav gerginliğinden fazlası olabileceğini gösterir.',
      'next_step', 'Kısa bir görüşme planlayın; kaygının hangi durumlarda yükseldiğini ve aklından geçen düşünceleri birlikte yazın. Uyku da düşükse önce uykuyu ele alın. Günlük işlevsellik belirgin bozulduysa uzmana yönlendirmeyi değerlendirin.',
      'student_text', 'Son 3 kaydındaki kaygı puanların: ' || (ev->>'anxiety') || '. Kaygı art arda yüksek kaldığında dikkat daralır ve çalışmak zorlaşır; bu yetersiz olduğun anlamına gelmez, zorlandığını gösterir.'
    ));
  end if;

  if low_mood = 3 then
    v_reasons := v_reasons || to_jsonb('Son 3 kayıtta motivasyon ve enerji çok düşük (1-2/5)'::text);
    v_details := v_details || jsonb_build_array(jsonb_build_object(
      'title', 'Motivasyon ve enerji üç kayıt üst üste çok düşük (1-2/5)',
      'evidence', jsonb_build_array(
        'Motivasyon: ' || (ev->>'motivation'),
        'Enerji: ' || (ev->>'energy'),
        'Uyku: ' || (ev->>'sleep'),
        'Erteleme: ' || (ev->>'procrastinated')),
      'why', 'Birlikte ve birkaç gün süren düşük enerji ve motivasyon, yorgunluğun ya da duygu durumunda düşüşün işareti olabilir; yalnızca çalışma alışkanlığıyla açıklanmayabilir.',
      'next_step', 'Öğrenciye nasıl olduğunu sorun; uyku, iştah, keyif alma ve arkadaş ilişkilerindeki değişiklikleri dinleyin. Programın yükünü geçici olarak azaltın. İki haftadan uzun sürerse veli ve uzmanla iş birliğini değerlendirin.',
      'student_text', 'Son 3 kaydındaki motivasyon puanların: ' || (ev->>'motivation') || '; enerji puanların: ' || (ev->>'energy') || '. Birkaç gün üst üste böyle hissetmek yorucu olabilir; programı biraz hafifletmek ve konuşmak iyi gelebilir.'
    ));
  end if;

  if bad_night >= 2 then
    v_reasons := v_reasons || to_jsonb('Yüksek kaygıyla birlikte 5 saatten az uyku (2+ gün)'::text);
    v_details := v_details || jsonb_build_array(jsonb_build_object(
      'title', 'Yüksek kaygıyla birlikte 5 saatten az uyku (' || bad_night || ' gün)',
      'evidence', jsonb_build_array(
        'Uyku: ' || (ev->>'sleep'),
        'Kaygı: ' || (ev->>'anxiety'),
        'Telefon: ' || (ev->>'phone')),
      'why', 'Az uyku kaygıyı artırır, kaygı da uykuyu bozar. Bu döngü birkaç gün içinde dikkat, bellek ve duygu düzenlemeyi belirgin biçimde etkiler.',
      'next_step', 'Uykuyu önceliklendirin: geç saatteki çalışma bloklarını kaldırın, sabit kalkış saati ve yatmadan önce ekransız 1 saat belirleyin. Uykusuzluk sürerse aileyle paylaşın ve sağlık desteği önerin.',
      'student_text', 'Son kayıtlarındaki uyku sürelerin: ' || (ev->>'sleep') || '; kaygı puanların: ' || (ev->>'anxiety') || '. Az uyku kaygıyı artırır; bu gece erken yatmak bugünkü en önemli işin olabilir.'
    ));
  end if;

  if jsonb_array_length(v_reasons) = 0 then return new; end if;

  select id into existing from public.support_alerts
    where student_id = new.student_id and source = 'auto' and status <> 'closed' and created_at > now() - interval '7 days'
    order by created_at desc limit 1;
  if existing is null then
    insert into public.support_alerts (student_id, source, reasons, details, updated_by)
    values (new.student_id, 'auto', v_reasons, v_details, null);
  else
    update public.support_alerts set reasons = v_reasons, details = v_details, updated_at = now() where id = existing;
  end if;
  return new;
end;
$$;

-- 3) Öğrenci "Konuşmak istiyorum" dediğinde son 3 günün özeti de danışmana gider
create or replace function public.request_support(p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  existing uuid;
  ev jsonb;
  v_details jsonb := '[]'::jsonb;
begin
  if not exists (select 1 from public.profiles where id = me and role = 'student' and is_active) then
    raise exception 'Yalnızca öğrenci hesabı destek isteyebilir';
  end if;
  ev := public.support_evidence(me);
  if coalesce((ev->>'n')::int, 0) > 0 then
    v_details := jsonb_build_array(jsonb_build_object(
      'title', 'İstek anındaki son günlük kayıtlar',
      'evidence', to_jsonb(array_remove(array[
        'Kaygı: ' || (ev->>'anxiety'),
        'Motivasyon: ' || (ev->>'motivation'),
        'Enerji: ' || (ev->>'energy'),
        'Uyku: ' || (ev->>'sleep'),
        'Telefon: ' || (ev->>'phone'),
        'Erteleme: ' || (ev->>'procrastinated'),
        case when ev->>'obstacles' is not null then 'Yazdığı engeller: ' || (ev->>'obstacles') end], null)),
      'why', 'Öğrenci desteği kendisi istedi; bu, otomatik uyarılardan daha güçlü bir sinyaldir.',
      'next_step', 'Mümkün olan en kısa sürede öğrenciyle iletişime geçin ve dinleyin. Kendine zarar verme düşüncesi ya da acil bir risk sezerseniz veliyi bilgilendirin ve profesyonel yardıma yönlendirin.'
    ));
  else
    v_details := jsonb_build_array(jsonb_build_object(
      'title', 'Son 7 günde günlük kayıt yok',
      'evidence', '[]'::jsonb,
      'why', 'Öğrenci desteği kendisi istedi; bu, otomatik uyarılardan daha güçlü bir sinyaldir.',
      'next_step', 'Mümkün olan en kısa sürede öğrenciyle iletişime geçin ve dinleyin.'
    ));
  end if;

  select id into existing from public.support_alerts
    where student_id = me and source = 'student' and status <> 'closed' and created_at > now() - interval '24 hours'
    order by created_at desc limit 1;
  if existing is not null then
    update public.support_alerts
      set student_note = left(coalesce(nullif(trim(p_note), ''), student_note), 1000), status = 'open', details = v_details, updated_at = now()
      where id = existing;
  else
    insert into public.support_alerts (student_id, source, student_note, reasons, details)
    values (me, 'student', left(nullif(trim(p_note), ''), 1000), '["Öğrenci konuşmak istedi"]'::jsonb, v_details);
  end if;
  update public.support_alerts set student_dismissed_at = now()
    where student_id = me and source = 'auto' and student_dismissed_at is null;
end;
$$;

-- 4) Öğrencinin destek kartı: kendi verisine dayanan açıklamalar da döner
--    (danışmanın notları ve attığı adımlar öğrenciye gösterilmez)
create or replace function public.support_prompt()
returns jsonb language sql stable security definer set search_path = '' as $$
  with a as (
    select details from public.support_alerts
    where student_id = auth.uid() and source = 'auto' and status <> 'closed'
      and student_dismissed_at is null and created_at > now() - interval '7 days'
    order by created_at desc limit 1
  )
  select jsonb_build_object(
    'show', exists (select 1 from a),
    'details', coalesce((select jsonb_agg(d->>'student_text') filter (where d ? 'student_text') from a, jsonb_array_elements(a.details) d), '[]'::jsonb),
    'requested_at', (
      select max(created_at) from public.support_alerts
      where student_id = auth.uid() and source = 'student' and status <> 'closed')
  );
$$;

revoke all on function public.support_evidence(uuid), public.check_support_risk(), public.request_support(text), public.support_prompt() from anon, public;
grant execute on function public.request_support(text), public.support_prompt() to authenticated;

-- 5) Görüşme takvimi
create table if not exists public.counseling_sessions (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.profiles (id) on delete cascade,
  counselor_id uuid references public.profiles (id) on delete set null default auth.uid(),
  starts_at    timestamptz not null,
  duration_min int not null default 45 check (duration_min between 10 and 240),
  mode         text not null default 'online' check (mode in ('online', 'yuz_yuze', 'telefon')),
  link         text check (char_length(link) <= 500),
  topic        text not null default '' check (char_length(topic) <= 200),
  status       text not null default 'planned' check (status in ('planned', 'done', 'cancelled')),
  notes        text not null default '' check (char_length(notes) <= 3000), -- yalnızca danışman görür
  reminded_at  timestamptz,                                                 -- hatırlatma gönderildi
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references public.profiles (id) on delete set null default auth.uid()
);
alter table public.counseling_sessions add column if not exists reminded_at timestamptz;
create index if not exists counseling_sessions_student_idx on public.counseling_sessions (student_id, starts_at);

drop trigger if exists counseling_sessions_touch on public.counseling_sessions;
create trigger counseling_sessions_touch before update on public.counseling_sessions
  for each row execute function public.touch_row();

alter table public.counseling_sessions enable row level security;
drop policy if exists counseling_sessions_counselor on public.counseling_sessions;
create policy counseling_sessions_counselor on public.counseling_sessions for all to authenticated
  using (public.is_counselor_of(student_id)) with check (public.is_counselor_of(student_id));
revoke all on public.counseling_sessions from anon, authenticated;
grant select, insert, update, delete on public.counseling_sessions to authenticated;

-- Öğrenci kendi görüşmelerini notlar OLMADAN görür
create or replace function public.my_sessions()
returns table (id uuid, starts_at timestamptz, duration_min int, mode text, link text, topic text, status text)
language sql stable security definer set search_path = '' as $$
  select s.id, s.starts_at, s.duration_min, s.mode, s.link, s.topic, s.status
  from public.counseling_sessions s
  where s.student_id = auth.uid() and s.starts_at > now() - interval '30 days'
  order by s.starts_at;
$$;
revoke all on function public.my_sessions() from anon, public;
grant execute on function public.my_sessions() to authenticated;

-- 6) Soru bankası: öğrencinin çözemediği sorular (fotoğraf) ve bunlardan hazırlanan testler
create table if not exists public.question_items (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references public.profiles (id) on delete cascade,
  image_path     text not null check (char_length(image_path) <= 300),
  subject        text not null default '' check (char_length(subject) <= 60),
  topic_id       text check (char_length(topic_id) <= 80),
  source         text not null default '' check (char_length(source) <= 120),
  note           text not null default '' check (char_length(note) <= 1000),
  answer         text check (answer in ('A', 'B', 'C', 'D', 'E')),
  solution_path  text check (char_length(solution_path) <= 300),
  solution_note  text not null default '' check (char_length(solution_note) <= 2000),
  status         text not null default 'open' check (status in ('open', 'learned')),
  attempts       int not null default 0 check (attempts >= 0),
  correct_count  int not null default 0 check (correct_count >= 0),
  last_result    text check (last_result in ('correct', 'wrong', 'empty')),
  created_by     uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references public.profiles (id) on delete set null default auth.uid()
);
create index if not exists question_items_student_idx on public.question_items (student_id, created_at desc);

create table if not exists public.question_tests (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.profiles (id) on delete cascade,
  title        text not null default '' check (char_length(title) <= 120),
  question_ids uuid[] not null default '{}',
  answers      jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  correct      int,
  total        int,
  created_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  finished_at  timestamptz
);
create index if not exists question_tests_student_idx on public.question_tests (student_id, created_at desc);

drop trigger if exists question_items_touch on public.question_items;
create trigger question_items_touch before update on public.question_items
  for each row execute function public.touch_row();

alter table public.question_items enable row level security;
alter table public.question_tests enable row level security;
drop policy if exists question_items_access on public.question_items;
create policy question_items_access on public.question_items for all to authenticated
  using (public.can_access_student(student_id)) with check (public.can_access_student(student_id));
drop policy if exists question_tests_access on public.question_tests;
create policy question_tests_access on public.question_tests for all to authenticated
  using (public.can_access_student(student_id)) with check (public.can_access_student(student_id));
revoke all on public.question_items, public.question_tests from anon, authenticated;
grant select, insert, update, delete on public.question_items, public.question_tests to authenticated;

-- Fotoğraflar: özel depo, klasör = öğrenci kimliği (öğrenci ve danışmanı erişir)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sorular', 'sorular', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
drop policy if exists sorular_select on storage.objects;
create policy sorular_select on storage.objects for select to authenticated
  using (bucket_id = 'sorular' and public.can_access_student_path(name));
drop policy if exists sorular_insert on storage.objects;
create policy sorular_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'sorular' and public.can_access_student_path(name));
drop policy if exists sorular_delete on storage.objects;
create policy sorular_delete on storage.objects for delete to authenticated
  using (bucket_id = 'sorular' and public.can_access_student_path(name));

notify pgrst, 'reload schema';
