"use client";
// Konu bazlı başarı analizi: her ders ve konu için doğru oranı.
// Kaynaklar: programda çözülen sorular (görev doğru/yanlış), kaynak (kitap) test sonuçları ve deneme yanlışları.
// Ayrıca "Konular" sekmesinin üst düzeni (Konu takibi / Başarı analizi / Kaynaklar).

import { useEffect, useMemo, useState } from "react";
import { ALL_TOPICS } from "./curriculum";
import { errorText, fetchAnalyses, fetchPlans, sb } from "./db";
import { ResourceTracker } from "./kaynaklar";
import { addDays, fmtNum, formatShort, parseISODate, subjectForTopic, todayISO, type ExamAnalysis, type ResourceProgress, type WeeklyPlan } from "./lib";
import { TopicTracker } from "./topics";
import { Badge, Card, EmptyState, ErrorBox, PageLoader, Segmented, cx } from "./ui";

const topicNames = new Map(ALL_TOPICS.map((t) => [t.id, t.name]));
/** Müfredatta bulunamayan (ör. eski karnelerden gelen) konu kimliklerini okunur hâle getirir */
const topicName = {
  get: (id: string) => {
    const n = topicNames.get(id);
    if (n) return n;
    const tail = id.split(".").pop() ?? id;
    return tail.replace(/-/g, " ").replace(/^./, (c) => c.toLocaleUpperCase("tr-TR"));
  },
};
const WEEKS = 8;

