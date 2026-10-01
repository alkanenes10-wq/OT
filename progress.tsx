"use client";
// Gelişim panosu: öğrencinin çalışmasını gün gün, hafta hafta, ay ay gösterir.
// Kaynaklar: haftalık program görevleri (çözülen soru, tamamlanan blok, süre), gün sonu kayıtları,
// günlük takip (motivasyon, kaygı, enerji, uyku) ve deneme netleri.

import { useEffect, useMemo, useState } from "react";
import { errorText, fetchAnalyses, fetchLogs, fetchPlans, sb } from "./db";
import { BarChart, LineChart, niceMax, useWidth, xTickEvery } from "./insights";
import {
  addDays,
  avg,
  categoryOfSubject,
  fmtNum,
  formatShort,
  minutesToText,
  net,
  parseISODate,
  todayISO,
  type DailyLog,
  type ExamAnalysis,
  type PlanTask,
} from "./lib";
import { Card, EmptyState, ErrorBox, PageLoader, Segmented, cx } from "./ui";

type Gran = "gun" | "hafta" | "ay";
type Kind = "cubuk" | "cizgi";
const KIND_KEY = "yks-grafik-turu";

/** Çizgi grafik için 0'dan başlayan ölçek */
function lineScale(values: (number | null)[], fixedMax?: number) {
  const top = fixedMax ?? niceMax(Math.max(1, ...values.map((v) => v ?? 0)) * 1.05);
  return { yMin: 0, yMax: top, yTicks: [0, top / 2, top] };
}
const MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Tarihi içinde bulunduğu dönemin başlangıcına çevirir */
function bucketOf(date: string, g: Gran): string {
  if (g === "gun") return date;
  const d = parseISODate(date);
  if (g === "hafta") {
    const wd = (d.getDay() + 6) % 7; // Pazartesi = 0
    return addDays(date, -wd);
  }
  return iso(new Date(d.getFullYear(), d.getMonth(), 1));
}

/** Seçili ayrıntıya göre gösterilecek dönemler (eskiden yeniye) */
function buckets(g: Gran): string[] {
  const today = todayISO();
  if (g === "gun") return Array.from({ length: 30 }, (_, i) => addDays(today, i - 29));
  if (g === "hafta") {
    const cur = bucketOf(today, "hafta");
    return Array.from({ length: 12 }, (_, i) => addDays(cur, (i - 11) * 7));
  }
  const d = parseISODate(today);
  return Array.from({ length: 6 }, (_, i) => iso(new Date(d.getFullYear(), d.getMonth() - 5 + i, 1)));
}

function labelFor(g: Gran) {
  if (g === "ay") return (l: string) => MONTHS[parseISODate(l).getMonth()];
  return (l: string) => formatShort(l).replace(/ (\S{3})\S*$/, " $1");
}
function tipFor(g: Gran) {
  if (g === "ay") return (l: string) => `${MONTHS[parseISODate(l).getMonth()]} ${parseISODate(l).getFullYear()}`;
  if (g === "hafta") return (l: string) => `${formatShort(l)} – ${formatShort(addDays(l, 6))} haftası`;
  return (l: string) => formatShort(l);
}

type Row = { date: string; subject: string; cat: "sayisal" | "sozel" | null; solved: number; correct: number | null; wrong: number | null; done: boolean; real: boolean; minutes: number };

