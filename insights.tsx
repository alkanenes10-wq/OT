"use client";
import { GrowthDashboard } from "./progress";
// Grafikler, dikkat göstergeleri ve ilerleme özeti.

import { type PointerEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { courseTopicIds, isCompleted } from "./curriculum";
import { errorText, fetchLogs, fetchPlans, fetchTopicProgress, sb, useStudentCourses } from "./db";
import { addDays, avg, computeSignals, type DailyLog, fmtNum, formatShort, pct, pickCurrentPlan, type PlanTask, rangeDates, type Signal, todayISO, type TopicProgress, type WeeklyPlan } from "./lib";
import { DetailedSignalList, VariablesCard } from "./rehber";
import { Card, cx, EmptyState, ErrorBox, Icon, PageLoader, ProgressBar, Segmented } from "./ui";

/** Kapsayıcının genişliğini ölçer; grafik hiçbir zaman kapsayıcıdan taşmaz. */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(Math.floor(el.clientWidth));
    const ro = new ResizeObserver((entries) => setWidth(Math.floor(entries[0].contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

export function niceMax(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nf * exp;
}

export function xTickEvery(n: number, width: number) {
  const maxTicks = Math.max(2, Math.floor(width / 64));
  return Math.max(1, Math.ceil(n / maxTicks));
}

const shortDate = (l: string) => formatShort(l).replace(/ (\S{3})\S*$/, " $1");
const AXIS_TEXT = { fill: "var(--chart-muted)", fontSize: 11 } as const;

/* ------------------------------------------------------------------ */
export type LineSeries = { key: string; label: string; color: string; values: (number | null)[] };

/** Çok serili çizgi grafik (ör. kaygı / enerji / motivasyon, 1-5). Göstergeye dokununca seri gizlenir/gösterilir. */
export function LineChart({
  labels,
  series,
  yMin = 1,
  yMax = 5,
  yTicks = [1, 2, 3, 4, 5],
  height = 230,
  ariaLabel,
  formatLabel = shortDate,
  formatTip = formatShort,
}: {
  labels: string[];
  series: LineSeries[];
  yMin?: number;
  yMax?: number;
  yTicks?: number[];
  height?: number;
  ariaLabel: string;
  formatLabel?: (l: string) => string;
  formatTip?: (l: string) => string;
}) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const visible = series.filter((s) => !hidden.has(s.key));
  const n = labels.length;
  const compact = width < 480;
  const pad = { l: 14 + Math.max(...yTicks.map((t) => fmtNum(t, 0).length)) * 7, r: compact ? 14 : 96, t: 10, b: 24 };
  const iw = Math.max(10, width - pad.l - pad.r);
  const ih = height - pad.t - pad.b;
  const x = (i: number) => pad.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => pad.t + (1 - (v - yMin) / (yMax - yMin)) * ih;

  // Yumuşak çizgi: tekdüze kübik eğri (Fritsch–Carlson) — veri noktalarından geçer, taşma yapmaz
  const pathFor = (s: LineSeries) => {
    const segs: { x: number; y: number }[][] = [];
    let cur: { x: number; y: number }[] = [];
    s.values.forEach((v, i) => {
      if (v == null) {
        if (cur.length) segs.push(cur);
        cur = [];
        return;
      }
      cur.push({ x: x(i), y: y(v) });
    });
    if (cur.length) segs.push(cur);
    const f = (n: number) => n.toFixed(1);
    return segs
      .map((p) => {
        if (p.length === 1) return "";
        if (p.length === 2) return `M${f(p[0].x)},${f(p[0].y)}L${f(p[1].x)},${f(p[1].y)}`;
        const n = p.length;
        const dx = p.slice(1).map((q, i) => q.x - p[i].x);
        const m = p.slice(1).map((q, i) => (q.y - p[i].y) / (dx[i] || 1));
        const t = p.map((_, i) => (i === 0 ? m[0] : i === n - 1 ? m[n - 2] : m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2));
        for (let i = 0; i < n - 1; i++) {
          if (m[i] === 0) {
            t[i] = 0;
            t[i + 1] = 0;
            continue;
          }
          const a = t[i] / m[i];
          const b = t[i + 1] / m[i];
          const h = a * a + b * b;
          if (h > 9) {
            const k = 3 / Math.sqrt(h);
            t[i] = k * a * m[i];
            t[i + 1] = k * b * m[i];
          }
        }
        let d = `M${f(p[0].x)},${f(p[0].y)}`;
        for (let i = 0; i < n - 1; i++) {
          const h = dx[i] / 3;
          d += `C${f(p[i].x + h)},${f(p[i].y + t[i] * h)} ${f(p[i + 1].x - h)},${f(p[i + 1].y - t[i + 1] * h)} ${f(p[i + 1].x)},${f(p[i + 1].y)}`;
        }
        return d;
      })
      .join("");
  };
  /** Komşusu olmayan tek nokta (çizgi çizilemez) — görünür kalmalı */
  const isolated = (s: LineSeries, i: number) => s.values[i] != null && s.values[i - 1] == null && s.values[i + 1] == null;

  // Doğrudan etiketler (son değer) — geniş ekranda, çakışmayı önleyerek
  const endLabels = compact
    ? []
    : visible
        .map((s) => {
          let i = s.values.length - 1;
          while (i >= 0 && s.values[i] == null) i--;
          return i >= 0 ? { s, v: s.values[i] as number, y: y(s.values[i] as number) } : null;
        })
        .filter((e): e is { s: LineSeries; v: number; y: number } => e !== null)
        .sort((a, b) => a.y - b.y);
  for (let i = 1; i < endLabels.length; i++) {
    if (endLabels[i].y - endLabels[i - 1].y < 14) endLabels[i].y = endLabels[i - 1].y + 14;
  }

  const every = xTickEvery(n, iw);
  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = n <= 1 ? 0 : Math.round(((px - pad.l) / iw) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  const hx = hover != null ? x(hover) : 0;
  const markers = n <= 31;

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {series.map((s) => {
          const off = hidden.has(s.key);
          return (
            <button
              key={s.key}
              type="button"
              aria-pressed={!off}
              onClick={() =>
                setHidden((h) => {
                  const next = new Set(h);
                  if (next.has(s.key)) next.delete(s.key);
                  else if (series.length - next.size > 1) next.add(s.key);
                  return next;
                })
              }
              className={cx(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition",
                off ? "border-line text-faint line-through" : "border-line bg-surface-2 text-muted",
              )}
            >
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: off ? "var(--axis)" : s.color }} />
              {s.label}
            </button>
          );
        })}
      </div>
      <div ref={ref} className="relative w-full min-w-0" style={{ height }}>
        {width > 0 && (
          <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label={ariaLabel} className="block">
            {yTicks.map((t) => (
              <g key={t}>
                <line x1={pad.l} x2={pad.l + iw} y1={y(t)} y2={y(t)} style={{ stroke: "var(--grid)" }} strokeWidth={1} />
                <text x={pad.l - 8} y={y(t)} dy="0.32em" textAnchor="end" style={AXIS_TEXT} className="tabular">
                  {fmtNum(t, 0)}
                </text>
              </g>
            ))}
            {labels.map((l, i) =>
              i % every === 0 ? (
                <text key={l} x={x(i)} y={height - 6} textAnchor="middle" style={AXIS_TEXT}>
                  {formatLabel(l)}
                </text>
              ) : null,
            )}
            {hover != null && <line x1={hx} x2={hx} y1={pad.t} y2={pad.t + ih} style={{ stroke: "var(--axis)" }} strokeWidth={1} />}
            {visible.map((s) => (
              <g key={s.key}>
                <path className="chart-line" pathLength={1} d={pathFor(s)} fill="none" style={{ stroke: s.color }} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
                {s.values.map((v, i) => {
                  if (v == null) return null;
                  const solo = isolated(s, i);
                  if (!markers && hover !== i && !solo) return null;
                  const r = hover === i ? 3.5 : solo ? 3 : 1.75;
                  return <circle key={i} cx={x(i)} cy={y(v)} r={r} style={{ fill: s.color, stroke: "var(--surface)", opacity: hover === i || solo ? 1 : 0.85 }} strokeWidth={hover === i ? 1.5 : 0} />;
                })}
              </g>
            ))}
            {endLabels.map((e) => (
              <text key={e.s.key} x={pad.l + iw + 10} y={e.y} dy="0.32em" style={{ fill: "var(--chart-ink)", fontSize: 12 }}>
                {e.s.label} {fmtNum(e.v)}
              </text>
            ))}
            <rect
              x={pad.l - 10}
              y={0}
              width={iw + 20}
              height={height}
              fill="transparent"
              onPointerMove={onMove}
              onPointerDown={onMove}
              onPointerLeave={() => setHover(null)}
            />
          </svg>
        )}
        {hover != null && (
          <div
            className="pointer-events-none absolute top-0 z-10 w-40 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg"
            style={{ left: hx + 12 + 160 > width ? Math.max(0, hx - 172) : hx + 12 }}
          >
            <p className="mb-1 font-semibold">{formatTip(labels[hover])}</p>
            {visible.map((s) => (
              <p key={s.key} className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 text-muted">
                  <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className="font-semibold tabular">{s.values[hover] == null ? "—" : fmtNum(s.values[hover])}</span>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/** Tek serili sütun grafik (ör. uyku saatleri, telefon dakikası). */
export function BarChart({
  labels,
  values,
  color = "var(--series-1)",
  unit,
  height = 180,
  refLine,
  ariaLabel,
  formatLabel = shortDate,
  formatValue = (v) => fmtNum(v),
  max,
}: {
  labels: string[];
  values: (number | null)[];
  color?: string;
  unit: string;
  height?: number;
  refLine?: { value: number; label: string };
  ariaLabel: string;
  formatLabel?: (l: string) => string;
  formatValue?: (v: number) => string;
  max?: number;
}) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = labels.length;
  const maxVal = Math.max(refLine?.value ?? 0, ...values.map((v) => v ?? 0));
  const top = max ?? niceMax(maxVal * 1.05);
  const ticks = [0, top / 2, top];
  const tickText = (t: number) => fmtNum(t, top < 5 ? 1 : 0);
  const longest = Math.max(...ticks.map((t) => tickText(t).length));
  const pad = { l: 12 + longest * 7, r: refLine ? 36 : 6, t: 12, b: 24 };
  const iw = Math.max(10, width - pad.l - pad.r);
  const ih = height - pad.t - pad.b;
  const y = (v: number) => pad.t + (1 - v / top) * ih;
  const slot = iw / Math.max(1, n);
  const bw = Math.max(2, Math.min(28, slot - 2));
  const every = xTickEvery(n, iw);

  const barPath = (i: number, v: number) => {
    const bx = pad.l + i * slot + (slot - bw) / 2;
    const by = y(v);
    const h = pad.t + ih - by;
    const r = Math.min(4, bw / 2, h);
    return `M${bx},${by + h}L${bx},${by + r}Q${bx},${by} ${bx + r},${by}L${bx + bw - r},${by}Q${bx + bw},${by} ${bx + bw},${by + r}L${bx + bw},${by + h}Z`;
  };
  const tipX = hover != null ? pad.l + hover * slot + slot / 2 : 0;

  return (
    <div ref={ref} className="relative w-full min-w-0" style={{ height }}>
      {width > 0 && (
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label={ariaLabel} className="block">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={pad.l + iw} y1={y(t)} y2={y(t)} style={{ stroke: t === 0 ? "var(--axis)" : "var(--grid)" }} strokeWidth={1} />
              <text x={pad.l - 6} y={y(t)} dy="0.32em" textAnchor="end" style={AXIS_TEXT} className="tabular">
                {tickText(t)}
              </text>
            </g>
          ))}
          {values.map((v, i) =>
            v == null || v <= 0 ? null : (
              <path key={i} className="chart-bar" d={barPath(i, v)} style={{ animationDelay: `${Math.min(i, 20) * 18}ms`, fill: color, opacity: hover == null || hover === i ? 1 : 0.55 }} />
            ),
          )}
          {refLine && (
            <g>
              <line
                x1={pad.l}
                x2={pad.l + iw}
                y1={y(refLine.value)}
                y2={y(refLine.value)}
                style={{ stroke: "var(--chart-ink)" }}
                strokeDasharray="4 4"
                strokeWidth={1}
              />
              <text x={pad.l + iw + 4} y={y(refLine.value)} dy="0.32em" style={{ fill: "var(--chart-ink)", fontSize: 11 }}>
                {refLine.label}
              </text>
            </g>
          )}
          {labels.map((l, i) =>
            i % every === 0 ? (
              <text key={l} x={pad.l + i * slot + slot / 2} y={height - 6} textAnchor="middle" style={AXIS_TEXT}>
                {formatLabel(l)}
              </text>
            ) : null,
          )}
          {labels.map((l, i) => (
            <rect
              key={`hit-${l}`}
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
          className="pointer-events-none absolute top-0 z-10 w-32 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg"
          style={{ left: tipX + 10 + 128 > width ? Math.max(0, tipX - 138) : tipX + 10 }}
        >
          <p className="font-semibold">{formatLabel(labels[hover])}</p>
          <p className="tabular text-muted">{values[hover] == null ? "Kayıt yok" : `${formatValue(values[hover] as number)} ${unit}`}</p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
export function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card min-w-0 px-4 py-3">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="display mt-1 text-[26px] leading-tight">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-faint">{sub}</p>}
    </div>
  );
}

const STYLE: Record<Signal["level"], { cls: string; icon: "alert" | "info"; label: string }> = {
  critical: { cls: "bg-danger-soft text-danger", icon: "alert", label: "Önemli" },
  warning: { cls: "bg-warning-soft text-warning", icon: "alert", label: "Dikkat" },
  info: { cls: "bg-surface-2 text-muted", icon: "info", label: "Bilgi" },
};

export function SignalList({ signals, empty }: { signals: Signal[]; empty?: string }) {
  if (!signals.length) {
    return (
      <p className="flex items-center gap-2 text-sm text-success">
        <Icon name="check" size={16} strokeWidth={2.6} /> {empty ?? "Uyarı yok"}
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {signals.map((s, i) => {
        const st = STYLE[s.level];
        return (
          <li key={i} className={cx("flex items-start gap-2 rounded-xl px-3 py-2 text-sm", st.cls)}>
            <Icon name={st.icon} size={16} className="mt-0.5 shrink-0" />
            <span>
              <span className="font-semibold">{st.label}:</span> {s.text}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function SignalChips({ signals, max = 3 }: { signals: Signal[]; max?: number }) {
  const shown = signals.filter((s) => s.level !== "info").slice(0, max);
  const rest = signals.filter((s) => s.level !== "info").length - shown.length;
  if (!shown.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((s, i) => {
        const st = STYLE[s.level];
        return (
          <span key={i} className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", st.cls)}>
            <Icon name={st.icon} size={12} />
            {s.text}
          </span>
        );
      })}
      {rest > 0 && <span className="text-xs text-muted">+{rest}</span>}
    </div>
  );
}

type WeekRow = { plan: WeeklyPlan; total: number; done: number; minutes: number; questions: number };

export function StudentInsights({ studentId, showSignals = false }: { studentId: string; showSignals?: boolean }) {
  const COURSES = useStudentCourses(studentId);
  // Telefonda 14 gün daha okunaklı; geniş ekranda 30 gün
  const [range, setRange] = useState<14 | 30 | 60>(() => (typeof window !== "undefined" && window.innerWidth < 640 ? 14 : 30));
  const [logs, setLogs] = useState<DailyLog[] | null>(null);
  const [weeks, setWeeks] = useState<WeekRow[]>([]);
  const [currentTasks, setCurrentTasks] = useState<{ plan: WeeklyPlan | null; tasks: PlanTask[] }>({ plan: null, tasks: [] });
  const [topics, setTopics] = useState<TopicProgress[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [l, plans, tp] = await Promise.all([fetchLogs(studentId, addDays(todayISO(), -89)), fetchPlans(studentId), fetchTopicProgress(studentId)]);
        const recent = plans.slice(-8);
        const ids = recent.map((p) => p.id);
        let tasks: PlanTask[] = [];
        let dayRows: { plan_id: string; study_minutes: number | null; question_count: number | null }[] = [];
        if (ids.length) {
          const [t, d] = await Promise.all([
            sb().from("plan_tasks").select("*").in("plan_id", ids),
            sb().from("plan_days").select("plan_id, study_minutes, question_count").in("plan_id", ids),
          ]);
          if (t.error) throw t.error;
          if (d.error) throw d.error;
          tasks = (t.data ?? []) as PlanTask[];
          dayRows = d.data ?? [];
        }
        if (!active) return;
        const rows: WeekRow[] = recent.map((p) => {
          const pt = tasks.filter((t) => t.plan_id === p.id && (t.topic_id || t.content.trim() || t.target_questions));
          const pd = dayRows.filter((d) => d.plan_id === p.id);
          return {
            plan: p,
            total: pt.length,
            done: pt.filter((t) => t.done).length,
            minutes: pd.reduce((s, d) => s + (d.study_minutes ?? 0), 0),
            questions: pt.reduce((s, t) => s + (t.solved ?? 0), 0) || pd.reduce((s, d) => s + (d.question_count ?? 0), 0),
          };
        });
        const cur = pickCurrentPlan(plans);
        setLogs(l);
        setWeeks(rows);
        setTopics(tp);
        setCurrentTasks({ plan: cur, tasks: cur ? tasks.filter((t) => t.plan_id === cur.id) : [] });
      } catch (e) {
        if (active) setError(errorText(e));
      }
    })();
    return () => {
      active = false;
    };
  }, [studentId]);

  const dates = useMemo(() => rangeDates(addDays(todayISO(), -(range - 1)), range), [range]);
  const byDate = useMemo(() => new Map((logs ?? []).map((l) => [l.log_date, l])), [logs]);
  const inRange = useMemo(() => dates.map((d) => byDate.get(d)).filter((l): l is DailyLog => Boolean(l)), [dates, byDate]);

  const signals: Signal[] = useMemo(
    () => (logs ? computeSignals({ logs: logs.filter((l) => l.log_date >= addDays(todayISO(), -13)), plan: currentTasks.plan, tasks: currentTasks.tasks }) : []),
    [logs, currentTasks],
  );

  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!logs) return <PageLoader />;

  const series = (k: "anxiety" | "energy" | "motivation") => dates.map((d) => byDate.get(d)?.[k] ?? null);
  const sleepAvg = avg(inRange.map((l) => l.sleep_hours));
  const phoneAvg = avg(inRange.map((l) => l.phone_minutes));
  const procDays = inRange.filter((l) => l.procrastinated === true).length;
  const procAnswered = inRange.filter((l) => l.procrastinated != null).length;
  const replanDays = inRange.filter((l) => l.replanned === true).length;
  const replanAnswered = inRange.filter((l) => l.replanned != null).length;

  const topicMap = Object.fromEntries(topics.map((t) => [t.topic_id, t]));

  return (
    <div className="space-y-4">
      {showSignals && (
        <Card title="Dikkat edilecekler" subtitle="Son 14 gün · tanı değil, görüşmede konuşulabilecek gözlemler · ayrıntı için uyarıya dokun">
          <DetailedSignalList signals={signals} empty="Belirgin bir uyarı yok." />
        </Card>
      )}

      <GrowthDashboard studentId={studentId} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Günlük takip</h2>
        <div className="w-full sm:w-60">
          <Segmented
            size="sm"
            ariaLabel="Zaman aralığı"
            value={range}
            onChange={setRange}
            options={[
              { value: 14, label: "14 gün" },
              { value: 30, label: "30 gün" },
              { value: 60, label: "60 gün" },
            ]}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Doldurulan gün" value={`${inRange.length}/${range}`} sub={`%${pct(inRange.length, range) ?? 0}`} />
        <StatTile label="Ortalama uyku" value={sleepAvg == null ? "—" : `${fmtNum(sleepAvg)} sa`} />
        <StatTile label="Ortalama telefon" value={phoneAvg == null ? "—" : `${fmtNum(phoneAvg, 0)} dk`} />
        <StatTile
          label="Erteleme / plan değişikliği"
          value={`${procDays} / ${replanDays}`}
          sub={`${procAnswered} ve ${replanAnswered} yanıtlı günde`}
        />
      </div>

      <VariablesCard logs={logs.filter((l) => l.log_date >= addDays(todayISO(), -59))} audience={showSignals ? "counselor" : "student"} />

      {inRange.length > 0 && (
        <Card title="Telefon / dikkat dağıtıcı" subtitle="dakika / gün">
          <BarChart
            ariaLabel="Günlere göre telefon süresi"
            labels={dates}
            values={dates.map((d) => byDate.get(d)?.phone_minutes ?? null)}
            unit="dk"
            formatValue={(v) => fmtNum(v, 0)}
          />
        </Card>
      )}

      <Card title="Konu ilerlemesi" subtitle="Bitti + tekrar edildi">
        <ul className="space-y-3">
          {COURSES.map((c) => {
            const ids = courseTopicIds(c);
            const done = ids.filter((id) => isCompleted(topicMap[id]?.status)).length;
            const p = pct(done, ids.length) ?? 0;
            return (
              <li key={c.id}>
                <div className="mb-1 flex items-baseline justify-between text-sm">
                  <span>{c.name}</span>
                  <span className="tabular text-muted">
                    {done}/{ids.length} · %{p}
                  </span>
                </div>
                <ProgressBar value={p} tone="success" label={`${c.name} ilerlemesi`} />
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
