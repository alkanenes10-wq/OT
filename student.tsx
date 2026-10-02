"use client";
// Öğrenci ekranları: Bugün, Program, Günlük, Konular, İlerleme, Ayarlar.

import { StudentVideos, VideoSuggestionsCard } from "./videolar";
import { BadgesCard, StreakCard } from "./oyun";
import { NotificationsCard } from "./bildirim";
import { ForumBoard } from "./forum";
import { AppearanceCard } from "./theme";
import { useEffect, useState } from "react";
import { ChangeOwnPassword } from "./counselor";
import { DailyLogSection } from "./daily";
import { A, errorText, fetchLogs, fetchPlans, sb, useAuth, useRoute } from "./db";
import { StudentInsights } from "./insights";
import { addDays, type DailyLog, dayShort, diffDays, fmtNum, formatLong, pct, pickCurrentPlan, type PlanTask, todayISO, type WeeklyPlan, yesNo } from "./lib";
import { byOrder, patchTask, TaskRow, taskTitle, WeeklyPlanView } from "./plan";
import { ScheduleSection } from "./schedule";
import { DailyReminderCard, NextSessionCard, StartMode, YksCountdown, yksLabel } from "./ekler";
import { QuestionBank, QuestionBankTeaser } from "./soru-bankasi";
import { StudentSupport } from "./support";
import { StudentNotes } from "./notes";
import { InstallHint, PageHeader } from "./shell";
import { TopicsHub } from "./konu-analizi";
import { Button, Card, cx, EmptyState, ErrorBox, Icon, LinkButton, PageLoader, ProgressBar, Segmented, useToast } from "./ui";