export function GrowthDashboard({ studentId }: { studentId: string }) {
  const [gran, setGran] = useState<Gran>("hafta");
  const [kind, setKindState] = useState<Kind>("cubuk");
  useEffect(() => {
    try {
      const k = localStorage.getItem(KIND_KEY);
      if (k === "cizgi" || k === "cubuk") setKindState(k);
    } catch {}
  }, []);
  const setKind = (k: Kind) => {
    setKindState(k);
    try {
      localStorage.setItem(KIND_KEY, k);
    } catch {}
  };
  const [rows, setRows] = useState<Row[] | null>(null);
  const [dayMinutes, setDayMinutes] = useState<Map<string, number>>(new Map());
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [exams, setExams] = useState<ExamAnalysis[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const since = addDays(todayISO(), -200);
        const [plans, l, a] = await Promise.all([fetchPlans(studentId), fetchLogs(studentId, since), fetchAnalyses(studentId)]);
        const recent = plans.filter((p) => p.start_date >= addDays(since, -7));
        const startOf = new Map(recent.map((p) => [p.id, p.start_date]));
        let tasks: PlanTask[] = [];
        const dm = new Map<string, number>();
        if (recent.length) {
          const ids = recent.map((p) => p.id);
          const [t, d] = await Promise.all([
            sb().from("plan_tasks").select("plan_id, day_index, subject, topic_id, content, target_questions, solved, correct, wrong, done, duration_min").in("plan_id", ids),
            sb().from("plan_days").select("plan_id, day_index, study_minutes").in("plan_id", ids),
          ]);
          if (t.error) throw t.error;
          if (d.error) throw d.error;
          tasks = (t.data ?? []) as PlanTask[];
          for (const r of (d.data ?? []) as { plan_id: string; day_index: number; study_minutes: number | null }[]) {
            const s = startOf.get(r.plan_id);
            if (s && r.study_minutes) dm.set(addDays(s, r.day_index), r.study_minutes);
          }
        }
        if (!active) return;
        setRows(
          tasks
            .filter((t) => startOf.has(t.plan_id))
            .map((t) => ({
              date: addDays(startOf.get(t.plan_id) as string, t.day_index),
              subject: t.subject,
              cat: categoryOfSubject(t.subject),
              solved: t.solved ?? 0,
              correct: t.correct,
              wrong: t.wrong,
              done: t.done,
              real: Boolean(t.topic_id || (t.content ?? "").trim() || t.target_questions),
              minutes: t.done ? (t.duration_min ?? 0) : 0,
            })),
        );
        setDayMinutes(dm);
        setLogs(l);
        setExams(a);
      } catch (e) {
        if (active) setError(errorText(e));
      }
    })();
    return () => {
      active = false;
    };
  }, [studentId]);

  const B = useMemo(() => buckets(gran), [gran]);
  const agg = useMemo(() => {
    const idx = new Map(B.map((b, i) => [b, i]));
    const n = B.length;
    const say = Array<number>(n).fill(0);
    const soz = Array<number>(n).fill(0);
    const total = Array<number>(n).fill(0);
    const doneN = Array<number>(n).fill(0);
    const minutes = Array<number>(n).fill(0);
    const taskMinByDay = new Map<string, number>();
    const correct = Array<number>(n).fill(0);
    const wrong = Array<number>(n).fill(0);
    const bySubject = new Map<string, number>();
    const today = todayISO();
    for (const r of rows ?? []) {
      if (r.date > today) continue;
      const i = idx.get(bucketOf(r.date, gran));
      if (i == null) continue;
      if (r.real) {
        total[i]++;
        if (r.done) doneN[i]++;
      }
      if (r.cat === "sayisal") say[i] += r.solved;
      else soz[i] += r.solved;
      if (r.correct != null) correct[i] += r.correct;
      if (r.wrong != null) wrong[i] += r.wrong;
      if (r.solved) bySubject.set(r.subject, (bySubject.get(r.subject) ?? 0) + r.solved);
      taskMinByDay.set(r.date, (taskMinByDay.get(r.date) ?? 0) + r.minutes);
    }
    // Çalışma süresi: öğrencinin gün sonu kaydı varsa o, yoksa tamamlanan blokların süresi
    const days = new Set([...taskMinByDay.keys(), ...dayMinutes.keys()]);
    for (const d of days) {
      if (d > today) continue;
      const i = idx.get(bucketOf(d, gran));
      if (i == null) continue;
      minutes[i] += dayMinutes.get(d) ?? taskMinByDay.get(d) ?? 0;
    }
    // Günlük takip ortalamaları
    const group = new Map<number, DailyLog[]>();
    for (const l of logs) {
      const i = idx.get(bucketOf(l.log_date, gran));
      if (i == null) continue;
      group.set(i, [...(group.get(i) ?? []), l]);
    }
    const mean = (k: "motivation" | "anxiety" | "energy" | "sleep_hours") =>
      B.map((_, i) => {
        const v = avg((group.get(i) ?? []).map((l) => (l[k] == null ? null : Number(l[k]))));
        return v == null ? null : Math.round(v * 10) / 10;
      });
    return {
      say,
      soz,
      total,
      doneN,
      minutes,
      correct,
      wrong,
      completion: B.map((_, i) => (total[i] ? Math.round((doneN[i] / total[i]) * 100) : null)),
      motivation: mean("motivation"),
      anxiety: mean("anxiety"),
      energy: mean("energy"),
      sleep: mean("sleep_hours"),
      logDays: B.map((_, i) => (group.get(i) ?? []).length),
      bySubject: [...bySubject.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [rows, logs, dayMinutes, B, gran]);

  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!rows) return <PageLoader />;

  const fl = labelFor(gran);
  const ft = tipFor(gran);
  const n = B.length;
  const last = n - 1;
  const unitWord = gran === "gun" ? "bugün" : gran === "hafta" ? "bu hafta" : "bu ay";
  const prevWord = gran === "gun" ? "düne" : gran === "hafta" ? "geçen haftaya" : "geçen aya";
  const sumQ = (i: number) => agg.say[i] + agg.soz[i];
  const rangeQ = agg.say.reduce((a, b) => a + b, 0) + agg.soz.reduce((a, b) => a + b, 0);
  const rangeMin = agg.minutes.reduce((a, b) => a + b, 0);
  // Çizgide, henüz başlamış (boş) son dönem sıfıra düşüş gibi görünmesin diye boş bırakılır.
  const open = <T extends number | null>(arr: T[]) => arr.map((v, i) => (i === last && !v ? null : v));
  const hours = open(agg.minutes.map((m) => Math.round((m / 60) * 10) / 10));
  const rangeTotal = agg.total.reduce((a, b) => a + b, 0);
  const rangeDone = agg.doneN.reduce((a, b) => a + b, 0);
  const rangeC = agg.correct.reduce((a, b) => a + b, 0);
  const rangeW = agg.wrong.reduce((a, b) => a + b, 0);
  const rangeName = gran === "gun" ? "Son 30 gün" : gran === "hafta" ? "Son 12 hafta" : "Son 6 ay";
  const nothing = rangeQ === 0 && rangeTotal === 0 && logs.length === 0 && exams.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="display text-2xl">Gelişim</h2>
          <p className="text-sm text-muted">{rangeName} · çözülen soru, çalışma süresi, program ve günlük takip</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <div className="w-full sm:w-44">
            <Segmented
              size="sm"
              ariaLabel="Grafik türü"
              value={kind}
              onChange={setKind}
              options={[
                { value: "cubuk", label: "Çubuk" },
                { value: "cizgi", label: "Çizgi" },
              ]}
            />
          </div>
          <div className="w-full sm:w-56">
          <Segmented
            size="sm"
            ariaLabel="Zaman ayrıntısı"
            value={gran}
            onChange={setGran}
            options={[
              { value: "gun", label: "Gün" },
              { value: "hafta", label: "Hafta" },
              { value: "ay", label: "Ay" },
            ]}
          />
          </div>
        </div>
      </div>

      {nothing ? (
        <Card>
          <EmptyState icon="chart" title="Henüz gösterilecek veri yok">
            Öğrenci program görevlerini işaretleyip çözdüğü soruları girdikçe ve günlük takibi doldurdukça grafikler burada oluşur.
          </EmptyState>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label={`Çözülen soru · ${unitWord}`} value={fmtNum(sumQ(last), 0)} cur={sumQ(last)} prev={sumQ(last - 1)} prevWord={prevWord} />
            <Kpi
              label={`Çalışma süresi · ${unitWord}`}
              value={agg.minutes[last] ? minutesToText(agg.minutes[last]) : "—"}
              cur={agg.minutes[last]}
              prev={agg.minutes[last - 1]}
              prevWord={prevWord}
            />
            <CompletionTile done={rangeDone} total={rangeTotal} label={`Program tamamlama · ${rangeName.toLocaleLowerCase("tr-TR")}`} />
            <div className="card min-w-0 px-4 py-3">
              <p className="text-xs font-medium text-muted">Doğru oranı · {rangeName.toLocaleLowerCase("tr-TR")}</p>
              <p className="display mt-1 text-[26px] leading-tight tabular">{rangeC + rangeW ? `%${Math.round((rangeC / (rangeC + rangeW)) * 100)}` : "—"}</p>
              <p className="text-[11px] text-faint">{rangeC + rangeW ? `${fmtNum(rangeC, 0)} doğru · ${fmtNum(rangeW, 0)} yanlış` : "Doğru/yanlış girilmemiş"}</p>
            </div>
          </div>

          <Card title="Çözülen soru" subtitle={`${gran === "gun" ? "gün" : gran === "hafta" ? "hafta" : "ay"} başına · sayısal ve sözel · toplam ${fmtNum(rangeQ, 0)}`}>
            {kind === "cizgi" ? (
              <LineChart
                ariaLabel="Dönemlere göre çözülen soru, sayısal, sözel ve toplam"
                labels={B}
                formatLabel={fl}
                formatTip={ft}
                {...lineScale(B.map((_, i) => sumQ(i)))}
                series={[
                  { key: "say", label: "Sayısal", color: "var(--series-1)", values: open(agg.say) },
                  { key: "soz", label: "Sözel", color: "var(--series-2)", values: open(agg.soz) },
                  { key: "top", label: "Toplam", color: "var(--series-3)", values: open(B.map((_, i) => sumQ(i))) },
                ]}
              />
            ) : (
            <StackedBars
              labels={B}
              a={{ label: "Sayısal", color: "var(--series-1)", values: agg.say }}
              b={{ label: "Sözel", color: "var(--series-2)", values: agg.soz }}
              formatLabel={fl}
              formatTip={ft}
              unit="soru"
            />
            )}
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Çalışma süresi" subtitle={`saat · toplam ${minutesToText(rangeMin)}`}>
              {kind === "cizgi" ? (
                <LineChart
                  ariaLabel="Dönemlere göre çalışma süresi"
                  labels={B}
                  formatLabel={fl}
                  formatTip={ft}
                  {...lineScale(hours)}
                  series={[{ key: "saat", label: "Saat", color: "var(--series-3)", values: hours }]}
                />
              ) : (
                <BarChart
                  ariaLabel="Dönemlere göre çalışma süresi"
                  labels={B}
                  values={agg.minutes.map((m) => (m ? Math.round((m / 60) * 10) / 10 : null))}
                  unit="saat"
                  color="var(--series-3)"
                  formatLabel={fl}
                />
              )}
            </Card>
            <Card title="Program tamamlama" subtitle="tamamlanan görev yüzdesi">
              {kind === "cizgi" ? (
                <LineChart
                  ariaLabel="Dönemlere göre program tamamlama yüzdesi"
                  labels={B}
                  formatLabel={fl}
                  formatTip={ft}
                  {...lineScale(agg.completion, 100)}
                  series={[{ key: "tam", label: "Tamamlama", color: "var(--series-1)", values: open(agg.completion) }]}
                />
              ) : (
              <BarChart
                ariaLabel="Dönemlere göre program tamamlama yüzdesi"
                labels={B}
                values={agg.completion}
                unit="%"
                color="var(--series-1)"
                refLine={{ value: 80, label: "%80" }}
                max={100}
                formatLabel={fl}
                formatValue={(v) => fmtNum(v, 0)}
              />
              )}
            </Card>
          </div>

          {agg.bySubject.length > 0 && (
            <Card title="Derslere göre çözülen soru" subtitle={rangeName}>
              <HBars rows={agg.bySubject} />
            </Card>
          )}

          {agg.logDays.some((x) => x > 0) && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card title="Motivasyon, kaygı ve enerji" subtitle={`ortalama · 1 (çok düşük) – 5 (çok yüksek)${gran === "gun" ? "" : " · dönem ortalaması"}`}>
                <LineChart
                  ariaLabel="Dönemlere göre motivasyon, kaygı ve enerji ortalaması"
                  labels={B}
                  formatLabel={fl}
                  formatTip={ft}
                  series={[
                    { key: "motivation", label: "Motivasyon", color: "var(--series-1)", values: agg.motivation },
                    { key: "anxiety", label: "Kaygı", color: "var(--series-2)", values: agg.anxiety },
                    { key: "energy", label: "Enerji", color: "var(--series-3)", values: agg.energy },
                  ]}
                />
              </Card>
              <Card title="Uyku" subtitle="ortalama saat">
                {kind === "cizgi" ? (
                  <LineChart
                    ariaLabel="Dönemlere göre ortalama uyku"
                    labels={B}
                    formatLabel={fl}
                    formatTip={ft}
                    yMin={0}
                    yMax={10}
                    yTicks={[0, 5, 10]}
                    series={[{ key: "uyku", label: "Uyku (sa)", color: "var(--series-1)", values: agg.sleep }]}
                  />
                ) : (
                  <BarChart
                    ariaLabel="Dönemlere göre ortalama uyku"
                    labels={B}
                    values={agg.sleep}
                    unit="saat"
                    refLine={{ value: 7, label: "7 sa" }}
                    formatLabel={fl}
                    color="var(--series-1)"
                  />
                )}
              </Card>
            </div>
          )}

          <ExamTrends exams={exams} />
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
function Kpi({ label, value, cur, prev, prevWord }: { label: string; value: string; cur: number; prev: number | undefined; prevWord: string }) {
  const d = cur > 0 && prev != null && prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null;
  return (
    <div className="card min-w-0 px-4 py-3">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="display mt-1 text-[26px] leading-tight tabular">{value}</p>
      <p className={cx("text-[11px] tabular", d == null ? "text-faint" : d >= 0 ? "text-success" : "text-danger")}>
        {cur === 0 ? "Henüz kayıt yok" : d == null ? `${prevWord} göre: —` : `${d >= 0 ? "▲" : "▼"} %${Math.abs(d)} ${prevWord} göre`}
      </p>
    </div>
  );
}

function CompletionTile({ done, total, label }: { done: number; total: number; label: string }) {
  const p = total ? Math.round((done / total) * 100) : 0;
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <div className="card flex min-w-0 items-center gap-3 px-4 py-3">
      <svg width="58" height="58" viewBox="0 0 58 58" role="img" aria-label={`Program tamamlama yüzde ${p}`} className="shrink-0">
        <circle cx="29" cy="29" r={r} fill="none" style={{ stroke: "var(--grid)" }} strokeWidth="7" />
        <circle
          cx="29"
          cy="29"
          r={r}
          fill="none"
          style={{ stroke: "var(--series-3)" }}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${(p / 100) * c} ${c}`}
          transform="rotate(-90 29 29)"
        />
        <text x="29" y="29" dy="0.35em" textAnchor="middle" style={{ fill: "var(--fg)", fontSize: 13, fontWeight: 600 }}>
          %{p}
        </text>
      </svg>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted">{label}</p>
        <p className="text-sm tabular">
          {done} / {total} görev
        </p>
      </div>
    </div>
  );
}

/** İki serili yığılmış sütun grafik (sayısal + sözel) */
function StackedBars({
  labels,
  a,
  b,
  formatLabel,
  formatTip,
  unit,
  height = 220,
}: {
  labels: string[];
  a: { label: string; color: string; values: number[] };
  b: { label: string; color: string; values: number[] };
  formatLabel: (l: string) => string;
  formatTip: (l: string) => string;
  unit: string;
  height?: number;
}) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = labels.length;
  const totals = labels.map((_, i) => a.values[i] + b.values[i]);
  const top = niceMax(Math.max(1, ...totals) * 1.05);
  const ticks = [0, top / 2, top];
  const pad = { l: 12 + String(fmtNum(top, 0)).length * 7, r: 6, t: 12, b: 24 };
  const iw = Math.max(10, width - pad.l - pad.r);
  const ih = height - pad.t - pad.b;
  const y = (v: number) => pad.t + (1 - v / top) * ih;
  const slot = iw / Math.max(1, n);
  const bw = Math.max(3, Math.min(30, slot - 3));
  const every = xTickEvery(n, iw);
  const tipX = hover != null ? pad.l + hover * slot + slot / 2 : 0;

  // alt parça düz, üst parça 4px yuvarlak; parçalar arasında 2px yüzey boşluğu
  const seg = (i: number, from: number, to: number, round: boolean) => {
    const bx = pad.l + i * slot + (slot - bw) / 2;
    const y0 = y(from);
    const y1 = y(to);
    const h = y0 - y1;
    if (h <= 0.5) return "";
    const r = round ? Math.min(4, bw / 2, h) : 0;
    return `M${bx},${y0}L${bx},${y1 + r}Q${bx},${y1} ${bx + r},${y1}L${bx + bw - r},${y1}Q${bx + bw},${y1} ${bx + bw},${y1 + r}L${bx + bw},${y0}Z`;
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-3 text-xs text-muted">
        {[a, b].map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <div ref={ref} className="relative w-full min-w-0" style={{ height }}>
        {width > 0 && (
          <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label="Dönemlere göre çözülen soru, sayısal ve sözel" className="block">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.l} x2={pad.l + iw} y1={y(t)} y2={y(t)} style={{ stroke: t === 0 ? "var(--axis)" : "var(--grid)" }} strokeWidth={1} />
                <text x={pad.l - 6} y={y(t)} dy="0.32em" textAnchor="end" style={{ fill: "var(--chart-muted)", fontSize: 11 }} className="tabular">
                  {fmtNum(t, 0)}
                </text>
              </g>
            ))}
            {labels.map((_, i) => {
              const va = a.values[i];
              const vb = b.values[i];
              const gap = va > 0 && vb > 0 ? (2 / ih) * top : 0;
              const op = hover == null || hover === i ? 1 : 0.55;
              return (
                <g key={i} style={{ opacity: op }}>
                  {va > 0 && <path d={seg(i, 0, va, vb === 0)} style={{ fill: a.color }} />}
                  {vb > 0 && <path d={seg(i, va + gap, va + vb + gap, true)} style={{ fill: b.color }} />}
                </g>
              );
            })}
            {labels.map((l, i) =>
              i % every === 0 ? (
                <text key={l} x={pad.l + i * slot + slot / 2} y={height - 6} textAnchor="middle" style={{ fill: "var(--chart-muted)", fontSize: 11 }}>
                  {formatLabel(l)}
                </text>
              ) : null,
            )}
            {labels.map((l, i) => (
              <rect
                key={`h-${l}`}
                x={pad.l + i * slot}
                y={pad.t}
                width={slot}
                height={ih}
                fill="transparent"
                onPointerEnter={() => setHover(i)}
                onPointerDown={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
              />
            ))}
          </svg>
        )}
        {hover != null && (
          <div
            className="pointer-events-none absolute top-0 z-10 w-44 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg"
            style={{ left: tipX + 10 + 176 > width ? Math.max(0, tipX - 186) : tipX + 10 }}
          >
            <p className="mb-1 font-semibold">{formatTip(labels[hover])}</p>
            {[a, b].map((s) => (
              <p key={s.label} className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 text-muted">
                  <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className="font-semibold tabular">{fmtNum(s.values[hover], 0)}</span>
              </p>
            ))}
            <p className="mt-1 flex justify-between border-t border-line pt-1 font-semibold tabular">
              <span>Toplam</span>
              <span>
                {fmtNum(totals[hover], 0)} {unit}
              </span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/** Yatay çubuklar: derslere göre çözülen soru */
function HBars({ rows }: { rows: [string, number][] }) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  const total = rows.reduce((s, r) => s + r[1], 0);
  return (
    <ul className="space-y-2">
      {rows.slice(0, 12).map(([subject, v]) => {
        const cat = categoryOfSubject(subject);
        return (
          <li key={subject} className="grid grid-cols-[120px_1fr_76px] items-center gap-3 text-sm sm:grid-cols-[150px_1fr_90px]">
            <span className="truncate text-xs font-semibold text-muted">{subject}</span>
            <span className="h-3 rounded-r" style={{ width: `${Math.max(2, (v / max) * 100)}%`, background: cat === "sozel" ? "var(--series-2)" : "var(--series-1)", borderRadius: "0 4px 4px 0" }} />
            <span className="text-right tabular">
              {fmtNum(v, 0)} <span className="text-xs text-faint">%{Math.round((v / total) * 100)}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Deneme netleri: TYT ve AYT ayrı grafikler (ölçekleri farklı, tek eksen) */
function ExamTrends({ exams }: { exams: ExamAnalysis[] }) {
  const items = (["TYT", "AYT"] as const)
    .map((t) => {
      const list = exams.filter((e) => e.exam_type === t).sort((a, b) => a.exam_date.localeCompare(b.exam_date));
      return { t, list, nets: list.map((e) => netOf(e)) };
    })
    .filter((x) => x.list.length > 0);
  if (!items.length) return null;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {items.map(({ t, list, nets }) => {
        const vals = nets.filter((v): v is number => v != null);
        const top = niceMax(Math.max(t === "TYT" ? 40 : 20, ...vals) * 1.1);
        const first = vals[0];
        const lastV = vals[vals.length - 1];
        return (
          <Card
            key={t}
            title={`${t} net gelişimi`}
            subtitle={`${list.length} deneme${vals.length >= 2 ? ` · ilk ${fmtNum(first)} → son ${fmtNum(lastV)} (${lastV - first >= 0 ? "+" : ""}${fmtNum(lastV - first)})` : ""}`}
          >
            <LineChart
              ariaLabel={`${t} denemelerinde toplam net`}
              labels={list.map((e) => e.exam_date)}
              yMin={0}
              yMax={top}
              yTicks={[0, top / 2, top]}
              height={200}
              series={[{ key: t, label: "Toplam net", color: t === "TYT" ? "var(--series-1)" : "var(--series-2)", values: nets }]}
            />
          </Card>
        );
      })}
    </div>
  );
}

function netOf(a: ExamAnalysis): number | null {
  const v = Object.values(a.nets ?? {}).map((x) => net(x.d, x.y));
  if (!v.some((x) => x != null)) return null;
  return Math.round(v.reduce<number>((s, x) => s + (x ?? 0), 0) * 100) / 100;
}
