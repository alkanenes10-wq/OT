"use server";
// SUNUCU tarafı işlemler (gizli anahtar yalnızca burada kullanılır, tarayıcıya gönderilmez):
// ilk danışman kurulumu, öğrenci hesabı açma / şifre / pasif / silme.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash, timingSafeEqual } from "node:crypto";
import { STUDENT_EMAIL_DOMAIN, USERNAME_RE, normalizeUsername, type Profile } from "./lib";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

class Fail extends Error {}

function admin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) throw new Fail("Sunucu ayarı eksik: Vercel'de NEXT_PUBLIC_SUPABASE_URL ve SUPABASE_SECRET_KEY tanımlanmalı.");
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

async function run<T extends object>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, ...(await fn()) };
  } catch (e) {
    if (e instanceof Fail) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Beklenmeyen bir sunucu hatası oluştu." };
  }
}

function safeEqual(a: string, b: string) {
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
}

function str(v: unknown, max = 200) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function checkPassword(p: unknown): string {
  if (typeof p !== "string" || p.length < 8) throw new Fail("Şifre en az 8 karakter olmalı.");
  if (p.length > 72) throw new Fail("Şifre en fazla 72 karakter olabilir.");
  return p;
}

async function counselorCount(db: SupabaseClient) {
  const { count, error } = await db.from("profiles").select("id", { count: "exact", head: true }).eq("role", "counselor");
  if (error) {
    if (/does not exist|Could not find the table/i.test(error.message)) {
      throw new Fail("Veritabanı tabloları bulunamadı. Önce schema.sql dosyasını Supabase SQL Editor'de çalıştırın.");
    }
    throw new Fail(error.message);
  }
  return count ?? 0;
}

/** Oturum anahtarını doğrular, danışman olduğunu kontrol eder. */
async function requireCounselor(db: SupabaseClient, token: string) {
  if (!token) throw new Fail("Oturum bulunamadı. Lütfen tekrar giriş yapın.");
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new Fail("Oturum geçersiz. Lütfen tekrar giriş yapın.");
  const { data: p } = await db.from("profiles").select("id, role").eq("id", data.user.id).maybeSingle();
  if (!p || p.role !== "counselor") throw new Fail("Bu işlem yalnızca danışman içindir.");
  return p.id as string;
}

async function requireOwnStudent(db: SupabaseClient, counselorId: string, studentId: string) {
  const { data } = await db.from("profiles").select("id, role, counselor_id").eq("id", studentId).maybeSingle();
  if (!data || data.role !== "student" || data.counselor_id !== counselorId) throw new Fail("Öğrenci bulunamadı.");
}

/* ------------------------------------------------------------------ */

export async function setupStatus() {
  return run(async () => {
    const done = (await counselorCount(admin())) > 0;
    return { setupDone: done, setupAvailable: !done && Boolean(process.env.SETUP_SECRET) };
  });
}

export async function setupCounselor(input: { secret: string; fullName: string; email: string; password: string }) {
  return run(async () => {
    const expected = process.env.SETUP_SECRET ?? "";
    if (expected.length < 8) throw new Fail("Kurulum kapalı: Vercel'de SETUP_SECRET (en az 8 karakter) tanımlanmalı.");
    if (!safeEqual(str(input.secret), expected)) throw new Fail("Kurulum parolası hatalı.");
    const db = admin();
    if ((await counselorCount(db)) > 0) throw new Fail("Kurulum zaten tamamlanmış. Giriş sayfasını kullanın.");

    const fullName = str(input.fullName, 120);
    const email = str(input.email).toLowerCase();
    if (!fullName) throw new Fail("Ad soyad gerekli.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Fail("Geçerli bir e-posta girin.");
    const password = checkPassword(input.password);

    const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
    if (error || !data.user) throw new Fail(error?.message ?? "Hesap oluşturulamadı.");
    const { error: pErr } = await db.from("profiles").insert({ id: data.user.id, role: "counselor", full_name: fullName });
    if (pErr) {
      await db.auth.admin.deleteUser(data.user.id);
      throw new Fail(pErr.message);
    }
    return {};
  });
}

export async function createStudent(
  token: string,
  input: { fullName: string; username: string; password: string; field?: string; grade?: string; examYear?: string; target?: string },
) {
  return run(async () => {
    const db = admin();
    const counselorId = await requireCounselor(db, token);
    const fullName = str(input.fullName, 120);
    const username = normalizeUsername(str(input.username, 40));
    if (!fullName) throw new Fail("Ad soyad (veya öğrenci kodu) gerekli.");
    if (!USERNAME_RE.test(username)) {
      throw new Fail("Kullanıcı adı 3-30 karakter olmalı; yalnızca küçük harf (a-z), rakam, nokta, tire ve alt çizgi içerebilir.");
    }
    const password = checkPassword(input.password);
    const year = Number(input.examYear);

    const { data: existing } = await db.from("profiles").select("id").eq("username", username).maybeSingle();
    if (existing) throw new Fail("Bu kullanıcı adı zaten kullanılıyor.");

    const { data, error } = await db.auth.admin.createUser({
      email: `${username}@${STUDENT_EMAIL_DOMAIN}`,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, username },
    });
    if (error || !data.user) {
      throw new Fail(/already/i.test(error?.message ?? "") ? "Bu kullanıcı adı zaten kullanılıyor." : (error?.message ?? "Hesap oluşturulamadı."));
    }
    const { data: profile, error: pErr } = await db
      .from("profiles")
      .insert({
        id: data.user.id,
        role: "student",
        full_name: fullName,
        username,
        counselor_id: counselorId,
        field: str(input.field, 20) || null,
        grade: str(input.grade, 30) || null,
        exam_year: Number.isInteger(year) && year > 2000 && year < 2100 ? year : null,
        target: str(input.target) || null,
      })
      .select("*")
      .single();
    if (pErr) {
      await db.auth.admin.deleteUser(data.user.id);
      throw new Fail(pErr.message);
    }
    return { profile: profile as Profile };
  });
}

