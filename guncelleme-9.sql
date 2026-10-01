-- =====================================================================
-- GÜNCELLEME 9 — Ortak soru forumu (öğrenciler birbirine yardım eder)
-- Supabase → SQL Editor'de BİR KEZ çalıştırın. Veri silmez, tekrar çalıştırmak güvenlidir.
-- guncelleme-5.sql (soru bankası) daha önce çalıştırılmış olmalı.
--
-- Kurallar:
--   • Tüm öğrenciler (bütün danışmanların öğrencileri) ortak soruları görür.
--   • Kim sorduğu / kim cevapladığı öğrencilere HİÇ gösterilmez (tamamen anonim).
--     Danışman, onay kuyruğunda kendi öğrencisinin adını görür.
--   • Öğrencinin paylaştığı soru ve yazdığı cevap, kendi danışmanı onaylayana kadar yalnızca
--     kendisine görünür. Danışman cevapları doğrudan yayınlanır.
--   • Tablolara doğrudan erişim yoktur; her şey aşağıdaki fonksiyonlarla yapılır
--     (böylece yazarın kimliği istemciye hiç gitmez).
-- =====================================================================

create table if not exists public.forum_posts (
  id           uuid primary key default gen_random_uuid(),
  author_id    uuid not null references public.profiles (id) on delete cascade,
  question_id  uuid references public.question_items (id) on delete set null,
  subject      text not null default '' check (char_length(subject) <= 60),
  topic_id     text check (char_length(topic_id) <= 80),
  note         text not null default '' check (char_length(note) <= 1000),
  image_path   text not null check (image_path like 'forum/%' and char_length(image_path) <= 200),
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'hidden')),
  solved       boolean not null default false,
  reported     boolean not null default false,
  moderated_by uuid references public.profiles (id) on delete set null,
  moderated_at timestamptz,
  created_at   timestamptz not null default now()
);
create unique index if not exists forum_posts_question_uidx on public.forum_posts (question_id) where question_id is not null;
create index if not exists forum_posts_feed_idx on public.forum_posts (status, created_at desc);
create index if not exists forum_posts_author_idx on public.forum_posts (author_id);

create table if not exists public.forum_answers (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid not null references public.forum_posts (id) on delete cascade,
  author_id    uuid not null references public.profiles (id) on delete cascade,
  body         text not null check (char_length(body) between 1 and 2000),
  image_path   text check (image_path like 'forum/%' and char_length(image_path) <= 200),
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'hidden')),
  helpful      boolean not null default false,
  reported     boolean not null default false,
  moderated_by uuid references public.profiles (id) on delete set null,
  moderated_at timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists forum_answers_post_idx on public.forum_answers (post_id, created_at);
create index if not exists forum_answers_author_idx on public.forum_answers (author_id);

alter table public.forum_posts enable row level security;
alter table public.forum_answers enable row level security;
revoke all on public.forum_posts, public.forum_answers from anon, authenticated;

-- Yardımcılar ----------------------------------------------------------
create or replace function public.forum_role()
returns text language sql stable security definer set search_path = '' as $$
  select case
    when p.role = 'counselor' then 'counselor'
    when p.role = 'student' and p.is_active then 'student'
    else null end
  from public.profiles p where p.id = (select auth.uid());
$$;

-- Akış: onaylı sorular + kendi sorularım
create or replace function public.forum_feed(p_subject text default null, p_mine boolean default false, p_limit int default 30, p_before timestamptz default null)
returns table (id uuid, subject text, topic_id text, note text, image_path text, status text, solved boolean, created_at timestamptz, answer_count int, mine boolean)
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := auth.uid(); r text := public.forum_role();
begin
  if r is null then raise exception 'Giriş gerekli'; end if;
  return query
    select f.id, f.subject, f.topic_id, f.note, f.image_path, f.status, f.solved, f.created_at,
           (select count(*)::int from public.forum_answers a where a.post_id = f.id and a.status = 'approved'),
           f.author_id = me
      from public.forum_posts f
     where (f.status = 'approved' or f.author_id = me)
       and (not p_mine or f.author_id = me)
       and (p_subject is null or p_subject = '' or f.subject = p_subject)
       and (p_before is null or f.created_at < p_before)
     order by f.created_at desc
     limit least(greatest(coalesce(p_limit, 30), 1), 60);
