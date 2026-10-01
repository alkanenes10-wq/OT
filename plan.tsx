"use client";
// Haftalık program: Excel benzeri düzenlenebilir tablo (ders × gün), gün görünümü (telefon),
// görev düzenleyici ve deneme analizine göre otomatik program oluşturucu.

import { useCallback, useEffect, useMemo, useState } from "react";
import { ALL_TOPICS, COURSES } from "./curriculum";
import { errorText, fetchAnalyses, fetchPlanDetail, fetchPlans, fetchSchedule, fetchTopicProgress, sb, useAuth, useRoute } from "./db";
import {
  DAY_LEVELS,
  DEFAULT_SUBJECTS,
  EXTRA_SUBJECT_SUGGESTIONS,
  SUBJECT_SECTIONS,
  TASK_TYPES,
  addDays,
  categoryOfSection,
  categoryOfSubject,
  emptySchedule,
  dayName,
  dayShort,
  diffDays,
  fmtNum,
  formatShort,
  formatTR,
  minutesToText,
  normalizeSubject,
  parseISODate,
  pct,
  pickCurrentPlan,
  rangeMinutes,
  sectionsForField,
  timeToMinutes,
  todayISO,
  type DayLevel,
  type ExamAnalysis,
  type PlanDay,
  type PlanTask,
  type StudySchedule,
  type TaskType,
  type TimeBlock,
  type TopicProgress,
  type WeeklyPlan,
  parseTestList,
  type Resource,
} from "./lib";
import { CopyDaysModal } from "./ekler";
import { buildCandidates, buildTimedPlan, type Candidate, type DraftTask, type HistoryTask } from "./planner";
import { CalendarView } from "./calendar";
import { fetchResources, resourceLabel, TaskResourceLine } from "./kaynaklar";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBox,
  Field,
  Icon,
  IconButton,
  Modal,
  PageLoader,
  ProgressBar,
  Segmented,
  confirmAction,
  cx,
  useToast,
} from "./ui";

const topicName = new Map(ALL_TOPICS.map((t) => [t.id, t.name]));
const sectionTitle = new Map(COURSES.flatMap((c) => c.sections.map((s) => [s.id, s.title] as const)));
const hasText = (t: PlanTask) => Boolean(t.topic_id || t.content.trim() || t.target_questions);
export const taskTitle = (t: PlanTask) => (t.topic_id ? (topicName.get(t.topic_id) ?? t.topic_id) : t.content.trim() || t.subject);
const typeShort = (t: TaskType) => TASK_TYPES.find((x) => x.value === t)?.short ?? "";
const TYPE_TONE: Record<TaskType, string> = {
  soru: "bg-primary-soft text-primary-ink",
  konu: "bg-warning-soft text-warning",
  tekrar: "bg-success-soft text-success",
  deneme: "bg-danger-soft text-danger",
  diger: "bg-surface-2 text-muted",
};
const DEFAULT_LEVELS: DayLevel[] = ["normal", "normal", "normal", "normal", "normal", "normal", "normal"];
const levelsOf = (p: WeeklyPlan | null): DayLevel[] =>
  Array.isArray(p?.day_levels) && p.day_levels.length === 7 ? p.day_levels : DEFAULT_LEVELS;
const levelQ = (l: DayLevel) => DAY_LEVELS.find((x) => x.value === l)?.questions ?? 0;

/** Tablo satır sırası: önce sayısal, sonra sözel dersler, en sonda rutinler */
const GRID_SUBJECTS = [
  "TYT MATEMATİK",
  "AYT MATEMATİK",
  "GEOMETRİ",
  "TYT FİZİK",
  "AYT FİZİK",
  "TYT KİMYA",
  "AYT KİMYA",
  "TYT BİYOLOJİ",
  "AYT BİYOLOJİ",
  "TÜRKÇE",
  "EDEBİYAT",
  "TARİH",
  "COĞRAFYA",
  "FELSEFE",
  "DİN KÜLTÜRÜ",
  "PARAGRAF",
  "PROBLEM",
  "GÜNLÜK TEKRAR",
];
export function subjectOrder(s: string) {
  const i = GRID_SUBJECTS.indexOf(s);
  return i === -1 ? 100 : i;
}
/** Saatli görevler saat sırasıyla, saatsizler ders sırasıyla (sonda) */
export const byOrder = (a: PlanTask, b: PlanTask) =>
  a.day_index - b.day_index ||
  (a.start_time && b.start_time ? a.start_time.localeCompare(b.start_time) : a.start_time ? -1 : b.start_time ? 1 : 0) ||
  subjectOrder(a.subject) - subjectOrder(b.subject) ||
  a.sort - b.sort;
const catBorder = (subject: string) => {
  const c = categoryOfSubject(subject);
  return c === "sayisal" ? "border-say" : c === "sozel" ? "border-soz" : "border-line";
};

/** Görev alanlarını günceller; veritabanının hesapladığı son hali döner (ör. hedefe ulaşınca otomatik tamamlandı) */
export async function patchTask(id: string, patch: Partial<PlanTask>): Promise<PlanTask> {
  const { data, error } = await sb().from("plan_tasks").update(patch).eq("id", id).select("*").single();
  if (error) throw error;
  return data as PlanTask;
}

