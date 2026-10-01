"use client";
// Seri, rozetler, aylık hedefler ve özel gün rozetleri.
// • Rozet aileleri sınırsızdır: her ailenin seviyeleri sonsuza kadar devam eder (ör. her 30 günlük seri, her 2.500 soru).
// • Aylık hedef: danışman belirlemediyse geçen aya göre otomatik hesaplanır (kişiseldir, başkasıyla kıyas yoktur).
// • Özel gün rozetleri yalnızca o gün kazanılır; konu bitirme ve ders tamamlama rozetleri konu takibinden gelir.
// • Büyük kutlama yalnızca kilometre taşlarında (7, 30, 100 gün) gösterilir; diğer rozetler kısa bildirimle duyurulur.
// • Dil kazanç odaklıdır ("serine 1 gün ekle"), kayıp/korku vurgusu yapılmaz.

import { useEffect, useMemo, useState } from "react";
import { COURSES, ALL_TOPICS } from "./curriculum";
import { sb, useAuth } from "./db";
import { fmtNum } from "./lib";
import { Button, Card, Modal, cx, portal, useToast } from "./ui";

export type MonthStat = { m: string; q: number; d: number };
export type MonthGoalRow = { m: string; q: number | null; d: number | null };

export type GameStats = {
  streak: number;
  best: number;
  logs: number;
  solved: number;
  tasks_done: number;
  week_q: number;
  good_weeks: number;
  exams: number;
  books_done: number;
  week_total: number;
  week_done: number;
  log_streak?: number;
  log_best?: number;
  complete_logs?: number;
  today?: string;
  active_today?: boolean;
  log_today?: boolean;
  topics_done?: string[];
  months?: MonthStat[];
  goals?: MonthGoalRow[];
  special?: string[];
  n: number;
  streak_top: number | null;
  week_top: number | null;
};

const fmt = (n: number) => fmtNum(n, 0);

/* ------------------------------------------------------------------ */
/* Tarih yardımcıları (YYYY-MM-DD, Türkiye günü)                        */
/* ------------------------------------------------------------------ */
const AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
function istanbulToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
}
const todayOf = (s: GameStats) => s.today ?? istanbulToday();
function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}
const monthName = (m: string) => `${AYLAR[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
function prevMonth(m: string) {
  const y = Number(m.slice(0, 4));
  const mo = Number(m.slice(5, 7));
  return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`;
}
const daysInMonth = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).getUTCDate();

/* ------------------------------------------------------------------ */
/* Aylık hedef                                                          */
/* ------------------------------------------------------------------ */
export const GOAL_RULE_Q = "Geçen ay çözdüğün soru sayısının %10 fazlası (50'nin katına yukarı yuvarlanır). En az 200 soru.";
export const GOAL_RULE_D = "Geçen ayki aktif gün sayının 2 fazlası. En az 12 gün; dinlenmen için en fazla ayın gün sayısının 4 eksiği.";

export type MonthGoal = {
  m: string;
  goalQ: number;
  goalD: number;
  q: number;
  d: number;
  srcQ: "danisman" | "otomatik";
  srcD: "danisman" | "otomatik";
  achieved: boolean;
};

export function autoGoal(m: string, prev: MonthStat | undefined) {
  const pq = prev?.q ?? 0;
  const pd = prev?.d ?? 0;
  return {
    q: Math.max(200, Math.ceil((pq * 1.1) / 50) * 50),
    d: Math.min(daysInMonth(m) - 4, Math.max(12, pd + 2)),
  };
}

export function monthGoals(s: GameStats): MonthGoal[] {
  const today = todayOf(s);
  const cur = today.slice(0, 7);
  const stats = new Map((s.months ?? []).map((x) => [x.m, x]));
  if (!stats.has(cur)) stats.set(cur, { m: cur, q: 0, d: 0 });
  const over = new Map((s.goals ?? []).map((g) => [g.m, g]));
  return [...stats.values()]
    .filter((x) => x.m <= cur)
    .sort((a, b) => a.m.localeCompare(b.m))
    .map((x) => {
      const auto = autoGoal(x.m, stats.get(prevMonth(x.m)));
      const o = over.get(x.m);
      const goalQ = o?.q ?? auto.q;
      const goalD = o?.d ?? auto.d;
      return {
        m: x.m,
        goalQ,
        goalD,
        q: x.q,
        d: x.d,
        srcQ: o?.q != null ? "danisman" : "otomatik",
        srcD: o?.d != null ? "danisman" : "otomatik",
        achieved: x.q >= goalQ && x.d >= goalD,
      } as MonthGoal;
    });
}

/* ------------------------------------------------------------------ */
/* Özel günler (guncelleme-hepsi.sql → special_days() ile aynı liste)      */
/* ------------------------------------------------------------------ */
export const OZEL_GUNLER: { md: string; name: string; short: string }[] = [
  { md: "01-01", name: "Yeni Yıl", short: "1 Ocak" },
  { md: "03-14", name: "Pi Günü", short: "14 Mart" },
  { md: "04-23", name: "23 Nisan Ulusal Egemenlik ve Çocuk Bayramı", short: "23 Nisan" },
  { md: "05-19", name: "19 Mayıs Atatürk'ü Anma, Gençlik ve Spor Bayramı", short: "19 Mayıs" },
  { md: "08-30", name: "30 Ağustos Zafer Bayramı", short: "30 Ağustos" },
  { md: "10-29", name: "29 Ekim Cumhuriyet Bayramı", short: "29 Ekim" },
  { md: "11-24", name: "24 Kasım Öğretmenler Günü", short: "24 Kasım" },
];
const ozelOf = (iso: string) => OZEL_GUNLER.find((g) => g.md === iso.slice(5));
export const OZEL_HOW =
  "Özel gün rozetini yalnızca o gün kazanabilirsin. O gün (00.00–23.59, Türkiye saati) günlük takip formunu doldur YA DA programındaki en az bir görevi \"tamamlandı\" olarak işaretle. Her yıl yeniden kazanılabilir.";

