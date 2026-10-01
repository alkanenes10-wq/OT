"use client";
// Seri, rozetler ve haftalık hedef. Kıyas kişiseldir; anonim sıralama yalnızca olumlu çerçevede
// (ilk %50'deyse) ve en az 10 aktif öğrenci varken gösterilir — kimsenin adı/puanı görünmez.

import { useEffect, useState } from "react";
import { sb, useAuth } from "./db";
import { fmtNum } from "./lib";
import { Card, cx, useToast } from "./ui";

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
  n: number;
  streak_top: number | null;
  week_top: number | null;
};

type BadgeDef = { id: string; title: string; desc: string; tier: 1 | 2 | 3; earned: (s: GameStats) => boolean; progress?: (s: GameStats) => [number, number] };

export const BADGES: BadgeDef[] = [
  { id: "ilk-kayit", title: "İlk adım", desc: "İlk günlük kaydını yaptın", tier: 1, earned: (s) => s.logs >= 1 },
  { id: "seri-3", title: "3 gün seri", desc: "3 gün üst üste çalıştın", tier: 1, earned: (s) => s.best >= 3, progress: (s) => [Math.min(s.best, 3), 3] },
  { id: "seri-7", title: "1 hafta seri", desc: "7 gün üst üste", tier: 2, earned: (s) => s.best >= 7, progress: (s) => [Math.min(s.best, 7), 7] },
  { id: "seri-14", title: "2 hafta seri", desc: "14 gün üst üste", tier: 2, earned: (s) => s.best >= 14, progress: (s) => [Math.min(s.best, 14), 14] },
  { id: "seri-30", title: "30 gün seri", desc: "Bir ay boyunca her gün", tier: 3, earned: (s) => s.best >= 30, progress: (s) => [Math.min(s.best, 30), 30] },
  { id: "soru-100", title: "100 soru", desc: "Programda 100 soru çözdün", tier: 1, earned: (s) => s.solved >= 100, progress: (s) => [Math.min(s.solved, 100), 100] },
  { id: "soru-1000", title: "1.000 soru", desc: "1.000 soru barajı", tier: 2, earned: (s) => s.solved >= 1000, progress: (s) => [Math.min(s.solved, 1000), 1000] },
  { id: "soru-5000", title: "5.000 soru", desc: "Soru maratoncusu", tier: 3, earned: (s) => s.solved >= 5000, progress: (s) => [Math.min(s.solved, 5000), 5000] },
  { id: "hafta-80", title: "Güçlü hafta", desc: "Bir haftanın programını %80+ tamamladın", tier: 1, earned: (s) => s.good_weeks >= 1 },
  { id: "hafta-80x4", title: "İstikrar", desc: "4 haftayı %80+ tamamladın", tier: 2, earned: (s) => s.good_weeks >= 4, progress: (s) => [Math.min(s.good_weeks, 4), 4] },
  { id: "hafta-80x12", title: "Sezon ritmi", desc: "12 haftayı %80+ tamamladın", tier: 3, earned: (s) => s.good_weeks >= 12, progress: (s) => [Math.min(s.good_weeks, 12), 12] },
  { id: "deneme-1", title: "İlk deneme", desc: "İlk deneme sonucun kaydedildi", tier: 1, earned: (s) => s.exams >= 1 },
  { id: "deneme-10", title: "Deneme tecrübesi", desc: "10 deneme", tier: 2, earned: (s) => s.exams >= 10, progress: (s) => [Math.min(s.exams, 10), 10] },
  { id: "kitap-1", title: "Kitap bitti", desc: "Bir kaynağı bitirdin", tier: 2, earned: (s) => s.books_done >= 1 },
];

const tierCls = { 1: "from-[#d9a066] to-[#a8693a]", 2: "from-[#cfd6de] to-[#8d98a6]", 3: "from-[#f2cf5b] to-[#c99a14]" } as const;

function Medal({ tier, earned, size = 40 }: { tier: 1 | 2 | 3; earned: boolean; size?: number }) {
  return (
    <span
      className={cx("flex shrink-0 items-center justify-center rounded-full", earned ? `bg-gradient-to-br ${tierCls[tier]} text-white shadow-sm` : "border border-dashed border-line bg-surface-2 text-faint")}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" width={size * 0.5} height={size * 0.5} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z" />
      </svg>
    </span>
  );
}

