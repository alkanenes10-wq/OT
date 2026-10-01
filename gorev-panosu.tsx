"use client";
// Görev panosu (danışman): tüm öğrencilerin program görevleri tek ekranda.
// Geciken / Bugün / Yaklaşan / Tamamlanan sekmeleri; öğrenci, ders ve metin filtresi; gecikenlere toplu hatırlatma.

import { useCallback, useEffect, useMemo, useState } from "react";
import { sendResultText, sendToStudents } from "./bildirim";
import { ALL_TOPICS } from "./curriculum";
import { A, errorText, sb } from "./db";
import { KAZANIMLAR } from "./kazanimlar";
import { TopicOutcomes } from "./konu-bilgi";
import { addDays, dayShort, formatShort, isRealTask, type PlanTask, type Profile, todayISO } from "./lib";
import { Badge, Button, Card, cx, EmptyState, ErrorBox, Icon, PageLoader, Segmented, Tabs, useToast } from "./ui";

type Row = PlanTask & { date: string; student: Profile };
type View = "geciken" | "bugun" | "yaklasan" | "tamam";
type Range = 7 | 14 | 30;

const topicName = new Map(ALL_TOPICS.map((t) => [t.id, t.name]));
const titleOf = (t: PlanTask) => (t.topic_id ? (topicName.get(t.topic_id) ?? t.topic_id) : t.content.trim() || t.subject);
const localDate = (ts: string) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

async function pagedTasks(planIds: string[]): Promise<PlanTask[]> {
  const out: PlanTask[] = [];
  for (let i = 0; i < planIds.length; i += 150) {
    const ids = planIds.slice(i, i + 150);
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb().from("plan_tasks").select("*").in("plan_id", ids).range(from, from + 999);
      if (error) throw error;
      out.push(...((data ?? []) as PlanTask[]));
      if (!data || data.length < 1000) break;
    }
  }
  return out;
}