function nextSpecial(today: string) {
  const y = Number(today.slice(0, 4));
  const all = [y, y + 1].flatMap((yy) => OZEL_GUNLER.map((g) => ({ ...g, date: `${yy}-${g.md}` })));
  return all.find((g) => g.date >= today)!;
}

/* ------------------------------------------------------------------ */
/* Ders tamamlama                                                       */
/* ------------------------------------------------------------------ */
const TOPIC_IDS = new Set(ALL_TOPICS.map((t) => t.id));
const SECTIONS = COURSES.flatMap((c) => c.sections);
function sectionProgress(s: GameStats) {
  const done = new Set(s.topics_done ?? []);
  return SECTIONS.map((sec) => {
    const total = sec.topics.length;
    const d = sec.topics.filter((t) => done.has(t.id)).length;
    return { sec, done: d, total, complete: total > 0 && d === total };
  });
}

/* ------------------------------------------------------------------ */
/* Rozet aileleri (sınırsız seviyeli)                                   */
/* ------------------------------------------------------------------ */
type Family = {
  id: string;
  title: string;
  group: "Günlük takip" | "Çalışma" | "Konu, sınav ve kaynak";
  value: (s: GameStats) => number;
  /** İlk eşikler; sonrası `step` aralıklarla sınırsız devam eder */
  thresholds: number[];
  step: number;
  unit: string;
  /** "her 30 günde", "her 2.500 soruda" gibi */
  every: string;
  label: (n: number) => string;
  how: (n: number) => string;
};

export const FAMILIES: Family[] = [
  {
    id: "gunluk-seri",
    title: "Günlük serisi",
    group: "Günlük takip",
    value: (s) => Math.max(s.log_best ?? 0, s.log_streak ?? 0),
    thresholds: [3, 7, 14, 21, 30],
    step: 30,
    unit: "gün",
    every: "günde",
    label: (n) => `${fmt(n)} gün`,
    how: (n) =>
      `Günlük takip formunu ${fmt(n)} gün art arda doldur. Her gün doldurduğunda serine 1 gün eklenir. Bugünü gece 00.00'a kadar doldurman yeterli. Ara verirsen yeni serin 1'den başlar; en uzun serin her zaman kayıtlı kalır ve rozet ona göre verilir.`,
  },
  {
    id: "eksiksiz",
    title: "Eksiksiz günlük",
    group: "Günlük takip",
    value: (s) => s.complete_logs ?? 0,
    thresholds: [5, 15, 30, 60, 100],
    step: 50,
    unit: "günlük",
    every: "günlükte",
    label: (n) => `${fmt(n)} günlük`,
    how: (n) =>
      `Günlük takip formunda 7 alanın hepsini doldurduğun gün sayısı ${fmt(n)} olsun. 7 alan: uyku süresi, telefon süresi, kaygı, enerji, motivasyon, "erteledim mi?" ve "planımı değiştirdim mi?". Günlerin art arda olması gerekmez.`,
  },
  {
    id: "gunluk-toplam",
    title: "Günlük sadakati",
    group: "Günlük takip",
    value: (s) => s.logs,
    thresholds: [1, 10, 25, 50, 100],
    step: 50,
    unit: "gün",
    every: "günde",
    label: (n) => `${fmt(n)} gün`,
    how: (n) => (n === 1 ? "Günlük takip formunu ilk kez doldur." : `Günlük takip formunu toplam ${fmt(n)} gün doldur. Günlerin art arda olması gerekmez.`),
  },
  {
    id: "seri",
    title: "Çalışma serisi",
    group: "Çalışma",
    value: (s) => Math.max(s.best, s.streak),
    thresholds: [3, 7, 14, 30],
    step: 30,
    unit: "gün",
    every: "günde",
    label: (n) => `${fmt(n)} gün`,
    how: (n) =>
      `${fmt(n)} gün art arda çalış. Bir gün, o gün günlük takip formunu doldurduğunda YA DA programındaki en az bir görevi "tamamlandı" olarak işaretlediğinde serine eklenir. Ara verirsen yeni serin 1'den başlar; en uzun serin her zaman kayıtlı kalır ve rozet ona göre verilir.`,
  },
  {
    id: "aylik",
    title: "Aylık hedef",
    group: "Çalışma",
    value: (s) => monthGoals(s).filter((g) => g.achieved).length,
    thresholds: [1, 3, 6, 9, 12],
    step: 3,
    unit: "ay",
    every: "ayda",
    label: (n) => `${fmt(n)} ay`,
    how: (n) =>
      `Aylık hedefine (soru ve aktif gün) ulaştığın ay sayısı ${fmt(n)} olsun. Ayların art arda olması gerekmez. Hedefine ulaştığın an rozet verilir, ayın bitmesini beklemen gerekmez.`,
  },
  {
    id: "soru",
    title: "Soru",
    group: "Çalışma",
    value: (s) => s.solved,
    thresholds: [100, 500, 1000, 2500, 5000],
    step: 2500,
    unit: "soru",
    every: "soruda",
    label: (n) => `${fmt(n)} soru`,
    how: (n) =>
      `Programındaki görevlerde toplam ${fmt(n)} soru çöz. Sayılması için görevin altındaki "Çözdüğüm" kutusuna çözdüğün soru sayısını yaz ve görevi "tamamlandı" olarak işaretle.`,
  },
  {
    id: "gorev",
    title: "Görev",
    group: "Çalışma",
    value: (s) => s.tasks_done,
    thresholds: [10, 50, 100, 250, 500],
    step: 250,
    unit: "görev",
    every: "görevde",
    label: (n) => `${fmt(n)} görev`,
    how: (n) => `Programındaki görevlerden toplam ${fmt(n)} tanesini "tamamlandı" olarak işaretle.`,
  },
  {
    id: "hafta",
    title: "Güçlü hafta",
    group: "Çalışma",
    value: (s) => s.good_weeks,
    thresholds: [1, 4, 8, 12],
    step: 4,
    unit: "hafta",
    every: "haftada",
    label: (n) => `${fmt(n)} hafta`,
    how: (n) =>
      `Haftalık programındaki görevlerin en az %80'ini (örneğin 10 görevden 8'ini) tamamladığın hafta sayısı ${fmt(n)} olsun. Bir hafta, programın son günü bittikten sonra sayılır.`,
  },
  {
    id: "konu",
    title: "Konu bitirme",
    group: "Konu, sınav ve kaynak",
    value: (s) => (s.topics_done ?? []).filter((id) => TOPIC_IDS.has(id)).length,
    thresholds: [1, 10, 25, 50, 100],
    step: 50,
    unit: "konu",
    every: "konuda",
    label: (n) => `${fmt(n)} konu`,
    how: (n) =>
      `Konular → Konu takibi bölümünde toplam ${fmt(n)} konuyu "Bitti" ya da "Tekrar edildi" olarak işaretle. Konular farklı derslerden olabilir.`,
  },
  {
    id: "deneme",
    title: "Deneme",
    group: "Konu, sınav ve kaynak",
    value: (s) => s.exams,
    thresholds: [1, 5, 10],
    step: 5,
    unit: "deneme",
    every: "denemede",
    label: (n) => `${fmt(n)} deneme`,
    how: (n) =>
      `Toplam ${fmt(n)} denemen sisteme girilmiş olsun. Danışmanın deneme karneni yüklediğinde sayılır. Netinin kaç olduğu önemli değildir, yalnızca deneme sayısı sayılır.`,
  },
  {
    id: "kitap",
    title: "Kitap bitirme",
    group: "Konu, sınav ve kaynak",
    value: (s) => s.books_done,
    thresholds: [1],
    step: 1,
    unit: "kitap",
    every: "kitapta",
    label: (n) => `${fmt(n)} kitap`,
    how: (n) => `Konular → Kaynaklar bölümünde toplam ${fmt(n)} kitabı "Bitti" olarak işaretle.`,
  },
];

