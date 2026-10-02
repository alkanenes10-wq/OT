"use client";
// Görüşme öncesi rapor: son görüşmeden (ya da seçilen dönemden) bu yana öğrencinin tek sayfalık özeti.
// Danışmana özeldir (kaygı/motivasyon gibi günlük verileri de içerir). Yazdırılabilir / PDF olarak kaydedilebilir.

import { useEffect, useMemo, useState } from "react";
import { ALL_TOPICS, isCompleted, sinavOf } from "./curriculum";
import { A, errorText, fetchAnalyses, fetchLogs, fetchPlans, fetchTopicProgress, sb, useAuth } from "./db";
import type { CounselingSession } from "./ekler";
import { BarChart } from "./insights";
import { addDays, avg, type DailyLog, type ExamAnalysis, fmtNum, formatTR, isRealTask, minutesToText, net, wrongDivisor, pct, type PlanDay, type PlanTask, type Profile, todayISO, type TopicProgress } from "./lib";
import { earnedBadges, monthGoals, type GameStats } from "./oyun";
import { Button, Card, ErrorBox, Icon, PageLoader, Segmented, useToast } from "./ui";

type Task = PlanTask & { date: string };
type Raw = {
  student: Profile;
  sessions: (CounselingSession & { notes?: string })[];
  logs: DailyLog[];
  tasks: Task[];
  days: (PlanDay & { date: string })[];
  topics: TopicProgress[];
  exams: ExamAnalysis[];
  game: GameStats | null;
  openAlerts: number;
};
type PeriodKey = "son" | 7 | 14 | 30;