function Flame({ on }: { on: boolean }) {
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

const SEEN_KEY = (id: string) => `yks-rozet-gorulen-${id}`;

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

/** Öğrenci "Bugün" ekranı için kısa kart */
export function StreakCard({ studentId }: { studentId: string }) {
  const toast = useToast();
  const { stats, missing } = useGameStats(studentId);

  // Yeni kazanılan rozetler için bir kez tebrik
  useEffect(() => {
    if (!stats) return;
    try {
      const earned = BADGES.filter((b) => b.earned(stats)).map((b) => b.id);
      const raw = localStorage.getItem(SEEN_KEY(studentId));
      const seen: string[] = raw ? JSON.parse(raw) : [];
      const fresh = earned.filter((id) => !seen.includes(id));
      if (raw && fresh.length) toast.show(`Yeni rozet: ${BADGES.find((b) => b.id === fresh[0])?.title}${fresh.length > 1 ? ` (+${fresh.length - 1})` : ""}`);
      localStorage.setItem(SEEN_KEY(studentId), JSON.stringify(earned));
    } catch {}
  }, [stats, studentId, toast]);

  if (missing || !stats) return null;
  const pct = stats.week_total ? Math.round((stats.week_done / stats.week_total) * 100) : null;
  const earned = BADGES.filter((b) => b.earned(stats));
  const next = BADGES.filter((b) => !b.earned(stats) && b.progress).sort((a, b) => {
    const [x1, y1] = a.progress!(stats);
    const [x2, y2] = b.progress!(stats);
    return x2 / y2 - x1 / y1;
  })[0];

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Flame on={stats.streak > 0} />
          <div>
            <p className="display text-2xl leading-none tabular">{stats.streak} gün</p>
            <p className="text-xs text-muted">{stats.streak ? "serin devam ediyor" : "bugün başlat: günlük doldur ya da bir görev bitir"}</p>
          </div>
        </div>
        {pct != null && (
          <div className="flex items-center gap-2">
            <Ring value={pct} />
            <div>
              <p className="text-sm font-semibold tabular">
                {stats.week_done}/{stats.week_total} görev
              </p>
              <p className="text-xs text-muted">{pct >= 80 ? "haftalık hedefe ulaştın" : `haftalık hedef %80 · ${Math.max(0, Math.ceil(stats.week_total * 0.8) - stats.week_done)} görev kaldı`}</p>
            </div>
          </div>
        )}
        <div className="ml-auto flex items-center -space-x-2">
          {earned.slice(-4).map((b) => (
            <span key={b.id} title={b.title}>
              <Medal tier={b.tier} earned size={30} />
            </span>
          ))}
          {earned.length > 0 && <span className="pl-3 text-xs text-muted">{earned.length} rozet</span>}
        </div>
      </div>
      {(stats.streak_top != null && stats.streak_top <= 50) || (stats.week_top != null && stats.week_top <= 50) || next ? (
        <p className="mt-3 border-t border-line pt-2 text-xs text-muted">
          {stats.streak_top != null && stats.streak_top <= 50 && <span className="mr-3">Serinle öğrencilerin ilk %{stats.streak_top}&apos;indesin.</span>}
          {stats.week_top != null && stats.week_top <= 50 && <span className="mr-3">Bu hafta çözdüğün soruyla ilk %{stats.week_top}&apos;tesin.</span>}
          {next && (
            <span>
              Sıradaki rozet: <b className="font-medium text-fg">{next.title}</b> ({next.progress!(stats)[0]}/{next.progress!(stats)[1]})
            </span>
          )}
        </p>
      ) : null}
    </Card>
  );
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

/** İlerleme ekranı / danışman özeti: tüm rozetler */
export function BadgesCard({ studentId }: { studentId: string }) {
  const { profile } = useAuth();
  const { stats, missing } = useGameStats(studentId);
  if (missing || !stats) return null;
  const isCounselor = profile?.role === "counselor";
  const earned = BADGES.filter((b) => b.earned(stats)).length;
  return (
    <Card
      title="Seri ve rozetler"
      subtitle={`${stats.streak} gün seri · en uzun ${stats.best} gün · ${earned}/${BADGES.length} rozet · toplam ${fmtNum(stats.solved, 0)} soru`}
    >
      {isCounselor && stats.n >= 10 && (
        <p className="mb-3 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
          Anonim sıralama ({stats.n} aktif öğrenci): seride {stats.streak_top != null ? `ilk %${stats.streak_top}` : "seri yok"} · bu haftaki soruda {stats.week_top != null ? `ilk %${stats.week_top}` : "henüz soru yok"}. Öğrenci yalnızca ilk %50&apos;deyse görür.
        </p>
      )}
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {BADGES.map((b) => {
          const ok = b.earned(stats);
          const pr = !ok && b.progress ? b.progress(stats) : null;
          return (
            <li key={b.id} className={cx("flex items-center gap-2.5 rounded-xl border p-2.5", ok ? "border-line" : "border-dashed border-line opacity-80")}>
              <Medal tier={b.tier} earned={ok} size={34} />
              <div className="min-w-0">
                <p className={cx("text-sm font-semibold leading-tight", !ok && "text-muted")}>{b.title}</p>
                <p className="truncate text-[11px] text-muted">{pr ? `${fmtNum(pr[0], 0)}/${fmtNum(pr[1], 0)}` : b.desc}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