/* ------------------------------------------------------------------ */
/* Konular sekmesi                                                     */
/* ------------------------------------------------------------------ */
type HubView = "takip" | "analiz" | "kaynak";
export function TopicsHub({ studentId, studentName }: { studentId: string; studentName: string }) {
  const [view, setView] = useState<HubView>("takip");
  return (
    <div className="space-y-4">
      <Segmented
        ariaLabel="Konular görünümü"
        value={view}
        onChange={setView}
        options={[
          { value: "takip", label: "Konu takibi" },
          { value: "analiz", label: "Başarı analizi" },
          { value: "kaynak", label: "Kaynaklar" },
        ]}
      />
      {view === "takip" && <TopicTracker studentId={studentId} studentName={studentName} />}
      {view === "analiz" && <TopicAnalysis studentId={studentId} />}
      {view === "kaynak" && <ResourceTracker studentId={studentId} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Veri                                                                */
/* ------------------------------------------------------------------ */
type Attempt = { topic: string | null; subject: string; date: string; c: number; w: number; solved: number; src: "program" | "kaynak" };
type TopicStat = {
  id: string;
  subject: string;
  c: number;
  w: number;
  solved: number;
  acc: number | null;
  recentAcc: number | null;
  prevAcc: number | null;
  examHits: number;
  examWrong: number;
  lastExam: string | null;
  score: number;
  reasons: string[];
  weeks: { c: number; w: number }[];
};

const accOf = (c: number, w: number) => (c + w > 0 ? Math.round((c / (c + w)) * 100) : null);

function mondayOf(iso: string) {
  const d = parseISODate(iso);
  const wd = (d.getDay() + 6) % 7;
  return addDays(iso, -wd);
}

async function loadAttempts(studentId: string): Promise<{ attempts: Attempt[]; exams: ExamAnalysis[] }> {
  const since = addDays(todayISO(), -180);
  const [plans, exams] = await Promise.all([fetchPlans(studentId), fetchAnalyses(studentId)]);
  const recent = plans.filter((p) => p.start_date >= addDays(since, -6));
  const byPlan = new Map<string, WeeklyPlan>(recent.map((p) => [p.id, p]));
  const attempts: Attempt[] = [];
  if (recent.length) {
    // Supabase tek seferde en fazla 1000 satır döndürür: sayfalayarak oku
    const data: unknown[] = [];
    for (let from = 0; from < 10000; from += 1000) {
      const { data: page, error } = await sb()
        .from("plan_tasks")
        .select("id, plan_id, day_index, subject, topic_id, solved, correct, wrong")
        .eq("student_id", studentId)
        .in("plan_id", recent.map((p) => p.id))
        .or("correct.not.is.null,wrong.not.is.null,solved.not.is.null")
        .order("id")
        .range(from, from + 999);
      if (error) throw error;
      data.push(...(page ?? []));
      if ((page ?? []).length < 1000) break;
    }
    for (const t of (data ?? []) as { plan_id: string; day_index: number; subject: string; topic_id: string | null; solved: number | null; correct: number | null; wrong: number | null }[]) {
      const p = byPlan.get(t.plan_id);
      if (!p) continue;
      const c = t.correct ?? 0;
      const w = t.wrong ?? 0;
      if (!c && !w && !t.solved) continue;
      attempts.push({
        topic: t.topic_id,
        subject: t.topic_id ? subjectForTopic(t.topic_id) : t.subject,
        date: addDays(p.start_date, t.day_index),
        c,
        w,
        solved: t.solved ?? c + w,
        src: "program",
      });
    }
  }
  // Kaynak testleri (tablo yoksa sessizce atlanır). Programdan gelen tek test kaydı görevle aynı olduğu için tekrar sayılmaz.
  const { data: rp } = await sb().from("resource_progress").select("*").eq("student_id", studentId).gte("done_on", since).not("topic_id", "is", null);
  for (const r of (rp ?? []) as ResourceProgress[]) {
    if (r.task_id) continue;
    const c = r.correct ?? 0;
    const w = r.wrong ?? 0;
    if (!c && !w) continue;
    attempts.push({ topic: r.topic_id!, subject: subjectForTopic(r.topic_id!), date: r.done_on, c, w, solved: c + w + (r.empty ?? 0), src: "kaynak" });
  }
  return { attempts, exams: exams.filter((e) => e.exam_date >= since) };
}

function buildStats(attempts: Attempt[], exams: ExamAnalysis[], weekStarts: string[]): TopicStat[] {
  const today = todayISO();
  const recentFrom = addDays(today, -27);
  const prevFrom = addDays(today, -55);
  const m = new Map<string, TopicStat & { rc: number; rw: number; pc: number; pw: number }>();
  const get = (id: string) => {
    let s = m.get(id);
    if (!s) {
      s = {
        id,
        subject: subjectForTopic(id),
        c: 0,
        w: 0,
        solved: 0,
        acc: null,
        recentAcc: null,
        prevAcc: null,
        examHits: 0,
        examWrong: 0,
        lastExam: null,
        score: 0,
        reasons: [],
        weeks: weekStarts.map(() => ({ c: 0, w: 0 })),
        rc: 0,
        rw: 0,
        pc: 0,
        pw: 0,
      };
      m.set(id, s);
    }
    return s;
  };
  for (const a of attempts) {
    if (!a.topic) continue; // konusuz görevler yalnızca ders özetine girer
    const s = get(a.topic);
    s.c += a.c;
    s.w += a.w;
    s.solved += a.solved;
    if (a.date >= recentFrom) {
      s.rc += a.c;
      s.rw += a.w;
    } else if (a.date >= prevFrom) {
      s.pc += a.c;
      s.pw += a.w;
    }
    const wi = weekStarts.indexOf(mondayOf(a.date));
    if (wi >= 0) {
      s.weeks[wi].c += a.c;
      s.weeks[wi].w += a.w;
    }
  }
  for (const e of exams) {
    for (const r of e.results) {
      const miss = (r.wrong ?? 0) + (r.empty ?? 0);
      if (!miss) continue;
      const s = get(r.topic_id);
      s.examHits++;
      s.examWrong += miss;
      if (!s.lastExam || e.exam_date > s.lastExam) s.lastExam = e.exam_date;
    }
  }
  return [...m.values()].map((s) => {
    const acc = accOf(s.c, s.w);
    const recentAcc = s.rc + s.rw >= 8 ? accOf(s.rc, s.rw) : null;
    const prevAcc = s.pc + s.pw >= 8 ? accOf(s.pc, s.pw) : null;
    const n = s.c + s.w;
    const reasons: string[] = [];
    let score = 0;
    if (acc != null && n >= 5) {
      score += ((100 - acc) / 100) * 60 * Math.min(1, n / 30);
      if (acc < 60) reasons.push(`doğru oranı %${acc} (${fmtNum(n, 0)} soru)`);
    }
    if (s.examHits) {
      score += s.examHits * 14 + Math.min(20, s.examWrong * 2);
      reasons.push(`${s.examHits} denemede ${s.examWrong} yanlış/boş`);
    }
    if (recentAcc != null && prevAcc != null && recentAcc < prevAcc - 8) {
      score += 10;
      reasons.push(`son 4 haftada düştü (%${prevAcc} → %${recentAcc})`);
    }
    if (n === 0 && s.examHits) reasons.push("programda hiç soru çözülmemiş");
    const { rc, rw, pc, pw, ...rest } = s;
    void rc;
    void rw;
    void pc;
    void pw;
    return { ...rest, acc, recentAcc, prevAcc, score, reasons };
  });
}

/* ------------------------------------------------------------------ */
/* Görünüm                                                             */
/* ------------------------------------------------------------------ */
export function TopicAnalysis({ studentId }: { studentId: string }) {
  const [data, setData] = useState<{ attempts: Attempt[]; exams: ExamAnalysis[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState("");

  useEffect(() => {
    let live = true;
    loadAttempts(studentId)
      .then((d) => live && setData(d))
      .catch((e) => {
        if (!live) return;
        setError(errorText(e));
        setData({ attempts: [], exams: [] });
      });
    return () => {
      live = false;
    };
  }, [studentId]);

  const weekStarts = useMemo(() => {
    const cur = mondayOf(todayISO());
    return Array.from({ length: WEEKS }, (_, i) => addDays(cur, -7 * (WEEKS - 1 - i)));
  }, []);
  const stats = useMemo(() => (data ? buildStats(data.attempts, data.exams, weekStarts) : []), [data, weekStarts]);

  const subjects = useMemo(() => {
    const m = new Map<string, { c: number; w: number; solved: number; examWrong: number }>();
    const get = (k: string) => {
      let x = m.get(k);
      if (!x) m.set(k, (x = { c: 0, w: 0, solved: 0, examWrong: 0 }));
      return x;
    };
    for (const a of data?.attempts ?? []) {
      const x = get(a.subject);
      x.c += a.c;
      x.w += a.w;
      x.solved += a.solved;
    }
    for (const s of stats) get(s.subject).examWrong += s.examWrong;
    return [...m.entries()]
      .filter(([name]) => name && name !== "DİĞER")
      .map(([name, x]) => ({ name, ...x, acc: accOf(x.c, x.w) }))
      .sort((a, b) => (a.acc ?? 101) - (b.acc ?? 101) || b.examWrong - a.examWrong);
  }, [data, stats]);

  if (!data) return <PageLoader />;
  const filtered = subject ? stats.filter((s) => s.subject === subject) : stats;
  const priority = filtered
    .filter((s) => s.score > 0 && s.reasons.length)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  const heat = filtered
    .filter((s) => s.weeks.some((w) => w.c + w.w > 0))
    .sort((a, b) => b.c + b.w - (a.c + a.w))
    .slice(0, 14);
  const totalC = subjects.reduce((s, x) => s + x.c, 0);
  const totalW = subjects.reduce((s, x) => s + x.w, 0);
  const hasPractice = totalC + totalW > 0;

  if (!stats.length && !subjects.length)
    return (
      <Card>
        {error && <ErrorBox>{error}</ErrorBox>}
        <EmptyState icon="chart" title="Henüz analiz için veri yok">
          Programdaki görevlerde doğru/yanlış sayısı girildikçe, kaynak testleri kaydedildikçe ve deneme karnesi yüklendikçe her konunun başarısı burada hesaplanır.
        </EmptyState>
      </Card>
    );

  return (
    <div className="space-y-4">
      {error && <ErrorBox>{error}</ErrorBox>}
      <Card
        title="Derslere göre doğru oranı"
        subtitle={`Son 6 ay · ${hasPractice ? `${fmtNum(totalC + totalW, 0)} soruda %${accOf(totalC, totalW)} doğru` : "doğru/yanlış girilmemiş"} · ${data.exams.length} deneme`}
      >
        <ul className="space-y-2.5">
          {subjects.map((s) => (
            <li key={s.name}>
              <button
                type="button"
                onClick={() => setSubject((x) => (x === s.name ? "" : s.name))}
                aria-pressed={subject === s.name}
                className={cx("grid w-full grid-cols-[7.5rem_1fr_auto] items-center gap-3 rounded-lg px-1.5 py-1 text-left transition sm:grid-cols-[9rem_1fr_auto]", subject === s.name ? "bg-primary-soft" : "hover:bg-surface-2")}
              >
                <span className="truncate text-xs font-semibold tracking-wide">{s.name}</span>
                <span className="relative h-2.5 overflow-hidden rounded-full bg-surface-2">
                  {s.acc != null && <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${s.acc}%`, background: "var(--series-1)" }} />}
                </span>
                <span className="w-36 text-right text-xs tabular sm:w-52">
                  <span className="font-semibold">{s.acc != null ? `%${s.acc}` : "—"}</span>
                  <span className="text-muted">
                    {" "}
                    · {fmtNum(s.c + s.w, 0)} soru{s.examWrong ? ` · ${s.examWrong} deneme y/b` : ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-faint">Bir derse dokununca aşağıdaki listeler o derse göre süzülür.</p>
      </Card>

      <Card
        title={`Öncelikli konular${subject ? ` · ${subject}` : ""}`}
        subtitle="Düşük doğru oranı, denemelerde tekrar eden yanlış ve son haftalardaki düşüş birlikte değerlendirildi"
        action={
          subject && (
            <button className="text-sm font-medium text-primary" onClick={() => setSubject("")}>
              Tüm dersler
            </button>
          )
        }
      >
        {priority.length === 0 ? (
          <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted">Belirgin bir zayıf konu görünmüyor.</p>
        ) : (
          <ol className="-mx-1 divide-y divide-line">
            {priority.map((s, i) => (
              <li key={s.id} className="flex items-start gap-3 px-1 py-2.5">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-bold tabular">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{topicName.get(s.id) ?? s.id}</p>
                  <p className="text-xs text-muted">
                    {s.subject} · {s.reasons.join(" · ")}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  {s.acc != null ? (
                    <Badge tone={s.acc >= 75 ? "success" : s.acc >= 50 ? "warning" : "danger"}>%{s.acc}</Badge>
                  ) : (
                    <Badge tone="neutral">deneme</Badge>
                  )}
                  {s.recentAcc != null && s.prevAcc != null && s.recentAcc !== s.prevAcc && (
                    <p className={cx("mt-0.5 text-[11px] tabular", s.recentAcc > s.prevAcc ? "text-success" : "text-danger")}>
                      {s.recentAcc > s.prevAcc ? "▲" : "▼"} %{s.prevAcc} → %{s.recentAcc}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      {heat.length > 0 && (
        <Card title={`Haftalara göre doğru oranı${subject ? ` · ${subject}` : ""}`} subtitle="En çok soru çözülen konular · son 8 hafta">
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full min-w-[560px] border-separate text-xs" style={{ borderSpacing: 3 }}>
              <thead>
                <tr>
                  <th className="w-[38%] text-left font-medium text-muted" />
                  {weekStarts.map((w) => (
                    <th key={w} className="font-medium text-muted tabular">
                      {formatShort(w).replace(/ (\S{3})\S*$/, " $1")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heat.map((s) => (
                  <tr key={s.id}>
                    <th scope="row" className="max-w-0 truncate pr-2 text-left font-medium" title={topicName.get(s.id) ?? s.id}>
                      {topicName.get(s.id) ?? s.id}
                    </th>
                    {s.weeks.map((w, i) => {
                      const a = accOf(w.c, w.w);
                      return (
                        <td
                          key={i}
                          title={a == null ? "Kayıt yok" : `${formatShort(weekStarts[i])} haftası · ${w.c} doğru, ${w.w} yanlış · %${a}`}
                          className={cx(
                            "h-8 rounded-md text-center font-semibold tabular",
                            a == null ? "bg-surface-2 text-faint" : a >= 75 ? "bg-success-soft text-success" : a >= 50 ? "bg-warning-soft text-warning" : "bg-danger-soft text-danger",
                          )}
                        >
                          {a == null ? "·" : a}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded bg-success-soft ring-1 ring-success/30" /> %75+
            </span>
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded bg-warning-soft ring-1 ring-warning/30" /> %50–74
            </span>
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded bg-danger-soft ring-1 ring-danger/30" /> %50 altı
            </span>
            <span>Hücredeki sayı o haftanın doğru yüzdesidir.</span>
          </p>
        </Card>
      )}
      {!hasPractice && (
        <p className="text-xs text-faint">
          İpucu: Öğrenci görevlerde yalnızca “çözdüğüm” sayısını girerse doğru oranı hesaplanamaz. Görev düzenleyicideki sonuç alanına doğru ve yanlış sayısını girmesi analizi güçlendirir.
        </p>
      )}
    </div>
  );
}
