// Ortak yardımcılar: tipler, tarih, biçimlendirme, CSV, kullanıcı adı, ders listesi, uyarı kuralları.
// Hem tarayıcıda hem sunucuda kullanılabilir.
import type { TopicStatus } from "./curriculum";

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
};

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
  "DİL": ["tyt-matematik", "geometri", "tyt-turkce"],
  TYT: ["tyt-matematik", "geometri", "tyt-fizik", "tyt-kimya", "tyt-biyoloji", "tyt-turkce", "tyt-tarih", "tyt-cografya", "tyt-felsefe", "tyt-din"],
};
export const sectionsForField = (field: string | null | undefined) => FIELD_SECTIONS[field ?? ""] ?? FIELD_SECTIONS.TYT;

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
  exam_type: "TYT" | "AYT" | "BRANS";
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
};

export function net(d?: number | null, y?: number | null): number | null {
  if (d == null && y == null) return null;
  return Math.round(((d ?? 0) - (y ?? 0) / 4) * 100) / 100;
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

export const FIELDS = ["SAY", "EA", "SÖZ", "DİL", "TYT"] as const;
export const GRADES = ["9. sınıf", "10. sınıf", "11. sınıf", "12. sınıf", "Mezun"] as const;

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
};

/** Konu → programdaki ders satırı */
export function subjectForTopic(topicId: string): string {
  const section = topicId.split(".")[0];
  if (topicId === "tyt-matematik.problemler") return "PROBLEM";
  if (topicId.startsWith("tyt-turkce.paragrafta")) return "PARAGRAF";
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

export type Signal = { level: "critical" | "warning" | "info"; text: string };

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
    out.push({ level: "info", text: "Son günlerde günlük takip girilmemiş" });
  } else {
    const gap = diffDays(logs[0].log_date, today);
    if (gap >= T.missingLogDays) out.push({ level: "warning", text: `${gap} gündür günlük takip girilmedi` });

    const last3 = logs.slice(0, 3);
    const last7 = logs.slice(0, 7);
    const anx = avg(last3.map((l) => l.anxiety));
    if (anx != null && anx >= T.highAnxiety) out.push({ level: "critical", text: `Kaygı yüksek (son kayıtlar ort. ${fmtNum(anx)})` });
    const mot = avg(last3.map((l) => l.motivation));
    if (mot != null && mot <= T.lowMotivation) out.push({ level: "warning", text: `Motivasyon düşük (ort. ${fmtNum(mot)})` });
    const en = avg(last3.map((l) => l.energy));
    if (en != null && en <= T.lowEnergy) out.push({ level: "warning", text: `Enerji düşük (ort. ${fmtNum(en)})` });
    const sl = avg(last7.map((l) => (l.sleep_hours == null ? null : Number(l.sleep_hours))));
    if (sl != null && sl < T.lowSleep) out.push({ level: "warning", text: `Uyku az (ort. ${fmtNum(sl)} saat)` });
    const ph = avg(last7.map((l) => l.phone_minutes));
    if (ph != null && ph > T.highPhone) out.push({ level: "warning", text: `Telefon süresi yüksek (ort. ${fmtNum(ph, 0)} dk)` });
    const pr = last7.filter((l) => l.procrastinated === true).length;
    if (pr >= T.procrastinationDays) out.push({ level: "warning", text: `Son ${last7.length} kayıtta ${pr} gün erteleme` });
  }

  if (opts.plan && opts.tasks) {
    const elapsed = diffDays(opts.plan.start_date, today); // bugün hariç geçen gün sayısı
    if (elapsed >= 2 && elapsed <= 7) {
      const due = opts.tasks.filter((t) => isRealTask(t) && t.day_index < elapsed);
      if (due.length >= 3) {
        const done = due.filter((t) => t.done).length;
        const p = Math.round((done / due.length) * 100);
        if (p < T.lowCompletion) out.push({ level: "warning", text: `Program tamamlama düşük (%${p})` });
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
