// Otomatik bildirimler (Vercel Cron ile her gün çağrılır; vercel.json'a bakın).
//   /api/bildirim/gorev   → bugünkü görevleri bitmemiş öğrencilere (TR ~18:00)
//   /api/bildirim/gunluk  → günlük takibini doldurmamış öğrencilere (TR ~21:00)
//   /api/bildirim/ozet    → danışmana akşam özeti (TR ~21:30)
//   /api/bildirim/haftalik → pazar akşamı (TR ~20:00) haftalık raporları oluşturur; öğrenciye ve danışmana bildirir
//   POST /api/bildirim/gonder → danışmanın seçtiği öğrencilere anında uygulama bildirimi + uygulama içi not
// Güvenlik: Vercel, CRON_SECRET ortam değişkenini "Authorization: Bearer …" başlığıyla gönderir.
// Not: GitHub'a düz yüklemede bu dosyanın adı "bildirim-route.ts"dir; hazirla.mjs onu doğru klasöre taşır.

import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Sub = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };
type Msg = { title: string; body: string; url: string; tag: string };

function istanbulToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
}
function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function diffDays(a: string, b: string) {
  return Math.round((new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / 86400000);
}
async function chunked<T>(ids: string[], f: (c: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await f(ids.slice(i, i + 100));
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
  }
  return out;
}


export async function GET(req: Request, ctx: { params: Promise<{ tur: string }> }) {
  const { tur } = await ctx.params;
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  if (!["gorev", "gunluk", "ozet", "haftalik"].includes(tur)) return new Response("Not found", { status: 404 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!url || !key || !pub || !priv) return Response.json({ ok: false, error: "Eksik ortam değişkeni (Supabase gizli anahtarı veya VAPID anahtarları)" }, { status: 500 });
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:destek@example.com", pub, priv);
  const db = createClient(url, key, { auth: { persistSession: false } });
  const today = istanbulToday();

  // Abonelikler ve tercihler
  const { data: subsRaw, error: e1 } = await db.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth");
  if (e1) return Response.json({ ok: false, error: e1.message }, { status: 500 });
  const subs = (subsRaw ?? []) as Sub[];
  const userIds = [...new Set(subs.map((s) => s.user_id))];
  if (!userIds.length && tur !== "haftalik") return Response.json({ ok: true, sent: 0, note: "abone yok" });
  const prefs = await chunked<{ user_id: string; gunluk: boolean; gorev: boolean; ozet: boolean }>(userIds, (c) => db.from("notify_prefs").select("*").in("user_id", c));
  const prefOf = new Map(prefs.map((p) => [p.user_id, p]));
  const profiles = await chunked<{ id: string; role: string; full_name: string; is_active: boolean; counselor_id: string | null }>(userIds, (c) =>
    db.from("profiles").select("id, role, full_name, is_active, counselor_id").in("id", c),
  );
  const wants = (uid: string, k: "gunluk" | "gorev" | "ozet") => prefOf.get(uid)?.[k] ?? true;

  const messages = new Map<string, Msg>();

  if (tur === "haftalik") {
    // Raporlar herkes için oluşturulur (bildirimi kapalı olsa da uygulamada görünür)
    type Rep = { student_id: string; counselor_id: string | null; full_name: string; data: { tasks_total: number; tasks_done: number; solved: number; active_days: number; prev?: { solved: number } } };
    const { data: reps, error: re } = await db.rpc("generate_weekly_reports_all");
    if (re) return Response.json({ ok: false, error: /generate_weekly_reports_all/.test(re.message) ? "guncelleme-hepsi.sql çalıştırılmalı" : re.message }, { status: 500 });
    const list = (reps ?? []) as Rep[];
    const wantsWeekly = (uid: string) => (prefOf.get(uid) as { haftalik?: boolean } | undefined)?.haftalik ?? true;
    const perCounselor = new Map<string, number>();
    for (const r of list) {
      if (r.counselor_id) perCounselor.set(r.counselor_id, (perCounselor.get(r.counselor_id) ?? 0) + 1);
      if (!wantsWeekly(r.student_id)) continue;
      const d = r.data;
      const ad = r.full_name.split(" ")[0];
      const diff = d.prev ? d.solved - d.prev.solved : 0;
      const bits = [`${d.tasks_done}/${d.tasks_total} görev`, `${d.solved} soru`, `${d.active_days} aktif gün`];
      messages.set(r.student_id, {
        title: "Haftalık özetin hazır",
        body: `${ad}, bu hafta: ${bits.join(" · ")}${diff > 0 ? `. Geçen haftadan ${diff} soru fazla.` : "."} Ayrıntılar İlerleme sayfasında.`,
        url: "/?v=ilerleme",
        tag: "haftalik",
      });
    }
    for (const [cid, n] of perCounselor)
      if (wantsWeekly(cid)) messages.set(cid, { title: "Haftalık raporlar hazır", body: `${n} öğrencinin bu haftaki raporu oluşturuldu. Veliye gitmeden önce göz atabilirsiniz.`, url: "/?v=raporlar", tag: "haftalik" });
  } else if (tur === "gunluk" || tur === "gorev") {
    const students = profiles.filter((p) => p.role === "student" && p.is_active && wants(p.id, tur));
    const ids = students.map((s) => s.id);
    // Seri bilgisi (guncelleme-14: notify_streaks). Yoksa sayısız, yine kazanç odaklı metin kullanılır.
    type St = { student_id: string; streak: number; log_streak: number; active_today: boolean; log_today: boolean };
    const st = new Map<string, St>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await db.rpc("notify_streaks", { ids: ids.slice(i, i + 200) });
      for (const r of (data ?? []) as St[]) st.set(r.student_id, r);
    }
    if (tur === "gunluk") {
      const logged = new Set(
        (await chunked<{ student_id: string }>(ids, (c) => db.from("daily_logs").select("student_id").in("student_id", c).eq("log_date", today))).map((x) => x.student_id),
      );
      for (const s of students) {
        const x = st.get(s.id);
        if (logged.has(s.id)) continue;
        const n = x?.log_streak ?? 0;
        const ad = s.full_name.split(" ")[0];
        messages.set(s.id, {
          title: n ? `Günlük serine 1 gün ekle: ${n + 1}. gün` : "Bugünü kaydet, yeni serini başlat",
          body: n
            ? `${ad}, 2 dakikalık günlükle serin ${n} günden ${n + 1} güne çıksın. Uyku, telefon ve ruh hâlini kaydetmen yeterli.`
            : `${ad}, 2 dakikalık günlükle bugün yeni bir seri başlat. Uyku, telefon ve ruh hâlini kaydetmen yeterli.`,
          url: "/?v=gunluk",
          tag: "gunluk",
        });
      }
    } else {
      const plans = await chunked<{ id: string; student_id: string; start_date: string }>(ids, (c) =>
        db.from("weekly_plans").select("id, student_id, start_date").in("student_id", c).gte("start_date", addDays(today, -6)).lte("start_date", today),
      );
      const cur = new Map<string, { id: string; di: number }>();
      for (const p of plans) {
        const di = diffDays(p.start_date, today);
        if (di >= 0 && di <= 6 && (!cur.has(p.student_id) || p.start_date > (plans.find((x) => x.id === cur.get(p.student_id)!.id)?.start_date ?? ""))) cur.set(p.student_id, { id: p.id, di });
      }
      const tasks = await chunked<{ plan_id: string; day_index: number; done: boolean; topic_id: string | null; content: string; target_questions: number | null; subject: string }>(
        [...cur.values()].map((x) => x.id),
        (c) => db.from("plan_tasks").select("plan_id, day_index, done, topic_id, content, target_questions, subject").in("plan_id", c),
      );
      for (const s of students) {
        const c = cur.get(s.id);
        if (!c) continue;
        const todays = tasks.filter((t) => t.plan_id === c.id && t.day_index === c.di && (t.topic_id || t.content.trim() || t.target_questions));
        const left = todays.filter((t) => !t.done);
        if (!todays.length || !left.length) continue;
        const names = left.slice(0, 2).map((t) => t.subject);
        const list = `${names.join(", ")}${left.length > 2 ? " ve diğerleri" : ""}`;
        const n = st.get(s.id)?.streak ?? 0;
        const doneToday = todays.length - left.length;
        messages.set(s.id, st.get(s.id)?.active_today || doneToday > 0
          ? {
              title: doneToday ? `Bugün ${doneToday}/${todays.length} görev tamam` : `Bugün ${todays.length} görevin hazır`,
              body: `${left.length} görev${doneToday ? " daha" : ""} ile günü tamamla: ${list}. Her görev haftalık ve aylık hedefine eklenir.`,
              url: "/",
              tag: "gorev",
            }
          : {
              title: n ? `Bugün 1 görevle serine 1 gün ekle` : "Bugün 1 görevle serini başlat",
              body: n
                ? `Serin ${n} günden ${n + 1} güne çıksın. Sıradakiler: ${list}. En kolayından 5 dakikayla başla.`
                : `Sıradakiler: ${list}. En kolayından 5 dakikayla başla, serinin 1. günü bugün olsun.`,
              url: "/",
              tag: "gorev",
            });
      }
    }
  } else {
    // Danışman özeti
    const counselors = profiles.filter((p) => p.role === "counselor" && wants(p.id, "ozet"));
    for (const c of counselors) {
      const { data: st } = await db.from("profiles").select("id").eq("role", "student").eq("is_active", true).eq("counselor_id", c.id);
      const ids = ((st ?? []) as { id: string }[]).map((x) => x.id);
      if (!ids.length) continue;
      const logged = new Set(
        (await chunked<{ student_id: string }>(ids, (cc) => db.from("daily_logs").select("student_id").in("student_id", cc).eq("log_date", today))).map((x) => x.student_id),
      );
      const { count: alerts } = await db.from("support_alerts").select("id", { count: "exact", head: true }).in("student_id", ids).eq("status", "open");
      const posts = await db.from("forum_posts").select("id", { count: "exact", head: true }).in("author_id", ids).eq("status", "pending");
      const answers = await db.from("forum_answers").select("id", { count: "exact", head: true }).in("author_id", ids).eq("status", "pending");
      const forum = (posts.count ?? 0) + (answers.count ?? 0);
      const parts = [`${ids.length - logged.size}/${ids.length} öğrenci bugün günlüğünü doldurmadı`];
      if (alerts) parts.push(`${alerts} açık destek uyarısı`);
      if (forum) parts.push(`forumda ${forum} onay bekleyen`);
      const veli = await db.from("parent_messages").select("id", { count: "exact", head: true }).in("student_id", ids).eq("from_parent", true).is("read_at", null);
      if (veli.count) parts.push(`${veli.count} okunmamış veli mesajı`);
      messages.set(c.id, { title: "Bugünün özeti", body: parts.join(" · "), url: alerts ? "/" : forum ? "/?v=forum" : "/?v=hatirlatma", tag: "ozet" });
    }
  }

  // Aynı gün aynı bildirim bir kez (cron iki kez tetiklenirse)
  let sent = 0;
  let removed = 0;
  for (const [uid, msg] of messages) {
    const { error: dup } = await db.from("notify_log").insert({ user_id: uid, kind: tur, day: today });
    if (dup) continue;
    for (const s of subs.filter((x) => x.user_id === uid)) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), { TTL: 6 * 3600, urgency: "normal" });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await db.from("push_subscriptions").delete().eq("id", s.id);
          removed++;
        }
      }
    }
  }
  return Response.json({ ok: true, tur, day: today, recipients: messages.size, sent, removed });
}

