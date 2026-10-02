// Fotoğraftan yapay zekâyla soru çözümü — önce ipucu, öğrenci isterse tam çözüm.
//   POST /api/soru-coz  { mode: "ipucu", image_path, subject?, note? }  → yeni soru + ipucu
//   POST /api/soru-coz  { mode: "cozum", id }                            → o sorunun adım adım çözümü
// Gerekli ortam değişkeni: ANTHROPIC_API_KEY (isteğe bağlı: ANTHROPIC_MODEL, AI_DAILY_LIMIT).
// Fotoğrafı öğrenci kendi klasörüne yükler; sunucu oradan okur. Günlük sınır sunucuda denetlenir.
// Not: GitHub'a düz yüklemede bu dosyanın adı "soru-coz-route.ts"dir; hazirla.mjs onu doğru klasöre taşır.

import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
const API = (process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/$/, "");
const DEFAULT_LIMIT = Math.max(0, Math.min(50, Number(process.env.AI_DAILY_LIMIT ?? 5) || 5));

const RULES = `Sen sınava hazırlanan Türk öğrencilere yardım eden sabırlı bir öğretmensin.
Kurallar:
- Yalnızca fotoğraftaki ders/sınav sorusuyla ilgilen. Fotoğrafta soru yoksa ya da okunmuyorsa bunu tek cümleyle söyle ve daha net bir fotoğraf iste.
- Türkçe yaz. Düz metin kullan: Markdown, LaTeX, yıldız (*) ve kare (#) işareti kullanma. Üs için ^, kök için √, kesir için / kullan.
- Öğrenciye "sen" diye hitap et; kısa ve net cümleler kur.`;

const HINT = `${RULES}
Görev: Bu soruyu ÇÖZME ve doğru şıkkı SÖYLEME. Öğrencinin kendi başına çözebilmesi için yalnızca ipucu ver:
1) Soru hangi konuyu ve hangi bilgiyi ölçüyor (1 cümle).
2) Başlamak için ilk adım ne olmalı (1-2 cümle).
3) Dikkat edilmesi gereken tuzak ya da sık yapılan hata (1 cümle).
Toplam en fazla 90 kelime. Sayısal sonucu, ara sonuçları ve cevabı yazma.`;

const SOLVE = `${RULES}
Görev: Soruyu adım adım çöz.
- "1. adım:", "2. adım:" biçiminde numaralı kısa adımlar yaz; her adımda ne yaptığını ve nedenini açıkla.
- En sonda ayrı bir satırda "Cevap: ..." yaz (şıklı soruda şıkkı da belirt).
- Ardından "Kendini dene:" başlığıyla aynı türden kısa bir benzer soru öner (çözümünü verme).
En fazla 350 kelime.`;

type Json = Record<string, unknown>;
const bad = (error: string, status = 400) => Response.json({ ok: false, error }, { status });