export function TaskBoard() {
  const toast = useToast();
  const [range, setRange] = useState<Range>(14);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [students, setStudents] = useState<Profile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("geciken");
  const [studentId, setStudentId] = useState("");
  const [subject, setSubject] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const today = todayISO();

  const load = useCallback(async () => {
    setRows(null);
    setError(null);
    try {
      const { data: st, error: e1 } = await sb().from("profiles").select("*").eq("role", "student").eq("is_active", true).order("full_name");
      if (e1) throw e1;
      const list = (st ?? []) as Profile[];
      setStudents(list);
      if (!list.length) return setRows([]);
      const from = addDays(today, -(range - 1));
      const to = addDays(today, 7);
      const byId = new Map(list.map((s) => [s.id, s]));
      const plans: { id: string; student_id: string; start_date: string }[] = [];
      const ids = list.map((s) => s.id);
      for (let i = 0; i < ids.length; i += 150) {
        const { data, error } = await sb()
          .from("weekly_plans")
          .select("id, student_id, start_date")
          .in("student_id", ids.slice(i, i + 150))
          .gte("start_date", addDays(from, -6))
          .lte("start_date", to);
        if (error) throw error;
        plans.push(...((data ?? []) as typeof plans));
      }
      const start = new Map(plans.map((p) => [p.id, p.start_date]));
      const tasks = plans.length ? await pagedTasks(plans.map((p) => p.id)) : [];
      setRows(
        tasks
          .filter(isRealTask)
          .map((t) => ({ ...t, date: addDays(start.get(t.plan_id)!, t.day_index), student: byId.get(t.student_id)! }))
          .filter((t) => t.student && t.date >= from && t.date <= to),
      );
    } catch (e) {
      setError(errorText(e));
    }
  }, [range, today]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const needle = q.trim().toLocaleLowerCase("tr-TR");
    return rows.filter(
      (r) =>
        (!studentId || r.student_id === studentId) &&
        (!subject || r.subject === subject) &&
        (!needle || `${titleOf(r)} ${r.content} ${r.student.full_name}`.toLocaleLowerCase("tr-TR").includes(needle)),
    );
  }, [rows, studentId, subject, q]);

  const groups = useMemo(() => {
    const g: Record<View, Row[]> = { geciken: [], bugun: [], yaklasan: [], tamam: [] };
    for (const r of filtered) {
      if (r.done) g.tamam.push(r);
      else if (r.date < today) g.geciken.push(r);
      else if (r.date === today) g.bugun.push(r);
      else g.yaklasan.push(r);
    }
    g.geciken.sort((a, b) => a.date.localeCompare(b.date) || a.student.full_name.localeCompare(b.student.full_name, "tr"));
    g.bugun.sort((a, b) => a.student.full_name.localeCompare(b.student.full_name, "tr") || (a.start_time ?? "").localeCompare(b.start_time ?? ""));
    g.yaklasan.sort((a, b) => a.date.localeCompare(b.date) || a.student.full_name.localeCompare(b.student.full_name, "tr"));
    g.tamam.sort((a, b) => (b.done_at ?? b.date).localeCompare(a.done_at ?? a.date));
    return g;
  }, [filtered, today]);

  const subjects = useMemo(() => [...new Set((rows ?? []).map((r) => r.subject))].sort((a, b) => a.localeCompare(b, "tr")), [rows]);
  const list = groups[view];

  async function remindOverdue() {
    const by = new Map<string, Row[]>();
    for (const r of groups.geciken) by.set(r.student_id, [...(by.get(r.student_id) ?? []), r]);
    if (!by.size) return;
    if (!window.confirm(`${by.size} öğrenciye geciken görevleri için bildirim gönderilsin mi?`)) return;
    setSending(true);
    const items = [...by.entries()].map(([sid, rs]) => {
      const first = rs[0].student.full_name.split(" ")[0];
      const names = rs.slice(0, 3).map((r) => `${r.subject} (${titleOf(r)})`).join(", ");
      return {
        student_id: sid,
        message: `Merhaba ${first}, programında ${rs.length} görev yerine getirilmeyi bekliyor: ${names}${rs.length > 3 ? " ve diğerleri" : ""}. Bugün birini bitirip diğerlerini birlikte yeniden planlayalım mı?`,
      };
    });
    try {
      const res = await sendToStudents(items, "Bekleyen görevlerin");
      toast.show(sendResultText(res), res.ok ? "success" : "danger");
    } catch (e) {
      toast.show(errorText(e), "danger");
    }
    setSending(false);
  }

  const counts = { geciken: groups.geciken.length, bugun: groups.bugun.length, yaklasan: groups.yaklasan.length, tamam: groups.tamam.length };
  const doneRate = counts.tamam + counts.geciken ? Math.round((counts.tamam / (counts.tamam + counts.geciken)) * 100) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-2xl sm:text-[32px]">Görev panosu</h1>
          <p className="text-sm text-muted">Tüm öğrencilerin program görevleri. Teslim tarihi, görevin programdaki günüdür.</p>
        </div>
        <Segmented
          size="sm"
          ariaLabel="Dönem"
          value={range}
          onChange={setRange}
          options={[
            { value: 7 as const, label: "Son 7 gün" },
            { value: 14 as const, label: "Son 14 gün" },
            { value: 30 as const, label: "Son 30 gün" },
          ]}
        />
      </div>

      {error && <ErrorBox>{error}</ErrorBox>}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            ["geciken", "Geciken", counts.geciken, "text-danger"],
            ["bugun", "Bugün", counts.bugun, "text-fg"],
            ["yaklasan", "Yaklaşan (7 gün)", counts.yaklasan, "text-fg"],
            ["tamam", "Tamamlanan", counts.tamam, "text-success"],
          ] as const
        ).map(([k, label, n, tone]) => (
          <button key={k} type="button" onClick={() => setView(k)} className={cx("card p-3 text-left transition-colors", view === k && "ring-2 ring-primary/40")}>
            <p className="text-xs text-muted">{label}</p>
            <p className={cx("display mt-0.5 text-2xl tabular", tone)}>{rows ? n : "…"}</p>
          </button>
        ))}
      </section>

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <select className="field h-10 w-auto min-w-40 flex-1 text-sm sm:flex-none" value={studentId} onChange={(e) => setStudentId(e.target.value)} aria-label="Öğrenci">
            <option value="">Tüm öğrenciler</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </select>
          <select className="field h-10 w-auto min-w-32 flex-1 text-sm sm:flex-none" value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Ders">
            <option value="">Tüm dersler</option>
            {subjects.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <span className="relative min-w-40 flex-1">
            <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input className="field h-10 pl-9 text-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Konu, açıklama ya da öğrenci ara" />
          </span>
        </div>
        <div className="mt-3">
          <Tabs
            tabs={[
              { value: "geciken" as const, label: `Geciken (${counts.geciken})` },
              { value: "bugun" as const, label: `Bugün (${counts.bugun})` },
              { value: "yaklasan" as const, label: `Yaklaşan (${counts.yaklasan})` },
              { value: "tamam" as const, label: `Tamamlanan (${counts.tamam})` },
            ]}
            value={view}
            onChange={setView}
          />
        </div>
        {view === "geciken" && counts.geciken > 0 && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
            <span className="text-muted">
              {new Set(groups.geciken.map((r) => r.student_id)).size} öğrencide {counts.geciken} geciken görev
              {doneRate != null ? ` · dönemin tamamlanma oranı %${doneRate}` : ""}
            </span>
            <Button size="sm" icon="bell" loading={sending} onClick={remindOverdue}>
              Gecikenlere hatırlat
            </Button>
          </div>
        )}

        {!rows ? (
          <PageLoader />
        ) : list.length === 0 ? (
          <EmptyState icon={view === "geciken" ? "check" : "list"} title={view === "geciken" ? "Geciken görev yok" : "Bu listede görev yok"}>
            {view === "geciken" ? "Seçilen dönemde tamamlanmayan geçmiş görev bulunmuyor." : "Filtreleri ya da dönemi değiştirmeyi deneyin."}
          </EmptyState>
        ) : (
          <>
            {/* Masaüstü: tablo */}
            <div className="mt-3 hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th className="py-2 pr-3 font-medium">Öğrenci</th>
                    <th className="py-2 pr-3 font-medium">Görev</th>
                    <th className="py-2 pr-3 font-medium">Hedef</th>
                    <th className="py-2 pr-3 font-medium">Sonuç</th>
                    <th className="py-2 pr-3 font-medium">Teslim</th>
                    <th className="py-2 font-medium">Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {list.slice(0, 400).map((r) => (
                    <TaskLine key={r.id} r={r} today={today} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} />
                  ))}
                </tbody>
              </table>
            </div>
            {/* Telefon: kart listesi */}
            <ul className="mt-3 divide-y divide-line md:hidden">
              {list.slice(0, 400).map((r) => (
                <li key={r.id} className="py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <A to={{ v: "ogrenci", id: r.student_id, t: "program" }} className="text-sm font-semibold hover:text-primary">
                        {r.student.full_name}
                      </A>
                      <p className="text-sm">
                        <span className="text-xs font-semibold text-muted">{r.subject} · </span>
                        {titleOf(r)}
                      </p>
                      <p className="text-xs text-faint">
                        {r.target_questions ? `${r.target_questions} soru hedef · ` : ""}
                        {r.solved != null ? `${r.solved} çözüldü` : ""}
                        {r.correct != null || r.wrong != null ? ` · ${r.correct ?? 0}D ${r.wrong ?? 0}Y` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <StatusBadge r={r} today={today} />
                      <p className="mt-1 text-xs text-faint tabular">
                        {dayShort(r.date)} {formatShort(r.date)}
                      </p>
                    </div>
                  </div>
                  {r.topic_id && KAZANIMLAR[r.topic_id] && (
                    <details className="group mt-1">
                      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-primary [&::-webkit-details-marker]:hidden">
                        <Icon name="chevronRight" size={13} className="transition group-open:rotate-90" /> Kazanımlar
                      </summary>
                      <TopicOutcomes topicId={r.topic_id} compact className="mt-2 rounded-xl bg-surface-2 p-3" />
                    </details>
                  )}
                </li>
              ))}
            </ul>
            {list.length > 400 && <p className="mt-2 text-xs text-muted">İlk 400 görev gösteriliyor; filtrelerle daraltın.</p>}
          </>
        )}
      </Card>
    </div>
  );
}