/* ------------------------------------------------------------------ */
/* Danışmandan öğrencilere anında bildirim                              */
/* ------------------------------------------------------------------ */
export async function POST(req: Request, ctx: { params: Promise<{ tur: string }> }) {
  const { tur } = await ctx.params;
  if (tur !== "gonder") return new Response("Not found", { status: 404 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!url || !anon || !token) return Response.json({ ok: false, error: "Oturum gerekli" }, { status: 401 });

  let body: { student_ids?: string[]; items?: { student_id: string; message: string }[]; title?: string; message?: string; check_only?: boolean };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Geçersiz istek" }, { status: 400 });
  }
  const perStudent = new Map((body.items ?? []).filter((i) => i && typeof i.student_id === "string").map((i) => [i.student_id, String(i.message ?? "").trim().slice(0, 1000)]));
  const ids = [...new Set([...(body.student_ids ?? []), ...perStudent.keys()].filter((x) => typeof x === "string"))].slice(0, 500);
  if (!ids.length) return Response.json({ ok: false, error: "Öğrenci seçilmedi" }, { status: 400 });

  // Kullanıcının kendi yetkisiyle: danışman mı, bu öğrenciler onun mu? (RLS)
  const userDb = createClient(url, anon, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: u } = await userDb.auth.getUser(token);
  if (!u.user) return Response.json({ ok: false, error: "Oturum geçersiz" }, { status: 401 });
  const { data: me } = await userDb.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
  if ((me as { role?: string } | null)?.role !== "counselor") return Response.json({ ok: false, error: "Yalnızca danışmanlar" }, { status: 403 });
  const mine = await chunked<{ id: string; full_name: string }>(ids, (c) => userDb.from("profiles").select("id, full_name").eq("role", "student").eq("counselor_id", u.user!.id).in("id", c));
  const allowed = new Set(mine.map((m) => m.id));

  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const pushReady = Boolean(key && pub && priv);
  let subs: Sub[] = [];
  if (pushReady) {
    const admin = createClient(url, key!, { auth: { persistSession: false } });
    subs = await chunked<Sub>([...allowed], (c) => admin.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").in("user_id", c));
  }
  const withPush = new Set(subs.map((s) => s.user_id));
  if (body.check_only) return Response.json({ ok: true, push_ready: pushReady, enabled: [...withPush] });

  const message = String(body.message ?? "").trim().slice(0, 1000);
  if (!message && !perStudent.size) return Response.json({ ok: false, error: "Mesaj boş" }, { status: 400 });
  const title = String(body.title ?? "Danışmanından mesaj").slice(0, 80);

  // 1) Uygulama içi not (her durumda; öğrenci Bugün ekranında görür)
  const firstName = new Map(mine.map((m) => [m.id, m.full_name.split(" ")[0]]));
  const personal = (sid: string) => (perStudent.get(sid) || message).replaceAll("{ad}", firstName.get(sid) ?? "");
  const targets = [...allowed].filter((sid) => personal(sid));
  const { error: noteErr } = await userDb.from("shared_notes").insert(targets.map((sid) => ({ student_id: sid, body: personal(sid) })));

  // 2) Anlık bildirim (bildirimi açık cihazlara)
  let sent = 0;
  if (pushReady && subs.length) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:destek@example.com", pub!, priv!);
    const admin = createClient(url, key!, { auth: { persistSession: false } });
    for (const s of subs.filter((x) => targets.includes(x.user_id))) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title, body: personal(s.user_id).slice(0, 180), url: "/", tag: `not-${Date.now()}` }),
          { TTL: 24 * 3600, urgency: "high" },
        );
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await admin.from("push_subscriptions").delete().eq("id", s.id);
      }
    }
  }
  return Response.json({
    ok: !noteErr,
    error: noteErr?.message,
    push_ready: pushReady,
    students: allowed.size,
    notified: [...withPush].filter((x) => allowed.has(x)).length,
    sent,
  });
}