export async function updateStudent(token: string, studentId: string, input: { password?: string; active?: boolean }) {
  return run(async () => {
    const db = admin();
    const counselorId = await requireCounselor(db, token);
    await requireOwnStudent(db, counselorId, studentId);
    if (input.password !== undefined) {
      const { error } = await db.auth.admin.updateUserById(studentId, { password: checkPassword(input.password) });
      if (error) throw new Fail(error.message);
    }
    if (typeof input.active === "boolean") {
      const { error } = await db.auth.admin.updateUserById(studentId, { ban_duration: input.active ? "none" : "876000h" });
      if (error) throw new Fail(error.message);
      const { error: pErr } = await db.from("profiles").update({ is_active: input.active }).eq("id", studentId);
      if (pErr) throw new Fail(pErr.message);
    }
    return {};
  });
}

/** Öğrenciyi ve TÜM verilerini (program, günlük, konu, notlar) kalıcı olarak siler. */
export async function deleteStudent(token: string, studentId: string) {
  return run(async () => {
    const db = admin();
    const counselorId = await requireCounselor(db, token);
    await requireOwnStudent(db, counselorId, studentId);
    const { error } = await db.auth.admin.deleteUser(studentId);
    if (error) throw new Fail(error.message);
    return {};
  });
}

/* ------------------------------------------------------------------ */
/* Kazanım karnesi analizi — KODLA (yapay zekâ yok)                    */
/* ------------------------------------------------------------------ */
// Karne dosyası önce tarayıcıdan Supabase deposuna ("karneler") yüklenir; burada sunucu dosyayı
// depodan alır, PDF'in metin katmanını (unpdf) okur ve karne.ts içindeki kurallarla
// konu bazlı yanlış/boş sayılarını uygulamanın konu listesine eşler. Dışarıya veri gönderilmez.

export type KarneResult = {
  title: string;
  exam_date: string | null;
  exam_type: "TYT" | "AYT" | "BRANS";
  nets: Record<string, { d: number | null; y: number | null }>;
  results: { topic_id: string; wrong: number; empty: number }[];
  notes: string;
};

export type KarneReport = { lines: number; matched: number; unmatched: string[] };

export async function analyzeKarne(token: string, studentId: string, filePath: string) {
  return run(async () => {
    const db = admin();
    const counselorId = await requireCounselor(db, token);
    await requireOwnStudent(db, counselorId, studentId);
    if (!filePath.startsWith(`${studentId}/`)) throw new Fail("Geçersiz dosya.");

    const { data: blob, error } = await db.storage.from("karneler").download(filePath);
    if (error || !blob) throw new Fail("Karne dosyası okunamadı.");
    if (blob.size > 10 * 1024 * 1024) throw new Fail("Dosya en fazla 10 MB olabilir.");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
    if (!isPdf) throw new Fail("Fotoğraf karneler kodla okunamaz. Yayınevinin verdiği orijinal PDF'i yükleyin veya sonuçları elle girin.");

    const { parseKarne, toLines } = await import("./karne");
    const pages = await pdfText(bytes);
    const lines = toLines(pages);
    if (lines.length < 5) throw new Fail("PDF'te okunabilir metin yok (taranmış/fotoğraf PDF). Orijinal PDF'i yükleyin veya sonuçları elle girin.");

    const p = parseKarne(lines);
    if (!p.matched.length && !Object.keys(p.nets).length)
      throw new Fail("Bu karne biçimi tanınamadı: konu satırları bulunamadı. Sonuçları elle girebilirsiniz.");

    const result: KarneResult = {
      title: str(p.title, 120) || `${p.exam_type} Deneme`,
      exam_date: p.exam_date,
      exam_type: p.exam_type,
      nets: p.nets,
      results: p.results,
      notes: str(p.notes, 1000),
    };
    const report: KarneReport = { lines: lines.length, matched: p.matched.length, unmatched: p.unmatched.slice(0, 15) };
    return { result, report };
  });
}

/** PDF'in metin katmanını konum bilgisiyle çıkarır (pdf.js / unpdf). */
async function pdfText(bytes: Uint8Array) {
  const { getDocumentProxy } = await import("unpdf");
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    pdf = await getDocumentProxy(bytes);
  } catch {
    throw new Fail("PDF açılamadı (bozuk veya şifreli olabilir).");
  }
  const pages: { items: { str: string; x: number; y: number; w: number }[] }[] = [];
  for (let i = 1; i <= Math.min(pdf.numPages, 12); i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    const items: { str: string; x: number; y: number; w: number }[] = [];
    for (const it of tc.items as { str?: string; transform?: number[]; width?: number }[]) {
      if (typeof it.str !== "string" || !it.transform) continue;
      items.push({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width ?? 0 });
    }
    pages.push({ items });
  }
  await (pdf as unknown as { destroy?: () => Promise<void> }).destroy?.();
  return pages;
}