const topicName = new Map(ALL_TOPICS.map((t) => [t.id, t.name]));
const examNet = (a: ExamAnalysis) => {
  const vals = Object.values(a.nets ?? {}).map((v) => net(v?.d, v?.y, wrongDivisor(a.exam_type)));
  if (vals.every((v) => v == null)) return null;
  return Math.round(vals.reduce<number>((s, v) => s + (v ?? 0), 0) * 100) / 100;
};
const localDate = (ts: string) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function useRaw(studentId: string) {
  const [raw, setRaw] = useState<Raw | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const from = addDays(todayISO(), -75);
        const [st, ses, logs, plans, topics, exams, game, alerts] = await Promise.all([
          sb().from("profiles").select("*").eq("id", studentId).maybeSingle(),
          sb().from("counseling_sessions").select("*").eq("student_id", studentId).order("starts_at", { ascending: false }).limit(50),
          fetchLogs(studentId, from),
          fetchPlans(studentId),
          fetchTopicProgress(studentId),
          fetchAnalyses(studentId).catch(() => [] as ExamAnalysis[]),
          sb().rpc("gamification", { p_student: studentId }),
          sb().from("support_alerts").select("id", { count: "exact", head: true }).eq("student_id", studentId).eq("status", "open"),
        ]);
        if (st.error) throw st.error;
        if (!st.data) throw new Error("Öğrenci bulunamadı veya erişiminiz yok.");
        const recent = plans.filter((p) => p.start_date >= addDays(from, -7));
        const start = new Map(recent.map((p) => [p.id, p.start_date]));
        let tasks: Task[] = [];
        let days: (PlanDay & { date: string })[] = [];
        if (recent.length) {
          const ids = recent.map((p) => p.id);
          const [t, d] = await Promise.all([sb().from("plan_tasks").select("*").in("plan_id", ids), sb().from("plan_days").select("*").in("plan_id", ids)]);
          if (t.error) throw t.error;
          tasks = ((t.data ?? []) as PlanTask[]).filter(isRealTask).map((x) => ({ ...x, date: addDays(start.get(x.plan_id) ?? todayISO(), x.day_index) }));
          days = ((d.data ?? []) as PlanDay[]).map((x) => ({ ...x, date: addDays(start.get(x.plan_id) ?? todayISO(), x.day_index) }));
        }
        if (!alive) return;
        setRaw({
          student: st.data as Profile,
          sessions: (ses.data ?? []) as Raw["sessions"],
          logs,
          tasks,
          days,
          topics,
          exams,
          game: game.error ? null : (game.data as GameStats),
          openAlerts: alerts.count ?? 0,
        });
      } catch (e) {
        if (alive) setError(errorText(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [studentId]);
  return { raw, error };
}

export function SessionReport({ studentId, sessionId }: { studentId: string; sessionId?: string }) {
  const { raw, error } = useRaw(studentId);
  const { profile } = useAuth();
  const toast = useToast();
  const [period, setPeriod] = useState<PeriodKey>("son");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const session = raw?.sessions.find((s) => s.id === sessionId) ?? null;
  // Bu görüşmeden önceki son yapılmış görüşme
  const lastDone = useMemo(() => {
    if (!raw) return null;
    const before = session ? session.starts_at : new Date().toISOString();
    return raw.sessions.find((s) => s.status === "done" && s.starts_at < before && s.id !== sessionId) ?? null;
  }, [raw, session, sessionId]);

  useEffect(() => {
    if (session?.notes) setNote(session.notes);
  }, [session?.notes]);

  const r = useMemo(() => {
    if (!raw) return null;
    const today = todayISO();
    const fromLast = lastDone ? addDays(localDate(lastDone.starts_at), 1) : addDays(today, -13);
    const from = period === "son" ? (fromLast > today ? today : fromLast) : addDays(today, -(period - 1));
    const nDays = Math.max(1, Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000) + 1);
    const dates = Array.from({ length: nDays }, (_, i) => addDays(from, i));

    const logs = raw.logs.filter((l) => l.log_date >= from && l.log_date <= today);
    const inRange = raw.tasks.filter((t) => t.date >= from && t.date <= today);
    const done = inRange.filter((t) => t.done);
    const overdue = raw.tasks.filter((t) => !t.done && t.date < today && t.date >= addDays(today, -21)).sort((a, b) => b.date.localeCompare(a.date));
    const solved = inRange.reduce((s, t) => s + (t.done ? (t.solved ?? 0) : 0), 0);
    const correct = inRange.reduce((s, t) => s + (t.correct ?? 0), 0);
    const wrong = inRange.reduce((s, t) => s + (t.wrong ?? 0), 0);
    const accuracy = correct + wrong > 0 ? Math.round((correct / (correct + wrong)) * 100) : null;
    const minutesByDay = new Map<string, number>();
    for (const d of raw.days) if (d.date >= from && d.date <= today && d.study_minutes) minutesByDay.set(d.date, (minutesByDay.get(d.date) ?? 0) + d.study_minutes);
    const minutes = [...minutesByDay.values()].reduce((a, b) => a + b, 0);
    const qByDay = new Map<string, number>();
    for (const t of done) qByDay.set(t.date, (qByDay.get(t.date) ?? 0) + (t.solved ?? 0));
    const active = new Set([...logs.map((l) => l.log_date), ...done.map((t) => (t.done_at ? localDate(t.done_at) : t.date)).filter((d) => d >= from && d <= today)]);

    const bySubject = new Map<string, { n: number; d: number; q: number; c: number; w: number }>();
    for (const t of inRange) {
      const e = bySubject.get(t.subject) ?? { n: 0, d: 0, q: 0, c: 0, w: 0 };
      e.n++;
      if (t.done) {
        e.d++;
        e.q += t.solved ?? 0;
      }
      e.c += t.correct ?? 0;
      e.w += t.wrong ?? 0;
      bySubject.set(t.subject, e);
    }
    const subjects = [...bySubject.entries()].sort((a, b) => b[1].q - a[1].q || b[1].n - a[1].n);
    const maxQ = Math.max(1, ...subjects.map(([, e]) => e.q));

    const finishedTopics = raw.topics.filter((t) => isCompleted(t.status) && (t.updated_at ?? "").slice(0, 10) >= from).map((t) => topicName.get(t.topic_id) ?? t.topic_id);
    // Konu bazında doğruluk (en az 15 işaretli soru)
    const byTopic = new Map<string, { c: number; w: number }>();
    for (const t of raw.tasks.filter((x) => x.date >= addDays(today, -45) && x.topic_id)) {
      const e = byTopic.get(t.topic_id!) ?? { c: 0, w: 0 };
      e.c += t.correct ?? 0;
      e.w += t.wrong ?? 0;
      byTopic.set(t.topic_id!, e);
    }
    const weakTopics = [...byTopic.entries()]
      .filter(([, e]) => e.c + e.w >= 15)
      .map(([id, e]) => ({ name: topicName.get(id) ?? id, acc: Math.round((e.c / (e.c + e.w)) * 100), n: e.c + e.w }))
      .filter((x) => x.acc < 65)
      .sort((a, b) => a.acc - b.acc)
      .slice(0, 5);

    const examsIn = raw.exams.filter((e) => e.exam_date >= from && e.exam_date <= today);
    const examsAll = [...raw.exams].sort((a, b) => b.exam_date.localeCompare(a.exam_date));
    const lastExam = examsAll[0] ?? null;
    const prevSame = lastExam ? examsAll.find((e) => e.id !== lastExam.id && e.exam_type === lastExam.exam_type) : null;
    const examDelta = lastExam && prevSame && examNet(lastExam) != null && examNet(prevSame) != null ? Math.round((examNet(lastExam)! - examNet(prevSame)!) * 100) / 100 : null;

    const sleep = avg(logs.map((l) => (l.sleep_hours == null ? null : Number(l.sleep_hours))));
    const phone = avg(logs.map((l) => l.phone_minutes));
    const anxiety = avg(logs.map((l) => l.anxiety));
    const motivation = avg(logs.map((l) => l.motivation));
    const energy = avg(logs.map((l) => l.energy));
    const procDays = logs.filter((l) => l.procrastinated).length;
    const replanDays = logs.filter((l) => l.replanned).length;
    const obstacles = logs.filter((l) => l.obstacle?.trim()).slice(0, 4).map((l) => ({ d: l.log_date, t: l.obstacle!.trim() }));
    const completion = pct(done.length, inRange.length);

    // Görüşmede konuşulabilecekler (kural tabanlı)
    const talk: { tone: "good" | "watch"; text: string }[] = [];
    if (raw.openAlerts) talk.push({ tone: "watch", text: `${raw.openAlerts} açık destek uyarısı var; görüşmenin başında ele alın.` });
    if (completion != null && completion >= 80) talk.push({ tone: "good", text: `Program tamamlama %${completion}. Bu düzeni fark edip takdir edin.` });
    else if (completion != null && completion < 60) talk.push({ tone: "watch", text: `Program tamamlama %${completion}. Programın yoğunluğunu ve zorlayan saatleri birlikte gözden geçirin.` });
    if (overdue.length) talk.push({ tone: "watch", text: `${overdue.length} geciken görev var (en çok: ${topSubjects(overdue)}). Hangilerinin yeniden planlanacağına birlikte karar verin.` });
    for (const w of weakTopics.slice(0, 2)) talk.push({ tone: "watch", text: `${w.name}: doğruluk %${w.acc} (${w.n} soru). Konu tekrarı mı, soru tipi mi zorluyor, sorun.` });
    if (procDays >= 2) talk.push({ tone: "watch", text: `${logs.length} günlüğün ${procDays}'inde erteleme işaretlenmiş. Ertelemenin hangi görevlerde ve saatlerde olduğunu konuşun.` });
    if (anxiety != null && anxiety >= 3.5) talk.push({ tone: "watch", text: `Kaygı ortalaması ${fmtNum(anxiety)}/5. Kaygının kaynağını ve baş etme yollarını konuşun.` });
    if (motivation != null && motivation <= 2.5) talk.push({ tone: "watch", text: `Motivasyon ortalaması ${fmtNum(motivation)}/5. Kısa vadeli, ulaşılabilir bir hedef belirleyin.` });
    if (sleep != null && sleep < 6.5) talk.push({ tone: "watch", text: `Uyku ortalaması ${fmtNum(sleep)} saat. Uyku düzenini konuşun.` });
    if (phone != null && phone > 150) talk.push({ tone: "watch", text: `Telefon ortalaması ${minutesToText(Math.round(phone))}. Çalışma saatlerinde telefon kuralını konuşun.` });
    if (logs.length < nDays / 2) talk.push({ tone: "watch", text: `Günlük ${nDays} günün ${logs.length}'inde doldurulmuş. Neyin zorladığını sorun.` });
    if (examDelta != null) talk.push({ tone: examDelta >= 0 ? "good" : "watch", text: `Son deneme (${lastExam!.title}) bir önceki ${lastExam!.exam_type} denemesine göre ${examDelta >= 0 ? "+" : ""}${fmtNum(examDelta, 2)} net.` });
    if (raw.game && raw.game.streak >= 7) talk.push({ tone: "good", text: `${raw.game.streak} günlük çalışma serisi devam ediyor.` });

    const goal = raw.game?.months ? monthGoals(raw.game).find((g) => g.m === today.slice(0, 7)) : undefined;
    const badgesNow = raw.game ? earnedBadges(raw.game).length : null;

    return {
      today, from, nDays, dates, logs, inRange, done, overdue, solved, correct, wrong, accuracy, minutes, minutesByDay, qByDay, active,
      subjects, maxQ, finishedTopics, weakTopics, examsIn, lastExam, examDelta, sleep, phone, anxiety, motivation, energy, procDays, replanDays,
      obstacles, completion, talk, goal, badgesNow,
    };
  }, [raw, period, lastDone]);

  async function saveNote() {
    if (!sessionId) return;
    setSaving(true);
    const { error: e } = await sb().from("counseling_sessions").update({ notes: note.slice(0, 3000) }).eq("id", sessionId);
    setSaving(false);
    toast.show(e ? errorText(e) : "Not görüşmeye kaydedildi", e ? "danger" : "success");
  }

  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!raw || !r) return <PageLoader />;
  const s = raw.student;

  return (
    <div className="space-y-4">
      <div className="no-print">
        <A to={{ v: "ogrenci", id: studentId }} className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
          <Icon name="chevronLeft" size={16} /> {s.full_name}
        </A>
      </div>
      <Card title="Görüşme öncesi rapor" subtitle="Dönemi seçin, gerekirse notunuzu ekleyin, sonra yazdırın ya da PDF olarak kaydedin." className="no-print">
        <div className="space-y-3">
          <Segmented
            size="sm"
            ariaLabel="Dönem"
            value={period}
            onChange={setPeriod}
            options={[
              { value: "son" as const, label: lastDone ? "Son görüşmeden beri" : "Son 14 gün" },
              { value: 7 as const, label: "7 gün" },
              { value: 14 as const, label: "14 gün" },
              { value: 30 as const, label: "30 gün" },
            ]}
          />
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium">Görüşme notu {sessionId ? "(görüşmeye kaydedilir, yalnızca siz görürsünüz)" : "(yalnızca rapora eklenir)"}</span>
            <textarea className="field min-h-20" maxLength={3000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="ör. Bu görüşmede matematik programını hafifletip paragraf hızına odaklanacağız." />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button icon="printer" onClick={() => window.print()}>
              Yazdır / PDF kaydet
            </Button>
            {sessionId && (
              <Button variant="secondary" icon="check" loading={saving} onClick={saveNote}>
                Notu görüşmeye kaydet
              </Button>
            )}
          </div>
        </div>
      </Card>

      <article className="print-area card space-y-6 p-5 sm:p-8">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
          <div>
            <p className="text-xs font-semibold tracking-wide text-primary uppercase">Öğrenci performans raporu</p>
            <h2 className="display mt-1 text-2xl">{s.full_name}</h2>
            <p className="text-sm text-muted">{[s.grade, s.field, s.exam_year ? `${sinavOf(s.field)} ${s.exam_year}` : null, s.target ? `Hedef: ${s.target}` : null].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="text-right text-sm">
            <p className="font-medium">
              {formatTR(r.from)} – {formatTR(r.today)}
            </p>
            <p className="text-muted">
              {r.nDays} gün{period === "son" && lastDone ? ` · son görüşme ${formatTR(localDate(lastDone.starts_at))}` : ""}
            </p>
            {session && <p className="text-muted">Görüşme: {formatTR(localDate(session.starts_at))}</p>}
          </div>
        </header>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {(
            [
              ["Çalışma süresi", r.minutes ? minutesToText(r.minutes) : "—", "programa girilen süre"],
              ["Çözülen soru", String(r.solved), `${r.done.length} tamamlanan görevden`],
              ["Doğruluk", r.accuracy != null ? `%${r.accuracy}` : "—", r.correct + r.wrong ? `${r.correct} D · ${r.wrong} Y` : "D/Y girilmemiş"],
              ["Görev tamamlama", r.completion != null ? `%${r.completion}` : "—", `${r.done.length}/${r.inRange.length} görev`],
              ["Aktif gün", `${r.active.size}/${r.nDays}`, "görev ya da günlük"],
              ["Günlük takip", `${r.logs.length}/${r.nDays}`, "gün dolduruldu"],
            ] as const
          ).map(([label, value, sub]) => (
            <div key={label} className="rounded-xl bg-surface-2 p-3">
              <p className="text-xs text-muted">{label}</p>
              <p className="display mt-0.5 text-2xl tabular">{value}</p>
              <p className="text-xs text-faint">{sub}</p>
            </div>
          ))}
        </section>

        {r.talk.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-semibold">Görüşmede konuşulabilecekler</h3>
            <ul className="space-y-1.5 text-sm">
              {r.talk.map((t, i) => (
                <li key={i} className="flex gap-2">
                  <span className={t.tone === "good" ? "text-success" : "text-warning"} aria-hidden>
                    {t.tone === "good" ? "✓" : "•"}
                  </span>
                  <span>{t.text}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="grid gap-6 sm:grid-cols-2">
          <section>
            <h3 className="mb-1 text-sm font-semibold">Günlük çalışma süresi</h3>
            <BarChart labels={r.dates} values={r.dates.map((d) => r.minutesByDay.get(d) ?? null)} unit="dk" height={150} ariaLabel="Günlük çalışma süresi" />
          </section>
          <section>
            <h3 className="mb-1 text-sm font-semibold">Günlük çözülen soru</h3>
            <BarChart labels={r.dates} values={r.dates.map((d) => r.qByDay.get(d) ?? null)} unit="soru" height={150} color="var(--series-2)" ariaLabel="Günlük çözülen soru" />
          </section>
        </div>

        {r.subjects.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-semibold">Derslere göre</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="py-1.5 font-medium">Ders</th>
                  <th className="py-1.5 font-medium">Çözülen soru</th>
                  <th className="py-1.5 text-right font-medium">Doğruluk</th>
                  <th className="py-1.5 text-right font-medium">Görev</th>
                </tr>
              </thead>
              <tbody>
                {r.subjects.map(([name, e]) => (
                  <tr key={name} className="border-b border-line/60">
                    <td className="py-1.5 pr-2">{name}</td>
                    <td className="py-1.5">
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-24 overflow-hidden rounded-full bg-surface-2 sm:w-40">
                          <span className="bar-grow block h-full rounded-full" style={{ width: `${Math.round((e.q / r.maxQ) * 100)}%`, background: "var(--series-1)" }} />
                        </span>
                        <span className="tabular">{e.q || "—"}</span>
                      </span>
                    </td>
                    <td className="py-1.5 text-right tabular">{e.c + e.w ? `%${Math.round((e.c / (e.c + e.w)) * 100)}` : "—"}</td>
                    <td className="py-1.5 text-right tabular">
                      {e.d}/{e.n}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <div className="grid gap-6 sm:grid-cols-2">
          <section>
            <h3 className="mb-2 text-sm font-semibold">Günlük örüntüleri</h3>
            {r.logs.length ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                {(
                  [
                    ["Uyku", r.sleep != null ? `${fmtNum(r.sleep)} sa` : "—"],
                    ["Telefon", r.phone != null ? minutesToText(Math.round(r.phone)) : "—"],
                    ["Kaygı", r.anxiety != null ? `${fmtNum(r.anxiety)}/5` : "—"],
                    ["Motivasyon", r.motivation != null ? `${fmtNum(r.motivation)}/5` : "—"],
                    ["Enerji", r.energy != null ? `${fmtNum(r.energy)}/5` : "—"],
                    ["Erteleme", `${r.procDays} gün`],
                    ["Plan değişikliği", `${r.replanDays} gün`],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="flex justify-between border-b border-line/60 py-0.5">
                    <dt className="text-muted">{k}</dt>
                    <dd className="tabular">{v}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-muted">Bu dönemde günlük kaydı yok.</p>
            )}
            {r.obstacles.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-medium text-muted">Öğrencinin yazdığı engeller</p>
                <ul className="mt-1 space-y-1 text-sm">
                  {r.obstacles.map((o) => (
                    <li key={o.d}>
                      <span className="text-xs text-faint tabular">{formatTR(o.d)}:</span> {o.t}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="space-y-4">
            <div>
              <h3 className="mb-2 text-sm font-semibold">Denemeler</h3>
              {r.examsIn.length ? (
                <ul className="space-y-1 text-sm">
                  {r.examsIn.map((e) => (
                    <li key={e.id} className="flex justify-between gap-2 border-b border-line/60 py-0.5">
                      <span className="min-w-0 truncate">
                        {e.title} <span className="text-xs text-faint">{formatTR(e.exam_date)}</span>
                      </span>
                      <span className="tabular">{examNet(e) != null ? `${fmtNum(examNet(e), 2)} net` : "—"}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">{r.lastExam ? `Bu dönemde deneme yok. Son deneme: ${r.lastExam.title} (${formatTR(r.lastExam.exam_date)}).` : "Henüz deneme girilmemiş."}</p>
              )}
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold">Konular</h3>
              <p className="text-sm">
                Bu dönemde bitirilen: <b className="font-semibold">{r.finishedTopics.length}</b>
                {r.finishedTopics.length ? <span className="text-muted"> — {r.finishedTopics.slice(0, 8).join(", ")}{r.finishedTopics.length > 8 ? "…" : ""}</span> : null}
              </p>
              {r.weakTopics.length > 0 && (
                <p className="mt-1 text-sm">
                  Zorlandığı konular: <span className="text-muted">{r.weakTopics.map((w) => `${w.name} (%${w.acc})`).join(", ")}</span>
                </p>
              )}
            </div>
            {raw.game && (
              <div>
                <h3 className="mb-2 text-sm font-semibold">Seri ve hedef</h3>
                <p className="text-sm">
                  Çalışma serisi {raw.game.streak} gün · günlük serisi {raw.game.log_streak ?? 0} gün · {r.badgesNow} rozet
                  {r.goal ? ` · bu ay ${fmtNum(r.goal.q, 0)}/${fmtNum(r.goal.goalQ, 0)} soru, ${r.goal.d}/${r.goal.goalD} aktif gün` : ""}
                </p>
              </div>
            )}
          </section>
        </div>

        {r.overdue.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-semibold">Geciken görevler ({r.overdue.length})</h3>
            <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              {r.overdue.slice(0, 12).map((t) => (
                <li key={t.id} className="flex justify-between gap-2 border-b border-line/60 py-0.5">
                  <span className="min-w-0 truncate">
                    <span className="text-muted">{t.subject} ·</span> {t.topic_id ? (topicName.get(t.topic_id) ?? t.content) : t.content || t.subject}
                  </span>
                  <span className="shrink-0 text-xs text-faint tabular">{formatTR(t.date)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {(note.trim() || lastDone?.notes) && (
          <section className="grid gap-4 sm:grid-cols-2">
            {lastDone?.notes && (
              <div>
                <h3 className="mb-1 text-sm font-semibold">Önceki görüşmenin notu</h3>
                <p className="whitespace-pre-line text-sm text-muted">{lastDone.notes}</p>
              </div>
            )}
            {note.trim() && (
              <div>
                <h3 className="mb-1 text-sm font-semibold">Bu görüşme için not</h3>
                <p className="whitespace-pre-line text-sm">{note.trim()}</p>
              </div>
            )}
          </section>
        )}

        <footer className="border-t border-line pt-3 text-xs text-faint">
          Bu rapor {profile?.full_name ?? "danışman"} tarafından {formatTR(r.today)} tarihinde hazırlanmıştır. Günlük verileri (kaygı, motivasyon, yazılanlar) içerdiği için yalnızca danışman kullanımı içindir.
        </footer>
      </article>
    </div>
  );
}

function topSubjects(tasks: Task[]) {
  const m = new Map<string, number>();
  for (const t of tasks) m.set(t.subject, (m.get(t.subject) ?? 0) + 1);
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([s, n]) => `${s} ${n}`)
    .join(", ");
}
