"use client";
// Veli görünümü: danışmanın oluşturduğu özel bağlantıyla (/?v=veli&id=…) açılır, giriş gerektirmez, salt okunurdur.
// Veri yalnızca parent_view() fonksiyonundan gelir: program, deneme netleri, çalışma/soru grafikleri, uyku ve telefon.
// Kaygı, motivasyon, notlar, destek kayıtları ve soru fotoğrafları veliye hiçbir zaman gösterilmez.

import { useCallback, useEffect, useMemo, useState } from "react";
import { ALL_TOPICS, COURSES } from "./curriculum";
import { errorText, sb } from "./db";
import { YksCountdown } from "./ekler";
import { waTo } from "./hatirlatma";
import { BarChart } from "./insights";
import { addDays, dayName, fmtNum, formatShort, isRealTask, minutesToText, parseISODate, pickCurrentPlan, todayISO, type PlanTask } from "./lib";
import { ExamTrends } from "./progress";
import { Badge, Button, Card, EmptyState, ErrorBox, IconButton, PageLoader, cx, confirmAction, useToast } from "./ui";

const topicName = new Map(ALL_TOPICS.map((t) => [t.id, t.name]));

type ParentData = {
  student: { full_name: string; field: string | null; grade: string | null; exam_year: number | null; target: string | null };
  counselor: string | null;
  plans: { id: string; start_date: string }[];
  tasks: (Pick<PlanTask, "plan_id" | "day_index" | "subject" | "topic_id" | "content" | "task_type" | "target_questions" | "solved" | "correct" | "wrong" | "done" | "start_time" | "duration_min">)[];
  days: { plan_id: string; day_index: number; study_minutes: number | null }[];
  exams: { exam_date: string; exam_type: "TYT" | "AYT" | "BRANS"; title: string; nets: Record<string, { d?: number | null; y?: number | null }> }[];
  sleep_phone: { log_date: string; sleep_hours: number | null; phone_minutes: number | null }[];
  topics: { topic_id: string; status: string }[];
};

const mondayOf = (iso: string) => {
  const d = parseISODate(iso);
  return addDays(iso, -((d.getDay() + 6) % 7));
};
const title = (t: ParentData["tasks"][number]) => (t.topic_id ? (topicName.get(t.topic_id) ?? t.topic_id) : t.content.trim() || t.subject);
const avgOf = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

/* ------------------------------------------------------------------ */
/* Veli sayfası                                                         */
/* ------------------------------------------------------------------ */
export function ParentPage({ token }: { token: string }) {
  const [data, setData] = useState<ParentData | null | "invalid">(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    sb()
      .rpc("parent_view", { p_token: token })
      .then(({ data, error }) => {
        if (error) {
          setError(/parent_view|schema cache|Could not find/i.test(error.message) ? "Veli sayfası henüz etkinleştirilmemiş." : errorText(error));
          return;
        }
        setData(data ? (data as ParentData) : "invalid");
      });
  }, [token]);

  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <span className="flex items-center gap-2 font-bold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-fg">
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 16l5-5 4 4 7-7" />
              </svg>
            </span>
            YKS Takip
          </span>
          <Badge>Veli görünümü · salt okunur</Badge>
        </div>
      </header>
      <main className="mx-auto max-w-4xl space-y-4 px-4 pb-16 pt-5">
        {error ? (
          <ErrorBox>{error}</ErrorBox>
        ) : data === null ? (
          <PageLoader />
        ) : data === "invalid" ? (
          <Card>
            <EmptyState icon="alert" title="Bağlantı geçersiz">
              Bu bağlantı iptal edilmiş ya da hatalı. Lütfen öğrencinin danışmanından yeni bağlantı isteyin.
            </EmptyState>
          </Card>
        ) : (
          <ParentContent d={data} />
        )}
      </main>
    </div>
  );
}