/** "Hedefler: 3, 7, 14, 21, 30 gün, sonra her 30 günde bir yeni rozet. Sınır yok." */
export function scheduleText(f: Family) {
  const firsts = f.thresholds.map((t) => fmt(t)).join(", ");
  return `Hedefler: ${firsts} ${f.unit}, sonra her ${fmt(f.step)} ${f.every} bir yeni rozet. Sınır yok.`;
}

/** Bu değere kadar kazanılan eşikler + sıradaki eşik */
export function familyLevels(f: Family, v: number) {
  const earned: number[] = [];
  let i = 0;
  let t = f.thresholds[0];
  while (t <= v) {
    earned.push(t);
    i++;
    t = i < f.thresholds.length ? f.thresholds[i] : f.thresholds[f.thresholds.length - 1] + (i - f.thresholds.length + 1) * f.step;
    if (earned.length > 2000) break;
  }
  return { earned, next: t };
}

/** Seviyeye göre renk: 1-2 bronz, 3-4 gümüş, 5-7 altın, 8+ zümrüt. 5 = özel gün (mor) */
export type Tier = 1 | 2 | 3 | 4 | 5;
export const tierOf = (level: number): Tier => (level <= 2 ? 1 : level <= 4 ? 2 : level <= 7 ? 3 : 4);
const TIER_NAME: Record<Tier, string> = { 1: "Bronz", 2: "Gümüş", 3: "Altın", 4: "Zümrüt", 5: "Özel" };

export type EarnedBadge = { id: string; title: string; label: string; how: string; familyId: string; level: number; tier: Tier };

export function earnedBadges(s: GameStats): EarnedBadge[] {
  const fam = FAMILIES.flatMap((f) =>
    familyLevels(f, f.value(s)).earned.map((th, i) => ({
      id: `${f.id}-${th}`,
      title: f.title,
      label: f.label(th),
      how: f.how(th),
      familyId: f.id,
      level: i + 1,
      tier: tierOf(i + 1),
    })),
  );
  const months = monthGoals(s)
    .filter((g) => g.achieved)
    .map((g) => ({ id: `ay-${g.m}`, title: "Ay hedefi", label: monthName(g.m), how: `${monthName(g.m)} hedefine ulaştın: ${fmt(g.goalQ)} soru ve ${g.goalD} aktif gün.`, familyId: "ay", level: 1, tier: 3 as Tier }));
  const ozel = (s.special ?? []).flatMap((d) => {
    const g = ozelOf(d);
    return g ? [{ id: `ozel-${d}`, title: g.name, label: `${g.short} ${d.slice(0, 4)}`, how: OZEL_HOW, familyId: "ozel", level: 1, tier: 5 as Tier }] : [];
  });
  const ders = sectionProgress(s)
    .filter((x) => x.complete)
    .map((x) => ({ id: `ders-${x.sec.id}`, title: "Ders tamamlama", label: x.sec.title, how: `${x.sec.title} altındaki ${x.total} konunun hepsini bitirdin.`, familyId: "ders", level: 1, tier: 4 as Tier }));
  return [...fam, ...months, ...ozel, ...ders];
}

const tierCls: Record<Tier, string> = {
  1: "from-[#d9a066] to-[#a8693a]",
  2: "from-[#cfd6de] to-[#8d98a6]",
  3: "from-[#f2cf5b] to-[#c99a14]",
  4: "from-[#5fd3b5] to-[#0e7066]",
  5: "from-[#c49af0] to-[#6b3fb0]",
};

export function Medal({ tier, earned, size = 40, level }: { tier: Tier; earned: boolean; size?: number; level?: number }) {
  return (
    <span
      className={cx("relative flex shrink-0 items-center justify-center rounded-full", earned ? `bg-gradient-to-br ${tierCls[tier]} text-white shadow-sm` : "border border-dashed border-line bg-surface-2 text-faint")}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" width={size * 0.5} height={size * 0.5} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z" />
      </svg>
      {level != null && level > 1 && size >= 30 && (
        <span className="absolute -bottom-1 -right-1 rounded-full bg-fg px-1 text-[9px] font-bold leading-[14px] text-bg tabular">{level}</span>
      )}
    </span>
  );
}

