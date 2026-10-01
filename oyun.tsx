"use client";
// Seri, rozetler ve haftalık hedef. Rozetler sınırsızdır: her rozet ailesinin seviyeleri sonsuza kadar devam eder
// (ör. her 30 günlük seri, her 2.500 soru yeni bir rozet). Koşullar öğrenciye açıkça gösterilir.
// Kıyas kişiseldir; anonim sıralama yalnızca olumlu çerçevede (ilk %50'deyse) ve en az 10 aktif öğrenci varken gösterilir.

import { useEffect, useMemo, useState } from "react";
import { sb, useAuth } from "./db";
import { fmtNum } from "./lib";
import { Card, Modal, cx, useToast } from "./ui";

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
  n: number;
  streak_top: number | null;
  week_top: number | null;
};

/* ------------------------------------------------------------------ */
/* Rozet aileleri                                                       */
/* ------------------------------------------------------------------ */
type Family = {
  id: string;
  title: string;
  group: "Günlük takip" | "Çalışma" | "Sınav ve kaynak";
  value: (s: GameStats) => number;
  /** İlk eşikler; sonrası `step` aralıklarla sınırsız devam eder */
  thresholds: number[];
  step: number;
  label: (n: number) => string;
  how: (n: number) => string;
};

const fmt = (n: number) => fmtNum(n, 0);

export const FAMILIES: Family[] = [
  {
    id: "gunluk-seri",
    title: "Günlük serisi",
    group: "Günlük takip",
    value: (s) => Math.max(s.log_best ?? 0, s.log_streak ?? 0),
    thresholds: [3, 7, 14, 21, 30],
    step: 30,
    label: (n) => `${fmt(n)} gün`,
    how: (n) =>
      `Günlük takip formunu ${fmt(n)} gün üst üste doldur. Arada bir gün boş kalırsa sayaç sıfırdan başlar. Bugünü henüz doldurmadıysan serin dünden devam eder; gece 00.00'a kadar doldurman yeterli.`,
  },
  {
    id: "eksiksiz",
    title: "Eksiksiz günlük",
    group: "Günlük takip",
    value: (s) => s.complete_logs ?? 0,
    thresholds: [5, 15, 30, 60, 100],
    step: 50,
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
    label: (n) => `${fmt(n)} gün`,
    how: (n) =>
      `${fmt(n)} gün üst üste çalış. Bir günün sayılması için o gün günlük takip formunu doldurman YA DA programındaki en az bir görevi "tamamlandı" olarak işaretlemen yeterli. Arada bir gün ikisini de yapmazsan sayaç sıfırdan başlar.`,
  },
  {
    id: "soru",
    title: "Soru",
    group: "Çalışma",
    value: (s) => s.solved,
    thresholds: [100, 500, 1000, 2500, 5000],
    step: 2500,
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
    label: (n) => `${fmt(n)} hafta`,
    how: (n) =>
      `Haftalık programındaki görevlerin en az %80'ini (örneğin 10 görevden 8'ini) tamamladığın hafta sayısı ${fmt(n)} olsun. Bir hafta, programın son günü bittikten sonra sayılır.`,
  },
  {
    id: "deneme",
    title: "Deneme",
    group: "Sınav ve kaynak",
    value: (s) => s.exams,
    thresholds: [1, 5, 10],
    step: 5,
    label: (n) => `${fmt(n)} deneme`,
    how: (n) =>
      `Toplam ${fmt(n)} denemen sisteme girilmiş olsun. Danışmanın deneme karneni yüklediğinde sayılır. Netinin kaç olduğu önemli değildir, yalnızca deneme sayısı sayılır.`,
  },
  {
    id: "kitap",
    title: "Kitap bitirme",
    group: "Sınav ve kaynak",
    value: (s) => s.books_done,
    thresholds: [1],
    step: 1,
    label: (n) => `${fmt(n)} kitap`,
    how: (n) => `Konular → Kaynaklar bölümünde toplam ${fmt(n)} kitabı "Bitti" olarak işaretle.`,
  },
];