end;
$$;

-- Bir sorunun cevapları: onaylılar + kendi cevaplarım
create or replace function public.forum_thread(p_post uuid)
returns table (id uuid, body text, image_path text, status text, helpful boolean, created_at timestamptz, mine boolean, by_counselor boolean)
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if public.forum_role() is null then raise exception 'Giriş gerekli'; end if;
  if not exists (select 1 from public.forum_posts f where f.id = p_post and (f.status = 'approved' or f.author_id = me)) then
    raise exception 'Soru bulunamadı';
  end if;
  return query
    select a.id, a.body, a.image_path, a.status, a.helpful, a.created_at, a.author_id = me,
           exists (select 1 from public.profiles p where p.id = a.author_id and p.role = 'counselor')
      from public.forum_answers a
     where a.post_id = p_post and (a.status = 'approved' or a.author_id = me)
     order by a.helpful desc, a.created_at;
end;
$$;

-- Öğrenci kendi sorusunu paylaşır (danışman onayına düşer)
create or replace function public.forum_share(p_question uuid, p_image_path text, p_note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); q record; new_id uuid;
begin
  if public.forum_role() is distinct from 'student' then raise exception 'Yalnızca öğrenciler soru paylaşabilir'; end if;
  select * into q from public.question_items where id = p_question and student_id = me;
  if not found then raise exception 'Soru bulunamadı'; end if;
  if (select count(*) from public.forum_posts where author_id = me and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Bugün en fazla 10 soru paylaşabilirsin';
  end if;
  insert into public.forum_posts (author_id, question_id, subject, topic_id, note, image_path)
  values (me, p_question, coalesce(q.subject, ''), q.topic_id, left(coalesce(p_note, ''), 1000), p_image_path)
  returning id into new_id;
  return new_id;
end;
$$;

-- Cevap yaz (öğrenci → onaya düşer, danışman → hemen yayınlanır)
create or replace function public.forum_reply(p_post uuid, p_body text, p_image_path text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); r text := public.forum_role(); new_id uuid;
begin
  if r is null then raise exception 'Giriş gerekli'; end if;
  if not exists (select 1 from public.forum_posts f where f.id = p_post and (f.status = 'approved' or f.author_id = me)) then
    raise exception 'Soru bulunamadı';
  end if;
  if r = 'student' and (select count(*) from public.forum_answers where author_id = me and created_at > now() - interval '1 day') >= 30 then
    raise exception 'Bugün en fazla 30 cevap yazabilirsin';
  end if;
  insert into public.forum_answers (post_id, author_id, body, image_path, status, moderated_by, moderated_at)
  values (p_post, me, left(trim(p_body), 2000), nullif(p_image_path, ''),
          case when r = 'counselor' then 'approved' else 'pending' end,
          case when r = 'counselor' then me end,
          case when r = 'counselor' then now() end)
  returning id into new_id;
  return new_id;
end;
$$;

-- Soru sahibi: "Bu cevap işime yaradı"
create or replace function public.forum_mark_helpful(p_answer uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); pid uuid;
begin
  select a.post_id into pid from public.forum_answers a join public.forum_posts f on f.id = a.post_id
   where a.id = p_answer and a.status = 'approved' and f.author_id = me;
  if pid is null then raise exception 'Yalnızca soruyu soran işaretleyebilir'; end if;
  update public.forum_answers set helpful = true where id = p_answer;
  update public.forum_posts set solved = true where id = pid;
end;
$$;

-- Uygunsuz içeriği bildir
create or replace function public.forum_report(p_kind text, p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.forum_role() is null then raise exception 'Giriş gerekli'; end if;
  if p_kind = 'post' then update public.forum_posts set reported = true where id = p_id and status = 'approved';
  elsif p_kind = 'answer' then update public.forum_answers set reported = true where id = p_id and status = 'approved';
  end if;
end;
$$;

-- Kendi gönderimi sil
create or replace function public.forum_delete_own(p_kind text, p_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); img text;
begin
  if p_kind = 'post' then
    delete from public.forum_posts where id = p_id and author_id = me returning image_path into img;
  elsif p_kind = 'answer' then
    delete from public.forum_answers where id = p_id and author_id = me returning image_path into img;
  end if;
  return img;
end;
$$;

-- Danışman: kendi öğrencilerinin onay bekleyen ve bildirilen gönderileri
create or replace function public.forum_queue()
returns table (kind text, id uuid, post_id uuid, author_name text, body text, image_path text, status text, reported boolean, created_at timestamptz, post_note text, post_image text, post_subject text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.forum_role() is distinct from 'counselor' then raise exception 'Yalnızca danışmanlar'; end if;
  return query
    select 'post'::text, f.id, f.id, p.full_name, f.note, f.image_path, f.status, f.reported, f.created_at, f.note, f.image_path, f.subject
      from public.forum_posts f join public.profiles p on p.id = f.author_id
     where public.is_counselor_of(f.author_id) and (f.status = 'pending' or (f.reported and f.status = 'approved'))
    union all
    select 'answer'::text, a.id, a.post_id, p.full_name, a.body, a.image_path, a.status, a.reported, a.created_at, f.note, f.image_path, f.subject
      from public.forum_answers a join public.forum_posts f on f.id = a.post_id join public.profiles p on p.id = a.author_id
     where public.is_counselor_of(a.author_id) and (a.status = 'pending' or (a.reported and a.status = 'approved'))
    order by 9;
end;
$$;

-- Danışman kararı: approve / reject / hide / keep (bildirimi kapat)
create or replace function public.forum_moderate(p_kind text, p_id uuid, p_action text)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); author uuid; cur text;
begin
  if public.forum_role() is distinct from 'counselor' then raise exception 'Yalnızca danışmanlar'; end if;
  if p_kind = 'post' then select author_id, status into author, cur from public.forum_posts where id = p_id;
  else select author_id, status into author, cur from public.forum_answers where id = p_id; end if;
  if author is null then raise exception 'Bulunamadı'; end if;
  -- Kendi öğrencisi değilse yalnızca yayındaki içeriği gizleyebilir
  if not public.is_counselor_of(author) and author <> me and not (p_action = 'hide' and cur = 'approved') then
    raise exception 'Bu öğrenci sizin öğrenciniz değil';
  end if;
  if p_action not in ('approve', 'reject', 'hide', 'keep') then raise exception 'Geçersiz işlem'; end if;
  if p_kind = 'post' then
    update public.forum_posts
       set status = case p_action when 'approve' then 'approved' when 'reject' then 'rejected' when 'hide' then 'hidden' else status end,
           reported = false, moderated_by = me, moderated_at = now()
     where id = p_id;
  else
    update public.forum_answers
       set status = case p_action when 'approve' then 'approved' when 'reject' then 'rejected' when 'hide' then 'hidden' else status end,
           reported = false, moderated_by = me, moderated_at = now()
     where id = p_id;
  end if;
end;
$$;

revoke execute on function public.forum_role(), public.forum_feed(text, boolean, int, timestamptz), public.forum_thread(uuid),
  public.forum_share(uuid, text, text), public.forum_reply(uuid, text, text), public.forum_mark_helpful(uuid),
  public.forum_report(text, uuid), public.forum_delete_own(text, uuid), public.forum_queue(), public.forum_moderate(text, uuid, text)
  from anon, public;
grant execute on function public.forum_role(), public.forum_feed(text, boolean, int, timestamptz), public.forum_thread(uuid),
  public.forum_share(uuid, text, text), public.forum_reply(uuid, text, text), public.forum_mark_helpful(uuid),
  public.forum_report(text, uuid), public.forum_delete_own(text, uuid), public.forum_queue(), public.forum_moderate(text, uuid, text)
  to authenticated;

-- Fotoğraflar: "sorular" deposunda forum/ klasörü. Dosya adları tahmin edilemez (rastgele kimlik).
drop policy if exists sorular_forum_select on storage.objects;
create policy sorular_forum_select on storage.objects for select to authenticated
  using (bucket_id = 'sorular' and name like 'forum/%' and public.forum_role() is not null);
drop policy if exists sorular_forum_insert on storage.objects;
create policy sorular_forum_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'sorular' and name like 'forum/%' and public.forum_role() is not null);
drop policy if exists sorular_forum_delete on storage.objects;
create policy sorular_forum_delete on storage.objects for delete to authenticated
  using (bucket_id = 'sorular' and name like 'forum/%' and public.forum_role() = 'counselor');

notify pgrst, 'reload schema';
