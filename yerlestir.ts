// Programı çalışma saatlerine yerleştirme yardımcıları.
// Görev eklerken/taşırken öğrencinin o günkü çalışma saatlerinde ilk boş yere otomatik saat verir;
// "Saatlere yerleştir" ile bir günün (ya da haftanın) blokları sırası korunarak saatlere dizilir.

import { addDays, minutesToTime, timeToMinutes, weekdayIndex, type PlanTask, type StudySchedule } from "./lib";

type Busy = { s: number; e: number };

export function dayRanges(schedule: StudySchedule | null, date: string): Busy[] {
  if (!schedule) return [];
  return (schedule.slots[weekdayIndex(date)] ?? [])
    .map((r) => ({ s: timeToMinutes(r.s), e: timeToMinutes(r.e) }))
    .filter((r): r is Busy => r.s != null && r.e != null && r.e > r.s)
    .sort((a, b) => a.s - b.s);
}

export const hasSchedule = (schedule: StudySchedule | null) => Boolean(schedule?.slots.some((d) => d.length > 0));

function busyOf(tasks: Pick<PlanTask, "start_time" | "duration_min">[], fallbackDur: number): Busy[] {
  return tasks
    .map((t) => {
      const s = timeToMinutes(t.start_time ?? "");
      return s == null ? null : { s, e: s + (t.duration_min ?? fallbackDur) };
    })
    .filter((x): x is Busy => x != null)
    .sort((a, b) => a.s - b.s);
}

/** Çalışma saatleri içinde, mevcut bloklarla çakışmayan ilk boşluk (dakika). Yer yoksa null. */
export function firstFreeStart(ranges: Busy[], busy: Busy[], dur: number, brk: number, notBefore = 0): number | null {
  for (const r of ranges) {
    let t = Math.max(r.s, notBefore);
    for (;;) {
      if (t + dur > r.e) break;
      const clash = busy.find((b) => t < b.e + brk && b.s < t + dur + brk);
      if (!clash) return t;
      t = clash.e + brk;
    }
  }
  return null;
}

/** Bir göreve, eklendiği günde çalışma saatlerine uygun saat önerir. */
export function suggestSlot(
  schedule: StudySchedule | null,
  planStart: string,
  dayIndex: number,
  dayTasks: Pick<PlanTask, "id" | "start_time" | "duration_min">[],
  excludeId?: string,
  dur?: number | null,
): { start_time: string; duration_min: number } | null {
  if (!schedule || !hasSchedule(schedule)) return null;
  const d = dur && dur >= 10 ? dur : schedule.block_min;
  const ranges = dayRanges(schedule, addDays(planStart, dayIndex));
  if (!ranges.length) return null;
  const busy = busyOf(
    dayTasks.filter((t) => t.id !== excludeId),
    schedule.block_min,
  );
  const s = firstFreeStart(ranges, busy, d, schedule.break_min);
  return s == null ? null : { start_time: minutesToTime(s), duration_min: d };
}

/** Bırakılan saat çalışma saatleri dışındaysa ya da başka blokla çakışıyorsa en yakın uygun saate kaydırır. */
export function snapToSchedule(
  schedule: StudySchedule | null,
  planStart: string,
  dayIndex: number,
  dayTasks: Pick<PlanTask, "id" | "start_time" | "duration_min">[],
  task: Pick<PlanTask, "id" | "duration_min">,
  wanted: string,
): { time: string; moved: boolean } {
  const w = timeToMinutes(wanted);
  if (!schedule || !hasSchedule(schedule) || w == null) return { time: wanted, moved: false };
  const dur = task.duration_min ?? schedule.block_min;
  const ranges = dayRanges(schedule, addDays(planStart, dayIndex));
  if (!ranges.length) return { time: wanted, moved: false };
  const busy = busyOf(
    dayTasks.filter((t) => t.id !== task.id),
    schedule.block_min,
  );
  const brk = schedule.break_min;
  const fits = (t: number) => ranges.some((r) => t >= r.s && t + dur <= r.e) && !busy.some((b) => t < b.e + brk && b.s < t + dur + brk);
  if (fits(w)) return { time: wanted, moved: false };
  // En yakın uygun başlangıç (5 dk adımlarla, önce ileri sonra geri)
  for (let k = 5; k <= 24 * 60; k += 5) {
    if (fits(w + k)) return { time: minutesToTime(w + k), moved: true };
    if (w - k >= 0 && fits(w - k)) return { time: minutesToTime(w - k), moved: true };
  }
  return { time: wanted, moved: false };
}

/**
 * Bir günün bloklarını sırası korunarak çalışma saatlerine dizer.
 * Dönen liste: yalnızca saati değişen görevler. Sığmayanlar `overflow` olarak döner (saatleri değiştirilmez).
 */
export function reflowDay(
  schedule: StudySchedule,
  planStart: string,
  dayIndex: number,
  dayTasks: PlanTask[],
): { changes: { id: string; start_time: string; duration_min: number }[]; overflow: PlanTask[] } {
  const ranges = dayRanges(schedule, addDays(planStart, dayIndex));
  const ordered = [...dayTasks].sort((a, b) => {
    const x = timeToMinutes(a.start_time ?? "") ?? 9999;
    const y = timeToMinutes(b.start_time ?? "") ?? 9999;
    return x - y || a.sort - b.sort;
  });
  const changes: { id: string; start_time: string; duration_min: number }[] = [];
  const overflow: PlanTask[] = [];
  const placed: Busy[] = [];
  let cursor = 0;
  for (const t of ordered) {
    const dur = t.duration_min ?? schedule.block_min;
    const s = firstFreeStart(ranges, placed, dur, schedule.break_min, cursor);
    if (s == null) {
      overflow.push(t);
      continue;
    }
    placed.push({ s, e: s + dur });
    cursor = s + dur + schedule.break_min;
    const st = minutesToTime(s);
    if (st !== t.start_time || dur !== t.duration_min) changes.push({ id: t.id, start_time: st, duration_min: dur });
  }
  return { changes, overflow };
}