/** "Hedefler: 3, 7, 14, 21, 30 gün, sonra her 30 günde bir" */
export function scheduleText(f: Family) {
  const unit = f.label(2).replace(/^[\d.]+\s*/, "");
  const firsts = f.thresholds.map((t) => fmt(t)).join(", ");
  return `Hedefler: ${firsts} ${unit}, sonra her ${fmt(f.step)} ${unit === "kayıt" ? "kayıtta" : unit === "gün" ? "günde" : unit === "hafta" ? "haftada" : unit === "soru" ? "soruda" : unit === "görev" ? "görevde" : unit === "deneme" ? "denemede" : unit === "kitap" ? "kitapta" : unit === "günlük" ? "günlükte" : unit} bir yeni rozet. Sınır yok.`;
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

/** Seviyeye göre renk: 1-2 bronz, 3-4 gümüş, 5-7 altın, 8+ zümrüt */
export type Tier = 1 | 2 | 3 | 4;
export const tierOf = (level: number): Tier => (level <= 2 ? 1 : level <= 4 ? 2 : level <= 7 ? 3 : 4);
const TIER_NAME: Record<Tier, string> = { 1: "Bronz", 2: "Gümüş", 3: "Altın", 4: "Zümrüt" };

export type EarnedBadge = { id: string; family: Family; level: number; threshold: number; tier: Tier };

export function earnedBadges(s: GameStats): EarnedBadge[] {
  return FAMILIES.flatMap((f) => familyLevels(f, f.value(s)).earned.map((th, i) => ({ id: `${f.id}-${th}`, family: f, level: i + 1, threshold: th, tier: tierOf(i + 1) })));
}

const tierCls: Record<Tier, string> = {
  1: "from-[#d9a066] to-[#a8693a]",
  2: "from-[#cfd6de] to-[#8d98a6]",
  3: "from-[#f2cf5b] to-[#c99a14]",
  4: "from-[#5fd3b5] to-[#0e7066]",
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

export function Flame({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden className={on ? "text-warning" : "text-faint"}>
      <path
        fill="currentColor"
        d="M12 2c.5 3-1.5 4.7-3 6.4C7.5 10 6 11.8 6 14.5A6 6 0 0 0 12 20.5a6 6 0 0 0 6-6c0-2.3-1-3.9-2-5.2-.4 1.4-1.2 2.4-2.4 2.9.6-3.4-.4-7.2-1.6-10.2z"
        opacity={on ? 1 : 0.5}
      />
    </svg>
  );
}

const SEEN_KEY = (id: string) => `yks-rozet-gorulen-v2-${id}`;

export function useGameStats(studentId: string) {
  const [stats, setStats] = useState<GameStats | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    sb()
      .rpc("gamification", { p_student: studentId })
      .then(({ data, error }) => {
        if (error) return setMissing(true);
        setStats(data as GameStats);
      });
  }, [studentId]);
  return { stats, missing };
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
/* Öğrenci "Bugün" kartı                                                */
/* ------------------------------------------------------------------ */
export function StreakCard({ studentId }: { studentId: string }) {
  const toast = useToast();
  const { stats, missing } = useGameStats(studentId);
  const [open, setOpen] = useState(false);

  // Yeni kazanılan rozetler için bir kez tebrik
  useEffect(() => {
    if (!stats) return;
    try {
      const earned = earnedBadges(stats);
      const raw = localStorage.getItem(SEEN_KEY(studentId));
      const seen: string[] = raw ? JSON.parse(raw) : [];
      const fresh = earned.filter((b) => !seen.includes(b.id));
      if (raw && fresh.length) {
        const b = fresh[fresh.length - 1];
        toast.show(`Yeni rozet: ${b.family.title} · ${b.family.label(b.threshold)}${fresh.length > 1 ? ` (+${fresh.length - 1})` : ""}`);
      }
      localStorage.setItem(SEEN_KEY(studentId), JSON.stringify(earned.map((b) => b.id)));
    } catch {}
  }, [stats, studentId, toast]);

  if (missing || !stats) return null;
  const pct = stats.week_total ? Math.round((stats.week_done / stats.week_total) * 100) : null;
  const earned = earnedBadges(stats);
  const next = closestNext(stats);

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="flex items-center gap-2">
          <Flame on={stats.streak > 0} />
          <div>
            <p className="display text-2xl leading-none tabular">{stats.streak} gün</p>
            <p className="text-xs text-muted">{stats.streak ? "çalışma serin" : "bugün başlat"}</p>
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold tabular">{stats.log_streak ?? 0} gün</p>
          <p className="text-xs text-muted">günlük serin</p>
        </div>
        {pct != null && (
          <div className="flex items-center gap-2">
            <Ring value={pct} />
            <div>
              <p className="text-sm font-semibold tabular">
                {stats.week_done}/{stats.week_total} görev
              </p>
              <p className="text-xs text-muted">{pct >= 80 ? "haftalık hedefe ulaştın" : `hedef %80 · ${Math.max(0, Math.ceil(stats.week_total * 0.8) - stats.week_done)} görev kaldı`}</p>
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
    </Card>
  );
}

function topBadges(earned: EarnedBadge[], n: number) {
  // Her aileden en yüksek seviye; en yüksek renkten başlayarak
  const best = new Map<string, EarnedBadge>();
  for (const b of earned) best.set(b.family.id, b);
  return [...best.values()].sort((a, b) => b.level - a.level).slice(0, n);
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
/* Rozet defteri: tüm aileler, koşullar, ilerleme ve kazanılan rozetler  */
/* ------------------------------------------------------------------ */
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
          <li>Aşağıda {FAMILIES.length} rozet türü var. Her türde bir hedefe ulaştığında o rozeti alırsın ve bir sonraki hedef açılır.</li>
          <li>Hedeflerin sonu yoktur. Örnek: Soru rozetlerini 100, 500, 1.000, 2.500 ve 5.000 soruda alırsın; sonra her 2.500 soruda bir yeni rozet gelir (7.500, 10.000, 12.500…).</li>
          <li>Rozet durumun uygulamayı her açtığında güncellenir. Gün, Türkiye saatiyle gece 00.00&apos;da değişir.</li>
          <li>Kazandığın rozet hiçbir zaman silinmez; serin bozulsa bile rozet sende kalır.</li>
          <li>Renk, o türde kaçıncı rozette olduğunu gösterir: 1–2. rozet bronz, 3–4. gümüş, 5–7. altın, 8. ve sonrası zümrüt.</li>
          <li>Rozetler yalnızca senin kendi çalışmana göre verilir; başka öğrencilerle yarışmazsın.</li>
        </ul>
      </div>
      {groups.map(([g, fams]) => (
        <div key={g}>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">{g}</p>
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
                          <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round(ratio * 100)}%` }} />
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
    </div>
  );
}

/** İlerleme ekranı / danışman özeti: rozet defteri kartı */
export function BadgesCard({ studentId }: { studentId: string }) {
  const { profile } = useAuth();
  const { stats, missing } = useGameStats(studentId);
  if (missing || !stats) return null;
  const isCounselor = profile?.role === "counselor";
  const earned = earnedBadges(stats);
  return (
    <Card
      title={isCounselor ? "Seri ve rozetler" : "Rozetlerim"}
      subtitle={`${stats.streak} gün çalışma serisi · ${stats.log_streak ?? 0} gün günlük serisi · toplam ${earned.length} rozet`}
    >
      {isCounselor && stats.n >= 10 && (
        <p className="mb-3 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
          Anonim sıralama ({stats.n} aktif öğrenci): seride {stats.streak_top != null ? `ilk %${stats.streak_top}` : "seri yok"} · bu haftaki soruda {stats.week_top != null ? `ilk %${stats.week_top}` : "henüz soru yok"}. Öğrenci yalnızca ilk %50&apos;deyse görür.
        </p>
      )}
      <BadgeBook stats={stats} />
    </Card>
  );
}

/** Öğrenci listesindeki kart için kısa şerit: seri + kazanılan rozetler */
export function BadgeStrip({ stats }: { stats: GameStats }) {
  const earned = earnedBadges(stats);
  const top = topBadges(earned, 5);
  return (
    <div className="flex items-center gap-2">
      <span className="flex items-center gap-0.5" title={`En uzun çalışma serisi: ${stats.best} gün · günlük serisi: ${stats.log_streak ?? 0} gün`}>
        <span className="-ml-1 scale-75">
          <Flame on={stats.streak > 0} />
        </span>
        <span className={cx("text-sm font-semibold tabular", !stats.streak && "text-faint")}>{stats.streak}</span>
        <span className="text-[11px] text-muted">gün seri</span>
      </span>
      <span className="ml-auto flex items-center">
        {earned.length ? (
          <>
            <span className="flex -space-x-1.5">
              {top.map((b) => (
                <span key={b.id} title={`${b.family.title} · ${b.family.label(b.threshold)} (${b.level}. seviye)`}>
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
    ((data ?? []) as (Omit<GameStats, "n" | "streak_top" | "week_top"> & { student_id: string })[]).map((r) => [
      r.student_id,
      { ...r, best: Math.max(r.best, r.streak), n: 0, streak_top: null, week_top: null },
    ]),
  );
}
