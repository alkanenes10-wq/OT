// Ortak yardımcılar: tipler, tarih, biçimlendirme, CSV, kullanıcı adı, ders listesi, uyarı kuralları.
// Hem tarayıcıda hem sunucuda kullanılabilir.
import { coursesFor, gradeLevel, sectionsOfCourses, sinavOf, type TopicStatus } from "./curriculum";

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "YKS Takip";

/* ==================================================================
   TİPLER
   ================================================================== */

export type Role = "counselor" | "student";

export type Profile = {
  id: string;
  role: Role;
  full_name: string;
  username: string | null;
  counselor_id: string | null;
  field: string | null;
  grade: string | null;
  exam_year: number | null;
  target: string | null;
  is_active: boolean;
  created_at: string;
};

export type WeeklyPlan = {
  id: string;
  student_id: string;
  start_date: string; // yyyy-mm-dd
  title: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  day_levels: DayLevel[];
  analysis_id: string | null;
};

export type PlanTask = {
  id: string;
  plan_id: string;
  student_id: string;
  day_index: number;
  subject: string;
  content: string;
  done: boolean;
  done_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  topic_id: string | null;
  task_type: TaskType;
  target_questions: number | null;
  solved: number | null;
  correct: number | null;
  wrong: number | null;
  sort: number;
  start_time: string | null; // "17:00" — saatli programlarda blok başlangıcı
  duration_min: number | null;
  resource_id?: string | null; // bağlı kaynak (kitap) — guncelleme-8.sql
  resource_tests?: string | null; // "12-14" gibi test numaraları
};

/* ------------------------------------------------------------------ */
/* Destek / risk yönlendirmesi                                         */
/* ------------------------------------------------------------------ */
export type SupportStatus = "open" | "seen" | "contacted" | "closed";
export type SupportAlert = {
  id: string;
  student_id: string;
  source: "auto" | "student";
  reasons: string[];
  /** Ayrıntılar (güncelleme 5): kanıt, neden önemli, önerilen adım, öğrenciye açıklama */
  details?: SupportDetail[] | null;
  student_note: string | null;
  status: SupportStatus;
  student_dismissed_at: string | null;
  created_at: string;
  updated_at: string;
};
export type SupportDetail = { title: string; evidence?: string[]; why?: string; next_step?: string; student_text?: string };
export type SupportActionKind = "seen" | "contacted" | "parent" | "school" | "referred" | "note" | "closed";
export type SupportAction = {
  id: string;
  alert_id: string;
  student_id: string;
  action: SupportActionKind;
  note: string;
  created_by: string | null;
  created_at: string;
};
export const SUPPORT_ACTIONS: { value: SupportActionKind; label: string; status: SupportStatus | null }[] = [
  { value: "seen", label: "Gördüm", status: "seen" },
  { value: "contacted", label: "Öğrenciyle görüştüm", status: "contacted" },
  { value: "parent", label: "Veliyle paylaştım", status: "contacted" },
  { value: "school", label: "Okul rehberliğine bildirdim", status: "contacted" },
  { value: "referred", label: "Uzmana yönlendirdim", status: "contacted" },
  { value: "note", label: "Not", status: null },
  { value: "closed", label: "Kapattım", status: "closed" },
];