function Today() {
  const { profile } = useAuth();
  const { go } = useRoute();
  const toast = useToast();
  const [plan, setPlan] = useState<WeeklyPlan | null>(null);
  const [tasks, setTasks] = useState<PlanTask[]>([]);
  const [logs, setLogs] = useState<DailyLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = todayISO();

  useEffect(() => {
    if (!profile) return;
    (async () => {
      try {
        const [plans, l] = await Promise.all([fetchPlans(profile.id), fetchLogs(profile.id, addDays(today, -13))]);
        const p = pickCurrentPlan(plans);
        const current = p && p.start_date <= today && today <= addDays(p.start_date, 6) ? p : null;
        setPlan(current);
        if (current) {
          const { data, error } = await sb().from("plan_tasks").select("*").eq("plan_id", current.id);
          if (error) throw error;
          setTasks((data ?? []) as PlanTask[]);
        }
        setLogs(l);
      } catch (e) {
        setError(errorText(e));
        setLogs([]);
      }
    })();
  }, [profile, today]);

  const replace = (row: PlanTask) => setTasks((ts) => ts.map((x) => (x.id === row.id ? row : x)));

  async function toggle(t: PlanTask) {
    const next = !t.done;
    replace({ ...t, done: next });
    try {
      replace(await patchTask(t.id, { done: next }));
      if (next) {
        const remaining = todayTasks.filter((x) => !x.done && x.id !== t.id).length;
        toast.show(remaining === 0 ? "Bugünün tüm görevleri tamam!" : "Tamamlandı");
      }
    } catch (e) {
      replace(t);
      toast.show(errorText(e), "danger");
    }
  }

  async function setSolved(t: PlanTask, solved: number | null) {
    try {
      const row = await patchTask(t.id, { solved });
      replace(row);
      if (row.done && !t.done) toast.show("Hedefe ulaştın, görev tamamlandı!");
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

  if (!profile) return null;
  if (!logs) return <PageLoader />;

  const dayIndex = plan ? diffDays(plan.start_date, today) : -1;
  const todayTasks = tasks
    .filter((t) => t.day_index === dayIndex && (t.topic_id || t.content.trim() || t.target_questions))
    .sort(byOrder);
  const doneToday = todayTasks.filter((t) => t.done).length;
  const weekTasks = tasks.filter((t) => t.topic_id || t.content.trim() || t.target_questions);
  const todayTarget = todayTasks.reduce((a, t) => a + (t.target_questions ?? 0), 0);
  const todaySolved = todayTasks.reduce((a, t) => a + (t.solved ?? 0), 0);
  const weekDone = weekTasks.filter((t) => t.done).length;
  const todayLog = logs.find((l) => l.log_date === today) ?? null;
  const yesterdayLog = logs.find((l) => l.log_date === addDays(today, -1)) ?? null;
  const filled = new Set(logs.map((l) => l.log_date));
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const firstName = profile.full_name.split(" ")[0];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="display text-[28px] leading-tight">Merhaba {firstName}</h1>
          <p className="text-sm text-muted">{formatLong(today)}</p>
          {yksLabel(profile.exam_year) && <p className="text-xs text-faint">{yksLabel(profile.exam_year)}</p>}
        </div>
        <YksCountdown examYear={profile.exam_year} />
      </div>
      <InstallHint />
      <StudentSupport variant="card" />
      {error && <ErrorBox>{error}</ErrorBox>}

      <FocusCard
        next={todayTasks.find((t) => !t.done) ?? null}
        total={todayTasks.length}
        done={doneToday}
        hasPlan={Boolean(plan)}
        hasLog={Boolean(todayLog)}
        onDone={toggle}
        onLog={() => go({ v: "gunluk" })}
        onProgram={() => go({ v: "program" })}
      />
      <NextSessionCard />
      {profile && <StudentNotes studentId={profile.id} />}

      {yesterdayLog?.tomorrow_change && (
        <div className="card flex items-start gap-3 border-primary/30 bg-primary-soft p-4">
          <Icon name="target" className="mt-0.5 shrink-0 text-primary-ink" />
          <div className="text-sm">
            <p className="font-medium text-primary-ink">Dün bugün için belirlediğin küçük değişiklik</p>
            <p className="mt-0.5 text-fg">{yesterdayLog.tomorrow_change}</p>
          </div>
        </div>
      )}

      <Card
        title="Bugünkü görevler"
        subtitle={todayTasks.length ? `${doneToday}/${todayTasks.length} görev · ${todaySolved}${todayTarget ? ` / ${todayTarget}` : ""} soru` : undefined}
        action={
          <A to={{ v: "program" }} className="text-sm font-medium text-primary">
            Program →
          </A>
        }
      >
        {!plan ? (
          <EmptyState icon="calendar" title="Bu hafta için program yok" action={<LinkButton to={{ v: "program" }} variant="soft" icon="plus">Program oluştur</LinkButton>}>
            Danışmanın program eklediğinde burada görünür. İstersen kendin de oluşturabilirsin.
          </EmptyState>
        ) : todayTasks.length === 0 ? (
          <p className="py-3 text-center text-sm text-muted">Bugün için görev yazılmamış.</p>
        ) : (
          <>
            <ProgressBar value={pct(doneToday, todayTasks.length)} tone="success" label="Bugünkü görevler" />
            <ul className="-mx-1 mt-2 divide-y divide-line">
              {todayTasks.map((t) => (
                <li key={t.id}>
                  <TaskRow task={t} onToggle={toggle} onSolved={setSolved} onPatch={patchResult} />
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {profile && <StreakCard studentId={profile.id} />}

      <Card
        title="Günlük takip"
        subtitle={todayLog ? "Bugünü değerlendirdin" : "Günün sonunda 1-2 dakikanı ayır"}
        action={
          todayLog ? (
            <A to={{ v: "gunluk" }} className="text-sm font-medium text-primary">
              Düzenle →
            </A>
          ) : undefined
        }
      >
        {todayLog ? (
          <dl className="grid grid-cols-3 gap-3 text-sm sm:grid-cols-6">
            <Mini label="Uyku" value={todayLog.sleep_hours != null ? `${fmtNum(todayLog.sleep_hours)} sa` : "—"} tone={todayLog.sleep_hours == null ? null : todayLog.sleep_hours < 6 ? "bad" : todayLog.sleep_hours < 7 ? "mid" : "good"} />
            <Mini label="Telefon" value={todayLog.phone_minutes != null ? `${todayLog.phone_minutes} dk` : "—"} tone={todayLog.phone_minutes == null ? null : todayLog.phone_minutes > 180 ? "bad" : todayLog.phone_minutes > 90 ? "mid" : "good"} />
            <Mini label="Erteleme" value={yesNo(todayLog.procrastinated)} tone={todayLog.procrastinated == null ? null : todayLog.procrastinated ? "mid" : "good"} />
            <Mini label="Kaygı" value={todayLog.anxiety != null ? `${todayLog.anxiety}/5` : "—"} tone={todayLog.anxiety == null ? null : todayLog.anxiety >= 4 ? "bad" : todayLog.anxiety === 3 ? "mid" : "good"} />
            <Mini label="Enerji" value={todayLog.energy != null ? `${todayLog.energy}/5` : "—"} tone={todayLog.energy == null ? null : todayLog.energy <= 2 ? "bad" : todayLog.energy === 3 ? "mid" : "good"} />
            <Mini label="Motivasyon" value={todayLog.motivation != null ? `${todayLog.motivation}/5` : "—"} tone={todayLog.motivation == null ? null : todayLog.motivation <= 2 ? "bad" : todayLog.motivation === 3 ? "mid" : "good"} />
          </dl>
        ) : (
          <LinkButton to={{ v: "gunluk" }} icon="journal" className="w-full">
            Bugünü değerlendir
          </LinkButton>
        )}
        <div className="mt-4 flex items-center justify-between gap-1">
          {last7.map((d) => (
            <div key={d} className="flex flex-1 flex-col items-center gap-1 text-[11px] text-muted">
              <span
                className={cx(
                  "flex h-7 w-7 items-center justify-center rounded-full",
                  filled.has(d) ? "bg-success text-white" : "bg-surface-2 ring-1 ring-inset ring-line",
                )}
                aria-label={filled.has(d) ? "dolduruldu" : "boş"}
              >
                {filled.has(d) && <Icon name="check" size={14} strokeWidth={3} />}
              </span>
              {dayShort(d)}
            </div>
          ))}
        </div>
      </Card>

      <VideoSuggestionsCard />

      <details className="group">
        <summary className="card flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
          <span>
            Daha fazla
            <span className="ml-2 font-normal text-muted">
              5 dakika modu · sorularım{plan ? ` · bu hafta ${weekDone}/${weekTasks.length} görev` : ""}
            </span>
          </span>
          <Icon name="chevronDown" size={18} className="shrink-0 text-faint transition group-open:rotate-180" />
        </summary>
        <div className="mt-4 space-y-4">
          <StartMode />
          <QuestionBankTeaser studentId={profile.id} />
          {plan && (
            <Card title="Bu hafta" subtitle={`${weekDone} / ${weekTasks.length} görev`}>
              <ProgressBar value={pct(weekDone, weekTasks.length)} label="Haftalık program" />
              <p className="mt-2 text-xs text-muted">%{pct(weekDone, weekTasks.length) ?? 0} tamamlandı</p>
            </Card>
          )}
        </div>
      </details>

      <StudentSupport variant="link" />
    </div>
  );
}

/** "Şimdi ne yapmalıyım?" — ekranın en üstündeki tek odak kartı */
function FocusCard({
  next,
  total,
  done,
  hasPlan,
  hasLog,
  onDone,
  onLog,
  onProgram,
}: {
  next: PlanTask | null;
  total: number;
  done: number;
  hasPlan: boolean;
  hasLog: boolean;
  onDone: (t: PlanTask) => void;
  onLog: () => void;
  onProgram: () => void;
}) {
  const [hour, setHour] = useState<number | null>(null);
  useEffect(() => setHour(new Date().getHours()), []);
  const evening = hour != null && hour >= 19;

  if (next) {
    return (
      <section className="card border-primary/30 bg-primary-soft p-4 sm:p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-primary-ink">
          Şimdi sıradaki · {done + 1}/{total}
        </p>
        <p className="mt-1.5 text-[11px] font-semibold tracking-wide text-muted">
          {next.subject}
          {next.start_time ? ` · ${next.start_time}` : ""}
          {next.duration_min ? ` · ${next.duration_min} dk` : ""}
        </p>
        <p className="display text-xl leading-snug">{taskTitle(next)}</p>
        {next.target_questions ? <p className="mt-0.5 text-sm text-muted">Hedef: {next.target_questions} soru</p> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button icon="check" onClick={() => onDone(next)}>
            Tamamladım
          </Button>
          {!hasLog && evening && (
            <Button variant="secondary" icon="journal" onClick={onLog}>
              Günlüğü doldur
            </Button>
          )}
        </div>
      </section>
    );
  }
  if (!hasLog) {
    return (
      <section className="card border-primary/30 bg-primary-soft p-4 sm:p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-primary-ink">{total ? "Bugünün görevleri tamam" : "Şimdi sıradaki"}</p>
        <p className="display mt-1.5 text-xl leading-snug">Bugünü 30 saniyede kaydet</p>
        <p className="mt-0.5 text-sm text-muted">Uyku, telefon ve ruh hâlini işaretle; günlük serine 1 gün eklensin.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button icon="journal" onClick={onLog}>
            Günlüğü doldur
          </Button>
          {!hasPlan && (
            <Button variant="secondary" icon="calendar" onClick={onProgram}>
              Programa git
            </Button>
          )}
        </div>
      </section>
    );
  }
  return (
    <section className="card flex items-center gap-3 border-success/30 bg-success-soft p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success text-white">
        <Icon name="check" size={20} strokeWidth={3} />
      </span>
      <div className="text-sm">
        <p className="font-semibold">Bugün için her şey tamam</p>
        <p className="text-muted">{total ? `${done}/${total} görev bitti, günlüğün dolu.` : "Günlüğün dolu."} İyi dinlenmeler.</p>
      </div>
    </section>
  );
}

function Mini({ label, value, tone = null }: { label: string; value: string | number; tone?: "good" | "mid" | "bad" | null }) {
  return (
    <div
      className={cx(
        "rounded-xl px-2 py-2 text-center",
        tone === "bad" ? "bg-danger-soft text-danger" : tone === "mid" ? "bg-warning-soft text-warning" : tone === "good" ? "bg-success-soft text-success" : "bg-surface-2",
      )}
    >
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="mt-0.5 font-semibold tabular">{value}</dd>
    </div>
  );
}

function Program() {
  const { profile } = useAuth();
  if (!profile) return null;
  return (
    <>
      <PageHeader title="Haftalık program" />
      <WeeklyPlanView studentId={profile.id} field={profile.field} />
      <details className="group mt-6 max-w-3xl">
        <summary className="cursor-pointer list-none text-sm font-medium text-primary">
          <span className="group-open:hidden">▸ Çalışma saatlerimi göster</span>
          <span className="hidden group-open:inline">▾ Çalışma saatlerimi gizle</span>
        </summary>
        <div className="mt-3">
          <ScheduleSection studentId={profile.id} editable={false} />
        </div>
      </details>
    </>
  );
}

function Daily() {
  const { profile } = useAuth();
  if (!profile) return null;
  return (
    <>
      <PageHeader title="Günlük takip" subtitle="Günün nasıl geçti? Dürüst ol — amaç kendini yargılamak değil, örüntüleri görmek." />
      <div className="space-y-4">
        <DailyReminderCard compact />
        <DailyLogSection studentId={profile.id} studentName={profile.full_name} />
      </div>
    </>
  );
}

function Topics() {
  const { profile } = useAuth();
  if (!profile) return null;
  return (
    <>
      <PageHeader title="Konular" />
      <TopicsHub studentId={profile.id} studentName={profile.full_name} audience="student" />
    </>
  );
}

function Questions() {
  const { profile } = useAuth();
  const [view, setView] = useState<"benim" | "ortak">("benim");
  if (!profile) return null;
  return (
    <>
      <PageHeader
        title="Sorular"
        subtitle={view === "benim" ? "Yapamadığın soruları sakla, cevabına bak, onlardan test çöz." : "Arkadaşlarının soruları — herkes anonim. Bildiğin bir soruya çözüm yolunu yaz."}
      />
      <div className="mb-4">
        <Segmented
          ariaLabel="Sorular görünümü"
          value={view}
          onChange={setView}
          options={[
            { value: "benim", label: "Sorularım" },
            { value: "ortak", label: "Ortak sorular" },
          ]}
        />
      </div>
      {view === "benim" ? <QuestionBank studentId={profile.id} audience="student" /> : <ForumBoard audience="student" />}
    </>
  );
}

function Progress() {
  const { profile } = useAuth();
  if (!profile) return null;
  return (
    <>
      <PageHeader title="İlerleme" />
      <div className="mb-4">
        <BadgesCard studentId={profile.id} />
      </div>
      <StudentInsights studentId={profile.id} />
    </>
  );
}

function Settings() {
  const { profile, signOut } = useAuth();
  const [counselor, setCounselor] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.counselor_id) return;
    sb()
      .from("profiles")
      .select("full_name")
      .eq("id", profile.counselor_id)
      .maybeSingle()
      .then(({ data }) => setCounselor((data as { full_name: string } | null)?.full_name ?? null));
  }, [profile?.counselor_id]);

  if (!profile) return null;
  return (
    <div className="space-y-4">
      <PageHeader title="Ayarlar" />
      <Card title="Hesabım">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Item label="Ad" value={profile.full_name} />
          <Item label="Kullanıcı adı" value={`@${profile.username}`} />
          <Item label="Alan" value={profile.field ?? "—"} />
          <Item label="Sınıf" value={profile.grade ?? "—"} />
          <Item label="Sınav yılı" value={profile.exam_year ? String(profile.exam_year) : "—"} />
          <Item label="Danışmanım" value={counselor ?? "—"} />
        </dl>
        <p className="mt-3 text-xs text-faint">Bilgilerini danışmanın güncelleyebilir.</p>
      </Card>
      <AppearanceCard />
      <NotificationsCard />
      <DailyReminderCard />
      <ChangeOwnPassword />
      <Button variant="danger" icon="logout" className="w-full" onClick={() => signOut()}>
        Çıkış yap
      </Button>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

/** Öğrenci tarafının ekran seçimi (?v=…) */
export function StudentApp() {
  const { route } = useRoute();
  switch (route.v) {
    case "program":
      return <Program />;
    case "gunluk":
      return <Daily />;
    case "konular":
      return <Topics />;
    case "sorular":
      return <Questions />;
    case "ilerleme":
      return <Progress />;
    case "videolar":
      return <StudentVideos />;
    case "ayarlar":
      return <Settings />;
    default:
      return <Today />;
  }
}
