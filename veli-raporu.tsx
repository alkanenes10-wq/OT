"use client";
// Veli raporu: seçilen dönem için yazdırılabilir / PDF olarak kaydedilebilir özet.
// Psikolojik ayrıntılar varsayılan olarak KAPALI; danışman yalnızca genel iyi oluş özetini paylaşır.

import { useEffect, useMemo, useState } from "react";
import { coursesFor, courseTopicIds, isCompleted, sinavOf } from "./curriculum";
import { errorText, fetchAnalyses, fetchLogs, fetchPlans, fetchTopicProgress, sb } from "./db";
import { waLink } from "./ekler";
import { addDays, avg, type DailyLog, type ExamAnalysis, fmtNum, formatTR, isRealTask, net, wrongDivisor, pct, type PlanTask, type Profile, todayISO, type TopicProgress, type WeeklyPlan } from "./lib";
import { Button, Card, ErrorBox, Icon, PageLoader, Segmented } from "./ui";

type Period = 7 | 14 | 30;

type Data = { logs: DailyLog[]; tasks: (PlanTask & { date: string })[]; topics: TopicProgress[]; exams: ExamAnalysis[] };

const examNet = (a: ExamAnalysis) => {
  const vals = Object.values(a.nets ?? {}).map((v) => net(v?.d, v?.y, wrongDivisor(a.exam_type)));
  if (vals.every((v) => v == null)) return null;
  return Math.round(vals.reduce<number>((s, v) => s + (v ?? 0), 0) * 100) / 100;
};

function useReportData(studentId: string) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const from = addDays(todayISO(), -45);
        const [logs, plans, topics, exams] = await Promise.all([fetchLogs(studentId, from), fetchPlans(studentId), fetchTopicProgress(studentId), fetchAnalyses(studentId).catch(() => [])]);
        const recent = plans.filter((p: WeeklyPlan) => p.start_date >= addDays(from, -7));
        let tasks: (PlanTask & { date: string })[] = [];
        if (recent.length) {
          const { data, error } = await sb().from("plan_tasks").select("*").in("plan_id", recent.map((p) => p.id));
          if (error) throw error;
          const start = new Map(recent.map((p) => [p.id, p.start_date]));
          tasks = ((data ?? []) as PlanTask[]).filter(isRealTask).map((t) => ({ ...t, date: addDays(start.get(t.plan_id) ?? todayISO(), t.day_index) }));
        }
        setData({ logs, tasks, topics, exams });
      } catch (e) {
        setError(errorText(e));
      }
    })();
  }, [studentId]);
  return { data, error };
}

function homeTips(opts: { sleep: number | null; phone: number | null; proc: number; filled: number; days: number; completion: number | null }): string[] {
  const out: string[] = [];
  if (opts.sleep != null && opts.sleep < 7)
    out.push("Uyku ortalaması önerilenin altında. Gece geç saatlere kalan çalışmayı teşvik etmek yerine sabit bir yatma ve kalkma saatini birlikte belirleyebilirsiniz.");
  if (opts.phone != null && opts.phone > 120)
    out.push("Çalışma saatlerinde telefonun başka odada kalması en etkili düzenlemedir. Bunu bir yasak olarak değil, ortak bir kural olarak konuşmanız daha iyi sonuç verir.");
  if (opts.proc >= Math.max(2, Math.round(opts.filled / 2)))
    out.push("Erteleme çoğu zaman tembellikten değil, görevin yarattığı kaygıdan doğar. Baskı yerine küçük adımları fark edip takdir etmek başlamayı kolaylaştırır.");
  if (opts.completion != null && opts.completion < 60)
    out.push("Programın tamamlanma oranı düşük. Bu, programın bu dönem için fazla yoğun olduğunu gösterebilir; eleştiri yerine 'Ne zorladı?' diye sormak daha yararlı olur.");
  if (opts.filled < opts.days / 2) out.push("Günlük takip formu düzenli doldurulmuyor. Akşamları 2 dakikalık bu değerlendirmeyi nazikçe hatırlatmanız yeterlidir; içeriğini sormanıza gerek yok.");
  if (!out.length) out.push("Bu dönemde düzen iyi gidiyor. Sonuçtan çok emeği takdir etmek (\"Bu hafta çok düzenli çalıştın\") motivasyonun sürmesine yardım eder.");
  out.push("Deneme sonuçlarını karşılaştırmak yerine bir önceki denemeye göre gelişimi konuşmak kaygıyı azaltır.");
  return out.slice(0, 4);
}