/* ------------------------------------------------------------------ */
/* Çalışma saatleri (danışman girer, öğrenci görür)                    */
/* ------------------------------------------------------------------ */
export type TimeRange = { s: string; e: string };
export type StudySchedule = {
  student_id: string;
  slots: TimeRange[][]; // 0 = Pazartesi … 6 = Pazar
  block_min: number;
  break_min: number;
  updated_at?: string;
};
export const WEEKDAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
export const emptySchedule = (studentId: string): StudySchedule => ({
  student_id: studentId,
  slots: [[], [], [], [], [], [], []],
  block_min: 40,
  break_min: 10,
});
/** Tarihin haftanın hangi günü olduğu (0 = Pazartesi) */
export function weekdayIndex(iso: string): number {
  return (parseISODate(iso).getDay() + 6) % 7;
}
export function rangeMinutes(r: TimeRange[]): number {
  return r.reduce((s, x) => {
    const a = timeToMinutes(x.s);
    const b = timeToMinutes(x.e);
    return a != null && b != null && b > a ? s + b - a : s;
  }, 0);
}
export function minutesToTime(m: number): string {
  const h = Math.floor(m / 60) % 24;
  return `${String(h).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ */
/* Sayısal / sözel ve alanlara göre dersler                            */
/* ------------------------------------------------------------------ */
export type Category = "sayisal" | "sozel";
export const SAYISAL_SECTIONS = [
  "tyt-matematik",
  "ayt-matematik",
  "geometri",
  "tyt-fizik",
  "ayt-fizik",
  "tyt-kimya",
  "ayt-kimya",
  "tyt-biyoloji",
  "ayt-biyoloji",
  "lgs-matematik",
  "lgs-fen",
  "kpss-matematik",
];
export const categoryOfSection = (sectionId: string): Category => (SAYISAL_SECTIONS.includes(sectionId) ? "sayisal" : "sozel");
export function categoryOfSubject(subject: string): Category | null {
  if (subject === "PROBLEM") return "sayisal";
  if (subject === "PARAGRAF") return "sozel";
  const secs = SUBJECT_SECTIONS[subject];
  return secs?.length ? categoryOfSection(secs[0]) : null;
}
/** Alana göre programda yer alacak bölümler (TYT dahil yalnızca alan dersleri). Türkçe ve TYT matematik
 * her alanda temel ders olduğundan sırasıyla SAY ve SÖZ'e "karşı kategori" olarak eklenir. */
export const FIELD_SECTIONS: Record<string, string[]> = {
  SAY: ["tyt-matematik", "ayt-matematik", "geometri", "tyt-fizik", "ayt-fizik", "tyt-kimya", "ayt-kimya", "tyt-biyoloji", "ayt-biyoloji", "tyt-turkce"],
  EA: ["tyt-matematik", "ayt-matematik", "geometri", "tyt-turkce", "ayt-edebiyat", "tyt-tarih", "ayt-tarih", "tyt-cografya", "ayt-cografya"],
  "SÖZ": ["tyt-matematik", "tyt-turkce", "ayt-edebiyat", "tyt-tarih", "ayt-tarih", "tyt-cografya", "ayt-cografya", "tyt-felsefe", "tyt-din"],
  "DİL": ["ydt-dilbilgisi", "ydt-soru-turleri", "tyt-turkce", "tyt-matematik", "geometri", "tyt-tarih", "tyt-cografya", "tyt-felsefe", "tyt-din"],
  TYT: ["tyt-matematik", "geometri", "tyt-fizik", "tyt-kimya", "tyt-biyoloji", "tyt-turkce", "tyt-tarih", "tyt-cografya", "tyt-felsefe", "tyt-din"],
  LGS: ["lgs-matematik", "lgs-fen", "lgs-turkce", "lgs-inkilap", "lgs-din", "lgs-ingilizce"],
  KPSS: ["kpss-matematik", "kpss-turkce", "kpss-tarih", "kpss-cografya", "kpss-vatandaslik"],
};
/** Alana (ve ara sınıflarda sınıfa) göre programda yer alacak bölümler */
export function sectionsForField(field: string | null | undefined, grade?: string | null): string[] {
  const secs = FIELD_SECTIONS[field ?? ""] ?? FIELD_SECTIONS.TYT;
  if (sinavOf(field) !== "YKS" || gradeLevel(grade) >= 12) return secs;
  const open = new Set(sectionsOfCourses(coursesFor(field, grade)).map((x) => x.id));
  return secs.filter((x) => open.has(x));
}

/** Sınav adı ve deneme türleri (öğrencinin sınavına göre) */
export const examName = (field: string | null | undefined) => sinavOf(field);
export function examTypesFor(field: string | null | undefined): ExamAnalysis["exam_type"][] {
  const s = sinavOf(field);
  return s === "LGS" ? ["LGS", "BRANS"] : s === "KPSS" ? ["KPSS", "BRANS"] : ["TYT", "AYT", "BRANS"];
}
/** Deneme net tablosundaki bölümler: DİL öğrencisinde AYT oturumu Yabancı Dil Testi'dir (YDT, 80 soru) */
export function examSectionsFor(type: ExamAnalysis["exam_type"], field: string | null | undefined): { name: string; count: number }[] {
  return field === "DİL" && type === "AYT" ? [{ name: "Yabancı Dil", count: 80 }] : EXAM_SECTIONS[type];
}
/** Deneme türünün görünen adı */
export const examTypeLabel = (type: string, field?: string | null) => (type === "BRANS" ? "Branş" : type === "AYT" && field === "DİL" ? "YDT" : type);
/** Kaç yanlış bir doğruyu götürür: LGS'de 3, diğerlerinde 4 */
export const wrongDivisor = (type: string | null | undefined) => (type === "LGS" ? 3 : 4);

/** İçeriği olan (boş olmayan) görev mi? */
export const isRealTask = (t: Pick<PlanTask, "topic_id" | "content" | "target_questions">) =>
  Boolean(t.topic_id || t.content.trim() || t.target_questions);

export type TaskType = "konu" | "soru" | "tekrar" | "deneme" | "diger";

export const TASK_TYPES: { value: TaskType; label: string; short: string }[] = [
  { value: "soru", label: "Soru çözümü", short: "Soru" },
  { value: "konu", label: "Konu çalışma", short: "Konu" },
  { value: "tekrar", label: "Konu tekrarı", short: "Tekrar" },
  { value: "deneme", label: "Deneme", short: "Deneme" },
  { value: "diger", label: "Diğer", short: "Diğer" },
];

/** Günlük müsaitlik (okuldaki boş saatlere göre) */
export type DayLevel = "kapali" | "hafif" | "normal" | "yogun";
export const DAY_LEVELS: { value: DayLevel; label: string; questions: number }[] = [
  { value: "kapali", label: "Kapalı", questions: 0 },
  { value: "hafif", label: "Hafif", questions: 60 },
  { value: "normal", label: "Normal", questions: 120 },
  { value: "yogun", label: "Yoğun", questions: 200 },
];

export type ExamAnalysis = {
  id: string;
  student_id: string;
  exam_date: string;
  title: string;
  exam_type: "TYT" | "AYT" | "BRANS" | "LGS" | "KPSS";
  nets: Record<string, { d?: number | null; y?: number | null }>;
  results: { topic_id: string; wrong?: number; empty?: number }[];
  file_path: string | null;
  notes: string;
  created_at: string;
};

/** Deneme netleri için bölümler */
export const EXAM_SECTIONS: Record<ExamAnalysis["exam_type"], { name: string; count: number }[]> = {
  TYT: [
    { name: "Türkçe", count: 40 },
    { name: "Sosyal", count: 20 },
    { name: "Matematik", count: 40 },
    { name: "Fen", count: 20 },
  ],
  AYT: [
    { name: "Matematik", count: 40 },
    { name: "Fizik", count: 14 },
    { name: "Kimya", count: 13 },
    { name: "Biyoloji", count: 13 },
    { name: "Edebiyat", count: 24 },
    { name: "Tarih-1", count: 10 },
    { name: "Coğrafya-1", count: 6 },
  ],
  BRANS: [{ name: "Branş", count: 40 }],
  LGS: [
    { name: "Türkçe", count: 20 },
    { name: "Matematik", count: 20 },
    { name: "Fen", count: 20 },
    { name: "İnkılap", count: 10 },
    { name: "Din", count: 10 },
    { name: "İngilizce", count: 10 },
  ],
  KPSS: [
    { name: "Türkçe", count: 30 },
    { name: "Matematik", count: 30 },
    { name: "Tarih", count: 27 },
    { name: "Coğrafya", count: 18 },
    { name: "Vatandaşlık", count: 9 },
    { name: "Güncel", count: 6 },
  ],
};

/** Net = doğru − yanlış / bölen (YKS ve KPSS'de 4, LGS'de 3) */
export function net(d?: number | null, y?: number | null, divisor = 4): number | null {
  if (d == null && y == null) return null;
  return Math.round(((d ?? 0) - (y ?? 0) / divisor) * 100) / 100;
}

export type TimeBlock = { start: string; end: string; label: string };

export type PlanDay = {
  plan_id: string;
  day_index: number;
  student_id: string;
  notes: string;
  time_blocks: TimeBlock[];
  study_minutes: number | null;
  question_count: number | null;
  updated_by: string | null;
  updated_at: string;
};

export type DailyLog = {
  id: string;
  student_id: string;
  log_date: string;
  sleep_hours: number | null;
  procrastinated: boolean | null;
  phone_minutes: number | null;
  replanned: boolean | null;
  anxiety: number | null;
  energy: number | null;
  motivation: number | null;
  obstacle: string | null;
  action_taken: string | null;
  what_worked: string | null;
  tomorrow_change: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type TopicProgress = {
  student_id: string;
  topic_id: string;
  status: TopicStatus;
  note: string;
  updated_by: string | null;
  updated_at: string;
};

export type CounselorNote = {
  id: string;
  student_id: string;
  counselor_id: string;
  note_date: string;
  content: string;
  created_at: string;
};

export const FIELDS = ["SAY", "EA", "SÖZ", "DİL", "TYT", "LGS", "KPSS"] as const;
export const FIELD_LABELS: Record<string, string> = {
  SAY: "YKS · Sayısal",
  EA: "YKS · Eşit ağırlık",
  "SÖZ": "YKS · Sözel",
  "DİL": "YKS · Dil",
  TYT: "YKS · Yalnızca TYT",
  LGS: "LGS (8. sınıf)",
  KPSS: "KPSS (GY-GK)",
};
export const GRADES = ["8. sınıf", "9. sınıf", "10. sınıf", "11. sınıf", "12. sınıf", "Mezun"] as const;

/* ==================================================================
   TARİH
   ================================================================== */

// Tarih yardımcıları — tüm tarihler cihazın yerel saatine göre "yyyy-mm-dd" biçimindedir.

export const DAY_NAMES = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
export const DAY_SHORT = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function addDays(s: string, n: number): string {
  const d = parseISODate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** b - a (gün) */
export function diffDays(a: string, b: string): number {
  const ms = parseISODate(b).getTime() - parseISODate(a).getTime();
  return Math.round(ms / 86400000);
}

/** 23.09.2026 */
export function formatTR(s: string): string {
  const [y, m, d] = s.split("-");
  return `${d}.${m}.${y}`;
}

/** 23 Eylül */
export function formatShort(s: string): string {
  const d = parseISODate(s);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** 23 Eylül 2026, Çarşamba */
export function formatLong(s: string): string {
  const d = parseISODate(s);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${DAY_NAMES[d.getDay()]}`;
}