function ParentContent({ d }: { d: ParentData }) {
  const today = todayISO();
  const plan = pickCurrentPlan(d.plans, today);
  const real = d.tasks.filter((t) => isRealTask(t));
  const weekTasks = plan ? real.filter((t) => t.plan_id === plan.id) : [];
  const done = weekTasks.filter((t) => t.done).length;
  const solved = weekTasks.reduce((s, t) => s + (t.solved ?? 0), 0);
  const target = weekTasks.reduce((s, t) => s + (t.target_questions ?? 0), 0);
  const first = d.student.full_name.split(" ")[0];

  // Son 12 hafta
  const weeks = useMemo(() => {
    const cur = mondayOf(today);
    return Array.from({ length: 12 }, (_, i) => addDays(cur, -7 * (11 - i)));
  }, [today]);
  const planWeek = new Map(d.plans.map((p) => [p.id, mondayOf(p.start_date)]));
  const agg = weeks.map((w) => {
    const ts = real.filter((t) => planWeek.get(t.plan_id) === w);
    const mins = d.days.filter((x) => planWeek.get(x.plan_id) === w).reduce((s, x) => s + (x.study_minutes ?? 0), 0);
    const logs = d.sleep_phone.filter((l) => mondayOf(l.log_date) === w);
    return {
      solved: ts.reduce((s, t) => s + (t.solved ?? 0), 0),
      pct: ts.length ? Math.round((ts.filter((t) => t.done).length / ts.length) * 100) : null,
      hours: mins ? Math.round((mins / 60) * 10) / 10 : null,
      sleep: avgOf(logs.map((l) => l.sleep_hours)),
      phone: avgOf(logs.map((l) => l.phone_minutes)),
    };
  });
  const fl = (l: string) => formatShort(l).replace(/ (\S{3})\S*$/, " $1");
  const last4 = d.sleep_phone.filter((l) => l.log_date >= addDays(today, -27));
  const sleep4 = avgOf(last4.map((l) => l.sleep_hours));
  const phone4 = avgOf(last4.map((l) => l.phone_minutes));

  const courseProgress = COURSES.map((c) => {
    const ids = new Set(c.sections.flatMap((s) => s.topics.map((t) => t.id)));
    const fin = d.topics.filter((t) => ids.has(t.topic_id) && (t.status === "done" || t.status === "reviewed")).length;
    return { name: c.name, fin, total: ids.size };
  }).filter((c) => c.fin > 0);

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="display text-2xl font-bold">{d.student.full_name}</h1>
          <p className="text-sm text-muted">
            {[d.student.field, d.student.grade, d.student.target ? `Hedef: ${d.student.target}` : null].filter(Boolean).join(" · ")}
            {d.counselor ? ` · Danışman: ${d.counselor}` : ""}
          </p>
        </div>
        <YksCountdown examYear={d.student.exam_year} />
      </div>

      <Card
        title="Bu haftaki program"
        subtitle={plan ? `${formatShort(plan.start_date)} – ${formatShort(addDays(plan.start_date, 6))}` : "Bu hafta için program yok"}
      >
        {plan && weekTasks.length > 0 ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <Mini label="Tamamlanan görev" value={`${done}/${weekTasks.length}`} />
              <Mini label="Tamamlama" value={`%${Math.round((done / weekTasks.length) * 100)}`} />
              <Mini label="Çözülen soru" value={target ? `${fmtNum(solved, 0)} / ${fmtNum(target, 0)}` : fmtNum(solved, 0)} />
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 7 }, (_, i) => {
                const date = addDays(plan.start_date, i);
                const list = weekTasks.filter((t) => t.day_index === i).sort((a, b) => (a.start_time ?? "99").localeCompare(b.start_time ?? "99"));
                if (!list.length) return null;
                return (
                  <div key={i} className={cx("rounded-xl border p-2.5", date === today ? "border-primary/50 bg-primary-soft/40" : "border-line")}>
                    <p className="mb-1 flex justify-between text-xs font-semibold">
                      <span>
                        {dayName(date)} {formatShort(date)}
                      </span>
                      <span className="text-muted tabular">
                        {list.filter((t) => t.done).length}/{list.length}
                      </span>
                    </p>
                    <ul className="space-y-0.5">
                      {list.map((t, k) => (
                        <li key={k} className="flex items-center gap-1.5 text-xs">
                          <span className={cx("flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border", t.done ? "border-success bg-success text-white" : "border-faint")}>
                            {t.done && (
                              <svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="4" aria-hidden>
                                <path d="M5 12.5l4.5 4.5L19 7.5" />
                              </svg>
                            )}
                          </span>
                          <span className={cx("truncate", t.done && "text-muted")}>
                            <span className="text-faint">{t.subject} · </span>
                            {title(t)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">Danışman programı hazırladığında burada görünür.</p>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Çözülen soru" subtitle="haftalık · son 12 hafta">
          <BarChart ariaLabel="Haftalara göre çözülen soru" labels={weeks} values={agg.map((a) => a.solved || null)} unit="soru" formatLabel={fl} formatValue={(v) => fmtNum(v, 0)} color="var(--series-1)" />
        </Card>
        <Card title="Program tamamlama" subtitle="haftalık görev yüzdesi">
          <BarChart ariaLabel="Haftalara göre program tamamlama" labels={weeks} values={agg.map((a) => a.pct)} unit="%" max={100} refLine={{ value: 80, label: "%80" }} formatLabel={fl} formatValue={(v) => fmtNum(v, 0)} color="var(--series-3)" />
        </Card>
        <Card title="Çalışma süresi" subtitle="saat / hafta">
          <BarChart ariaLabel="Haftalara göre çalışma süresi" labels={weeks} values={agg.map((a) => a.hours)} unit="saat" formatLabel={fl} color="var(--series-3)" />
        </Card>
        <Card title="Uyku ve telefon" subtitle={`son 4 hafta ortalaması · uyku ${sleep4 != null ? `${fmtNum(sleep4)} sa` : "—"} · telefon ${phone4 != null ? minutesToText(Math.round(phone4)) : "—"} / gün`}>
          <BarChart ariaLabel="Haftalara göre ortalama uyku" labels={weeks} values={agg.map((a) => (a.sleep != null ? Math.round(a.sleep * 10) / 10 : null))} unit="saat uyku" refLine={{ value: 7, label: "7 sa" }} formatLabel={fl} color="var(--series-1)" />
          <div className="mt-3">
            <BarChart ariaLabel="Haftalara göre günlük ortalama telefon süresi" labels={weeks} values={agg.map((a) => (a.phone != null ? Math.round(a.phone) : null))} unit="dk telefon" formatLabel={fl} formatValue={(v) => fmtNum(v, 0)} color="var(--series-2)" />
          </div>
        </Card>
      </div>

      {d.exams.length > 0 ? (
        <ExamTrends exams={d.exams} />
      ) : (
        <Card title="Deneme netleri">
          <p className="text-sm text-muted">Henüz deneme sonucu girilmedi.</p>
        </Card>
      )}

      {courseProgress.length > 0 && (
        <Card title="Tamamlanan konular">
          <ul className="space-y-2">
            {courseProgress.map((c) => (
              <li key={c.name}>
                <div className="flex justify-between text-sm">
                  <span>{c.name}</span>
                  <span className="text-muted tabular">
                    {c.fin}/{c.total}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div className="bar-grow h-full rounded-full bg-primary" style={{ width: `${Math.round((c.fin / c.total) * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="text-center text-xs text-faint">
        Bu sayfa {first} için danışmanı tarafından paylaşıldı ve yalnızca görüntüleme içindir. Öğrencinin kişisel günlük notları ve duygu durumu kayıtları veliyle paylaşılmaz.
      </p>
    </>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-2 px-2 py-2">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="font-semibold tabular">{value}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Danışman: öğrencinin veli bağlantıları (Hesap sekmesi)                */
/* ------------------------------------------------------------------ */
type LinkRow = { id: string; token: string; label: string; created_at: string; revoked_at: string | null; last_seen_at: string | null; view_count: number };

function newToken() {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export function ParentLinksCard({ studentId, studentName }: { studentId: string; studentName: string }) {
  const toast = useToast();
  const [rows, setRows] = useState<LinkRow[] | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState("");
  const urlOf = (t: string) => `${window.location.origin}/?v=veli&id=${t}`;

  const load = useCallback(async () => {
    const { data, error } = await sb().from("parent_links").select("*").eq("student_id", studentId).order("created_at", { ascending: false });
    if (error) {
      setMissing(true);
      return setRows([]);
    }
    setRows((data ?? []) as LinkRow[]);
    const { data: c } = await sb().from("student_contacts").select("parent_phone").eq("student_id", studentId).maybeSingle();
    setPhone((c as { parent_phone?: string } | null)?.parent_phone ?? "");
  }, [studentId]);
  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    setBusy(true);
    const { error } = await sb().from("parent_links").insert({ student_id: studentId, token: newToken(), label: "Veli" });
    setBusy(false);
    if (error) return toast.show(errorText(error), "danger");
    toast.show("Veli bağlantısı oluşturuldu");
    load();
  }
  async function revoke(r: LinkRow) {
    if (!confirmAction("Bu bağlantı iptal edilsin mi? Veli artık sayfayı açamaz.")) return;
    const { error } = await sb().from("parent_links").update({ revoked_at: new Date().toISOString() }).eq("id", r.id);
    if (error) return toast.show(errorText(error), "danger");
    load();
  }
  async function copy(r: LinkRow) {
    try {
      await navigator.clipboard.writeText(urlOf(r.token));
      toast.show("Bağlantı kopyalandı");
    } catch {
      toast.show("Kopyalanamadı", "danger");
    }
  }
  const message = (r: LinkRow) =>
    `Merhaba, ${studentName.split(" ")[0]}'in haftalık programını, deneme netlerini ve çalışma grafiklerini bu bağlantıdan takip edebilirsiniz (giriş gerekmez, yalnızca görüntüleme): ${urlOf(r.token)}`;
  const waHref = (r: LinkRow) => waTo(phone, message(r));

  if (missing) return <Card title="Veli bağlantısı"><p className="text-sm text-muted">Veli bağlantısı için Supabase&apos;de guncelleme-11.sql çalıştırılmalı.</p></Card>;
  if (!rows) return null;
  const active = rows.filter((r) => !r.revoked_at);

  return (
    <Card
      title="Veli bağlantısı"
      subtitle="Veli giriş yapmadan, yalnızca bu öğrencinin programını, deneme netlerini, gelişim grafiklerini ve uyku/telefon ortalamalarını görür. Düzenleme yapamaz; kaygı, motivasyon ve notlar gösterilmez."
      action={
        <Button size="sm" icon="plus" onClick={create} loading={busy}>
          {active.length ? "Yeni bağlantı" : "Bağlantı oluştur"}
        </Button>
      }
    >
      {active.length === 0 ? (
        <p className="text-sm text-muted">Henüz etkin veli bağlantısı yok.</p>
      ) : (
        <ul className="space-y-2">
          {active.map((r) => (
            <li key={r.id} className="rounded-xl border border-line p-3">
              <p className="truncate font-mono text-xs text-muted">{urlOf(r.token)}</p>
              <p className="mt-1 text-xs text-faint">
                {formatShort(r.created_at.slice(0, 10))} oluşturuldu ·{" "}
                {r.last_seen_at ? `${r.view_count} kez açıldı, son ${formatShort(r.last_seen_at.slice(0, 10))}` : "henüz açılmadı"}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <a href={waHref(r)} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-medium text-primary-fg">
                  Veliye WhatsApp&apos;tan gönder
                </a>
                <Button size="sm" variant="ghost" icon="copy" onClick={() => copy(r)}>
                  Kopyala
                </Button>
                <a href={urlOf(r.token)} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-xl px-3 text-sm text-muted hover:bg-surface-2">
                  Önizle
                </a>
                <IconButton icon="trash" label="Bağlantıyı iptal et" className="ml-auto h-9 w-9" onClick={() => revoke(r)} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {!phone && active.length > 0 && <p className="mt-2 text-xs text-faint">Veli telefonunu &quot;İletişim&quot; kartına eklerseniz WhatsApp doğrudan velide açılır.</p>}
    </Card>
  );
}