export function ParentReport({ student }: { student: Profile }) {
  const { data, error } = useReportData(student.id);
  const [period, setPeriod] = useState<Period>(7);
  const [wellbeing, setWellbeing] = useState(true);
  const [note, setNote] = useState("");
  const first = student.full_name.split(" ")[0];

  const r = useMemo(() => {
    if (!data) return null;
    const today = todayISO();
    const from = addDays(today, -(period - 1));
    const logs = data.logs.filter((l) => l.log_date >= from && l.log_date <= today);
    const due = data.tasks.filter((t) => t.date >= from && t.date <= today);
    const done = due.filter((t) => t.done);
    const solved = due.reduce((s, t) => s + (t.solved ?? 0), 0);
    const bySubject = new Map<string, { n: number; d: number; q: number }>();
    for (const t of due) {
      const e = bySubject.get(t.subject) ?? { n: 0, d: 0, q: 0 };
      e.n++;
      if (t.done) e.d++;
      e.q += t.solved ?? 0;
      bySubject.set(t.subject, e);
    }
    const topicMap = Object.fromEntries(data.topics.map((t) => [t.topic_id, t]));
    const courses = coursesFor(student.field, student.grade).map((c) => {
      const ids = courseTopicIds(c);
      const d = ids.filter((id) => isCompleted(topicMap[id]?.status)).length;
      return { name: c.name, done: d, total: ids.length };
    }).filter((c) => c.done > 0);
    const newlyDone = data.topics.filter((t) => isCompleted(t.status) && t.updated_at && t.updated_at.slice(0, 10) >= from).length;
    const exams = data.exams.filter((e) => e.exam_date >= addDays(today, -60)).slice(0, 4);
    const sleep = avg(logs.map((l) => l.sleep_hours));
    const phone = avg(logs.map((l) => l.phone_minutes));
    const proc = logs.filter((l) => l.procrastinated).length;
    const mood = avg(logs.map((l) => (l.energy == null || l.motivation == null ? null : (l.energy + l.motivation) / 2)));
    const anx = avg(logs.map((l) => l.anxiety));
    const completion = pct(done.length, due.length);
    const general =
      logs.length < 3
        ? "Bu dönemde değerlendirme için yeterli günlük kayıt yok."
        : (mood ?? 3) >= 3 && (anx ?? 3) < 3.5
          ? "Genel olarak dengeli bir dönem geçirdi; enerji ve motivasyon çoğu gün yeterli düzeydeydi."
          : (anx ?? 0) >= 3.5
            ? "Bu dönemde sınav kaygısı zaman zaman belirginleşti. Danışmanıyla bu konu üzerinde çalışıyoruz; evde sakin ve destekleyici bir tutum çok değerli."
            : "Bu dönemde yorgunluk ve motivasyon düşüklüğü bazı günlerde öne çıktı. Programı gerektiğinde hafifleterek ilerliyoruz.";
    return {
      from,
      today,
      logs,
      due: due.length,
      done: done.length,
      completion,
      solved,
      subjects: [...bySubject.entries()].sort((a, b) => b[1].n - a[1].n),
      courses,
      newlyDone,
      exams,
      sleep,
      phone,
      proc,
      general,
      tips: homeTips({ sleep, phone, proc, filled: logs.length, days: period, completion }),
    };
  }, [data, period]);

  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!r) return <PageLoader />;

  const summary = [
    `${student.full_name} · ${formatTR(r.from)} – ${formatTR(r.today)} özeti`,
    `Program: ${r.done}/${r.due} görev tamamlandı${r.completion != null ? ` (%${r.completion})` : ""}, ${r.solved} soru çözüldü.`,
    r.newlyDone ? `Bu dönemde ${r.newlyDone} konu tamamlandı.` : "",
    r.exams[0] ? `Son deneme: ${r.exams[0].title} · toplam net ${fmtNum(examNet(r.exams[0]), 2)}` : "",
    wellbeing ? `Genel durum: ${r.general}` : "",
    note.trim() ? `Danışman notu: ${note.trim()}` : "",
    `Evde destek için: ${r.tips[0]}`,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div className="space-y-4">
      <Card title="Veli raporu" subtitle="Dönemi seç, notunu ekle, sonra yazdır ya da PDF olarak kaydet." className="no-print">
        <div className="space-y-3">
          <Segmented
            size="sm"
            ariaLabel="Dönem"
            value={period}
            onChange={setPeriod}
            options={[
              { value: 7, label: "Son 7 gün" },
              { value: 14, label: "Son 14 gün" },
              { value: 30, label: "Son 30 gün" },
            ]}
          />
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={wellbeing} onChange={(e) => setWellbeing(e.target.checked)} />
            <span>
              Genel iyi oluş özetini ekle
              <span className="block text-xs text-muted">Yalnızca genel bir cümle ve uyku ortalaması paylaşılır. Kaygı puanları, öğrencinin yazdıkları ve destek uyarıları rapora hiçbir zaman girmez.</span>
            </span>
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium">Danışman değerlendirmesi</span>
            <textarea className="field min-h-24" maxLength={1500} value={note} onChange={(e) => setNote(e.target.value)} placeholder={`ör. ${first} bu hafta matematikte düzenli çalıştı; önümüzdeki hafta paragraf hızına odaklanacağız.`} />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button icon="printer" onClick={() => window.print()}>
              Yazdır / PDF kaydet
            </Button>
            <a href={waLink(summary)} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-2 rounded-xl border border-line bg-surface px-4 text-[15px] font-medium">
              <Icon name="message" size={17} /> Özeti WhatsApp'ta paylaş
            </a>
          </div>
        </div>
      </Card>

      <article id="veli-raporu" className="card space-y-5 p-5 sm:p-8">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
          <div>
            <p className="text-xs font-semibold tracking-wide text-primary uppercase">Veli bilgilendirme raporu</p>
            <h2 className="display mt-1 text-2xl">{student.full_name}</h2>
            <p className="text-sm text-muted">
              {[student.grade, student.field, student.exam_year ? `${sinavOf(student.field)} ${student.exam_year}` : null, student.target ? `Hedef: ${student.target}` : null].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="text-right text-sm">
            <p className="font-medium">
              {formatTR(r.from)} – {formatTR(r.today)}
            </p>
            <p className="text-muted">{period} günlük dönem</p>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Görev tamamlama", r.completion != null ? `%${r.completion}` : "—", `${r.done}/${r.due} görev`],
            ["Çözülen soru", String(r.solved), "program görevlerinden"],
            ["Tamamlanan konu", String(r.newlyDone), "bu dönemde"],
            ["Günlük takip", `${r.logs.length}/${period}`, "gün dolduruldu"],
          ].map(([label, value, sub]) => (
            <div key={label} className="rounded-xl bg-surface-2 p-3">
              <p className="text-xs text-muted">{label}</p>
              <p className="display mt-0.5 text-2xl tabular">{value}</p>
              <p className="text-xs text-faint">{sub}</p>
            </div>
          ))}
        </section>

        {r.subjects.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-semibold">Derslere göre program</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="py-1.5 font-medium">Ders</th>
                  <th className="py-1.5 font-medium">Tamamlanan</th>
                  <th className="py-1.5 text-right font-medium">Çözülen soru</th>
                </tr>
              </thead>
              <tbody>
                {r.subjects.map(([s, e]) => (
                  <tr key={s} className="border-b border-line/60">
                    <td className="py-1.5">{s}</td>
                    <td className="py-1.5">
                      <span className="inline-flex items-center gap-2">
                        <span className="inline-block h-1.5 w-20 overflow-hidden rounded-full bg-surface-2">
                          <span className="bar-grow block h-full bg-primary" style={{ width: `${Math.round((e.d / e.n) * 100)}%` }} />
                        </span>
                        <span className="tabular">
                          {e.d}/{e.n}
                        </span>
                      </span>
                    </td>
                    <td className="py-1.5 text-right tabular">{e.q || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          {r.courses.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold">Konu ilerlemesi (toplam)</h3>
              <ul className="space-y-1.5 text-sm">
                {r.courses.map((c) => (
                  <li key={c.name}>
                    <div className="flex justify-between">
                      <span>{c.name}</span>
                      <span className="tabular text-muted">
                        {c.done}/{c.total}
                      </span>
                    </div>
                    <span className="mt-0.5 block h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <span className="bar-grow block h-full bg-success" style={{ width: `${Math.round((c.done / c.total) * 100)}%` }} />
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {r.exams.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold">Son denemeler</h3>
              <ul className="space-y-1.5 text-sm">
                {r.exams.map((e) => (
                  <li key={e.id} className="flex justify-between gap-2 border-b border-line/60 pb-1.5">
                    <span>
                      {e.title} <span className="text-xs text-muted">· {e.exam_type} · {formatTR(e.exam_date)}</span>
                    </span>
                    <span className="font-semibold tabular">{fmtNum(examNet(e), 2)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {wellbeing && (
          <section className="rounded-xl bg-surface-2 p-4 text-sm">
            <h3 className="mb-1 font-semibold">Genel durum</h3>
            <p>{r.general}</p>
            {r.sleep != null && <p className="mt-1 text-muted">Ortalama uyku: {fmtNum(r.sleep)} saat (önerilen 8–10 saat).</p>}
          </section>
        )}

        {note.trim() && (
          <section className="text-sm">
            <h3 className="mb-1 font-semibold">Danışman değerlendirmesi</h3>
            <p className="whitespace-pre-line">{note.trim()}</p>
          </section>
        )}

        <section className="text-sm">
          <h3 className="mb-1.5 font-semibold">Evde nasıl destek olabilirsiniz?</h3>
          <ul className="list-disc space-y-1 pl-5">
            {r.tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>

        <footer className="border-t border-line pt-3 text-xs text-faint">
          Bu rapor öğrencinin uygulamaya girdiği program ve takip verilerinden hazırlanmıştır. Psikolojik değerlendirme ya da tanı içermez. Sorularınız için danışmanınızla iletişime geçebilirsiniz.
        </footer>
      </article>
    </div>
  );
}
