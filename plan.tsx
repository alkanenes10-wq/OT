"use client";
// Haftalık program (Excel şablonunun 1. sayfası).

import { useCallback, useEffect, useMemo, useState } from "react";
import { errorText, fetchPlanDetail, fetchPlans, sb, useAuth } from "./db";
import { addDays, dayName, dayShort, DEFAULT_SUBJECTS, diffDays, EXTRA_SUBJECT_SUGGESTIONS, fmtNum, formatShort, formatTR, minutesToText, normalizeSubject, parseISODate, pct, pickCurrentPlan, type PlanDay, type PlanTask, type TimeBlock, timeToMinutes, todayISO, type WeeklyPlan } from "./lib";
import { Badge, Button, Card, confirmAction, cx, EmptyState, ErrorBox, Field, Icon, IconButton, Modal, PageLoader, ProgressBar, Segmented, useToast } from "./ui";

const hasContent = (t: PlanTask) => t.content.trim().length > 0;

export function WeeklyPlanView({ studentId }: { studentId: string }) {
  const toast = useToast();
  const { profile } = useAuth();
  const [plans, setPlans] = useState<WeeklyPlan[] | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<PlanTask[]>([]);
  const [days, setDays] = useState<PlanDay[]>([]);
  const [day, setDay] = useState(0);
  const [edit, setEdit] = useState(false);
  const [view, setView] = useState<"day" | "table">("day");
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const plan = useMemo(() => plans?.find((p) => p.id === planId) ?? null, [plans, planId]);

  const loadPlans = useCallback(
    async (selectId?: string) => {
      try {
        const list = await fetchPlans(studentId);
        setPlans(list);
        const chosen = selectId ? list.find((p) => p.id === selectId) : pickCurrentPlan(list);
        setPlanId(chosen?.id ?? null);
        if (chosen) {
          const offset = diffDays(chosen.start_date, todayISO());
          setDay(offset >= 0 && offset <= 6 ? offset : 0);
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

  useEffect(() => {
    if (!planId) {
      setTasks([]);
      setDays([]);
      return;
    }
    let active = true;
    setLoadingDetail(true);
    fetchPlanDetail(planId)
      .then((d) => {
        if (!active) return;
        setTasks(d.tasks);
        setDays(d.days);
      })
      .catch((e) => active && setError(errorText(e)))
      .finally(() => active && setLoadingDetail(false));
    return () => {
      active = false;
    };
  }, [planId]);

  const sortedPlans = plans ?? [];
  const idx = plan ? sortedPlans.findIndex((p) => p.id === plan.id) : -1;
  const goPlan = (i: number) => {
    const p = sortedPlans[i];
    if (!p) return;
    setPlanId(p.id);
    const offset = diffDays(p.start_date, todayISO());
    setDay(offset >= 0 && offset <= 6 ? offset : 0);
  };

  /* ---------- görev işlemleri ---------- */
  async function toggleTask(t: PlanTask) {
    const next = !t.done;
    setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, done: next } : x)));
    const { error } = await sb().from("plan_tasks").update({ done: next }).eq("id", t.id);
    if (error) {
      setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, done: t.done } : x)));
      toast.show(errorText(error), "danger");
    }
  }

  async function saveTask(dayIndex: number, subject: string, content: string) {
    if (!plan) return;
    const existing = tasks.find((t) => t.day_index === dayIndex && t.subject === subject);
    const clean = content.trim().slice(0, 500);
    if (existing && existing.content === clean) return;
    if (!clean) {
      if (!existing) return;
      const { error } = await sb().from("plan_tasks").delete().eq("id", existing.id);
      if (error) return toast.show(errorText(error), "danger");
      setTasks((ts) => ts.filter((t) => t.id !== existing.id));
      return;
    }
    const { data, error } = await sb()
      .from("plan_tasks")
      .upsert(
        { plan_id: plan.id, student_id: studentId, day_index: dayIndex, subject, content: clean, done: existing?.done ?? false },
        { onConflict: "plan_id,day_index,subject" },
      )
      .select("*")
      .single();
    if (error) return toast.show(errorText(error), "danger");
    setTasks((ts) => [...ts.filter((t) => !(t.day_index === dayIndex && t.subject === subject)), data as PlanTask]);
  }

  async function deletePlan() {
    if (!plan) return;
    if (!confirmAction(`${formatTR(plan.start_date)} tarihli program ve tüm görevleri silinsin mi?`)) return;
    const { error } = await sb().from("weekly_plans").delete().eq("id", plan.id);
    if (error) return toast.show(errorText(error), "danger");
    toast.show("Program silindi");
    setEdit(false);
    loadPlans();
  }

  /* ---------- hesaplamalar ---------- */
  const dayTasks = (i: number) => tasks.filter((t) => t.day_index === i && hasContent(t));
  const weekTasks = tasks.filter(hasContent);
  const weekDone = weekTasks.filter((t) => t.done).length;
  const weekMinutes = days.reduce((s, d) => s + (d.study_minutes ?? 0), 0);
  const weekQuestions = days.reduce((s, d) => s + (d.question_count ?? 0), 0);

  if (plans === null) return <PageLoader />;

  return (
    <div className={cx("space-y-4", view !== "table" && "max-w-3xl")}>
      {error && <ErrorBox>{error}</ErrorBox>}

      {!plan ? (
        <Card>
          <EmptyState
            icon="calendar"
            title="Henüz haftalık program yok"
            action={
              <Button icon="plus" onClick={() => setNewOpen(true)}>
                Yeni program oluştur
              </Button>
            }
          >
            Program 7 gün sürer ve seçtiğin günden başlar (ör. Çarşamba → Salı).
          </EmptyState>
        </Card>
      ) : (
        <>
          {/* Program başlığı ve gezinme */}
          <div className="card flex flex-wrap items-center gap-2 p-2 sm:p-3">
            <IconButton icon="chevronLeft" label="Önceki program" disabled={idx <= 0} onClick={() => goPlan(idx - 1)} />
            <div className="min-w-0 flex-1 text-center">
              <p className="truncate text-[15px] font-semibold">
                {formatShort(plan.start_date)} – {formatShort(addDays(plan.start_date, 6))} {parseISODate(addDays(plan.start_date, 6)).getFullYear()}
              </p>
              <p className="truncate text-xs text-muted">
                {plan.title ? `${plan.title} · ` : ""}Veriliş: {formatTR(plan.start_date)}
                {plan.created_by && plan.created_by !== studentId ? " · Danışman hazırladı" : ""}
              </p>
            </div>
            <IconButton icon="chevronRight" label="Sonraki program" disabled={idx >= sortedPlans.length - 1} onClick={() => goPlan(idx + 1)} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant={edit ? "primary" : "secondary"} size="sm" icon={edit ? "check" : "edit"} onClick={() => setEdit((e) => !e)}>
              {edit ? "Düzenlemeyi bitir" : "Programı düzenle"}
            </Button>
            <Button variant="secondary" size="sm" icon="plus" onClick={() => setNewOpen(true)}>
              Yeni program
            </Button>
            <div className="ml-auto hidden w-56 md:block">
              <Segmented
                size="sm"
                value={view}
                onChange={setView}
                options={[
                  { value: "day", label: "Gün" },
                  { value: "table", label: "Tablo" },
                ]}
                ariaLabel="Görünüm"
              />
            </div>
            {edit && (
              <Button variant="danger" size="sm" icon="trash" onClick={deletePlan}>
                Sil
              </Button>
            )}
          </div>

          {/* Haftalık özet */}
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Tamamlanan" value={`${weekDone}/${weekTasks.length}`} sub={weekTasks.length ? `%${pct(weekDone, weekTasks.length)}` : "—"} />
            <Stat label="Çalışma süresi" value={weekMinutes ? minutesToText(weekMinutes) : "—"} />
            <Stat label="Soru sayısı" value={weekQuestions ? fmtNum(weekQuestions, 0) : "—"} />
          </div>

          {loadingDetail ? (
            <PageLoader />
          ) : view === "table" ? (
            <WeekTable
              plan={plan}
              tasks={tasks}
              days={days}
              onPick={(i) => {
                setDay(i);
                setView("day");
              }}
            />
          ) : (
            <>
              {/* Gün seçici */}
              <div className="no-scrollbar -mx-4 overflow-x-auto px-4">
                <div className="grid min-w-[322px] grid-cols-7 gap-1">
                  {Array.from({ length: 7 }, (_, i) => {
                    const date = addDays(plan.start_date, i);
                    const dt = dayTasks(i);
                    const done = dt.filter((t) => t.done).length;
                    const isToday = date === todayISO();
                    const active = i === day;
                    return (
                      <button
                        key={i}
                        onClick={() => setDay(i)}
                        aria-pressed={active}
                        className={cx(
                          "flex flex-col items-center rounded-xl border px-1 py-2 transition",
                          active ? "border-primary bg-primary text-primary-fg" : "border-line bg-surface hover:bg-surface-2",
                          !active && isToday && "ring-2 ring-primary/40",
                        )}
                      >
                        <span className={cx("text-[11px] font-medium", active ? "opacity-90" : "text-muted")}>{dayShort(date)}</span>
                        <span className="text-lg font-semibold tabular">{parseISODate(date).getDate()}</span>
                        <span className={cx("text-[11px] tabular", active ? "opacity-90" : "text-faint")}>
                          {dt.length ? `${done}/${dt.length}` : "–"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <DayPanel
                key={`${plan.id}-${day}`}
                plan={plan}
                dayIndex={day}
                tasks={tasks.filter((t) => t.day_index === day)}
                edit={edit}
                onToggle={toggleTask}
                onSave={(subject, content) => saveTask(day, subject, content)}
              />

              <DayDetails
                key={`details-${plan.id}-${day}`}
                plan={plan}
                dayIndex={day}
                studentId={studentId}
                current={days.find((d) => d.day_index === day) ?? null}
                onSaved={(d) => setDays((ds) => [...ds.filter((x) => x.day_index !== d.day_index), d])}
              />
            </>
          )}
        </>
      )}

      <NewPlanModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        studentId={studentId}
        copyFrom={plan}
        isCounselor={profile?.role === "counselor"}
        onCreated={(id) => {
          setNewOpen(false);
          setEdit(true);
          loadPlans(id);
        }}
      />
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card px-3 py-2.5">
      <p className="text-[11px] font-medium text-muted">{label}</p>
      <p className="mt-0.5 text-base font-semibold tabular sm:text-lg">{value}</p>
      {sub && <p className="text-[11px] text-faint tabular">{sub}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
function DayPanel({
  plan,
  dayIndex,
  tasks,
  edit,
  onToggle,
  onSave,
}: {
  plan: WeeklyPlan;
  dayIndex: number;
  tasks: PlanTask[];
  edit: boolean;
  onToggle: (t: PlanTask) => void;
  onSave: (subject: string, content: string) => Promise<void>;
}) {
  const date = addDays(plan.start_date, dayIndex);
  const [extra, setExtra] = useState<string[]>([]);
  const [adding, setAdding] = useState("");
  const withContent = tasks.filter(hasContent);
  const done = withContent.filter((t) => t.done).length;

  const subjects = useMemo(() => {
    const fromTasks = tasks.map((t) => t.subject);
    const all = [...DEFAULT_SUBJECTS, ...fromTasks, ...extra];
    return all.filter((s, i) => all.indexOf(s) === i);
  }, [tasks, extra]);

  return (
    <Card
      title={`${dayName(date)} · ${formatShort(date)}`}
      subtitle={withContent.length ? `${done} / ${withContent.length} görev tamamlandı` : undefined}
      action={withContent.length ? <div className="w-24 pt-2"><ProgressBar value={pct(done, withContent.length)} tone="success" /></div> : undefined}
    >
      {edit ? (
        <div className="space-y-2">
          <p className="text-xs text-muted">Görevi yazıp kutudan çıkınca otomatik kaydedilir. Silmek için kutuyu boşaltın.</p>
          {subjects.map((s) => {
            const t = tasks.find((x) => x.subject === s);
            return <TaskEditRow key={s} subject={s} task={t} onSave={(c) => onSave(s, c)} onToggle={onToggle} />;
          })}
          <div className="flex gap-2 pt-2">
            <input
              className="field"
              list="subject-suggestions"
              placeholder="Başka ders ekle (ör. DENEME)"
              value={adding}
              onChange={(e) => setAdding(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const s = normalizeSubject(adding);
                  if (s && !subjects.includes(s)) setExtra((x) => [...x, s]);
                  setAdding("");
                }
              }}
            />
            <datalist id="subject-suggestions">
              {EXTRA_SUBJECT_SUGGESTIONS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <Button
              variant="secondary"
              icon="plus"
              onClick={() => {
                const s = normalizeSubject(adding);
                if (s && !subjects.includes(s)) setExtra((x) => [...x, s]);
                setAdding("");
              }}
            >
              Ekle
            </Button>
          </div>
        </div>
      ) : withContent.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">Bu gün için görev yok. Eklemek için “Programı düzenle”ye dokun.</p>
      ) : (
        <ul className="-mx-1 divide-y divide-line">
          {withContent
            .sort((a, b) => subjectOrder(a.subject) - subjectOrder(b.subject))
            .map((t) => (
              <li key={t.id}>
                <TaskCheckRow task={t} onToggle={onToggle} />
              </li>
            ))}
        </ul>
      )}
    </Card>
  );
}

export function subjectOrder(s: string) {
  const i = DEFAULT_SUBJECTS.indexOf(s);
  return i === -1 ? 100 : i;
}

export function TaskCheckRow({ task, onToggle }: { task: PlanTask; onToggle: (t: PlanTask) => void }) {
  return (
    <button
      onClick={() => onToggle(task)}
      role="checkbox"
      aria-checked={task.done}
      className="flex w-full items-start gap-3 rounded-xl px-1 py-3 text-left transition hover:bg-surface-2"
    >
      <span
        className={cx(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition",
          task.done ? "border-success bg-success text-white" : "border-line bg-surface",
        )}
      >
        {task.done && <Icon name="check" size={16} strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold tracking-wide text-muted">{task.subject}</span>
        <span className={cx("block text-[15px] leading-snug", task.done && "text-faint line-through")}>{task.content}</span>
      </span>
    </button>
  );
}

function TaskEditRow({
  subject,
  task,
  onSave,
  onToggle,
}: {
  subject: string;
  task?: PlanTask;
  onSave: (content: string) => Promise<void>;
  onToggle: (t: PlanTask) => void;
}) {
  const [value, setValue] = useState(task?.content ?? "");
  const [saving, setSaving] = useState(false);
  useEffect(() => setValue(task?.content ?? ""), [task?.content]);
  const commit = async () => {
    if ((task?.content ?? "") === value.trim()) return;
    setSaving(true);
    await onSave(value);
    setSaving(false);
  };
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-2 sm:grid-cols-[150px_1fr_auto]">
      <label className="col-span-2 text-[11px] font-semibold tracking-wide text-muted sm:col-span-1 sm:text-xs" htmlFor={`t-${subject}`}>
        {subject}
      </label>
      <div className="relative">
        <input
          id={`t-${subject}`}
          className="field py-2"
          value={value}
          maxLength={500}
          placeholder="Görev (ör. 40 soru, 2 konu tekrarı)"
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
        {saving && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-faint">kaydediliyor…</span>}
      </div>
      <button
        type="button"
        disabled={!task}
        onClick={() => task && onToggle(task)}
        aria-label={task?.done ? "Tamamlanmadı olarak işaretle" : "Tamamlandı olarak işaretle"}
        className={cx(
          "flex h-10 w-10 items-center justify-center rounded-xl border-2 transition disabled:opacity-30",
          task?.done ? "border-success bg-success text-white" : "border-line bg-surface text-transparent",
        )}
      >
        <Icon name="check" size={18} strokeWidth={3} />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function DayDetails({
  plan,
  dayIndex,
  studentId,
  current,
  onSaved,
}: {
  plan: WeeklyPlan;
  dayIndex: number;
  studentId: string;
  current: PlanDay | null;
  onSaved: (d: PlanDay) => void;
}) {
  const toast = useToast();
  const [notes, setNotes] = useState(current?.notes ?? "");
  const [blocks, setBlocks] = useState<TimeBlock[]>(current?.time_blocks ?? []);
  const [minutes, setMinutes] = useState<string>(current?.study_minutes != null ? String(current.study_minutes) : "");
  const [questions, setQuestions] = useState<string>(current?.question_count != null ? String(current.question_count) : "");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const blockMinutes = blocks.reduce((s, b) => {
    const a = timeToMinutes(b.start);
    const e = timeToMinutes(b.end);
    if (a == null || e == null) return s;
    return s + (e >= a ? e - a : e + 1440 - a);
  }, 0);

  const mark = () => setDirty(true);

  async function save() {
    const m = minutes.trim() === "" ? null : Math.max(0, Math.min(1440, Math.round(Number(minutes))));
    const q = questions.trim() === "" ? null : Math.max(0, Math.min(5000, Math.round(Number(questions))));
    if ((m != null && Number.isNaN(m)) || (q != null && Number.isNaN(q))) {
      toast.show("Süre ve soru sayısı sayı olmalı", "danger");
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
          question_count: q,
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
    <Card title="Gün sonu" subtitle="Notlar, zaman aralıkları, toplam süre ve soru sayısı">
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
          <Field label="Toplam soru" htmlFor={`q-${dayIndex}`}>
            <input
              id={`q-${dayIndex}`}
              className="field"
              inputMode="numeric"
              value={questions}
              onChange={(e) => {
                setQuestions(e.target.value.replace(/[^\d]/g, ""));
                mark();
              }}
              placeholder="ör. 250"
            />
          </Field>
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

/* ------------------------------------------------------------------ */
function WeekTable({
  plan,
  tasks,
  days,
  onPick,
}: {
  plan: WeeklyPlan;
  tasks: PlanTask[];
  days: PlanDay[];
  onPick: (dayIndex: number) => void;
}) {
  const withContent = tasks.filter(hasContent);
  const subjects = [...new Set(withContent.map((t) => t.subject))].sort((a, b) => subjectOrder(a) - subjectOrder(b));
  if (!subjects.length) {
    return (
      <Card>
        <p className="py-6 text-center text-sm text-muted">Bu programda henüz görev yok.</p>
      </Card>
    );
  }
  const dates = Array.from({ length: 7 }, (_, i) => addDays(plan.start_date, i));
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[860px] border-collapse text-sm">
        <thead>
          <tr className="bg-surface-2 text-left">
            <th className="sticky left-0 z-10 w-36 bg-surface-2 px-3 py-2 text-xs font-semibold text-muted">DERSLER</th>
            {dates.map((d, i) => (
              <th key={d} className="px-2 py-2 text-xs font-semibold">
                <button className="text-left hover:text-primary" onClick={() => onPick(i)}>
                  {dayName(d).toLocaleUpperCase("tr-TR")}
                  <span className="block font-normal text-faint">{formatShort(d)}</span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {subjects.map((s) => (
            <tr key={s} className="border-t border-line align-top">
              <th scope="row" className="sticky left-0 z-10 bg-surface px-3 py-2 text-left text-[11px] font-semibold text-muted">
                {s}
              </th>
              {dates.map((_, i) => {
                const t = withContent.find((x) => x.subject === s && x.day_index === i);
                return (
                  <td key={i} className={cx("border-l border-line px-2 py-2", t?.done && "bg-success-soft")}>
                    {t && (
                      <span className="flex items-start gap-1">
                        {t.done ? (
                          <Icon name="check" size={14} className="mt-0.5 shrink-0 text-success" strokeWidth={3} />
                        ) : (
                          <span className="mt-1 h-3 w-3 shrink-0 rounded-sm border-2 border-line" />
                        )}
                        <span className="line-clamp-3">{t.content}</span>
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
          <tr className="border-t-2 border-line bg-surface-2">
            <th scope="row" className="sticky left-0 z-10 bg-surface-2 px-3 py-2 text-left text-[11px] font-semibold text-muted">
              ÇALIŞMA SÜRESİ
            </th>
            {dates.map((_, i) => (
              <td key={i} className="border-l border-line px-2 py-2 tabular">
                {minutesToText(days.find((d) => d.day_index === i)?.study_minutes)}
              </td>
            ))}
          </tr>
          <tr className="border-t border-line bg-surface-2">
            <th scope="row" className="sticky left-0 z-10 bg-surface-2 px-3 py-2 text-left text-[11px] font-semibold text-muted">
              SORU SAYISI
            </th>
            {dates.map((_, i) => (
              <td key={i} className="border-l border-line px-2 py-2 tabular">
                {days.find((d) => d.day_index === i)?.question_count ?? "—"}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function NewPlanModal({
  open,
  onClose,
  studentId,
  copyFrom,
  isCounselor,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  studentId: string;
  copyFrom: WeeklyPlan | null;
  isCounselor: boolean;
  onCreated: (id: string) => void;
}) {
  const toast = useToast();
  const [start, setStart] = useState(todayISO());
  const [title, setTitle] = useState("");
  const [copy, setCopy] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStart(todayISO());
      setTitle("");
      setCopy(Boolean(copyFrom));
      setError(null);
    }
  }, [open, copyFrom]);

  async function create() {
    setError(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) {
      setError("Geçerli bir başlangıç tarihi seçin.");
      return;
    }
    setBusy(true);
    const { data, error } = await sb()
      .from("weekly_plans")
      .insert({ student_id: studentId, start_date: start, title: title.trim().slice(0, 120) || null })
      .select("*")
      .single();
    if (error) {
      setBusy(false);
      setError(/duplicate|unique/i.test(error.message) ? "Bu tarihte başlayan bir program zaten var." : errorText(error));
      return;
    }
    const newPlan = data as WeeklyPlan;
    if (copy && copyFrom) {
      const { data: src, error: e2 } = await sb().from("plan_tasks").select("day_index, subject, content").eq("plan_id", copyFrom.id);
      if (!e2 && src && src.length) {
        const rows = (src as Pick<PlanTask, "day_index" | "subject" | "content">[])
          .filter((t) => t.content.trim())
          .map((t) => ({ ...t, plan_id: newPlan.id, student_id: studentId, done: false }));
        const { error: e3 } = await sb().from("plan_tasks").insert(rows);
        if (e3) toast.show("Görevler kopyalanamadı: " + errorText(e3), "danger");
      }
    }
    setBusy(false);
    toast.show("Program oluşturuldu");
    onCreated(newPlan.id);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Yeni haftalık program"
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
            <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[var(--primary)]" checked={copy} onChange={(e) => setCopy(e.target.checked)} />
            <span>
              Görevleri mevcut programdan kopyala
              <span className="block text-xs text-muted">
                {formatTR(copyFrom.start_date)} programındaki görevler tamamlanmamış olarak aktarılır.
              </span>
            </span>
          </label>
        )}
        {error && <ErrorBox>{error}</ErrorBox>}
        <Badge tone="primary" icon="info">
          Hem öğrenci hem danışman programı düzenleyebilir
        </Badge>
      </div>
    </Modal>
  );
}