async function ask(key: string, system: string, imageB64: string, text: string): Promise<string> {
  const r = await fetch(`${API}/v1/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1200,
      system,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: imageB64 } },
            { type: "text", text },
          ],
        },
      ],
    }),
  });
  const j = (await r.json().catch(() => null)) as { content?: { type: string; text?: string }[]; error?: { message?: string } } | null;
  if (!r.ok) throw new Error(j?.error?.message || `Yapay zekâ hizmeti yanıt vermedi (${r.status})`);
  const out = (j?.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("\n")
    .trim();
  if (!out) throw new Error("Yapay zekâ boş yanıt döndürdü");
  return out.replace(/[*#`]/g, "").slice(0, 6000);
}

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const aiKey = process.env.ANTHROPIC_API_KEY;
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!url || !anon || !service) return bad("Sunucu ayarları eksik", 500);
  if (!token) return bad("Oturum gerekli", 401);
  if (!aiKey) return bad("Yapay zekâ henüz kurulmadı: danışmanın Vercel'e ANTHROPIC_API_KEY eklemesi gerekiyor.", 503);

  let body: Json;
  try {
    body = (await req.json()) as Json;
  } catch {
    return bad("Geçersiz istek");
  }

  // Kimlik: yalnızca öğrencinin kendisi
  const userDb = createClient(url, anon, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: u } = await userDb.auth.getUser(token);
  const uid = u?.user?.id;
  if (!uid) return bad("Oturum geçersiz", 401);
  const db = createClient(url, service, { auth: { persistSession: false } });
  const { data: prof } = await db.from("profiles").select("id, role, is_active, field, grade").eq("id", uid).maybeSingle();
  const p = prof as { id: string; role: string; is_active: boolean; field: string | null; grade: string | null } | null;
  if (!p || p.role !== "student" || !p.is_active) return bad("Bu özellik yalnızca öğrenciler içindir", 403);

  const sinav = p.field === "LGS" ? "LGS (8. sınıf)" : p.field === "KPSS" ? "KPSS" : "YKS (TYT/AYT)";

  try {
    if (body.mode === "cozum") {
      const id = String(body.id ?? "");
      const { data: row } = await db.from("ai_questions").select("*").eq("id", id).eq("student_id", uid).maybeSingle();
      const q = row as { id: string; image_path: string; subject: string; note: string; hint: string | null; solution: string | null } | null;
      if (!q) return bad("Soru bulunamadı", 404);
      if (q.solution) return Response.json({ ok: true, id: q.id, solution: q.solution });
      const img = await db.storage.from("sorular").download(q.image_path);
      if (img.error || !img.data) return bad("Fotoğraf okunamadı");
      const b64 = Buffer.from(await img.data.arrayBuffer()).toString("base64");
      const solution = await ask(aiKey, SOLVE, b64, `Sınav: ${sinav}.${q.subject ? ` Ders: ${q.subject}.` : ""}${q.note ? ` Öğrencinin notu: ${q.note}` : ""}`);
      await db.from("ai_questions").update({ solution, solution_at: new Date().toISOString() }).eq("id", q.id);
      return Response.json({ ok: true, id: q.id, solution });
    }

    if (body.mode !== "ipucu") return bad("Geçersiz istek");
    const imagePath = String(body.image_path ?? "");
    if (!imagePath.startsWith(`${uid}/`) || imagePath.includes("..") || imagePath.length > 300) return bad("Geçersiz fotoğraf yolu");
    const subject = String(body.subject ?? "").slice(0, 60);
    const note = String(body.note ?? "").trim().slice(0, 500);

    // Günlük sınır (Türkiye günü)
    const { data: st } = await db.from("ai_settings").select("daily_limit").eq("student_id", uid).maybeSingle();
    const limit = (st as { daily_limit: number } | null)?.daily_limit ?? DEFAULT_LIMIT;
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
    const { count } = await db.from("ai_questions").select("id", { count: "exact", head: true }).eq("student_id", uid).gte("created_at", `${day}T00:00:00+03:00`);
    if (limit === 0) return bad("Yapay zekâ ile soru çözümü danışmanın tarafından kapatılmış.", 403);
    if ((count ?? 0) >= limit) return bad(`Bugünkü ${limit} soruluk hakkını kullandın. Yarın yeniden sorabilirsin; bu arada soruyu Sorularım'a ekleyip danışmanına ya da foruma sorabilirsin.`, 429);

    const img = await db.storage.from("sorular").download(imagePath);
    if (img.error || !img.data) return bad("Fotoğraf okunamadı. Yeniden yüklemeyi dene.");
    if (img.data.size > 4_500_000) return bad("Fotoğraf çok büyük");
    const b64 = Buffer.from(await img.data.arrayBuffer()).toString("base64");
    const hint = await ask(aiKey, HINT, b64, `Sınav: ${sinav}.${subject ? ` Ders: ${subject}.` : ""}${note ? ` Öğrencinin notu: ${note}` : ""}`);
    const ins = await db.from("ai_questions").insert({ student_id: uid, image_path: imagePath, subject, note, hint, model: MODEL }).select("id, created_at").single();
    if (ins.error) return bad(/ai_questions/.test(ins.error.message) ? "Veritabanı güncel değil: guncelleme-hepsi.sql çalıştırılmalı." : ins.error.message, 500);
    return Response.json({ ok: true, id: (ins.data as { id: string }).id, hint, left: Math.max(0, limit - (count ?? 0) - 1), limit });
  } catch (e) {
    return bad((e as Error).message || "Beklenmeyen hata", 502);
  }
}

/** Durum: kurulu mu, bugün kaç hak kaldı (istemci açılışta sorar) */
export async function GET(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!url || !anon || !service || !token) return bad("Oturum gerekli", 401);
  const userDb = createClient(url, anon, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: u } = await userDb.auth.getUser(token);
  const uid = u?.user?.id;
  if (!uid) return bad("Oturum geçersiz", 401);
  const db = createClient(url, service, { auth: { persistSession: false } });
  const { data: st } = await db.from("ai_settings").select("daily_limit").eq("student_id", uid).maybeSingle();
  const limit = (st as { daily_limit: number } | null)?.daily_limit ?? DEFAULT_LIMIT;
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
  const { count } = await db.from("ai_questions").select("id", { count: "exact", head: true }).eq("student_id", uid).gte("created_at", `${day}T00:00:00+03:00`);
  return Response.json({ ok: true, configured: Boolean(process.env.ANTHROPIC_API_KEY), limit, used: count ?? 0, default_limit: DEFAULT_LIMIT });
}
