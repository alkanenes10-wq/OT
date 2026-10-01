// Otomatik bildirimler (Vercel Cron ile her gün çağrılır; vercel.json'a bakın).
//   /api/bildirim/gorev   → bugünkü görevleri bitmemiş öğrencilere (TR ~18:00)
//   /api/bildirim/gunluk  → günlük takibini doldurmamış öğrencilere (TR ~21:00)
//   /api/bildirim/ozet    → danışmana akşam özeti (TR ~21:30)
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
  if (!["gorev", "gunluk", "ozet"].includes(tur)) return new Response("Not found", { status: 404 });

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
  if (!userIds.length) return Response.json({ ok: true, sent: 0, note: "abone yok" });
  const prefs = await chunked<{ user_id: string; gunluk: boolean; gorev: boolean; ozet: boolean }>(userIds, (c) => db.from("notify_prefs").select("*").in("user_id", c));
  const prefOf = new Map(prefs.map((p) => [p.user_id, p]));
  const profiles = await chunked<{ id: string; role: string; full_name: string; is_active: boolean; counselor_id: string | null }>(userIds, (c) =>
    db.from("profiles").select("id, role, full_name, is_active, counselor_id").in("id", c),
  );
  const wants = (uid: string, k: "gunluk" | "gorev" | "ozet") => prefOf.get(uid)?.[k] ?? true;

  const messages = new Map<string, Msg>();

  if (tur === "gunluk" || tur === "gorev") {
    const students = profiles.filter((p) => p.role === "student" && p.is_active && wants(p.id, tur));
    const ids = students.map((s) => s.id);
    if (tur === "gunluk") {
      const logged = new Set(
        (await chunked<{ student_id: string }>(ids, (c) => db.from("daily_logs").select("student_id").in("student_id", c).eq("log_date", today))).map((x) => x.student_id),
      );
      for (const s of students)
        if (!logged.has(s.id))
          messages.set(s.id, {
            title: "Günlük takibin seni bekliyor",
            body: `${s.full_name.split(" ")[0]}, bugünü 2 dakikada kaydet: uyku, telefon, ruh hâli. Serini de korursun.`,
            url: "/?v=gunluk",
            tag: "gunluk",
          });
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
        messages.set(s.id, {
          title: `Bugün ${left.length} görevin kaldı`,
          body: `${names.join(", ")}${left.length > 2 ? " ve diğerleri" : ""}. En kolayından 5 dakikayla başla.`,
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