export function Flame({ on, size = 28 }: { on: boolean; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className={on ? "text-warning" : "text-faint"}>
      <path
        fill="currentColor"
        d="M12 2c.5 3-1.5 4.7-3 6.4C7.5 10 6 11.8 6 14.5A6 6 0 0 0 12 20.5a6 6 0 0 0 6-6c0-2.3-1-3.9-2-5.2-.4 1.4-1.2 2.4-2.4 2.9.6-3.4-.4-7.2-1.6-10.2z"
        opacity={on ? 1 : 0.5}
      />
    </svg>
  );
}

const SEEN_KEY = (id: string) => `yks-rozet-gorulen-v3-${id}`;
const PARTY_KEY = (id: string) => `yks-kutlama-${id}`;

export function useGameStats(studentId: string) {
  const [stats, setStats] = useState<GameStats | null>(null);
  const [missing, setMissing] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    sb()
      .rpc("gamification", { p_student: studentId })
      .then(({ data, error }) => {
        if (error) return setMissing(true);
        setStats(data as GameStats);
      });
  }, [studentId, tick]);
  return { stats, missing, reload: () => setTick((t) => t + 1) };
}

/** En yakın sıradaki rozet (yüzde olarak) */
function closestNext(s: GameStats) {
  return FAMILIES.map((f) => {
    const v = f.value(s);
    const { earned, next } = familyLevels(f, v);
    const prev = earned.length ? earned[earned.length - 1] : 0;
    return { f, v, next, ratio: (v - prev) / Math.max(1, next - prev) };
  }).sort((a, b) => b.ratio - a.ratio)[0];
}

/* ------------------------------------------------------------------ */
/* Kilometre taşı kutlaması (yalnızca 7, 30, 100 gün)                    */
/* ------------------------------------------------------------------ */
export const MILESTONES = [7, 30, 100];
type Party = { kind: "seri" | "gunluk"; days: number };

function findParty(s: GameStats, studentId: string): { party: Party | null; keys: string[] } {
  const today = todayOf(s);
  const runs: { kind: Party["kind"]; v: number; end: string }[] = [
    { kind: "seri", v: s.streak, end: s.active_today ? today : addDays(today, -1) },
    { kind: "gunluk", v: s.log_streak ?? 0, end: s.log_today ? today : addDays(today, -1) },
  ];
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(PARTY_KEY(studentId));
  } catch {}
  const seen: string[] = raw ? JSON.parse(raw) : [];
  const keys: string[] = [];
  let party: Party | null = null;
  for (const r of runs) {
    const start = addDays(r.end, -(r.v - 1));
    for (const m of MILESTONES) {
      if (r.v < m) continue;
      const key = `${r.kind}-${m}-${start}`;
      keys.push(key);
      if (seen.includes(key)) continue;
      // İlk açılışta eski kilometre taşlarını kutlama; yalnızca yeni ulaşılanı kutla
      if (!raw && r.v !== m) continue;
      if (!party || m > party.days) party = { kind: r.kind, days: m };
    }
  }
  return { party, keys: [...new Set([...seen, ...keys])].slice(-200) };
}