export function dayName(s: string): string {
  return DAY_NAMES[parseISODate(s).getDay()];
}

export function dayShort(s: string): string {
  return DAY_SHORT[parseISODate(s).getDay()];
}

/** "Bugün", "Dün", "3 gün önce" */
export function relativeDay(s: string | null | undefined): string {
  if (!s) return "Hiç";
  const n = diffDays(s, todayISO());
  if (n <= 0) return "Bugün";
  if (n === 1) return "Dün";
  return `${n} gün önce`;
}

export function rangeDates(start: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}

export function minutesToText(min: number | null | undefined): string {
  if (min == null || Number.isNaN(min)) return "—";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m} dk`;
  if (m === 0) return `${h} sa`;
  return `${h} sa ${m} dk`;
}

/** "09:30" → dakika */
export function timeToMinutes(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/* ==================================================================
   BİÇİMLENDİRME
   ================================================================== */

export function fmtNum(n: number | null | undefined, digits = 1): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("tr-TR", { maximumFractionDigits: digits });
}

export function avg(values: (number | null | undefined)[]): number | null {
  const v = values.filter((x): x is number => typeof x === "number" && !Number.isNaN(x));
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

export function pct(part: number, total: number): number | null {
  if (!total) return null;
  return Math.round((part / total) * 100);
}

export function yesNo(v: boolean | null | undefined): string {
  if (v == null) return "—";
  return v ? "Evet" : "Hayır";
}

/* ==================================================================
   CSV (Excel)
   ================================================================== */

type Cell = string | number | boolean | null | undefined;

function cell(v: Cell): string {
  if (v == null) return "";
  let s = typeof v === "boolean" ? (v ? "Evet" : "Hayır") : String(v);
  if (typeof v === "number") s = s.replace(".", ","); // Türkçe Excel ondalık virgül
  if (/[;"\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Türkçe Excel ile uyumlu (noktalı virgül ayraçlı, UTF-8 BOM'lu) CSV indirir. */
export function downloadCSV(filename: string, rows: Cell[][]) {
  const text = rows.map((r) => r.map(cell).join(";")).join("\r\n");
  const blob = new Blob(["\ufeff" + text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ==================================================================
   KULLANICI ADI
   ================================================================== */

// Öğrenciler e-posta yerine kullanıcı adıyla giriş yapar. Supabase e-posta istediği için
// kullanıcı adı, hiçbir zaman e-posta gönderilmeyen ayrılmış bir alan adına eşlenir.
export const STUDENT_EMAIL_DOMAIN = "ogrenci.yks-takip.invalid";

export const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,29}$/;

export function normalizeUsername(u: string): string {
  return u.trim().toLocaleLowerCase("tr-TR").replace(/ı/g, "i");
}

export function loginIdToEmail(id: string): string {
  const v = id.trim();
  if (v.includes("@")) return v.toLowerCase();
  return `${normalizeUsername(v)}@${STUDENT_EMAIL_DOMAIN}`;
}

/* ==================================================================
   HAFTALIK PROGRAM DERSLERİ
   ================================================================== */

// Haftalık programdaki ders satırları (şablondaki sıra). İstediğiniz gibi değiştirebilirsiniz.
export const DEFAULT_SUBJECTS = [
  "TÜRKÇE",
  "TYT MATEMATİK",
  "AYT MATEMATİK",
  "GEOMETRİ",
  "EDEBİYAT",
  "TARİH",
  "COĞRAFYA",
  "FELSEFE",
  "TYT FİZİK",
  "TYT KİMYA",
  "TYT BİYOLOJİ",
  "PARAGRAF",
  "PROBLEM",
  "GÜNLÜK TEKRAR",
];

const DIL_SUBJECTS = ["YDT DİL BİLGİSİ", "YDT KELİME", "YDT OKUMA", "YDT ÇEVİRİ", "YDT SORU TÜRLERİ", "TÜRKÇE", "TYT MATEMATİK", "GEOMETRİ", "TARİH", "COĞRAFYA", "FELSEFE", "PARAGRAF", "PROBLEM", "GÜNLÜK TEKRAR"];
const LGS_SUBJECTS = ["LGS TÜRKÇE", "LGS MATEMATİK", "FEN BİLİMLERİ", "İNKILAP TARİHİ", "LGS DİN KÜLTÜRÜ", "İNGİLİZCE", "PARAGRAF", "GÜNLÜK TEKRAR"];
const KPSS_SUBJECTS = ["KPSS TÜRKÇE", "KPSS MATEMATİK", "KPSS TARİH", "KPSS COĞRAFYA", "VATANDAŞLIK", "PARAGRAF", "PROBLEM", "GÜNLÜK TEKRAR"];
/** Öğrencinin sınavına göre programdaki ders satırları */
export function subjectsFor(field: string | null | undefined): string[] {
  const s = sinavOf(field);
  if (field === "DİL") return DIL_SUBJECTS;
  return s === "LGS" ? LGS_SUBJECTS : s === "KPSS" ? KPSS_SUBJECTS : DEFAULT_SUBJECTS;
}

// Ders satırı → konu takibindeki bölümler (görev eklerken konu seçimi için)
export const SUBJECT_SECTIONS: Record<string, string[]> = {
  "TÜRKÇE": ["tyt-turkce"],
  "PARAGRAF": ["tyt-turkce"],
  "TYT MATEMATİK": ["tyt-matematik"],
  "PROBLEM": ["tyt-matematik"],
  "AYT MATEMATİK": ["ayt-matematik"],
  "GEOMETRİ": ["geometri"],
  "EDEBİYAT": ["ayt-edebiyat"],
  "TARİH": ["tyt-tarih", "ayt-tarih"],
  "COĞRAFYA": ["tyt-cografya", "ayt-cografya"],
  "FELSEFE": ["tyt-felsefe"],
  "TYT FİZİK": ["tyt-fizik"],
  "AYT FİZİK": ["ayt-fizik"],
  "TYT KİMYA": ["tyt-kimya"],
  "AYT KİMYA": ["ayt-kimya"],
  "TYT BİYOLOJİ": ["tyt-biyoloji"],
  "AYT BİYOLOJİ": ["ayt-biyoloji"],
  "DİN KÜLTÜRÜ": ["tyt-din"],
  "YDT DİL BİLGİSİ": ["ydt-dilbilgisi"],
  "YDT KELİME": ["ydt-dilbilgisi"],
  "YDT OKUMA": ["ydt-soru-turleri"],
  "YDT ÇEVİRİ": ["ydt-soru-turleri"],
  "YDT SORU TÜRLERİ": ["ydt-soru-turleri"],
  "LGS TÜRKÇE": ["lgs-turkce"],
  "LGS MATEMATİK": ["lgs-matematik"],
  "FEN BİLİMLERİ": ["lgs-fen"],
  "İNKILAP TARİHİ": ["lgs-inkilap"],
  "LGS DİN KÜLTÜRÜ": ["lgs-din"],
  "İNGİLİZCE": ["lgs-ingilizce"],
  "KPSS TÜRKÇE": ["kpss-turkce"],
  "KPSS MATEMATİK": ["kpss-matematik"],
  "KPSS TARİH": ["kpss-tarih"],
  "KPSS COĞRAFYA": ["kpss-cografya"],
  "VATANDAŞLIK": ["kpss-vatandaslik"],
};

/** Konu → programdaki ders satırı */
export function subjectForTopic(topicId: string): string {
  const section = topicId.split(".")[0];
  if (topicId === "tyt-matematik.problemler") return "PROBLEM";
  if (topicId.startsWith("tyt-turkce.paragrafta")) return "PARAGRAF";
  if (section === "ydt-dilbilgisi") return /vocabulary|collocations/.test(topicId) ? "YDT KELİME" : "YDT DİL BİLGİSİ";
  if (section === "ydt-soru-turleri") return /ceviri/.test(topicId) ? "YDT ÇEVİRİ" : /okuma|paragraf|anlam-butunlugunu/.test(topicId) ? "YDT OKUMA" : "YDT SORU TÜRLERİ";
  for (const [subject, sections] of Object.entries(SUBJECT_SECTIONS)) {
    if (subject === "PARAGRAF" || subject === "PROBLEM") continue;
    if (sections.includes(section)) return subject;
  }
  return "DİĞER";
}

// "Ders ekle" listesinde önerilecek ek dersler
export const EXTRA_SUBJECT_SUGGESTIONS = [
  "AYT FİZİK",
  "AYT KİMYA",
  "AYT BİYOLOJİ",
  "DİN KÜLTÜRÜ",
  "DENEME",
  "TYT DENEME",
  "AYT DENEME",
  "BRANŞ DENEMESİ",
  "KİTAP OKUMA",
];

export function normalizeSubject(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLocaleUpperCase("tr-TR").slice(0, 60);
}

/* ==================================================================
   DİKKAT GÖSTERGELERİ
   ================================================================== */

// Danışman için "dikkat" göstergeleri. Bunlar tanı değil, görüşmede konuşulabilecek
// gözlemlerdir. Eşik değerlerini buradan değiştirebilirsiniz.

export type Signal = {
  level: "critical" | "warning" | "info";
  text: string;
  /** İlgili değişken (açıklama için), ör. "anxiety" */
  key?: string;
  /** Uyarıya yol açan kayıtlar: tarih ve değerler */
  evidence?: string[];
  /** Danışmana önerilen adım */
  suggestion?: string;
};

export const THRESHOLDS = {
  missingLogDays: 3, // bu kadar gündür kayıt yoksa
  highAnxiety: 4, // son 3 kaydın kaygı ortalaması ≥
  lowMotivation: 2, // son 3 kaydın motivasyon ortalaması ≤
  lowEnergy: 2, // son 3 kaydın enerji ortalaması ≤
  lowSleep: 6, // son 7 kaydın uyku ortalaması <
  highPhone: 180, // son 7 kaydın telefon ortalaması (dk) >
  procrastinationDays: 4, // son 7 kayıtta erteleme günü ≥
  lowCompletion: 50, // bu haftaki (bugüne kadarki) görev tamamlama % <
};

const dd = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
/** Kayıtları "12.10: 4/5 · 13.10: 5/5" gibi tek satırlık kanıta çevirir (eskiden yeniye). */
function evidenceLine(logs: DailyLog[], pick: (l: DailyLog) => string | null): string {
  return [...logs]
    .reverse()
    .map((l) => `${dd(l.log_date)}: ${pick(l) ?? "—"}`)
    .join(" · ");
}
const scale = (v: number | null) => (v == null ? null : `${v}/5`);
const sleepTxt = (l: DailyLog) => (l.sleep_hours == null ? null : `${fmtNum(Number(l.sleep_hours))} sa`);

export function computeSignals(opts: {
  logs: DailyLog[]; // herhangi bir sırada
  plan?: WeeklyPlan | null;
  tasks?: PlanTask[];
}): Signal[] {
  const out: Signal[] = [];
  const today = todayISO();
  const logs = [...opts.logs].sort((a, b) => (a.log_date < b.log_date ? 1 : -1)); // yeni → eski
  const T = THRESHOLDS;

  if (!logs.length) {
    out.push({
      level: "info",
      text: "Son günlerde günlük takip girilmemiş",
      suggestion: "Öğrenciye günlük formun akşam 1-2 dakika sürdüğünü hatırlatın; kayıt olmadan uyarı sistemi çalışamaz.",
    });
  } else {
    const gap = diffDays(logs[0].log_date, today);
    if (gap >= T.missingLogDays)
      out.push({
        level: "warning",
        text: `${gap} gündür günlük takip girilmedi`,
        evidence: [`Son kayıt: ${formatTR(logs[0].log_date)} (${dayName(logs[0].log_date)})`],
        suggestion: "Kayıt bırakma bazen zorlanmanın ilk işaretidir. Kısa bir mesajla nasıl olduğunu sorun; formu doldurmayı suçlamadan hatırlatın.",
      });

    const last3 = logs.slice(0, 3);
    const last7 = logs.slice(0, 7);
    const anx = avg(last3.map((l) => l.anxiety));
    if (anx != null && anx >= T.highAnxiety) {
      const sl = avg(last3.map((l) => (l.sleep_hours == null ? null : Number(l.sleep_hours))));
      out.push({
        level: "critical",
        key: "anxiety",
        text: `Kaygı yüksek (son kayıtlar ort. ${fmtNum(anx)})`,
        evidence: [
          `Kaygı: ${evidenceLine(last3, (l) => scale(l.anxiety))}`,
          `Uyku: ${evidenceLine(last3, sleepTxt)}${sl != null && sl < 6 ? " (az uyku kaygıyı besliyor olabilir)" : ""}`,
          ...last3.filter((l) => l.obstacle).slice(0, 2).map((l) => `${dd(l.log_date)} engel: “${(l.obstacle ?? "").slice(0, 120)}”`),
        ],
        suggestion: "Görüşmede kaygının hangi durumlarda yükseldiğini ve otomatik düşünceleri birlikte yazın. Uyku da düşükse önce uyku düzenini ele alın. Kaygı işlevselliği belirgin bozuyorsa uzmana yönlendirmeyi değerlendirin.",
      });
    }
    const mot = avg(last3.map((l) => l.motivation));
    if (mot != null && mot <= T.lowMotivation)
      out.push({
        level: "warning",
        key: "motivation",
        text: `Motivasyon düşük (ort. ${fmtNum(mot)})`,
        evidence: [`Motivasyon: ${evidenceLine(last3, (l) => scale(l.motivation))}`, `Enerji: ${evidenceLine(last3, (l) => scale(l.energy))}`],
        suggestion: "Hedefi küçültün: bir sonraki 2 gün için 'en kolay ilk görev' belirleyin. Motivasyonla birlikte enerji de düşükse uyku ve yorgunluğu sorun.",
      });
    const en = avg(last3.map((l) => l.energy));
    if (en != null && en <= T.lowEnergy)
      out.push({
        level: "warning",
        key: "energy",
        text: `Enerji düşük (ort. ${fmtNum(en)})`,
        evidence: [`Enerji: ${evidenceLine(last3, (l) => scale(l.energy))}`, `Uyku: ${evidenceLine(last3, sleepTxt)}`],
        suggestion: "Programdaki yeni konu yükünü birkaç gün tekrar ve soruya kaydırın; mola düzenini ve uykuyu konuşun.",
      });
    const sl = avg(last7.map((l) => (l.sleep_hours == null ? null : Number(l.sleep_hours))));
    if (sl != null && sl < T.lowSleep)
      out.push({
        level: "warning",
        key: "sleep_hours",
        text: `Uyku az (ort. ${fmtNum(sl)} saat)`,
        evidence: [`Uyku: ${evidenceLine(last7, sleepTxt)}`, `Aynı günlerde kaygı: ${evidenceLine(last7, (l) => scale(l.anxiety))}`],
        suggestion: "Sabit kalkış saati ve yatmadan önce ekransız 1 saat hedefi koyun. Gece geç saate kalan çalışma blokları varsa programı öne çekin.",
      });
    const ph = avg(last7.map((l) => l.phone_minutes));
    if (ph != null && ph > T.highPhone)
      out.push({
        level: "warning",
        key: "phone_minutes",
        text: `Telefon süresi yüksek (ort. ${fmtNum(ph, 0)} dk)`,
        evidence: [
          `Telefon: ${evidenceLine(last7, (l) => (l.phone_minutes == null ? null : `${l.phone_minutes} dk`))}`,
          `Erteleme: ${evidenceLine(last7, (l) => (l.procrastinated == null ? null : l.procrastinated ? "evet" : "hayır"))}`,
        ],
        suggestion: `Haftalık hedefi birlikte belirleyin (ör. günde ${fmtNum(Math.max(60, Math.round((ph * 0.75) / 10) * 10), 0)} dk). Çalışma bloklarında telefonun başka odada kalmasını deneyin.`,
      });
    const pr = last7.filter((l) => l.procrastinated === true).length;
    if (pr >= T.procrastinationDays)
      out.push({
        level: "warning",
        key: "procrastinated",
        text: `Son ${last7.length} kayıtta ${pr} gün erteleme`,
        evidence: [
          `Erteleme: ${evidenceLine(last7, (l) => (l.procrastinated == null ? null : l.procrastinated ? "evet" : "hayır"))}`,
          ...last7.filter((l) => l.procrastinated && l.obstacle).slice(0, 2).map((l) => `${dd(l.log_date)} engel: “${(l.obstacle ?? "").slice(0, 120)}”`),
        ],
        suggestion: "Ertelenen görevin öncesindeki duyguyu konuşun (sıkılma, yetersizlik, belirsizlik). Görevi 5 dakikalık ilk adıma bölün ve başlama saatini sabitleyin.",
      });
  }

  if (opts.plan && opts.tasks) {
    const elapsed = diffDays(opts.plan.start_date, today); // bugün hariç geçen gün sayısı
    if (elapsed >= 2 && elapsed <= 7) {
      const due = opts.tasks.filter((t) => isRealTask(t) && t.day_index < elapsed);
      if (due.length >= 3) {
        const done = due.filter((t) => t.done).length;
        const p = Math.round((done / due.length) * 100);
        if (p < T.lowCompletion) {
          const bySubject = new Map<string, { d: number; n: number }>();
          for (const t of due) {
            const e = bySubject.get(t.subject) ?? { d: 0, n: 0 };
            e.n++;
            if (t.done) e.d++;
            bySubject.set(t.subject, e);
          }
          const worst = [...bySubject.entries()]
            .sort((a, b) => a[1].d / a[1].n - b[1].d / b[1].n)
            .slice(0, 3)
            .map(([s, e]) => `${s}: ${e.d}/${e.n}`);
          out.push({
            level: "warning",
            text: `Program tamamlama düşük (%${p})`,
            evidence: [`Geçen ${elapsed} günde ${due.length} görevin ${done} tanesi tamamlandı`, `En çok geride kalan dersler: ${worst.join(" · ")}`],
            suggestion: "Programın yükünü öğrenciyle birlikte gözden geçirin; gerçekçi olmayan bir plan ertelemeyi artırır. Kalan günler için görev sayısını azaltmayı düşünün.",
          });
        }
      }
    }
  }

  const rank = { critical: 0, warning: 1, info: 2 } as const;
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}

/** Bugünü içeren plan; yoksa en yakın gelecek plan; o da yoksa en son geçmiş plan. */
export function pickCurrentPlan<T extends { start_date: string }>(plans: T[], today = todayISO()): T | null {
  const sorted = [...plans].sort((a, b) => (a.start_date < b.start_date ? 1 : -1));
  const containing = sorted.find((p) => p.start_date <= today && today <= addDays(p.start_date, 6));
  if (containing) return containing;
  const upcoming = [...sorted].reverse().find((p) => p.start_date > today);
  return upcoming ?? sorted.find((p) => p.start_date <= today) ?? null;
}

/* Kişisel görünüm (theme.tsx). Sayfa açılırken React yüklenmeden çalışan küçük betik — layout.tsx kullanır. */
export const THEME_STORAGE_KEY = "yks-gorunum";
export const THEME_BOOT_SCRIPT = `try{var t=JSON.parse(localStorage.getItem("yks-gorunum")||"{}"),r=document.documentElement;if(t.a&&t.a!=="petrol")r.dataset.accent=t.a;if(t.m==="light"||t.m==="dark")r.dataset.mode=t.m}catch(e){}`;

/* ------------------------------------------------------------------ */
/* Kaynak (kitap) takibi — kaynaklar.tsx, guncelleme-8.sql              */
/* ------------------------------------------------------------------ */
export type ResourceKind = "soru_bankasi" | "konu_anlatim" | "fasikul" | "deneme" | "diger";
export const RESOURCE_KINDS: { value: ResourceKind; label: string }[] = [
  { value: "soru_bankasi", label: "Soru bankası" },
  { value: "fasikul", label: "Fasikül" },
  { value: "konu_anlatim", label: "Konu anlatımı" },
  { value: "deneme", label: "Deneme kitabı" },
  { value: "diger", label: "Diğer" },
];
export type Resource = {
  id: string;
  student_id: string;
  title: string;
  publisher: string;
  subject: string;
  kind: ResourceKind;
  total_tests: number;
  status: "active" | "done" | "paused";
  created_at: string;
  catalog_id?: string | null; // katalogdan seçildiyse (guncelleme-10.sql)
};
/** Danışmanların tanımladığı ortak kaynak kataloğu */
export type CatalogItem = {
  id: string;
  title: string;
  publisher: string;
  subject: string;
  kind: ResourceKind;
  total_tests: number;
  test_topics: { from: number; to: number; topic_id: string }[];
  is_active: boolean;
  created_at: string;
};
export type ResourceProgress = {
  id: string;
  resource_id: string;
  student_id: string;
  test_no: number;
  topic_id: string | null;
  correct: number | null;
  wrong: number | null;
  empty: number | null;
  done_on: string;
  task_id: string | null;
};
/** "12-14, 18" → [12, 13, 14, 18] */
export function parseTestList(s: string | null | undefined): number[] {
  const out: number[] = [];
  for (const part of (s ?? "").split(",")) {
    const p = part.trim();
    const m = p.match(/^(\d{1,4})\s*-\s*(\d{1,4})$/);
    if (m) {
      const a = +m[1];
      const b = +m[2];
      if (b >= a && b - a < 60) for (let n = a; n <= b; n++) out.push(n);
    } else if (/^\d{1,4}$/.test(p)) out.push(+p);
  }
  return out.filter((n) => n >= 1 && n <= 1000);
}