/* ================================================================== */
export function WeeklyPlanView({ studentId, field }: { studentId: string; field?: string | null }) {
  const toast = useToast();
  const { profile } = useAuth();
  const isCounselor = profile?.role === "counselor";
  const [plans, setPlans] = useState<WeeklyPlan[] | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<PlanTask[]>([]);
  const [days, setDays] = useState<PlanDay[]>([]);
  const [day, setDay] = useState(0);
  const [view, setView] = useState<"takvim" | "tablo" | "gun">("gun");
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<PlanTask> | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [genOpen, setGenOpen] = useState(false);

  useEffect(() => {
    if (window.innerWidth >= 900) setView("takvim");
  }, []);

  const plan = useMemo(() => plans?.find((p) => p.id === planId) ?? null, [plans, planId]);

  const loadPlans = useCallback(
    async (selectId?: string) => {
      try {
        const list = await fetchPlans(studentId);
        setPlans(list);
        const chosen = selectId ? list.find((p) => p.id === selectId) : pickCurrentPlan(list);
        setPlanId(chosen?.id ?? null);
        if (chosen) {
          const off = diffDays(chosen.start_date, todayISO());
          setDay(off >= 0 && off <= 6 ? off : 0);
        }
      } catch (e) {
        setError(errorText(e));
        setPlans([]);
      }
    },
    [studentId],
  );

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  const reloadDetail = useCallback(async (id: string) => {
    setLoadingDetail(true);
    try {
      const d = await fetchPlanDetail(id);
      setTasks(d.tasks);
      setDays(d.days);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    if (planId) reloadDetail(planId);
    else {
      setTasks([]);
      setDays([]);
    }
  }, [planId, reloadDetail]);

  const sorted = plans ?? [];
  const idx = plan ? sorted.findIndex((p) => p.id === plan.id) : -1;
  const goPlan = (i: number) => {
    const p = sorted[i];
    if (!p) return;
    setPlanId(p.id);
    const off = diffDays(p.start_date, todayISO());
    setDay(off >= 0 && off <= 6 ? off : 0);
  };

  /* ---------- görev işlemleri ---------- */
  const replace = (t: PlanTask) => setTasks((ts) => [...ts.filter((x) => x.id !== t.id), t]);

  async function toggle(t: PlanTask) {
    const next = !t.done;
    setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, done: next } : x)));
    try {
      replace(await patchTask(t.id, { done: next }));
      if (next && t.topic_id && t.task_type !== "deneme") toast.show("Tamamlandı · konu takibi güncellendi");
    } catch (e) {
      replace(t);
      toast.show(errorText(e), "danger");
    }
  }

  async function setSolved(t: PlanTask, solved: number | null) {
    try {
      const row = await patchTask(t.id, { solved });
      replace(row);
      if (row.done && !t.done) toast.show("Hedefe ulaşıldı, görev tamamlandı");
    } catch (e) {
      toast.show(errorText(e), "danger");
    }
  }

  async function patchResult(t: PlanTask, patch: Partial<PlanTask>) {
    try {
      replace(await patchTask(t.id, patch));
    } catch (e) {
      toast.show(errorText(e), "danger");
    }
  }

  async function saveTask(draft: Partial<PlanTask>) {
    if (!plan) return;
    const payload = {
      day_index: draft.day_index ?? 0,
      subject: normalizeSubject(draft.subject || "DİĞER"),
      topic_id: draft.topic_id || null,
      task_type: draft.task_type ?? "soru",
      target_questions: draft.target_questions ?? null,
      solved: draft.solved ?? null,
      correct: draft.correct ?? null,
      wrong: draft.wrong ?? null,
      content: (draft.content ?? "").trim().slice(0, 500),
      done: draft.done ?? false,
      start_time: draft.start_time || null,
      duration_min: draft.duration_min && draft.duration_min >= 5 ? draft.duration_min : null,
      // Kaynak bağlantısı yalnızca guncelleme-8.sql çalıştırıldıysa gönderilir
      ...(draft.resource_id !== undefined
        ? { resource_id: draft.resource_id || null, resource_tests: draft.resource_id ? (draft.resource_tests ?? "").trim().slice(0, 40) || null : null }
        : {}),
    };
    const q = draft.id
      ? sb().from("plan_tasks").update(payload).eq("id", draft.id)
      : sb()
          .from("plan_tasks")
          .insert({ ...payload, plan_id: plan.id, student_id: studentId, sort: tasks.filter((t) => t.day_index === payload.day_index).length });
    const { data, error } = await q.select("*").single();
    if (error) throw error;
    replace(data as PlanTask);
  }

  async function moveTask(t: PlanTask, dayIndex: number, time: string) {
    if (t.day_index === dayIndex && t.start_time === time) return;
    const before = t;
    setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, day_index: dayIndex, start_time: time, duration_min: x.duration_min ?? 40 } : x)));
    try {
      replace(await patchTask(t.id, { day_index: dayIndex, start_time: time, duration_min: t.duration_min ?? 40 }));
    } catch (e) {
      replace(before);
      toast.show(errorText(e), "danger");
    }
  }

  async function removeTask(id: string) {
    const { error } = await sb().from("plan_tasks").delete().eq("id", id);
    if (error) throw error;
    setTasks((ts) => ts.filter((t) => t.id !== id));
  }

  async function setLevel(d: number, level: DayLevel) {
    if (!plan) return;
    const levels = [...levelsOf(plan)];
    levels[d] = level;
    setPlans((ps) => (ps ?? []).map((p) => (p.id === plan.id ? { ...p, day_levels: levels } : p)));
    const { error } = await sb().from("weekly_plans").update({ day_levels: levels }).eq("id", plan.id);
    if (error) toast.show(errorText(error), "danger");
  }

  async function deletePlan() {
    if (!plan) return;
    if (!confirmAction(`${formatTR(plan.start_date)} tarihli program ve tüm görevleri silinsin mi?`)) return;
    const { error } = await sb().from("weekly_plans").delete().eq("id", plan.id);
    if (error) return toast.show(errorText(error), "danger");
    toast.show("Program silindi");
    loadPlans();
  }

  /* ---------- özet ---------- */
  const real = tasks.filter(hasText);
  const done = real.filter((t) => t.done).length;
  const target = real.reduce((s, t) => s + (t.target_questions ?? 0), 0);
  const solved = real.reduce((s, t) => s + (t.solved ?? 0), 0);
  const minutes = days.reduce((s, d) => s + (d.study_minutes ?? 0), 0);

  if (plans === null) return <PageLoader />;

  return (
    <div className={cx("space-y-4", view === "gun" && "max-w-3xl")}>
      {error && <ErrorBox>{error}</ErrorBox>}

      <div className="flex flex-wrap items-center gap-2">
        {isCounselor && (
          <Button icon="target" onClick={() => setGenOpen(true)}>
            Otomatik program oluştur
          </Button>
        )}
        <Button variant="secondary" icon="plus" onClick={() => setNewOpen(true)}>
          Boş hafta / kopyala
        </Button>
        {plan && (
          <div className="ml-auto w-64">
            <Segmented
              size="sm"
              value={view}
              onChange={setView}
              ariaLabel="Görünüm"
              options={[
                { value: "takvim", label: "Takvim" },
                { value: "tablo", label: "Tablo" },
                { value: "gun", label: "Gün" },
              ]}
            />
          </div>
        )}
      </div>

      {!plan ? (
        <Card>
          <EmptyState icon="calendar" title="Henüz haftalık program yok">
            {isCounselor ? <><b>Otomatik program oluştur</b> ile son deneme analizine</> : <>Danışmanın programı hazırlayınca burada görünür. İstersen</>} ve öğrencinin müsait günlerine göre hazır bir hafta oluşturabilir, sonra tablo üzerinde
            düzenleyebilirsin.
          </EmptyState>
        </Card>
      ) : (
        <>
          <div className="card flex items-center gap-2 p-2 sm:p-3">
            <IconButton icon="chevronLeft" label="Önceki hafta" disabled={idx <= 0} onClick={() => goPlan(idx - 1)} />
            <div className="min-w-0 flex-1 text-center">
              <p className="truncate text-[15px] font-semibold">
                {formatShort(plan.start_date)} – {formatShort(addDays(plan.start_date, 6))} {parseISODate(addDays(plan.start_date, 6)).getFullYear()}
              </p>
              <p className="truncate text-xs text-muted">
                {plan.title ? `${plan.title} · ` : ""}Veriliş: {formatTR(plan.start_date)}
                {plan.created_by && plan.created_by !== studentId ? " · Danışman hazırladı" : ""}
              </p>
            </div>
            <IconButton icon="chevronRight" label="Sonraki hafta" disabled={idx >= sorted.length - 1} onClick={() => goPlan(idx + 1)} />
            <IconButton icon="trash" label="Bu haftayı sil" onClick={deletePlan} />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Görev" value={`${done}/${real.length}`} sub={real.length ? `%${pct(done, real.length)} tamamlandı` : "—"} />
            <Stat label="Hedef soru" value={target ? fmtNum(target, 0) : "—"} />
            <Stat label="Çözülen soru" value={solved ? fmtNum(solved, 0) : "—"} sub={target ? `hedefin %${pct(solved, target)}'i` : undefined} />
            <Stat label="Çalışma süresi" value={minutes ? minutesToText(minutes) : "—"} />
          </div>

          {loadingDetail ? (
            <PageLoader />
          ) : view === "takvim" ? (
            <CalendarView
              plan={plan}
              tasks={real}
              onToggle={toggle}
              onEdit={(t) => setEditing(t)}
              onAdd={(d, time) => setEditing({ day_index: d, subject: "TÜRKÇE", task_type: "soru", start_time: time, duration_min: time ? 40 : null })}
              onMove={moveTask}
            />
          ) : view === "tablo" ? (
            <WeekGrid
              plan={plan}
              field={field}
              tasks={real}
              days={days}
              onToggle={toggle}
              onEdit={(t) => setEditing(t)}
              onAdd={(d, subject) => setEditing({ day_index: d, subject, task_type: "soru" })}
              onLevel={setLevel}
              onPickDay={(d) => {
                setDay(d);
                setView("gun");
              }}
            />
          ) : (
            <DayView
              plan={plan}
              day={day}
              setDay={setDay}
              tasks={real}
              days={days}
              studentId={studentId}
              onToggle={toggle}
              onSolved={setSolved}
              onPatch={patchResult}
              onEdit={(t) => setEditing(t)}
              onAdd={(d) => setEditing({ day_index: d, subject: "TÜRKÇE", task_type: "soru" })}
              onLevel={setLevel}
              onDaySaved={(d) => setDays((ds) => [...ds.filter((x) => x.day_index !== d.day_index), d])}
            />
          )}
        </>
      )}

      {editing && plan && (
        <TaskEditor
          plan={plan}
          studentId={studentId}
          weekTopics={real.map((t) => t.topic_id).filter((x): x is string => Boolean(x))}
          task={editing}
          onClose={() => setEditing(null)}
          onSave={async (t) => {
            await saveTask(t);
            setEditing(null);
            toast.show("Kaydedildi");
          }}
          onDelete={
            editing.id
              ? async () => {
                  await removeTask(editing.id as string);
                  setEditing(null);
                  toast.show("Görev silindi");
                }
              : undefined
          }
        />
      )}

      <NewPlanModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        studentId={studentId}
        copyFrom={plan}
        copyTasks={tasks}
        isCounselor={isCounselor}
        onCreated={(id) => {
          setNewOpen(false);
          loadPlans(id);
        }}
      />
      {genOpen && (
        <GeneratorModal
          studentId={studentId}
          plans={sorted}
          onClose={() => setGenOpen(false)}
          onCreated={(id) => {
            setGenOpen(false);
            setView(window.innerWidth >= 900 ? "takvim" : "gun");
            loadPlans(id).then(() => reloadDetail(id));
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card px-3 py-2.5">
      <p className="text-[11px] font-medium text-muted">{label}</p>
      <p className="display mt-0.5 text-[22px] tabular">{value}</p>
      {sub && <p className="text-[11px] text-faint tabular">{sub}</p>}
    </div>
  );
}

/* ================================================================== */
/* Excel benzeri tablo                                                 */
/* ================================================================== */
function WeekGrid({
  plan,
  field,
  tasks,
  days,
  onToggle,
  onEdit,
  onAdd,
  onLevel,
  onPickDay,
}: {
  plan: WeeklyPlan;
  field?: string | null;
  tasks: PlanTask[];
  days: PlanDay[];
  onToggle: (t: PlanTask) => void;
  onEdit: (t: PlanTask) => void;
  onAdd: (d: number, subject: string) => void;
  onLevel: (d: number, l: DayLevel) => void;
  onPickDay: (d: number) => void;
}) {
  const [extra, setExtra] = useState<string[]>([]);
  const [adding, setAdding] = useState("");
  const levels = levelsOf(plan);
  const dates = Array.from({ length: 7 }, (_, i) => addDays(plan.start_date, i));
  const fieldSecs = field ? sectionsForField(field) : null;
  const base = fieldSecs
    ? GRID_SUBJECTS.filter((s) => !SUBJECT_SECTIONS[s] || s === "PARAGRAF" || s === "PROBLEM" ? true : SUBJECT_SECTIONS[s].some((x) => fieldSecs.includes(x)))
    : DEFAULT_SUBJECTS;
  const all = [...base, ...tasks.map((t) => t.subject), ...extra];
  const subjects = all.filter((s, i) => all.indexOf(s) === i).sort((a, b) => subjectOrder(a) - subjectOrder(b));
  const today = todayISO();
  const sum = (d: number, f: (t: PlanTask) => number) => tasks.filter((t) => t.day_index === d).reduce((s, t) => s + f(t), 0);
  const plannedMin = (d: number) => sum(d, (t) => (t.start_time ? (t.duration_min ?? 0) : 0));
  const timeSpan = (d: number) => {
    const timed = tasks.filter((t) => t.day_index === d && t.start_time);
    if (!timed.length) return "";
    const first = timed.map((t) => t.start_time as string).sort()[0];
    const ends = timed.map((t) => (timeToMinutes(t.start_time as string) ?? 0) + (t.duration_min ?? 0));
    const e = Math.max(...ends);
    return `${first}–${String(Math.floor(e / 60)).padStart(2, "0")}:${String(e % 60).padStart(2, "0")}`;
  };

  return (
    <div className="space-y-2">
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[1040px] table-fixed border-collapse text-[13px]">
          <colgroup>
            <col className="w-[132px]" />
            {dates.map((d) => (
              <col key={d} />
            ))}
          </colgroup>
          <thead>
            <tr className="bg-primary text-primary-fg">
              <th className="sticky left-0 z-10 bg-primary px-2 py-2 text-left text-xs font-semibold">DERSLER</th>
              {dates.map((d, i) => (
                <th key={d} className="border-l border-white/20 px-2 py-1.5 text-left">
                  <button className="w-full text-left" onClick={() => onPickDay(i)} title="Gün görünümünde aç">
                    <span className="block text-xs font-semibold">{dayName(d).toLocaleUpperCase("tr-TR")}</span>
                    <span className={cx("block text-[11px] font-normal opacity-80", d === today && "font-semibold opacity-100")}>
                      {formatShort(d)}
                      {d === today ? " · bugün" : ""}
                    </span>
                    {plannedMin(i) > 0 && <span className="block text-[10px] font-normal opacity-80 tabular">{timeSpan(i)} · {minutesToText(plannedMin(i))}</span>}
                  </button>
                </th>
              ))}
            </tr>
            <tr className="bg-surface-2">
              <th className="sticky left-0 z-10 bg-surface-2 px-2 py-1.5 text-left text-[11px] font-semibold text-muted">MÜSAİTLİK</th>
              {dates.map((d, i) => (
                <td key={d} className="border-l border-line px-1.5 py-1.5">
                  <select
                    aria-label={`${dayName(d)} müsaitlik`}
                    value={levels[i]}
                    onChange={(e) => onLevel(i, e.target.value as DayLevel)}
                    className={cx(
                      "h-7 w-full rounded-md border px-1 text-xs font-medium",
                      levels[i] === "kapali" ? "border-line bg-surface-2 text-faint" : levels[i] === "yogun" ? "border-transparent bg-primary-soft text-primary-ink" : "border-line bg-surface",
                    )}
                  >
                    {DAY_LEVELS.map((l) => (
                      <option key={l.value} value={l.value}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </td>
              ))}
            </tr>
          </thead>
          <tbody>
            {subjects.map((s) => (
              <tr key={s} className="border-t border-line align-top">
                <th scope="row" className={cx("sticky left-0 z-10 border-l-[3px] bg-surface px-2 py-2 text-left text-[11px] font-semibold text-muted", catBorder(s))}>
                  {s}
                </th>
                {dates.map((d, i) => {
                  const cell = tasks.filter((t) => t.subject === s && t.day_index === i).sort(byOrder);
                  const closed = levels[i] === "kapali";
                  return (
                    <td key={d} className={cx("group border-l border-line p-1", closed && "bg-surface-2/70")}>
                      <div className="space-y-0.5">
                        {cell.map((t) => (
                          <GridChip key={t.id} task={t} onToggle={onToggle} onEdit={onEdit} />
                        ))}
                        <button
                          onClick={() => onAdd(i, s)}
                          aria-label={`${s} ${dayName(d)} görev ekle`}
                          className={cx(
                            "flex w-full items-center justify-center rounded-md text-faint transition hover:bg-primary-soft hover:text-primary-ink",
                            cell.length ? "h-5 opacity-0 group-hover:opacity-100 focus:opacity-100" : "h-8 opacity-30 group-hover:opacity-100 focus:opacity-100",
                          )}
                        >
                          <Icon name="plus" size={14} />
                        </button>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="border-t-2 border-line bg-surface-2 font-medium">
              <th scope="row" className="sticky left-0 z-10 bg-surface-2 px-2 py-2 text-left text-[11px] font-semibold text-muted">
                HEDEF SORU
              </th>
              {dates.map((d, i) => {
                const t = sum(i, (x) => x.target_questions ?? 0);
                const cap = plannedMin(i) > 0 ? 0 : levelQ(levels[i]);
                return (
                  <td key={d} className="border-l border-line px-2 py-2 tabular">
                    {t || "—"}
                    {cap > 0 && <span className={cx("ml-1 text-[11px]", t > cap * 1.15 ? "text-warning" : "text-faint")}>/ ~{cap}</span>}
                  </td>
                );
              })}
            </tr>
            <tr className="border-t border-line bg-surface-2">
              <th scope="row" className="sticky left-0 z-10 bg-surface-2 px-2 py-2 text-left text-[11px] font-semibold text-muted">
                ÇÖZÜLEN
              </th>
              {dates.map((d, i) => {
                const sv = sum(i, (x) => x.solved ?? 0);
                const tg = sum(i, (x) => x.target_questions ?? 0);
                return (
                  <td key={d} className="border-l border-line px-2 py-2 tabular">
                    {sv || "—"}
                    {tg > 0 && sv > 0 && <span className="ml-1 text-[11px] text-faint">%{pct(sv, tg)}</span>}
                  </td>
                );
              })}
            </tr>
            <tr className="border-t border-line bg-surface-2">
              <th scope="row" className="sticky left-0 z-10 bg-surface-2 px-2 py-2 text-left text-[11px] font-semibold text-muted">
                ÇALIŞMA SÜRESİ
              </th>
              {dates.map((d, i) => (
                <td key={d} className="border-l border-line px-2 py-2 tabular">
                  {minutesToText(days.find((x) => x.day_index === i)?.study_minutes)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <input
          className="field h-9 w-56 py-1 text-sm"
          list="grid-subjects"
          placeholder="Ders satırı ekle (ör. AYT FİZİK)"
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const s = normalizeSubject(adding);
              if (s) setExtra((x) => [...x, s]);
              setAdding("");
            }
          }}
        />
        <datalist id="grid-subjects">
          {EXTRA_SUBJECT_SUGGESTIONS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <span>Hücreye tıkla → görev ekle · Göreve tıkla → düzenle · Kutucuk → tamamlandı</span>
        <span className="ml-auto flex flex-wrap gap-1.5">
          {TASK_TYPES.map((t) => (
            <span key={t.value} className={cx("rounded px-1.5 py-0.5 text-[10px] font-semibold", TYPE_TONE[t.value])}>
              {t.label}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}

function GridChip({ task, onToggle, onEdit }: { task: PlanTask; onToggle: (t: PlanTask) => void; onEdit: (t: PlanTask) => void }) {
  const progress = task.target_questions ? `${task.solved != null ? `${task.solved}/` : ""}${task.target_questions}` : "";
  return (
    <div className={cx("flex items-start gap-1 rounded-md px-1 py-0.5", task.done ? "bg-success-soft" : "hover:bg-surface-2")}>
      <button
        role="checkbox"
        aria-checked={task.done}
        aria-label={`${taskTitle(task)} tamamlandı`}
        onClick={() => onToggle(task)}
        className={cx(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border-[1.5px]",
          task.done ? "border-success bg-success text-white" : "border-faint bg-surface",
        )}
      >
        {task.done && <Icon name="check" size={11} strokeWidth={3.5} />}
      </button>
      <button onClick={() => onEdit(task)} className="min-w-0 flex-1 text-left leading-tight" title={task.content || undefined}>
        {task.start_time && <span className="mr-1 text-[10px] font-semibold text-muted tabular">{task.start_time}</span>}
        <span className={cx("mr-1 rounded px-1 text-[9px] font-bold uppercase", TYPE_TONE[task.task_type])}>{typeShort(task.task_type)}</span>
        <span className={cx(task.done && "text-muted")}>{taskTitle(task)}</span>
        {progress && <span className="ml-1 inline-block whitespace-nowrap text-[11px] font-semibold text-muted tabular">{progress}</span>}
      </button>
    </div>
  );
}

/* ================================================================== */
/* Gün görünümü (telefon / öğrenci)                                    */
/* ================================================================== */
function DayView({
  plan,
  day,
  setDay,
  tasks,
  days,
  studentId,
  onToggle,
  onSolved,
  onPatch,
  onEdit,
  onAdd,
  onLevel,
  onDaySaved,
}: {
  plan: WeeklyPlan;
  day: number;
  setDay: (d: number) => void;
  tasks: PlanTask[];
  days: PlanDay[];
  studentId: string;
  onToggle: (t: PlanTask) => void;
  onSolved: (t: PlanTask, n: number | null) => void;
  onPatch: (t: PlanTask, patch: Partial<PlanTask>) => void;
  onEdit: (t: PlanTask) => void;
  onAdd: (d: number) => void;
  onLevel: (d: number, l: DayLevel) => void;
  onDaySaved: (d: PlanDay) => void;
}) {
  const levels = levelsOf(plan);
  const dayTasks = tasks.filter((t) => t.day_index === day).sort(byOrder);
  const doneN = dayTasks.filter((t) => t.done).length;
  const target = dayTasks.reduce((s, t) => s + (t.target_questions ?? 0), 0);
  const solved = dayTasks.reduce((s, t) => s + (t.solved ?? 0), 0);
  const date = addDays(plan.start_date, day);

  return (
    <>
      <div className="no-scrollbar -mx-4 overflow-x-auto px-4">
        <div className="grid min-w-[322px] grid-cols-7 gap-1">
          {Array.from({ length: 7 }, (_, i) => {
            const d = addDays(plan.start_date, i);
            const dt = tasks.filter((t) => t.day_index === i);
            const active = i === day;
            return (
              <button
                key={i}
                onClick={() => setDay(i)}
                aria-pressed={active}
                className={cx(
                  "flex flex-col items-center rounded-xl border px-1 py-2 transition",
                  active ? "border-primary bg-primary text-primary-fg" : "border-line bg-surface hover:bg-surface-2",
                  !active && d === todayISO() && "ring-2 ring-primary/40",
                  !active && levels[i] === "kapali" && "opacity-60",
                )}
              >
                <span className={cx("text-[11px] font-medium", active ? "opacity-90" : "text-muted")}>{dayShort(d)}</span>
                <span className="text-lg font-semibold tabular">{parseISODate(d).getDate()}</span>
                <span className={cx("text-[11px] tabular", active ? "opacity-90" : "text-faint")}>
                  {dt.length ? `${dt.filter((t) => t.done).length}/${dt.length}` : "–"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <Card
        title={`${dayName(date)} · ${formatShort(date)}`}
        subtitle={
          dayTasks.length ? `${doneN}/${dayTasks.length} görev · ${solved}${target ? ` / ${target}` : ""} soru` : levels[day] === "kapali" ? "Bu gün kapalı (dinlenme)" : undefined
        }
        action={
          <select
            aria-label="Müsaitlik"
            value={levels[day]}
            onChange={(e) => onLevel(day, e.target.value as DayLevel)}
            className="h-8 rounded-lg border border-line bg-surface px-2 text-xs"
          >
            {DAY_LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        }
      >
        {dayTasks.length > 0 && <ProgressBar value={pct(doneN, dayTasks.length)} tone="success" label="Günün görevleri" />}
        {dayTasks.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">Bu gün için görev yok.</p>
        ) : (
          <ul className="-mx-1 mt-2 divide-y divide-line">
            {dayTasks.map((t) => (
              <li key={t.id}>
                <TaskRow task={t} onToggle={onToggle} onSolved={onSolved} onEdit={onEdit} onPatch={onPatch} />
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3">
          <Button variant="soft" size="sm" icon="plus" onClick={() => onAdd(day)}>
            Görev ekle
          </Button>
        </div>
      </Card>

      <DayDetails
        key={`details-${plan.id}-${day}`}
        plan={plan}
        dayIndex={day}
        studentId={studentId}
        solvedTotal={solved}
        current={days.find((d) => d.day_index === day) ?? null}
        onSaved={onDaySaved}
      />
    </>
  );
}

/** Görev satırı: kutucuk, tür, konu, hedef ve "çözdüğüm" girişi (Bugün ekranında da kullanılır) */
export function TaskRow({
  task,
  onToggle,
  onSolved,
  onEdit,
  onPatch,
}: {
  task: PlanTask;
  onToggle: (t: PlanTask) => void;
  onSolved: (t: PlanTask, n: number | null) => void;
  onEdit?: (t: PlanTask) => void;
  /** Doğru / yanlış sayısını kaydeder (konu başarı analizi için) */
  onPatch?: (t: PlanTask, patch: Partial<PlanTask>) => void;
}) {
  const [value, setValue] = useState(task.solved != null ? String(task.solved) : "");
  useEffect(() => setValue(task.solved != null ? String(task.solved) : ""), [task.solved]);
  const [dc, setDc] = useState(task.correct != null ? String(task.correct) : "");
  const [dw, setDw] = useState(task.wrong != null ? String(task.wrong) : "");
  useEffect(() => setDc(task.correct != null ? String(task.correct) : ""), [task.correct]);
  useEffect(() => setDw(task.wrong != null ? String(task.wrong) : ""), [task.wrong]);
  const commitDY = () => {
    if (!onPatch) return;
    const c = dc.trim() === "" ? null : Math.min(2000, Number(dc));
    const w = dw.trim() === "" ? null : Math.min(2000, Number(dw));
    if (c === task.correct && w === task.wrong) return;
    const patch: Partial<PlanTask> = { correct: c, wrong: w };
    // Çözülen sayı girilmemişse doğru + yanlış kadar say
    if (task.solved == null && (c != null || w != null)) patch.solved = (c ?? 0) + (w ?? 0);
    onPatch(task, patch);
  };
  const showSolved = task.task_type === "soru" || task.task_type === "deneme" || task.target_questions != null;
  const commit = () => {
    const n = value.trim() === "" ? null : Math.min(2000, Math.max(0, Math.round(Number(value))));
    if (n !== null && Number.isNaN(n)) return;
    if (n !== task.solved) onSolved(task, n);
  };
  return (
    <div className={cx("flex items-start gap-3 border-l-[3px] py-3 pl-2 pr-1", catBorder(task.subject))}>
      <button
        onClick={() => onToggle(task)}
        role="checkbox"
        aria-checked={task.done}
        aria-label={`${taskTitle(task)} tamamlandı`}
        className={cx(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition",
          task.done ? "border-success bg-success text-white" : "border-line bg-surface",
        )}
      >
        {task.done && <Icon name="check" size={16} strokeWidth={3} />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {task.start_time && (
            <span className="text-[12px] font-semibold tabular">
              {task.start_time}
              {task.duration_min ? <span className="font-normal text-muted"> · {task.duration_min} dk</span> : null}
            </span>
          )}
          <span className="text-[11px] font-semibold tracking-wide text-muted">{task.subject}</span>
          <span className={cx("rounded px-1.5 text-[10px] font-bold uppercase", TYPE_TONE[task.task_type])}>{typeShort(task.task_type)}</span>
        </div>
        <p className={cx("text-[15px] leading-snug", task.done && "text-faint line-through")}>{taskTitle(task)}</p>
        {task.topic_id && task.content.trim() && <p className="text-xs text-muted">{task.content}</p>}
        <TaskResourceLine task={task} />
        {showSolved && (
          <div className="mt-1.5 flex items-center gap-2 text-sm">
            <label className="text-xs text-muted" htmlFor={`solved-${task.id}`}>
              Çözdüğüm
            </label>
            <input
              id={`solved-${task.id}`}
              inputMode="numeric"
              className="field h-8 w-16 px-2 py-1 text-center text-sm tabular"
              value={value}
              onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, ""))}
              onBlur={commit}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              placeholder="0"
            />
            {task.target_questions ? <span className="text-xs text-muted tabular">/ {task.target_questions} soru</span> : <span className="text-xs text-muted">soru</span>}
          </div>
        )}
        {showSolved && onPatch && (
          <div className="mt-1.5 flex items-center gap-1.5 text-sm">
            <span className="text-xs text-muted">Doğru</span>
            <input
              aria-label="Doğru sayısı"
              inputMode="numeric"
              className="field h-8 w-14 px-1.5 py-1 text-center text-sm tabular"
              value={dc}
              onChange={(e) => setDc(e.target.value.replace(/[^\d]/g, ""))}
              onBlur={commitDY}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              placeholder="–"
            />
            <span className="ml-1 text-xs text-muted">Yanlış</span>
            <input
              aria-label="Yanlış sayısı"
              inputMode="numeric"
              className="field h-8 w-14 px-1.5 py-1 text-center text-sm tabular"
              value={dw}
              onChange={(e) => setDw(e.target.value.replace(/[^\d]/g, ""))}
              onBlur={commitDY}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              placeholder="–"
            />
          </div>
        )}
      </div>
      {onEdit && <IconButton icon="edit" label="Görevi düzenle" onClick={() => onEdit(task)} className="-mr-1 h-9 w-9" />}
    </div>
  );
}

/* ================================================================== */
/* Görev düzenleyici                                                   */
/* ================================================================== */
function TaskEditor({
  plan,
  studentId,
  weekTopics,
  task,
  onClose,
  onSave,
  onDelete,
}: {
  plan: WeeklyPlan;
  studentId: string;
  weekTopics: string[];
  task: Partial<PlanTask>;
  onClose: () => void;
  onSave: (t: Partial<PlanTask>) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [t, setT] = useState<Partial<PlanTask>>({ task_type: "soru", content: "", ...task });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<PlanTask>) => setT((x) => ({ ...x, ...patch }));
  const subject = t.subject ?? "TÜRKÇE";
  const sections = SUBJECT_SECTIONS[subject] ?? [];
  const subjects = [...DEFAULT_SUBJECTS, ...EXTRA_SUBJECT_SUGGESTIONS, ...Object.keys(SUBJECT_SECTIONS)];
  const subjectOptions = [...subjects, subject].filter((s, i, a) => a.indexOf(s) === i);
  const num = (v: string) => (v.trim() === "" ? null : Math.min(2000, Math.max(0, Math.round(Number(v.replace(/[^\d]/g, "")) || 0))));
  const [sugs, setSugs] = useState<Candidate[] | null>(null);
  const [sugBusy, setSugBusy] = useState(false);
  const [resources, setResources] = useState<Resource[]>([]);
  useEffect(() => {
    fetchResources(studentId)
      .then((rs) => setResources(rs.filter((r) => r.status !== "done" || r.id === task.resource_id)))
      .catch(() => setResources([]));
  }, [studentId, task.resource_id]);
  const subjectResources = [...resources].sort((a, b) => Number(b.subject === subject) - Number(a.subject === subject));
  const linkedTests = parseTestList(t.resource_tests);

  /** Aynı dersten öncelikli (deneme yanlışı, kronik eksik, sıradaki konu…) başka konular önerir */
  async function suggest() {
    setSugBusy(true);
    try {
      const [progress, analyses] = await Promise.all([fetchTopicProgress(studentId), fetchAnalyses(studentId)]);
      const list = buildCandidates({
        start: plan.start_date,
        schedule: emptySchedule(studentId),
        sections,
        tyt: analyses.find((a) => a.exam_type === "TYT") ?? null,
        ayt: analyses.find((a) => a.exam_type === "AYT") ?? null,
        progress,
        history: [],
        tytShare: 50,
        routines: { paragraf: false, problem: false },
        carryOver: false,
        excluded: [...weekTopics, t.topic_id ?? ""].filter(Boolean),
        allAnalyses: analyses,
      });
      setSugs(list.slice(0, 4));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSugBusy(false);
    }
  }

  async function save() {
    setError(null);
    if (!t.topic_id && !(t.content ?? "").trim() && !t.target_questions) return setError("Bir konu seçin veya açıklama yazın.");
    setBusy(true);
    try {
      await onSave({ ...t, subject });
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t.id ? "Görevi düzenle" : "Görev ekle"}
      footer={
        <>
          {onDelete && (
            <Button
              variant="danger"
              icon="trash"
              className="mr-auto"
              onClick={async () => {
                if (!confirmAction("Görev silinsin mi?")) return;
                try {
                  await onDelete();
                } catch (e) {
                  setError(errorText(e));
                }
              }}
            >
              Sil
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Vazgeç
          </Button>
          <Button icon="check" onClick={save} loading={busy}>
            Kaydet
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Gün" htmlFor="te-day">
            <select id="te-day" className="field" value={t.day_index ?? 0} onChange={(e) => set({ day_index: Number(e.target.value) })}>
              {Array.from({ length: 7 }, (_, i) => (
                <option key={i} value={i}>
                  {dayName(addDays(plan.start_date, i))} · {formatShort(addDays(plan.start_date, i))}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Ders" htmlFor="te-subject">
            <select id="te-subject" className="field" value={subject} onChange={(e) => set({ subject: e.target.value, topic_id: null })}>
              {subjectOptions.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Saat (isteğe bağlı)" htmlFor="te-time">
            <input id="te-time" type="time" className="field" value={t.start_time ?? ""} onChange={(e) => set({ start_time: e.target.value || null })} />
          </Field>
          <Field label="Süre (dk)" htmlFor="te-dur">
            <input
              id="te-dur"
              inputMode="numeric"
              className="field"
              value={t.duration_min ?? ""}
              placeholder="—"
              onChange={(e) => {
                const v = e.target.value.replace(/[^\d]/g, "");
                set({ duration_min: v ? Math.min(600, Number(v)) : null });
              }}
            />
          </Field>
        </div>
        <Field label="Görev türü">
          <div className="flex flex-wrap gap-1.5">
            {TASK_TYPES.map((x) => (
              <button
                key={x.value}
                type="button"
                onClick={() => set({ task_type: x.value })}
                aria-pressed={t.task_type === x.value}
                className={cx(
                  "rounded-lg border px-3 py-1.5 text-sm font-medium transition",
                  t.task_type === x.value ? "border-primary bg-primary text-primary-fg" : "border-line bg-surface hover:bg-surface-2",
                )}
              >
                {x.label}
              </button>
            ))}
          </div>
        </Field>
        {sections.length > 0 && (
          <Field
            label="Konu"
            htmlFor="te-topic"
            hint={
              t.task_type === "konu"
                ? "Tamamlanınca konu takibinde “Bitti” olur"
                : t.task_type === "tekrar"
                  ? "Tamamlanınca konu takibinde “Tekrar edildi” olur"
                  : t.task_type === "soru"
                    ? "Tamamlanınca konu takibinde en az “Çalışılıyor” olur"
                    : undefined
            }
          >
            <select id="te-topic" className="field" value={t.topic_id ?? ""} onChange={(e) => set({ topic_id: e.target.value || null })}>
              <option value="">— Konu seçilmedi —</option>
              {COURSES.flatMap((c) => c.sections)
                .filter((s) => sections.includes(s.id))
                .map((s) => (
                  <optgroup key={s.id} label={sectionTitle.get(s.id)}>
                    {s.topics.map((tp) => (
                      <option key={tp.id} value={tp.id}>
                        {tp.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
            </select>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Button size="sm" variant="soft" icon="target" onClick={suggest} loading={sugBusy}>
                Başka konu öner
              </Button>
              {sugs?.length === 0 && <span className="text-xs text-muted">Bu derste öneri yok.</span>}
              {sugs?.map((c) => (
                <button
                  key={c.topic_id}
                  type="button"
                  onClick={() => {
                    set({ topic_id: c.topic_id, task_type: c.mode === "konu" ? "konu" : t.task_type === "konu" ? "soru" : t.task_type });
                    setSugs(null);
                  }}
                  className="rounded-lg border border-line bg-surface px-2.5 py-1 text-left text-xs hover:border-primary hover:bg-primary-soft"
                  title={c.reasons.join(" · ")}
                >
                  <span className="font-semibold">{c.name}</span>
                  <span className="block text-[11px] text-muted">{c.reasons[0] ?? ""}</span>
                </button>
              ))}
            </div>
          </Field>
        )}
        {resources.length > 0 && (
          <Field
            label="Kaynak (isteğe bağlı)"
            htmlFor="te-res"
            hint={
              t.resource_id
                ? linkedTests.length
                  ? `Görev tamamlanınca ${linkedTests.length === 1 ? `test ${linkedTests[0]}` : `${linkedTests.length} test`} kaynakta “çözüldü” olur${linkedTests.length === 1 ? "; doğru/yanlış da teste yazılır" : ""}.`
                  : "Test numarası yazın: 12 · 12-14 · 12, 15"
                : undefined
            }
          >
            <div className="flex gap-2">
              <select
                id="te-res"
                className="field min-w-0 flex-1"
                value={t.resource_id ?? ""}
                onChange={(e) => set({ resource_id: e.target.value || null, resource_tests: e.target.value ? t.resource_tests ?? "" : null })}
              >
                <option value="">— Kaynak yok —</option>
                {subjectResources.map((r) => (
                  <option key={r.id} value={r.id}>
                    {resourceLabel(r)}
                    {r.subject && r.subject !== subject ? ` (${r.subject})` : ""}
                  </option>
                ))}
              </select>
              {t.resource_id && (
                <input
                  aria-label="Test numaraları"
                  className="field w-28"
                  value={t.resource_tests ?? ""}
                  maxLength={40}
                  placeholder="Test 12-14"
                  onChange={(e) => set({ resource_tests: e.target.value.replace(/[^\d,\s-]/g, "") })}
                />
              )}
            </div>
          </Field>
        )}
        <Field label="Hedef soru sayısı" htmlFor="te-target">
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="te-target"
              inputMode="numeric"
              className="field w-24"
              value={t.target_questions ?? ""}
              onChange={(e) => set({ target_questions: num(e.target.value) })}
              placeholder="—"
            />
            {[20, 30, 40, 50, 60].map((n) => (
              <button key={n} type="button" onClick={() => set({ target_questions: n })} className="rounded-lg border border-line px-2.5 py-1 text-sm hover:bg-surface-2">
                {n}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Açıklama (isteğe bağlı)" htmlFor="te-content">
          <input
            id="te-content"
            className="field"
            maxLength={500}
            value={t.content ?? ""}
            onChange={(e) => set({ content: e.target.value })}
            placeholder="ör. 3D yayınları test 4-6, video: …"
          />
        </Field>
        <details className="rounded-xl bg-surface-2 p-3" open={Boolean(t.done || t.solved)}>
          <summary className="cursor-pointer text-sm font-medium text-muted">Öğrenci sonucu (tamamlandı, çözülen, doğru, yanlış)</summary>
          <label className="mt-3 flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" className="h-5 w-5" checked={Boolean(t.done)} onChange={(e) => set({ done: e.target.checked })} />
            Tamamlandı
          </label>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {(
              [
                ["solved", "Çözülen"],
                ["correct", "Doğru"],
                ["wrong", "Yanlış"],
              ] as const
            ).map(([k, label]) => (
              <Field key={k} label={label} htmlFor={`te-${k}`}>
                <input id={`te-${k}`} inputMode="numeric" className="field" value={t[k] ?? ""} onChange={(e) => set({ [k]: num(e.target.value) })} />
              </Field>
            ))}
          </div>
        </details>
        {error && <ErrorBox>{error}</ErrorBox>}
      </div>
    </Modal>
  );
}

/* ================================================================== */
/* Otomatik program oluşturucu                                         */
/* ================================================================== */
const ALL_SECTIONS = COURSES.flatMap((c) => c.sections);

function defaultShare(field: string | null, grade: string | null) {
  if (field === "TYT" || field === "DİL") return 100;
  if (grade && /^(9|10|11)\./.test(grade)) return 70;
  return 50;
}

export function GeneratorModal({
  studentId,
  plans: plansProp,
  initialAnalysisId,
  onClose,
  onCreated,
}: {
  studentId: string;
  plans?: WeeklyPlan[];
  initialAnalysisId?: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const toast = useToast();
  const { go } = useRoute();
  const [data, setData] = useState<{
    plans: WeeklyPlan[];
    analyses: ExamAnalysis[];
    progress: TopicProgress[];
    schedule: StudySchedule;
    field: string | null;
    grade: string | null;
    history: HistoryTask[];
  } | null>(null);
  const [start, setStart] = useState(todayISO());
  const [tytId, setTytId] = useState("");
  const [aytId, setAytId] = useState("");
  const [sections, setSections] = useState<string[]>([]);
  const [tytShare, setTytShare] = useState(50);
  const [routines, setRoutines] = useState({ paragraf: true, problem: true });
  const [carryOver, setCarryOver] = useState(true);
  const [pattern, setPattern] = useState<"1-1" | "2-1" | "1-2">("1-1");
  const [excluded, setExcluded] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [plans, analyses, progress, schedule, prof] = await Promise.all([
          plansProp ? Promise.resolve(plansProp) : fetchPlans(studentId),
          fetchAnalyses(studentId),
          fetchTopicProgress(studentId),
          fetchSchedule(studentId),
          sb().from("profiles").select("field, grade").eq("id", studentId).single(),
        ]);
        // Son 4 haftanın görevleri (önceki programlar)
        const recent = plans.filter((p) => p.start_date >= addDays(todayISO(), -35));
        let history: HistoryTask[] = [];
        if (recent.length) {
          const { data: rows, error } = await sb()
            .from("plan_tasks")
            .select("plan_id, topic_id, task_type, done")
            .in("plan_id", recent.map((p) => p.id));
          if (error) throw error;
          const startOf = new Map(recent.map((p) => [p.id, p.start_date]));
          history = ((rows ?? []) as { plan_id: string; topic_id: string | null; task_type: TaskType; done: boolean }[]).map((r) => ({
            plan_start: startOf.get(r.plan_id) ?? "",
            topic_id: r.topic_id,
            task_type: r.task_type,
            done: r.done,
          }));
        }
        const field = (prof.data as { field: string | null } | null)?.field ?? null;
        const grade = (prof.data as { grade: string | null } | null)?.grade ?? null;
        setData({ plans, analyses, progress, schedule, field, grade, history });
        setSections(sectionsForField(field));
        setTytShare(defaultShare(field, grade));
        const pre = initialAnalysisId ? analyses.find((a) => a.id === initialAnalysisId) : undefined;
        const lastT = analyses.find((a) => a.exam_type === "TYT");
        const lastA = analyses.find((a) => a.exam_type === "AYT");
        setTytId((pre?.exam_type === "TYT" ? pre : lastT)?.id ?? "");
        setAytId((pre?.exam_type === "AYT" ? pre : lastA)?.id ?? "");
        // Başlangıç: en son programın ertesi haftası, yoksa bugün
        const last = [...plans].sort((a, b) => b.start_date.localeCompare(a.start_date))[0];
        if (last && addDays(last.start_date, 7) >= todayISO()) setStart(addDays(last.start_date, 7));
      } catch (e) {
        setError(errorText(e));
      }
    })();
  }, [studentId, plansProp, initialAnalysisId]);

  const result = useMemo(() => {
    if (!data) return null;
    return buildTimedPlan({
      start,
      schedule: data.schedule,
      sections,
      tyt: data.analyses.find((a) => a.id === tytId) ?? null,
      ayt: data.analyses.find((a) => a.id === aytId) ?? null,
      progress: data.progress,
      history: data.history,
      tytShare,
      routines,
      carryOver,
      excluded,
      pattern: pattern.split("-").map(Number) as [number, number],
      allAnalyses: data.analyses,
    });
  }, [data, start, sections, tytId, aytId, tytShare, routines, carryOver, excluded, pattern]);

  // Önizlemede elle yapılan değişiklikler: blok → başka konu / kaldırıldı
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [removed, setRemoved] = useState<string[]>([]);
  const [cycle, setCycle] = useState<Record<string, number>>({});
  useEffect(() => {
    setOverrides({});
    setRemoved([]);
    setCycle({});
  }, [result]);
  const keyOf = (b: { day_index: number; sort: number }) => `${b.day_index}-${b.sort}`;
  const finalBlocks = useMemo(() => {
    if (!result) return [];
    return result.blocks
      .filter((b) => !removed.includes(keyOf(b)))
      .map((b) => {
        const tid = overrides[keyOf(b)];
        const c = tid ? result.pool.find((x) => x.topic_id === tid) : null;
        if (!c) return b;
        const type: TaskType = c.mode === "konu" ? "konu" : b.task_type === "konu" ? "soru" : b.task_type;
        const q = Math.max(5, Math.round(((b.duration_min ?? 40) * (c.category === "sayisal" ? 0.6 : 0.8)) / 5) * 5);
        return { ...b, topic_id: c.topic_id, subject: c.subject, category: c.category, task_type: type, target_questions: type === "konu" ? null : (b.target_questions ?? q), content: type === "konu" ? "Konu çalışması + örnek sorular" : b.content };
      });
  }, [result, overrides, removed]);
  function swap(b: (typeof finalBlocks)[number]) {
    if (!result) return;
    const k = keyOf(b);
    const sameDay = new Set(finalBlocks.filter((x) => x.day_index === b.day_index).map((x) => x.topic_id));
    const opts = result.pool.filter(
      (c) => c.category === b.category && (!b.exam || c.exam === b.exam || c.exam === "BOTH") && c.topic_id !== b.topic_id && !sameDay.has(c.topic_id),
    );
    if (!opts.length) return toast.show("Bu blok için başka uygun konu yok", "danger");
    const i = cycle[k] ?? 0;
    setOverrides((o) => ({ ...o, [k]: opts[i % opts.length].topic_id }));
    setCycle((c) => ({ ...c, [k]: i + 1 }));
  }
  const finalTasks: DraftTask[] = finalBlocks.map(({ category: _c, exam: _e, routine: _r, ...t }) => t);
  const usedList = useMemo(() => {
    if (!result) return [];
    const cnt = new Map<string, number>();
    for (const b of finalBlocks) if (b.topic_id) cnt.set(b.topic_id, (cnt.get(b.topic_id) ?? 0) + 1);
    return result.pool.filter((c) => cnt.has(c.topic_id)).map((c) => ({ ...c, uses: cnt.get(c.topic_id) ?? 0 }));
  }, [result, finalBlocks]);

  const scheduleEmpty = data ? data.schedule.slots.every((r) => rangeMinutes(r) === 0) : false;
  const hasAyt = sections.some((s) => ALL_SECTIONS.find((x) => x.id === s)?.exam === "AYT");

  async function create() {
    if (!data || !result) return;
    setError(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return setError("Geçerli bir başlangıç tarihi seçin.");
    if (!finalTasks.length) return setError("Oluşturulacak blok yok. Çalışma saatlerini ve ders seçimini kontrol edin.");
    setBusy(true);
    try {
      const minutes = result.dayMinutes;
      const levels: DayLevel[] = minutes.map((m) => (m === 0 ? "kapali" : m <= 90 ? "hafif" : m <= 180 ? "normal" : "yogun"));
      const tyt = data.analyses.find((a) => a.id === tytId) ?? null;
      const ayt = data.analyses.find((a) => a.id === aytId) ?? null;
      const title = [tyt?.title, ayt?.title].filter(Boolean).join(" + ");
      let plan = data.plans.find((p) => p.start_date === start) ?? null;
      if (plan) {
        const { count } = await sb().from("plan_tasks").select("id", { count: "exact", head: true }).eq("plan_id", plan.id).eq("done", false);
        if (count && !confirmAction(`${formatTR(start)} haftasında tamamlanmamış ${count} görev var. Bunlar silinip yerine yeni program yazılsın mı? (Tamamlanan görevler kalır.)`)) {
          setBusy(false);
          return;
        }
        if (count) {
          const { error } = await sb().from("plan_tasks").delete().eq("plan_id", plan.id).eq("done", false);
          if (error) throw error;
        }
        await sb().from("weekly_plans").update({ day_levels: levels, analysis_id: (tyt ?? ayt)?.id ?? null }).eq("id", plan.id);
      } else {
        const { data: row, error } = await sb()
          .from("weekly_plans")
          .insert({ student_id: studentId, start_date: start, day_levels: levels, analysis_id: (tyt ?? ayt)?.id ?? null, title: title ? `${title} sonrası` : null })
          .select("*")
          .single();
        if (error) throw error;
        plan = row as WeeklyPlan;
      }
      const rows = finalTasks.map((t: DraftTask) => ({ ...t, plan_id: (plan as WeeklyPlan).id, student_id: studentId, done: false }));
      const { error: e2 } = await sb().from("plan_tasks").insert(rows);
      if (e2) throw e2;
      toast.show(`${rows.length} blokluk program oluşturuldu`);
      onCreated((plan as WeeklyPlan).id);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  const toggleSection = (id: string) => setSections((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));
  const dates = Array.from({ length: 7 }, (_, i) => addDays(start, i));

  return (
    <Modal
      open
      onClose={onClose}
      title="Otomatik haftalık program"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Vazgeç
          </Button>
          <Button icon="check" onClick={create} loading={busy} disabled={!result || scheduleEmpty || !finalTasks.length}>
            Programı oluştur{result ? ` (${finalTasks.length} blok)` : ""}
          </Button>
        </>
      }
    >
      {!data || !result ? (
        error ? <ErrorBox>{error}</ErrorBox> : <PageLoader />
      ) : scheduleEmpty ? (
        <div className="space-y-3">
          <EmptyState icon="clock" title="Önce çalışma saatlerini gir">
            Program, öğrencinin çalışabileceği saatlere göre oluşturulur. Saatler bölümünde her gün için saat aralıklarını girip kaydet.
          </EmptyState>
          <div className="flex justify-center">
            <Button
              icon="clock"
              onClick={() => {
                onClose();
                go({ v: "ogrenci", id: studentId, t: "saatler" });
              }}
            >
              Çalışma saatlerine git
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Başlangıç tarihi" htmlFor="g-start" hint={`${dayName(start)} → ${dayName(addDays(start, 6))}`}>
              <input id="g-start" type="date" className="field" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} />
            </Field>
            {(["TYT", "AYT"] as const).map((ex) => {
              const list = data.analyses.filter((a) => a.exam_type === ex);
              const val = ex === "TYT" ? tytId : aytId;
              return (
                <Field key={ex} label={`${ex} denemesi`} htmlFor={`g-${ex}`} hint={list.length ? "Yanlış/boş konular öne alınır" : "Bu türde deneme yok"}>
                  <select
                    id={`g-${ex}`}
                    className="field"
                    value={val}
                    onChange={(e) => {
                      (ex === "TYT" ? setTytId : setAytId)(e.target.value);
                      setExcluded([]);
                    }}
                  >
                    <option value="">Kullanma</option>
                    {list.map((a) => (
                      <option key={a.id} value={a.id}>
                        {formatShort(a.exam_date)} · {a.title}
                      </option>
                    ))}
                  </select>
                </Field>
              );
            })}
          </div>

          <details className="group rounded-xl border border-line">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm">
              <span>
                <span className="font-medium">Gelişmiş ayarlar</span>
                <span className="block text-xs text-muted">
                  {sections.length} ders · {hasAyt ? (tytShare === 100 ? "yalnız TYT" : `TYT %${tytShare}`) : "yalnız TYT"} · {pattern === "1-1" ? "1 sayısal · 1 sözel" : pattern === "2-1" ? "2 sayısal · 1 sözel" : "1 sayısal · 2 sözel"}
                  {routines.paragraf ? " · paragraf" : ""}
                  {routines.problem ? " · problem" : ""}
                </span>
              </span>
              <Icon name="chevronDown" size={18} className="shrink-0 text-muted transition group-open:rotate-180" />
            </summary>
            <div className="space-y-5 border-t border-line p-3">
          <div>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium">
                Dersler <span className="font-normal text-muted">· Alan: {data.field ?? "belirtilmemiş"}</span>
              </p>
              <button className="text-xs text-primary" onClick={() => setSections(sectionsForField(data.field))}>
                Alana göre varsayılan
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {(["sayisal", "sozel"] as const).map((cat) => (
                <div key={cat} className={cx("rounded-xl border p-2.5", cat === "sayisal" ? "border-say/30 bg-say-soft/40" : "border-soz/30 bg-soz-soft/40")}>
                  <p className={cx("mb-1.5 text-xs font-bold uppercase tracking-wide", cat === "sayisal" ? "text-say" : "text-soz")}>{cat === "sayisal" ? "Sayısal" : "Sözel"}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_SECTIONS.filter((s) => categoryOfSection(s.id) === cat).map((s) => {
                      const on = sections.includes(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggleSection(s.id)}
                          className={cx(
                            "rounded-lg border px-2 py-1 text-xs font-medium transition",
                            on ? (cat === "sayisal" ? "border-say bg-say text-white" : "border-soz bg-soz text-white") : "border-line bg-surface text-muted hover:bg-surface-2",
                          )}
                        >
                          {s.title.replace(" (TYT konuları hariç)", "").replace("Din Kültürü ve Ahlak Bilgisi", "TYT Din Kültürü")}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-3">
              <div>
                <p className="mb-1.5 text-sm font-medium">Blok sırası</p>
                <Segmented
                  size="sm"
                  ariaLabel="Blok sırası"
                  value={pattern}
                  onChange={setPattern}
                  options={[
                    { value: "1-1", label: "1 sayısal · 1 sözel" },
                    { value: "2-1", label: "2 say · 1 söz" },
                    { value: "1-2", label: "1 say · 2 söz" },
                  ]}
                />
              </div>
              <div>
              <p className="mb-1.5 text-sm font-medium">TYT / AYT dağılımı</p>
              {hasAyt ? (
                <Segmented
                  size="sm"
                  ariaLabel="TYT oranı"
                  value={tytShare}
                  onChange={setTytShare}
                  options={[100, 70, 50, 30].map((n) => ({ value: n, label: n === 100 ? "Yalnız TYT" : `TYT %${n}` }))}
                />
              ) : (
                <p className="text-sm text-muted">Seçili derslerde AYT yok, bloklar TYT’den.</p>
              )}
              </div>
            </div>
            <div className="space-y-1.5 text-sm">
              <p className="font-medium">Seçenekler</p>
              <label className="flex items-center gap-2">
                <input type="checkbox" className="h-4 w-4" checked={routines.paragraf} onChange={(e) => setRoutines((r) => ({ ...r, paragraf: e.target.checked }))} />
                Her gün 20 dk paragraf
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" className="h-4 w-4" checked={routines.problem} onChange={(e) => setRoutines((r) => ({ ...r, problem: e.target.checked }))} />
                Her gün 20 dk problem
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" className="h-4 w-4" checked={carryOver} onChange={(e) => setCarryOver(e.target.checked)} />
                Geçen haftadan kalanları öne al
              </label>
            </div>
          </div>

            </div>
          </details>

          <div>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium">Önizleme <span className="font-normal text-muted">· beğenmediğin bloğu “Değiştir” ile başka konuya çevir</span></p>
              <p className="text-xs text-muted tabular">
                {result.stats.sayisal} sayısal · {result.stats.sozel} sözel · TYT {result.stats.tyt} / AYT {result.stats.ayt} blok · ~{fmtNum(result.stats.questions, 0)} soru
              </p>
            </div>
            <div className="max-h-80 space-y-2 overflow-y-auto rounded-xl border border-line p-2">
              {dates.map((d, i) => {
                const list = finalBlocks.filter((b) => b.day_index === i);
                return (
                  <div key={d}>
                    <p className="px-1 text-xs font-semibold text-muted">
                      {dayName(d)} {formatShort(d)}
                      <span className="font-normal text-faint"> · {result.dayMinutes[i] ? `${minutesToText(result.dayMinutes[i])} ders` : "çalışma yok"}</span>
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {list.map((b) => (
                        <li
                          key={b.sort}
                          className={cx(
                            "flex items-center gap-2 rounded-md border-l-[3px] bg-surface-2/60 px-2 py-1 text-xs",
                            b.category === "sayisal" ? "border-say" : "border-soz",
                          )}
                        >
                          <span className="w-10 shrink-0 font-semibold tabular">{b.start_time}</span>
                          <span className="w-24 shrink-0 truncate text-[11px] text-muted">{b.subject}</span>
                          <span className="min-w-0 flex-1 truncate">{b.topic_id ? (topicName.get(b.topic_id) ?? b.topic_id) : b.content}</span>
                          <span className={cx("rounded px-1 text-[9px] font-bold uppercase", TYPE_TONE[b.task_type])}>{typeShort(b.task_type)}</span>
                          <span className="w-8 shrink-0 text-right tabular text-muted">{b.target_questions ?? ""}</span>
                          {!b.routine && (
                            <button
                              type="button"
                              onClick={() => swap(b)}
                              className="rounded px-1.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary-soft"
                              title="Bu bloğa başka konu koy"
                            >
                              Değiştir
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setRemoved((r) => [...r, keyOf(b)])}
                            aria-label="Bloğu kaldır"
                            className="flex h-6 w-6 items-center justify-center rounded text-faint hover:bg-danger-soft hover:text-danger"
                          >
                            <Icon name="x" size={13} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Bu hafta çalışılacak konular</p>
            {usedList.length === 0 ? (
              <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted">Konu bulunamadı. Ders seçimini veya deneme analizini kontrol et.</p>
            ) : (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {usedList.map((c) => (
                  <li key={c.topic_id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                    <span className={cx("h-2 w-2 shrink-0 rounded-full", c.category === "sayisal" ? "bg-say" : "bg-soz")} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{c.name}</p>
                      <p className="truncate text-xs text-muted">
                        {c.subject} · {c.reasons.join(" · ")}
                      </p>
                    </div>
                    <Badge>{c.uses} blok</Badge>
                    <IconButton icon="x" label="Konuyu çıkar" className="h-8 w-8" onClick={() => setExcluded((x) => [...x, c.topic_id])} />
                  </li>
                ))}
              </ul>
            )}
            {excluded.length > 0 && (
              <button className="mt-1 text-xs text-primary" onClick={() => setExcluded([])}>
                Çıkarılan {excluded.length} konuyu geri al
              </button>
            )}
          </div>
          <p className="text-xs text-muted">Oluşturduktan sonra tabloda her bloğu değiştirebilir, silebilir veya yeni görev ekleyebilirsin.</p>
          {error && <ErrorBox>{error}</ErrorBox>}
        </div>
      )}
    </Modal>
  );
}

/* ================================================================== */
/* Boş hafta / kopyala                                                 */
/* ================================================================== */
function NewPlanModal({
  open,
  onClose,
  studentId,
  copyFrom,
  copyTasks,
  isCounselor,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  studentId: string;
  copyFrom: WeeklyPlan | null;
  copyTasks: PlanTask[];
  isCounselor: boolean;
  onCreated: (id: string) => void;
}) {
  const toast = useToast();
  const [start, setStart] = useState(todayISO());
  const [title, setTitle] = useState("");
  const [copy, setCopy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStart(copyFrom ? addDays(copyFrom.start_date, 7) : todayISO());
      setTitle("");
      setCopy(false);
      setError(null);
    }
  }, [open, copyFrom]);

  async function create() {
    setError(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return setError("Geçerli bir başlangıç tarihi seçin.");
    setBusy(true);
    const { data, error } = await sb()
      .from("weekly_plans")
      .insert({ student_id: studentId, start_date: start, title: title.trim().slice(0, 120) || null, day_levels: levelsOf(copyFrom) })
      .select("*")
      .single();
    if (error) {
      setBusy(false);
      return setError(/duplicate|unique/i.test(error.message) ? "Bu tarihte başlayan bir program zaten var." : errorText(error));
    }
    const np = data as WeeklyPlan;
    if (copy && copyTasks.length) {
      const rows = copyTasks.filter(hasText).map((t) => ({
        plan_id: np.id,
        student_id: studentId,
        day_index: t.day_index,
        subject: t.subject,
        content: t.content,
        topic_id: t.topic_id,
        task_type: t.task_type,
        target_questions: t.target_questions,
        sort: t.sort,
        start_time: t.start_time,
        duration_min: t.duration_min,
        done: false,
      }));
      const { error: e3 } = await sb().from("plan_tasks").insert(rows);
      if (e3) toast.show("Görevler kopyalanamadı: " + errorText(e3), "danger");
    }
    setBusy(false);
    toast.show("Hafta oluşturuldu");
    onCreated(np.id);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Yeni hafta"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Vazgeç
          </Button>
          <Button onClick={create} loading={busy} icon="check">
            Oluştur
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Programın veriliş (başlangıç) tarihi" hint={`7 gün sürer: ${dayName(start)} → ${dayName(addDays(start, 6))}`} htmlFor="np-start">
          <input id="np-start" type="date" className="field" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="Başlık (isteğe bağlı)" htmlFor="np-title">
          <input
            id="np-title"
            className="field"
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={isCounselor ? "ör. Deneme haftası" : "ör. Tatil programı"}
          />
        </Field>
        {copyFrom && (
          <label className="flex items-start gap-3 rounded-xl bg-surface-2 p-3 text-sm">
            <input type="checkbox" className="mt-0.5 h-5 w-5" checked={copy} onChange={(e) => setCopy(e.target.checked)} />
            <span>
              Görüntülenen haftanın görevlerini kopyala
              <span className="block text-xs text-muted">{formatTR(copyFrom.start_date)} haftasındaki görevler, tamamlanmamış olarak aktarılır.</span>
            </span>
          </label>
        )}
        {error && <ErrorBox>{error}</ErrorBox>}
      </div>
    </Modal>
  );
}

/* ================================================================== */
function DayDetails({
  plan,
  dayIndex,
  studentId,
  current,
  onSaved,
  solvedTotal,
}: {
  plan: WeeklyPlan;
  dayIndex: number;
  studentId: string;
  solvedTotal: number;
  current: PlanDay | null;
  onSaved: (d: PlanDay) => void;
}) {
  const toast = useToast();
  const [notes, setNotes] = useState(current?.notes ?? "");
  const [blocks, setBlocks] = useState<TimeBlock[]>(current?.time_blocks ?? []);
  const [minutes, setMinutes] = useState<string>(current?.study_minutes != null ? String(current.study_minutes) : "");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);

  const blockMinutes = blocks.reduce((s, b) => {
    const a = timeToMinutes(b.start);
    const e = timeToMinutes(b.end);
    if (a == null || e == null) return s;
    return s + (e >= a ? e - a : e + 1440 - a);
  }, 0);

  const mark = () => setDirty(true);

  async function save() {
    const m = minutes.trim() === "" ? null : Math.max(0, Math.min(1440, Math.round(Number(minutes))));
    if (m != null && Number.isNaN(m)) {
      toast.show("Süre sayı olmalı", "danger");
      return;
    }
    setSaving(true);
    const cleanBlocks = blocks
      .filter((b) => b.start || b.end || b.label.trim())
      .map((b) => ({ start: b.start, end: b.end, label: b.label.trim().slice(0, 120) }))
      .slice(0, 20);
    const { data, error } = await sb()
      .from("plan_days")
      .upsert(
        {
          plan_id: plan.id,
          day_index: dayIndex,
          student_id: studentId,
          notes: notes.slice(0, 2000),
          time_blocks: cleanBlocks,
          study_minutes: m,
        },
        { onConflict: "plan_id,day_index" },
      )
      .select("*")
      .single();
    setSaving(false);
    if (error) return toast.show(errorText(error), "danger");
    setDirty(false);
    onSaved(data as PlanDay);
    toast.show("Gün kaydedildi");
  }

  return (
    <Card title="Gün sonu" subtitle="Notlar, zaman aralıkları ve toplam çalışma süresi">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Toplam çalışma (dk)" htmlFor={`min-${dayIndex}`}>
            <input
              id={`min-${dayIndex}`}
              className="field"
              inputMode="numeric"
              value={minutes}
              onChange={(e) => {
                setMinutes(e.target.value.replace(/[^\d]/g, ""));
                mark();
              }}
              placeholder="ör. 360"
            />
          </Field>
          <div className="space-y-1.5">
            <span className="block text-sm font-medium">Çözülen soru</span>
            <div className="field flex items-center bg-surface-2 tabular">{solvedTotal || "—"}</div>
            <p className="text-xs text-faint">Görevlere girilen sayılardan otomatik</p>
          </div>
        </div>
        {minutes && <p className="-mt-2 text-xs text-faint">{minutesToText(Number(minutes))}</p>}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Zaman aralıkları</span>
            {blockMinutes > 0 && (
              <button
                type="button"
                className="text-xs font-medium text-primary"
                onClick={() => {
                  setMinutes(String(blockMinutes));
                  mark();
                }}
              >
                Toplamı aralıklardan hesapla ({minutesToText(blockMinutes)})
              </button>
            )}
          </div>
          {blocks.map((b, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 sm:grid-cols-[110px_110px_1fr_auto]">
              <input
                type="time"
                aria-label="Başlangıç"
                className="field px-2"
                value={b.start}
                onChange={(e) => {
                  setBlocks((bs) => bs.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)));
                  mark();
                }}
              />
              <input
                type="time"
                aria-label="Bitiş"
                className="field px-2"
                value={b.end}
                onChange={(e) => {
                  setBlocks((bs) => bs.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)));
                  mark();
                }}
              />
              <IconButton
                icon="trash"
                label="Aralığı sil"
                className="sm:order-last"
                onClick={() => {
                  setBlocks((bs) => bs.filter((_, j) => j !== i));
                  mark();
                }}
              />
              <input
                className="field col-span-3 sm:col-span-1"
                placeholder="Ne çalışıldı? (ör. Matematik – problemler)"
                value={b.label}
                maxLength={120}
                onChange={(e) => {
                  setBlocks((bs) => bs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)));
                  mark();
                }}
              />
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            icon="plus"
            onClick={() => {
              setBlocks((bs) => [...bs, { start: "", end: "", label: "" }]);
              mark();
            }}
          >
            Aralık ekle
          </Button>
          {blocks.some((b) => b.start && b.end) && (
            <Button variant="ghost" size="sm" icon="copy" onClick={() => setCopyOpen(true)}>
              Bu saatleri diğer günlere kopyala
            </Button>
          )}
        </div>

        <Field label="Notlar" htmlFor={`notes-${dayIndex}`}>
          <textarea
            id={`notes-${dayIndex}`}
            className="field min-h-24"
            value={notes}
            maxLength={2000}
            onChange={(e) => {
              setNotes(e.target.value);
              mark();
            }}
            placeholder="Günün notları…"
          />
        </Field>

        {copyOpen && (
          <CopyDaysModal
            source={dayIndex}
            labels={Array.from({ length: 7 }, (_, i) => dayName(addDays(plan.start_date, i)))}
            weekdayIdx={Array.from({ length: 7 }, (_, i) => i).filter((i) => {
              const w = parseISODate(addDays(plan.start_date, i)).getDay();
              return w >= 1 && w <= 5;
            })}
            weekendIdx={Array.from({ length: 7 }, (_, i) => i).filter((i) => {
              const w = parseISODate(addDays(plan.start_date, i)).getDay();
              return w === 0 || w === 6;
            })}
            onClose={() => setCopyOpen(false)}
            onApply={async (targets) => {
              const clean = blocks.filter((b) => b.start && b.end).map((b) => ({ start: b.start, end: b.end, label: b.label.trim().slice(0, 120) }));
              const { data, error } = await sb()
                .from("plan_days")
                .upsert(
                  targets.map((t) => ({ plan_id: plan.id, day_index: t, student_id: studentId, time_blocks: clean })),
                  { onConflict: "plan_id,day_index" },
                )
                .select("*");
              if (error) return toast.show(errorText(error), "danger");
              for (const d of (data ?? []) as PlanDay[]) onSaved(d);
              toast.show(`Saatler ${targets.length} güne kopyalandı`);
              setCopyOpen(false);
            }}
          />
        )}

        <div className="flex items-center justify-end gap-3">
          {dirty && <span className="text-xs text-warning">Kaydedilmemiş değişiklik var</span>}
          <Button onClick={save} loading={saving} icon="check">
            Günü kaydet
          </Button>
        </div>
      </div>
    </Card>
  );
}