function Celebration({ party, onClose }: { party: Party; onClose: () => void }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 48 }, (_, i) => ({
        left: (i * 37) % 100,
        delay: (i % 12) * 0.12,
        dur: 2.4 + ((i * 7) % 10) / 10,
        color: ["#f2cf5b", "#5fd3b5", "#c49af0", "#f08a7a", "#7aa9f0"][i % 5],
        rot: (i * 53) % 360,
      })),
    [],
  );
  const text =
    party.kind === "seri"
      ? `${party.days} gün art arda çalıştın. Her gün attığın küçük adımlar burada birikti.`
      : `Günlük takibini ${party.days} gün art arda doldurdun. Kendini bu kadar düzenli izlemek çok değerli.`;
  return portal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal aria-label="Kilometre taşı" onClick={onClose}>
      <style>{`
        @keyframes yks-konfeti { 0% { transform: translateY(-10vh) rotate(0deg); opacity: 1 } 100% { transform: translateY(105vh) rotate(720deg); opacity: .9 } }
        @keyframes yks-pop { 0% { transform: scale(.6); opacity: 0 } 60% { transform: scale(1.06); opacity: 1 } 100% { transform: scale(1) } }
        @media (prefers-reduced-motion: reduce) { .yks-konfeti { display: none } .yks-pop { animation: none !important } }
      `}</style>
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        {pieces.map((p, i) => (
          <span
            key={i}
            className="yks-konfeti absolute top-0 block h-3 w-2 rounded-[2px]"
            style={{ left: `${p.left}%`, background: p.color, transform: `rotate(${p.rot}deg)`, animation: `yks-konfeti ${p.dur}s ${p.delay}s ease-in forwards` }}
          />
        ))}
      </div>
      <div className="yks-pop relative w-full max-w-sm rounded-2xl bg-surface p-6 text-center shadow-xl" style={{ animation: "yks-pop .5s ease-out" }} onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-2 flex h-20 w-20 items-center justify-center rounded-full bg-warning/15">
          <Flame on size={52} />
        </div>
        <p className="text-xs font-bold uppercase tracking-wide text-muted">Kilometre taşı</p>
        <p className="display mt-1 text-4xl tabular">{party.days} gün!</p>
        <p className="mt-1 text-sm font-semibold">{party.kind === "seri" ? "Çalışma serisi" : "Günlük serisi"}</p>
        <p className="mt-3 text-sm text-muted">{text}</p>
        <p className="mt-2 text-xs text-faint">Sıradaki kilometre taşı: {MILESTONES.find((m) => m > party.days) ? `${MILESTONES.find((m) => m > party.days)} gün` : "her yeni gün bir kazanç"}</p>
        <Button className="mt-5 w-full" onClick={onClose}>
          Devam et
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Öğrenci "Bugün" kartı                                                */
/* ------------------------------------------------------------------ */
export function StreakCard({ studentId }: { studentId: string }) {
  const toast = useToast();
  const { stats, missing } = useGameStats(studentId);
  const [open, setOpen] = useState(false);
  const [party, setParty] = useState<Party | null>(null);

  // Kilometre taşında büyük kutlama; diğer yeni rozetler için kısa bildirim
  useEffect(() => {
    if (!stats) return;
    try {
      const { party: p, keys } = findParty(stats, studentId);
      localStorage.setItem(PARTY_KEY(studentId), JSON.stringify(keys));
      if (p) setParty(p);
      const earned = earnedBadges(stats);
      const raw = localStorage.getItem(SEEN_KEY(studentId));
      const seen: string[] = raw ? JSON.parse(raw) : [];
      let fresh = earned.filter((b) => !seen.includes(b.id));
      if (p) fresh = fresh.filter((b) => b.familyId !== "seri" && b.familyId !== "gunluk-seri");
      if (raw && fresh.length) {
        const b = fresh[fresh.length - 1];
        toast.show(`Yeni rozet: ${b.title} · ${b.label}${fresh.length > 1 ? ` (+${fresh.length - 1})` : ""}`);
      }
      localStorage.setItem(SEEN_KEY(studentId), JSON.stringify(earned.map((b) => b.id)));
    } catch {}
  }, [stats, studentId, toast]);

  if (missing || !stats) return null;
  const today = todayOf(stats);
  const pct = stats.week_total ? Math.round((stats.week_done / stats.week_total) * 100) : null;
  const earned = earnedBadges(stats);
  const next = closestNext(stats);
  const goal = monthGoals(stats).find((g) => g.m === today.slice(0, 7));
  const ozelToday = ozelOf(today);
  const ozelEarnedToday = (stats.special ?? []).includes(today);
  const logStreak = stats.log_streak ?? 0;

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="flex items-center gap-2">
          <Flame on={stats.streak > 0} />
          <div>
            <p className="display text-2xl leading-none tabular">{stats.streak} gün</p>
            <p className="text-xs text-muted">
              {stats.active_today
                ? "çalışma serin · bugün eklendi ✓"
                : stats.streak
                  ? `bugün 1 görevle serin ${stats.streak + 1} gün olsun`
                  : "bugün 1 görevle serini başlat"}
            </p>
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold tabular">{logStreak} gün</p>
          <p className="text-xs text-muted">{stats.log_today ? "günlük serin · bugün eklendi ✓" : `günlüğü doldur, serin ${logStreak + 1} gün olsun`}</p>
        </div>
        {pct != null && (
          <div className="flex items-center gap-2">
            <Ring value={pct} />
            <div>
              <p className="text-sm font-semibold tabular">
                {stats.week_done}/{stats.week_total} görev
              </p>
              <p className="text-xs text-muted">
                {pct >= 80 ? "haftalık hedefe ulaştın" : `%80 hedefine ${Math.max(0, Math.ceil(stats.week_total * 0.8) - stats.week_done)} görev daha`}
              </p>
            </div>
          </div>
        )}
        <button type="button" onClick={() => setOpen(true)} className="ml-auto flex items-center rounded-xl px-1 py-0.5 hover:bg-surface-2" aria-label="Rozetlerim">
          <span className="flex -space-x-2">
            {topBadges(earned, 4).map((b) => (
              <Medal key={b.id} tier={b.tier} earned size={30} />
            ))}
          </span>
          <span className="pl-2 text-xs font-medium text-primary">{earned.length} rozet →</span>
        </button>
      </div>

      {goal && (
        <button type="button" onClick={() => setOpen(true)} className="mt-3 block w-full rounded-xl bg-surface-2 px-3 py-2 text-left">
          <p className="flex items-baseline justify-between gap-2 text-xs">
            <span className="font-semibold text-fg">{AYLAR[Number(goal.m.slice(5, 7)) - 1]} hedefin</span>
            <span className={cx("text-[11px]", goal.achieved ? "font-semibold text-success" : "text-muted")}>{goal.achieved ? "ulaştın ✓" : "ay sonuna kadar"}</span>
          </p>
          <GoalBar label="Soru" v={goal.q} goal={goal.goalQ} />
          <GoalBar label="Aktif gün" v={goal.d} goal={goal.goalD} />
        </button>
      )}

      {ozelToday && (
        <p className="mt-3 rounded-xl border border-[#c49af0]/50 bg-[#c49af0]/10 px-3 py-2 text-xs">
          <b className="font-semibold">Bugün {ozelToday.name}.</b>{" "}
          {ozelEarnedToday ? "Bugünün özel rozetini kazandın ✓" : "Bugün 1 görev tamamla ya da günlüğünü doldur, bu güne özel rozeti kazan."}
        </p>
      )}

      <p className="mt-3 border-t border-line pt-2 text-xs text-muted">
        {stats.streak_top != null && stats.streak_top <= 50 && <span className="mr-3">Serinle öğrencilerin ilk %{stats.streak_top}&apos;indesin.</span>}
        {stats.week_top != null && stats.week_top <= 50 && <span className="mr-3">Bu hafta çözdüğün soruyla ilk %{stats.week_top}&apos;tesin.</span>}
        {next && (
          <span>
            Sıradaki rozet: <b className="font-medium text-fg">{next.f.title} · {next.f.label(next.next)}</b> — {next.f.how(next.next)} ({fmt(next.v)}/{fmt(next.next)})
          </span>
        )}
      </p>
      {open && (
        <Modal open onClose={() => setOpen(false)} title="Rozetlerim">
          <BadgeBook stats={stats} />
        </Modal>
      )}
      {party && <Celebration party={party} onClose={() => setParty(null)} />}
    </Card>
  );
}

function GoalBar({ label, v, goal }: { label: string; v: number; goal: number }) {
  const r = Math.max(0, Math.min(1, v / Math.max(1, goal)));
  return (
    <span className="mt-1.5 flex items-center gap-2 text-[11px]">
      <span className="w-16 shrink-0 text-muted">{label}</span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line/60">
        <span className={cx("bar-grow block h-full rounded-full", r >= 1 ? "bg-success" : "bg-primary")} style={{ width: `${Math.round(r * 100)}%` }} />
      </span>
      <span className="w-20 shrink-0 text-right text-muted tabular">
        {fmt(v)}/{fmt(goal)}
      </span>
    </span>
  );
}