function StatusBadge({ r, today }: { r: Row; today: string }) {
  if (r.done) {
    const late = r.done_at && localDate(r.done_at) > r.date;
    return (
      <Badge tone="success" icon="check">
        {late ? "Geç tamamlandı" : "Tamamlandı"}
      </Badge>
    );
  }
  if (r.date < today) {
    const n = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${r.date}T12:00:00Z`)) / 86400000);
    return <Badge tone="danger">{n} gün gecikti</Badge>;
  }
  if (r.date === today) return <Badge tone="warning">Bugün</Badge>;
  return <Badge>Bekliyor</Badge>;
}

function TaskLine({ r, today, open, onToggle }: { r: Row; today: string; open: boolean; onToggle: () => void }) {
  const hasOutcomes = Boolean(r.topic_id && KAZANIMLAR[r.topic_id]);
  return (
    <>
      <tr className="border-b border-line/60 align-top">
        <td className="py-2 pr-3">
          <A to={{ v: "ogrenci", id: r.student_id, t: "program" }} className="font-medium hover:text-primary">
            {r.student.full_name}
          </A>
        </td>
        <td className="py-2 pr-3">
          <span className="text-xs font-semibold text-muted">{r.subject}</span>
          <span className="block">{titleOf(r)}</span>
          {r.topic_id && r.content.trim() && <span className="block text-xs text-muted">{r.content}</span>}
          {hasOutcomes && (
            <button type="button" onClick={onToggle} className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-primary" aria-expanded={open}>
              <Icon name="chevronRight" size={13} className={cx("transition", open && "rotate-90")} /> Kazanımlar
            </button>
          )}
        </td>
        <td className="py-2 pr-3 tabular">{r.target_questions ? `${r.target_questions} soru` : r.resource_tests ? `Test ${r.resource_tests}` : "—"}</td>
        <td className="py-2 pr-3 tabular">
          {r.solved != null ? `${r.solved} soru` : "—"}
          {r.correct != null || r.wrong != null ? (
            <span className="block text-xs text-muted">
              {r.correct ?? 0}D · {r.wrong ?? 0}Y
            </span>
          ) : null}
        </td>
        <td className="py-2 pr-3 whitespace-nowrap tabular">
          {dayShort(r.date)} {formatShort(r.date)}
          {r.start_time && <span className="block text-xs text-muted">{r.start_time}</span>}
        </td>
        <td className="py-2">
          <StatusBadge r={r} today={today} />
        </td>
      </tr>
      {open && r.topic_id && (
        <tr className="border-b border-line/60">
          <td />
          <td colSpan={5} className="pb-3">
            <TopicOutcomes topicId={r.topic_id} compact className="rounded-xl bg-surface-2 p-3" />
          </td>
        </tr>
      )}
    </>
  );
}
