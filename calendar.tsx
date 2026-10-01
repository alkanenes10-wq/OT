"use client";
// Haftalık program — takvim görünümü (Google Takvim benzeri).
// Günler sütun, saatler satır. Blok sürükle-bırak ile başka güne/saate taşınır,
// boş alana tıklayınca o saate görev eklenir, bloğa tıklayınca düzenlenir.

import { useMemo, useState, type DragEvent, type MouseEvent } from "react";
import { ALL_TOPICS } from "./curriculum";
import { TASK_TYPES, addDays, categoryOfSubject, dayName, formatShort, minutesToText, minutesToTime, timeToMinutes, todayISO, type PlanTask, type WeeklyPlan } from "./lib";
import { Icon, cx } from "./ui";

const PX = 1.15; // dakika başına piksel
const SNAP = 5;
const topicName = new Map(ALL_TOPICS.map((t) => [t.id, t.name]));
const typeShort = (t: PlanTask["task_type"]) => TASK_TYPES.find((x) => x.value === t)?.short ?? "";
const title = (t: PlanTask) => (t.topic_id ? (topicName.get(t.topic_id) ?? t.topic_id) : t.content.trim() || t.subject);

type Placed = { t: PlanTask; start: number; dur: number; lane: number; lanes: number };

function layoutDay(tasks: PlanTask[]): Placed[] {
  const items = tasks
    .map((t) => ({ t, start: timeToMinutes(t.start_time ?? "") ?? 0, dur: Math.max(15, t.duration_min ?? 40) }))
    .sort((a, b) => a.start - b.start || b.dur - a.dur);
  const out: Placed[] = [];
  let cluster: Placed[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanes = Math.max(1, ...cluster.map((c) => c.lane + 1));
    for (const c of cluster) c.lanes = lanes;
    out.push(...cluster);
    cluster = [];
  };
  for (const it of items) {
    if (it.start >= clusterEnd && cluster.length) flush();
    const laneEnds: number[] = [];
    for (const c of cluster) laneEnds[c.lane] = Math.max(laneEnds[c.lane] ?? 0, c.start + c.dur);
    let lane = laneEnds.findIndex((e) => e <= it.start);
    if (lane === -1) lane = laneEnds.length;
    cluster.push({ ...it, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, it.start + it.dur);
  }
  if (cluster.length) flush();
  return out;
}

export function CalendarView({
  plan,
  tasks,
  onToggle,
  onEdit,
  onAdd,
  onMove,
}: {
  plan: WeeklyPlan;
  tasks: PlanTask[];
  onToggle: (t: PlanTask) => void;
  onEdit: (t: PlanTask) => void;
  onAdd: (day: number, time: string | null) => void;
  onMove: (t: PlanTask, day: number, time: string) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [hover, setHover] = useState<{ day: number; min: number } | null>(null);
  const dates = Array.from({ length: 7 }, (_, i) => addDays(plan.start_date, i));
  const today = todayISO();
  const timed = tasks.filter((t) => t.start_time);
  const untimed = tasks.filter((t) => !t.start_time);

  const [startH, endH] = useMemo(() => {
    if (!timed.length) return [8, 22];
    const s = Math.min(...timed.map((t) => timeToMinutes(t.start_time!) ?? 480));
    const e = Math.max(...timed.map((t) => (timeToMinutes(t.start_time!) ?? 480) + (t.duration_min ?? 40)));
    let a = Math.max(6, Math.floor(s / 60) - 1);
    let b = Math.min(24, Math.ceil(e / 60) + 1);
    if (b - a < 6) b = Math.min(24, a + 6);
    if (b - a < 6) a = Math.max(0, b - 6);
    return [a, b];
  }, [timed]);
  const height = (endH - startH) * 60 * PX;
  const minuteAt = (e: DragEvent | MouseEvent, snap: number) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const m = startH * 60 + (e.clientY - rect.top) / PX;
    return Math.max(startH * 60, Math.min(endH * 60 - 15, Math.round(m / snap) * snap));
  };
  const dayPlanned = (d: number) => timed.filter((t) => t.day_index === d).reduce((s, t) => s + (t.duration_min ?? 0), 0);

  function drop(e: DragEvent, day: number) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || dragId;
    const t = tasks.find((x) => x.id === id);
    setDragId(null);
    setHover(null);
    if (!t) return;
    const m = minuteAt(e, SNAP);
    onMove(t, day, minutesToTime(m));
  }

  return (
    <div className="space-y-2">
      <div className="card overflow-x-auto">
        <div className="min-w-[900px]">
          {/* Başlık */}
          <div className="grid border-b border-line" style={{ gridTemplateColumns: "56px repeat(7, minmax(0, 1fr))" }}>
            <div />
            {dates.map((d, i) => (
              <div key={d} className={cx("border-l border-line px-2 py-2", d === today && "bg-primary-soft/60")}>
                <p className={cx("text-xs font-semibold uppercase tracking-wide", d === today ? "text-primary-ink" : "text-muted")}>{dayName(d)}</p>
                <p className="flex items-baseline justify-between gap-1">
                  <span className="display text-lg">{formatShort(d)}</span>
                  {dayPlanned(i) > 0 && <span className="text-[11px] text-muted tabular">{minutesToText(dayPlanned(i))}</span>}
                </p>
              </div>
            ))}
          </div>

          {/* Saatsiz görevler */}
          {untimed.length > 0 && (
            <div className="grid border-b border-line bg-surface-2/60" style={{ gridTemplateColumns: "56px repeat(7, minmax(0, 1fr))" }}>
              <div className="px-1 py-2 text-right text-[10px] font-semibold uppercase text-faint">Saatsiz</div>
              {dates.map((d, i) => (
                <div key={d} className="space-y-1 border-l border-line p-1">
                  {untimed
                    .filter((t) => t.day_index === i)
                    .map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", t.id);
                          setDragId(t.id);
                        }}
                        onClick={() => onEdit(t)}
                        className={cx(
                          "block w-full truncate rounded-md border-l-[3px] bg-surface px-1.5 py-1 text-left text-[11.5px]",
                          catBorder(t.subject),
                          t.done && "opacity-55 line-through",
                        )}
                      >
                        {title(t)}
                      </button>
                    ))}
                </div>
              ))}
            </div>
          )}

          {/* Saat ızgarası */}
          <div className="relative grid" style={{ gridTemplateColumns: "56px repeat(7, minmax(0, 1fr))" }}>
            <div className="relative" style={{ height }}>
              {Array.from({ length: endH - startH }, (_, i) => (
                <span key={i} className="absolute right-2 -translate-y-1/2 text-[11px] text-faint tabular" style={{ top: i * 60 * PX }}>
                  {i === 0 ? "" : `${String(startH + i).padStart(2, "0")}:00`}
                </span>
              ))}
            </div>
            {dates.map((d, day) => (
              <div
                key={d}
                role="presentation"
                className={cx("relative cursor-copy border-l border-line", d === today && "bg-primary-soft/25")}
                style={{
                  height,
                  backgroundImage: `repeating-linear-gradient(to bottom, var(--border) 0, var(--border) 1px, transparent 1px, transparent ${60 * PX}px)`,
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setHover({ day, min: minuteAt(e, SNAP) });
                }}
                onDragLeave={() => setHover((h) => (h?.day === day ? null : h))}
                onDrop={(e) => drop(e, day)}
                onClick={(e) => {
                  if (e.target !== e.currentTarget) return;
                  onAdd(day, minutesToTime(minuteAt(e, 15)));
                }}
                title="Boş alana tıkla: görev ekle"
              >
                {hover?.day === day && dragId && (
                  <div
                    className="pointer-events-none absolute inset-x-1 z-20 rounded-md border-2 border-dashed border-primary bg-primary-soft/50 px-1 text-[11px] font-semibold text-primary-ink"
                    style={{ top: (hover.min - startH * 60) * PX, height: (tasks.find((x) => x.id === dragId)?.duration_min ?? 40) * PX }}
                  >
                    {minutesToTime(hover.min)}
                  </div>
                )}
                {layoutDay(timed.filter((t) => t.day_index === day)).map(({ t, start, dur, lane, lanes }) => {
                  const cat = categoryOfSubject(t.subject);
                  const h = dur * PX;
                  return (
                    <div
                      key={t.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", t.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDragId(t.id);
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setHover(null);
                      }}
                      className={cx(
                        "group absolute z-10 cursor-grab overflow-hidden rounded-lg border-l-[3px] px-1.5 py-1 shadow-[0_1px_2px_rgba(31,42,46,0.08)] transition active:cursor-grabbing",
                        cat === "sayisal" ? "border-say bg-say-soft" : cat === "sozel" ? "border-soz bg-soz-soft" : "border-line bg-surface-2",
                        t.done && "opacity-60",
                        dragId === t.id && "opacity-40",
                      )}
                      style={{
                        top: (start - startH * 60) * PX + 1,
                        height: h - 2,
                        left: `calc(${(lane / lanes) * 100}% + 3px)`,
                        width: `calc(${100 / lanes}% - 6px)`,
                      }}
                    >
                      <button type="button" onClick={() => onEdit(t)} className="block h-full w-full text-left" aria-label={`${title(t)} düzenle`}>
                        <span className="flex items-center gap-1 text-[10.5px] font-semibold text-muted tabular">
                          {t.start_time}
                          <span className="truncate font-bold uppercase tracking-wide">{t.subject}</span>
                        </span>
                        <span className={cx("block text-[12.5px] font-medium leading-tight", t.done && "line-through", h < 40 ? "truncate" : "line-clamp-2")}>{title(t)}</span>
                        {h >= 52 && (
                          <span className="mt-0.5 block text-[10.5px] text-muted">
                            {typeShort(t.task_type)}
                            {t.target_questions ? ` · ${t.solved != null ? `${t.solved}/` : ""}${t.target_questions} soru` : ""}
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={t.done}
                        aria-label={`${title(t)} tamamlandı`}
                        onClick={() => onToggle(t)}
                        className={cx(
                          "absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full border-[1.5px] transition",
                          t.done ? "border-success bg-success text-white" : "border-faint bg-surface opacity-0 group-hover:opacity-100 focus:opacity-100",
                        )}
                      >
                        {t.done && <Icon name="check" size={12} strokeWidth={3.2} />}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span>Bloğu sürükle → başka gün/saate taşı</span>
        <span>Boş alana tıkla → o saate görev ekle</span>
        <span>Bloğa tıkla → düzenle</span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-say" /> Sayısal
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-soz" /> Sözel
        </span>
      </p>
    </div>
  );
}

function catBorder(subject: string) {
  const c = categoryOfSubject(subject);
  return c === "sayisal" ? "border-say" : c === "sozel" ? "border-soz" : "border-line";
}