function topBadges(earned: EarnedBadge[], n: number) {
  // Her türden en yüksek seviye; en yüksek renkten başlayarak
  const best = new Map<string, EarnedBadge>();
  for (const b of earned) best.set(b.familyId, b);
  return [...best.values()].sort((a, b) => b.tier - a.tier || b.level - a.level).slice(0, n);
}

function Ring({ value }: { value: number }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  return (
    <svg width="38" height="38" viewBox="0 0 38 38" aria-hidden>
      <circle cx="19" cy="19" r={r} fill="none" strokeWidth="4" style={{ stroke: "var(--surface-2)" }} />
      <circle
        cx="19"
        cy="19"
        r={r}
        fill="none"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={`${(Math.min(100, value) / 100) * c} ${c}`}
        transform="rotate(-90 19 19)"
        style={{ stroke: value >= 80 ? "var(--success)" : "var(--primary)" }}
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Rozet defteri                                                        */
/* ------------------------------------------------------------------ */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">{children}</p>;
}

function MonthGoalBox({ stats }: { stats: GameStats }) {
  const today = todayOf(stats);
  const goals = monthGoals(stats);
  const cur = goals.find((g) => g.m === today.slice(0, 7))!;
  const past = goals.filter((g) => g.m !== cur.m && g.achieved).reverse();
  const left = daysInMonth(cur.m) - Number(today.slice(8, 10)) + 1;
  return (
    <div>
      <SectionTitle>Bu ayın hedefi</SectionTitle>
      <div className="rounded-xl border border-line p-3">
        <p className="flex flex-wrap items-baseline justify-between gap-2 text-sm font-semibold">
          {monthName(cur.m)}
          <span className={cx("text-xs font-normal", cur.achieved ? "font-semibold text-success" : "text-muted")}>
            {cur.achieved ? "Hedefe ulaştın, ay rozeti senin ✓" : `Ayın bitmesine ${left} gün var`}
          </span>
        </p>
        <GoalBar label="Soru" v={cur.q} goal={cur.goalQ} />
        <GoalBar label="Aktif gün" v={cur.d} goal={cur.goalD} />
        <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted">
          <li>
            Bu ay <b className="font-medium text-fg">{fmt(cur.goalQ)} soru</b> çöz VE <b className="font-medium text-fg">{cur.goalD} gün</b> aktif ol. İkisine birden ulaştığında &quot;{monthName(cur.m)}&quot; ay rozetini kazanırsın.
          </li>
          <li>Soru: programındaki görevlerde &quot;Çözdüğüm&quot; kutusuna yazıp &quot;tamamlandı&quot; işaretlediğin sorular sayılır.</li>
          <li>Aktif gün: günlük takip formunu doldurduğun YA DA en az bir görevi tamamladığın gün.</li>
          <li>
            Soru hedefi: {cur.srcQ === "danisman" ? "danışmanın belirledi." : GOAL_RULE_Q} Aktif gün hedefi: {cur.srcD === "danisman" ? "danışmanın belirledi." : GOAL_RULE_D}
          </li>
        </ul>
        {past.length > 0 && (
          <div className="mt-3 border-t border-line pt-2">
            <p className="mb-1.5 text-xs text-muted">Ulaştığın ay hedefleri ({past.length + (cur.achieved ? 1 : 0)}):</p>
            <ul className="flex flex-wrap gap-2">
              {(cur.achieved ? [cur, ...past] : past).map((g) => (
                <li key={g.m} className="flex items-center gap-1.5 rounded-full border border-line py-0.5 pl-0.5 pr-2.5 text-xs" title={`${fmt(g.goalQ)} soru · ${g.goalD} aktif gün`}>
                  <Medal tier={3} earned size={22} />
                  {monthName(g.m)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function SpecialDaysBox({ stats }: { stats: GameStats }) {
  const today = todayOf(stats);
  const nx = nextSpecial(today);
  const inDays = daysBetween(today, nx.date);
  const got = [...(stats.special ?? [])].reverse();
  return (
    <div>
      <SectionTitle>Özel gün rozetleri</SectionTitle>
      <div className="rounded-xl border border-line p-3">
        <div className="flex items-start gap-3">
          <Medal tier={5} earned={got.length > 0} size={38} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              {nx.name}
              <span className="ml-2 text-xs font-normal text-muted">{inDays === 0 ? "bugün!" : `${inDays} gün sonra (${nx.short})`}</span>
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">{OZEL_HOW}</p>
            <p className="mt-1 text-[11px] text-faint">Özel günler: {OZEL_GUNLER.map((g) => g.short).join(", ")}.</p>
          </div>
        </div>
        {got.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
            {got.map((d) => (
              <li key={d} className="flex items-center gap-1.5 rounded-full border border-line py-0.5 pl-0.5 pr-2.5 text-xs" title={ozelOf(d)?.name}>
                <Medal tier={5} earned size={22} />
                {ozelOf(d)?.short} {d.slice(0, 4)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function SectionsBox({ stats }: { stats: GameStats }) {
  const [all, setAll] = useState(false);
  const rows = sectionProgress(stats).sort((a, b) => Number(b.complete) - Number(a.complete) || b.done / b.total - a.done / a.total);
  const shown = all ? rows : rows.slice(0, 5);
  return (
    <div>
      <SectionTitle>Ders tamamlama</SectionTitle>
      <div className="rounded-xl border border-line p-3">
        <p className="mb-2 text-xs leading-relaxed text-muted">
          Bir dersin (ör. TYT Türkçe) Konu takibindeki konularının hepsini &quot;Bitti&quot; ya da &quot;Tekrar edildi&quot; olarak işaretlediğinde o dersin rozetini kazanırsın. Toplam {rows.length} ders rozeti var; her dersin rozeti bir kez verilir.
        </p>
        <ul className="space-y-2">
          {shown.map((x) => (
            <li key={x.sec.id} className="flex items-center gap-2.5">
              <Medal tier={4} earned={x.complete} size={26} />
              <span className="min-w-0 flex-1 text-xs">
                <span className={cx("block truncate", x.complete ? "font-semibold" : "text-fg")}>{x.sec.title}</span>
                <span className="mt-1 block h-1 overflow-hidden rounded-full bg-surface-2">
                  <span className={cx("bar-grow block h-full rounded-full", x.complete ? "bg-success" : "bg-primary")} style={{ width: `${Math.round((x.done / Math.max(1, x.total)) * 100)}%` }} />
                </span>
              </span>
              <span className="w-14 shrink-0 text-right text-[11px] text-muted tabular">
                {x.done}/{x.total}
              </span>
            </li>
          ))}
        </ul>
        {rows.length > 5 && (
          <button type="button" className="mt-2 text-xs font-medium text-primary" onClick={() => setAll(!all)}>
            {all ? "Daha az göster" : `Tüm dersleri göster (${rows.length})`}
          </button>
        )}
      </div>
    </div>
  );
}

function BadgeBook({ stats }: { stats: GameStats }) {
  const [openFam, setOpenFam] = useState<string | null>(null);
  const groups = useMemo(() => {
    const m = new Map<string, Family[]>();
    for (const f of FAMILIES) m.set(f.group, [...(m.get(f.group) ?? []), f]);
    return [...m.entries()];
  }, []);
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-surface-2 p-3 text-xs text-muted">
        <p className="mb-1 font-semibold text-fg">Rozetler nasıl kazanılır?</p>
        <ul className="list-disc space-y-1 pl-4">
          <li>
            {FAMILIES.length} seviyeli rozet türü var. Her türde bir hedefe ulaştığında o rozeti alırsın ve bir sonraki hedef açılır. Hedeflerin sonu yoktur. Örnek: Soru rozetlerini 100, 500, 1.000, 2.500 ve 5.000 soruda alırsın; sonra her 2.500 soruda bir yeni rozet gelir (7.500, 10.000, 12.500…).
          </li>
          <li>Bunlara ek olarak her ay ulaştığın aylık hedef için bir ay rozeti, özel günlerde çalıştığın her gün için bir özel gün rozeti ve bitirdiğin her ders için bir ders rozeti kazanırsın.</li>
          <li>Rozet durumun uygulamayı her açtığında güncellenir. Gün, Türkiye saatiyle gece 00.00&apos;da değişir.</li>
          <li>Seri rozetleri en uzun serine göre verilir; ara versen bile kazandığın seri rozetleri sende kalır.</li>
          <li>Renk, o türde kaçıncı rozette olduğunu gösterir: 1–2. rozet bronz, 3–4. gümüş, 5–7. altın, 8. ve sonrası zümrüt. Ay rozetleri altın, ders rozetleri zümrüt, özel gün rozetleri mordur.</li>
          <li>7, 30 ve 100 günlük serilerde büyük bir kutlama ekranı açılır.</li>
          <li>Rozetler yalnızca senin kendi çalışmana göre verilir; başka öğrencilerle yarışmazsın.</li>
        </ul>
      </div>

      <MonthGoalBox stats={stats} />

      {groups.map(([g, fams]) => (
        <div key={g}>
          <SectionTitle>{g}</SectionTitle>
          <ul className="space-y-2">
            {fams.map((f) => {
              const v = f.value(stats);
              const { earned, next } = familyLevels(f, v);
              const prev = earned.length ? earned[earned.length - 1] : 0;
              const ratio = Math.max(0, Math.min(1, (v - prev) / Math.max(1, next - prev)));
              const lvl = earned.length;
              const isOpen = openFam === f.id;
              return (
                <li key={f.id} className="rounded-xl border border-line p-3">
                  <button type="button" className="flex w-full items-start gap-3 text-left" onClick={() => setOpenFam(isOpen ? null : f.id)} aria-expanded={isOpen}>
                    <Medal tier={tierOf(Math.max(1, lvl))} earned={lvl > 0} size={38} level={lvl || undefined} />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold">
                        {f.title}
                        <span className="text-xs font-normal text-muted">{lvl ? `${lvl} rozet · ${TIER_NAME[tierOf(lvl)]}` : "henüz yok"}</span>
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted">
                        <span className="font-medium text-fg">Sıradaki rozet ({f.label(next)}):</span> {f.how(next)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-faint">{scheduleText(f)}</p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                          <span className="bar-grow block h-full rounded-full bg-primary" style={{ width: `${Math.round(ratio * 100)}%` }} />
                        </span>
                        <span className="text-[11px] text-muted tabular">
                          {fmt(v)}/{fmt(next)}
                        </span>
                      </div>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="mt-3 border-t border-line pt-3">
                      <p className="mb-2 text-xs text-muted">Kazandığın {f.title.toLocaleLowerCase("tr-TR")} rozetleri ({earned.length}):</p>
                      {earned.length ? (
                        <ul className="flex flex-wrap gap-2">
                          {earned.map((th, i) => (
                            <li key={th} className="flex items-center gap-1.5 rounded-full border border-line py-0.5 pl-0.5 pr-2.5 text-xs" title={f.how(th)}>
                              <Medal tier={tierOf(i + 1)} earned size={22} />
                              {f.label(th)}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-muted">Bu türde henüz rozetin yok.</p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <SectionsBox stats={stats} />
      <SpecialDaysBox stats={stats} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Danışman: aylık hedefi elle belirleme                                 */
/* ------------------------------------------------------------------ */
function MonthGoalEditor({ studentId, stats, onSaved }: { studentId: string; stats: GameStats; onSaved: () => void }) {
  const toast = useToast();
  const today = todayOf(stats);
  const goals = monthGoals(stats);
  const cur = goals.find((g) => g.m === today.slice(0, 7))!;
  const auto = autoGoal(cur.m, (stats.months ?? []).find((x) => x.m === prevMonth(cur.m)));
  const [q, setQ] = useState(cur.srcQ === "danisman" ? String(cur.goalQ) : "");
  const [d, setD] = useState(cur.srcD === "danisman" ? String(cur.goalD) : "");
  const [busy, setBusy] = useState(false);

  async function save(reset = false) {
    const qn = reset || !q.trim() ? null : Math.round(Number(q));
    const dn = reset || !d.trim() ? null : Math.round(Number(d));
    if ((qn != null && !(qn >= 0 && qn <= 100000)) || (dn != null && !(dn >= 1 && dn <= daysInMonth(cur.m)))) {
      return toast.show(`Soru 0–100.000, aktif gün 1–${daysInMonth(cur.m)} arasında olmalı`, "danger");
    }
    setBusy(true);
    const month = `${cur.m}-01`;
    const res =
      qn == null && dn == null
        ? await sb().from("monthly_goals").delete().eq("student_id", studentId).eq("month", month)
        : await sb().from("monthly_goals").upsert({ student_id: studentId, month, questions: qn, active_days: dn, updated_at: new Date().toISOString() }, { onConflict: "student_id,month" });
    setBusy(false);
    if (res.error) return toast.show("Kaydedilemedi: guncelleme-hepsi.sql çalıştırıldı mı?", "danger");
    if (reset) {
      setQ("");
      setD("");
    }
    toast.show(qn == null && dn == null ? "Otomatik hedefe dönüldü" : "Aylık hedef kaydedildi");
    onSaved();
  }

  return (
    <div className="mb-4 rounded-xl border border-line p-3">
      <p className="text-sm font-semibold">{monthName(cur.m)} hedefi</p>
      <p className="mt-0.5 text-xs text-muted">
        Boş bırakılan alan otomatik hesaplanır (bu ay: {fmt(auto.q)} soru, {auto.d} aktif gün). Şu an: {fmt(cur.q)} soru, {cur.d} aktif gün.
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="text-xs text-muted">
          Soru hedefi
          <input className="field mt-1 h-9 w-28 text-sm" inputMode="numeric" placeholder={String(auto.q)} value={q} onChange={(e) => setQ(e.target.value.replace(/\D/g, ""))} />
        </label>
        <label className="text-xs text-muted">
          Aktif gün
          <input className="field mt-1 h-9 w-24 text-sm" inputMode="numeric" placeholder={String(auto.d)} value={d} onChange={(e) => setD(e.target.value.replace(/\D/g, ""))} />
        </label>
        <Button size="sm" loading={busy} onClick={() => save(false)}>
          Kaydet
        </Button>
        {(cur.srcQ === "danisman" || cur.srcD === "danisman") && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => save(true)}>
            Otomatiğe dön
          </Button>
        )}
      </div>
    </div>
  );
}

/** İlerleme ekranı / danışman özeti: rozet defteri kartı */
export function BadgesCard({ studentId }: { studentId: string }) {
  const { profile } = useAuth();
  const { stats, missing, reload } = useGameStats(studentId);
  if (missing || !stats) return null;
  const isCounselor = profile?.role === "counselor";
  const earned = earnedBadges(stats);
  return (
    <Card
      title={isCounselor ? "Seri, hedef ve rozetler" : "Rozetlerim"}
      subtitle={`${stats.streak} gün çalışma serisi · ${stats.log_streak ?? 0} gün günlük serisi · toplam ${earned.length} rozet`}
    >
      {isCounselor && stats.n >= 10 && (
        <p className="mb-3 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
          Anonim sıralama ({stats.n} aktif öğrenci): seride {stats.streak_top != null ? `ilk %${stats.streak_top}` : "seri yok"} · bu haftaki soruda {stats.week_top != null ? `ilk %${stats.week_top}` : "henüz soru yok"}. Öğrenci yalnızca ilk %50&apos;deyse görür.
        </p>
      )}
      {isCounselor && stats.months && <MonthGoalEditor studentId={studentId} stats={stats} onSaved={reload} />}
      <BadgeBook stats={stats} />
    </Card>
  );
}

/** Öğrenci listesindeki kart için kısa şerit: seri + kazanılan rozetler */
export function BadgeStrip({ stats }: { stats: GameStats }) {
  const earned = earnedBadges(stats);
  const top = topBadges(earned, 5);
  const goal = stats.months ? monthGoals(stats).find((g) => g.m === todayOf(stats).slice(0, 7)) : undefined;
  return (
    <div className="flex items-center gap-2">
      <span className="flex items-center gap-0.5" title={`En uzun çalışma serisi: ${stats.best} gün · günlük serisi: ${stats.log_streak ?? 0} gün`}>
        <span className="-ml-1 scale-75">
          <Flame on={stats.streak > 0} />
        </span>
        <span className={cx("text-sm font-semibold tabular", !stats.streak && "text-faint")}>{stats.streak}</span>
        <span className="text-[11px] text-muted">gün seri</span>
      </span>
      {goal && (
        <span className={cx("text-[11px] tabular", goal.achieved ? "font-semibold text-success" : "text-muted")} title={`Bu ay: ${fmt(goal.q)}/${fmt(goal.goalQ)} soru · ${goal.d}/${goal.goalD} aktif gün`}>
          · ay hedefi %{Math.min(100, Math.round(((Math.min(1, goal.q / Math.max(1, goal.goalQ)) + Math.min(1, goal.d / Math.max(1, goal.goalD))) / 2) * 100))}
        </span>
      )}
      <span className="ml-auto flex items-center">
        {earned.length ? (
          <>
            <span className="flex -space-x-1.5">
              {top.map((b) => (
                <span key={b.id} title={`${b.title} · ${b.label}${b.level > 1 ? ` (${b.level}. seviye)` : ""}`}>
                  <Medal tier={b.tier} earned size={22} />
                </span>
              ))}
            </span>
            <span className="ml-1.5 text-[11px] text-muted tabular">{earned.length} rozet</span>
          </>
        ) : (
          <span className="text-[11px] text-faint">henüz rozet yok</span>
        )}
      </span>
    </div>
  );
}

export async function fetchStudentsGame(): Promise<Map<string, GameStats>> {
  const { data, error } = await sb().rpc("students_gamification");
  if (error) return new Map();
  return new Map(
    ((data ?? []) as ({ student_id: string; data?: Omit<GameStats, "n" | "streak_top" | "week_top"> } & Partial<GameStats>)[]).map((r) => {
      // guncelleme-14: { student_id, data }; eski sürüm: düz sütunlar
      const g = (r.data ?? r) as GameStats;
      return [r.student_id, { ...g, best: Math.max(g.best, g.streak), n: 0, streak_top: null, week_top: null }];
    }),
  );
}
