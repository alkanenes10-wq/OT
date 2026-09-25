"use client";
// Danışman ekranları: öğrenci listesi, yeni öğrenci, öğrenci detayı, notlar, hesap yönetimi, ayarlar.

import { useCallback, useEffect, useMemo, useState } from "react";
import { ALL_TOPICS, isCompleted } from "./curriculum";
import { DailyLogSection } from "./daily";
import { createStudent, deleteStudent, updateStudent } from "./actions";
import { A, accessToken, errorText, sb, useAuth, useRoute } from "./db";
import { SignalChips, StudentInsights } from "./insights";
import { isRealTask, addDays, avg, computeSignals, type CounselorNote, type DailyLog, FIELDS, fmtNum, formatLong, GRADES, normalizeUsername, pct, pickCurrentPlan, type PlanTask, type Profile, relativeDay, type Signal, todayISO, type TopicProgress, USERNAME_RE, type WeeklyPlan } from "./lib";
import { WeeklyPlanView } from "./plan";
import { ExamAnalyses } from "./exams";
import { ScheduleSection } from "./schedule";
import { CounselorTeam, TransferStudent } from "./team";
import { PageHeader } from "./shell";
import { TopicTracker } from "./topics";
import { Badge, Button, Card, confirmAction, cx, EmptyState, ErrorBox, Field, Icon, IconButton, LinkButton, PageLoader, ProgressBar, Tabs, useToast } from "./ui";

/* ---------------- Danışman notları (öğrenci göremez) ---------------- */
export function CounselorNotes({ studentId }: { studentId: string }) {
  const toast = useToast();
  const [notes, setNotes] = useState<CounselorNote[] | null>(null);
  const [date, setDate] = useState(todayISO());
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    sb()
      .from("counselor_notes")
      .select("*")
      .eq("student_id", studentId)
      .order("note_date", { ascending: false })
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(errorText(error));
        setNotes((data ?? []) as CounselorNote[]);
      });

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  async function add() {
    if (!content.trim()) return;
    setBusy(true);
    const { error } = await sb().from("counselor_notes").insert({ student_id: studentId, note_date: date, content: content.trim().slice(0, 5000) });
    setBusy(false);
    if (error) return toast.show(errorText(error), "danger");
    setContent("");
    toast.show("Not eklendi");
    load();
  }

  async function remove(n: CounselorNote) {
    if (!confirmAction("Bu not silinsin mi?")) return;
    const { error } = await sb().from("counselor_notes").delete().eq("id", n.id);
    if (error) return toast.show(errorText(error), "danger");
    setNotes((ns) => (ns ?? []).filter((x) => x.id !== n.id));
  }

  return (
    <div className="space-y-4">
      <Card title="Yeni görüşme notu" subtitle="Bu notları yalnızca siz görürsünüz; öğrenci erişemez.">
        <div className="space-y-3">
          <div className="w-48">
            <Field label="Tarih" htmlFor="note-date">
              <input id="note-date" type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
          <Field label="Not" htmlFor="note-content">
            <textarea
              id="note-content"
              className="field min-h-32"
              maxLength={5000}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Görüşmede konuşulanlar, gözlemler, bir sonraki görüşme için hedefler…"
            />
          </Field>
          <div className="flex justify-end">
            <Button icon="plus" onClick={add} loading={busy} disabled={!content.trim()}>
              Notu ekle
            </Button>
          </div>
        </div>
      </Card>
      {error && <ErrorBox>{error}</ErrorBox>}
      {!notes ? (
        <PageLoader />
      ) : notes.length === 0 ? (
        <Card>
          <EmptyState icon="note" title="Henüz not yok" />
        </Card>
      ) : (
        <ul className="space-y-3">
          {notes.map((n) => (
            <li key={n.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold">{formatLong(n.note_date)}</p>
                <IconButton icon="trash" label="Notu sil" className="-mr-2 -mt-2 h-8 w-8" onClick={() => remove(n)} />
              </div>
              <p className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed">{n.content}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------------- Öğrenci bilgileri formu (oluşturma + düzenleme ortak) ---------------- */
export type StudentFields = { fullName: string; field: string; grade: string; examYear: string; target: string };

export function StudentFieldsForm({ value, onChange }: { value: StudentFields; onChange: (v: StudentFields) => void }) {
  const set = (k: keyof StudentFields) => (e: { target: { value: string } }) => onChange({ ...value, [k]: e.target.value });
  const year = new Date().getFullYear();
  return (
    <div className="space-y-4">
      <Field label="Ad soyad veya öğrenci kodu" hint="KVKK açısından yalnızca kod da kullanabilirsiniz (ör. ÖĞR-001)" htmlFor="sf-name">
        <input id="sf-name" className="field" value={value.fullName} maxLength={120} onChange={set("fullName")} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Alan" htmlFor="sf-field">
          <select id="sf-field" className="field" value={value.field} onChange={set("field")}>
            <option value="">—</option>
            {FIELDS.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </Field>
        <Field label="Sınıf" htmlFor="sf-grade">
          <select id="sf-grade" className="field" value={value.grade} onChange={set("grade")}>
            <option value="">—</option>
            {GRADES.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Sınav yılı" htmlFor="sf-year">
          <select id="sf-year" className="field" value={value.examYear} onChange={set("examYear")}>
            <option value="">—</option>
            {[year, year + 1, year + 2, year + 3].map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Hedef" htmlFor="sf-target">
          <input id="sf-target" className="field" value={value.target} maxLength={200} onChange={set("target")} placeholder="ör. Tıp, ilk 20 bin" />
        </Field>
      </div>
    </div>
  );
}

export function randomPassword(len = 10) {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join("");
}

/* ---------------- Hesap yönetimi ---------------- */
export function StudentAccount({ student, onChanged }: { student: Profile; onChanged: () => void }) {
  const toast = useToast();
  const { go } = useRoute();
  const [fields, setFields] = useState<StudentFields>({
    fullName: student.full_name,
    field: student.field ?? "",
    grade: student.grade ?? "",
    examYear: student.exam_year ? String(student.exam_year) : "",
    target: student.target ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [shownPw, setShownPw] = useState<string | null>(null);
  const [activeBusy, setActiveBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveProfile() {
    setError(null);
    if (!fields.fullName.trim()) return setError("Ad soyad boş olamaz.");
    setSaving(true);
    const { error } = await sb()
      .from("profiles")
      .update({
        full_name: fields.fullName.trim(),
        field: fields.field || null,
        grade: fields.grade || null,
        exam_year: fields.examYear ? Number(fields.examYear) : null,
        target: fields.target.trim() || null,
      })
      .eq("id", student.id);
    setSaving(false);
    if (error) return setError(errorText(error));
    toast.show("Bilgiler güncellendi");
    onChanged();
  }

  async function resetPassword() {
    setError(null);
    const pw = newPw.trim() || randomPassword();
    setPwBusy(true);
    try {
      const r = await updateStudent(await accessToken(), student.id, { password: pw });
      if (!r.ok) throw new Error(r.error);
      setShownPw(pw);
      setNewPw("");
      toast.show("Şifre değiştirildi");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setPwBusy(false);
    }
  }

  async function toggleActive() {
    const next = !student.is_active;
    if (!next && !confirmAction("Öğrenci pasif yapılsın mı? Giriş yapamaz, verileri silinmez.")) return;
    setActiveBusy(true);
    try {
      const r = await updateStudent(await accessToken(), student.id, { active: next });
      if (!r.ok) throw new Error(r.error);
      toast.show(next ? "Öğrenci aktif edildi" : "Öğrenci pasif yapıldı");
      onChanged();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setActiveBusy(false);
    }
  }

  async function remove() {
    const typed = window.prompt(
      `DİKKAT: ${student.full_name} ve tüm verileri (program, günlük, konu takibi, notlar) kalıcı olarak silinecek.\n\nOnaylamak için kullanıcı adını yazın: ${student.username}`,
    );
    if (typed == null) return;
    if (typed.trim() !== student.username) return toast.show("Kullanıcı adı eşleşmedi, silinmedi", "danger");
    try {
      const r = await deleteStudent(await accessToken(), student.id);
      if (!r.ok) throw new Error(r.error);
      toast.show("Öğrenci silindi");
      go({}, { replace: true });
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <div className="space-y-4">
      {error && <ErrorBox>{error}</ErrorBox>}
      <Card title="Öğrenci bilgileri">
        <StudentFieldsForm value={fields} onChange={setFields} />
        <div className="mt-4 flex justify-end">
          <Button icon="check" onClick={saveProfile} loading={saving}>
            Kaydet
          </Button>
        </div>
      </Card>

      <Card title="Giriş bilgileri" subtitle={`Kullanıcı adı: ${student.username}`}>
        <div className="space-y-3">
          <Field label="Yeni şifre" hint="Boş bırakırsanız rastgele bir şifre oluşturulur (en az 8 karakter)" htmlFor="new-pw">
            <input id="new-pw" className="field" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="off" />
          </Field>
          {shownPw && (
            <div className="rounded-xl bg-success-soft p-3 text-sm text-success">
              Yeni şifre: <b className="font-mono text-base">{shownPw}</b>
              <span className="block text-xs">Bu şifreyi öğrenciyle paylaşın; tekrar gösterilmeyecek.</span>
            </div>
          )}
          <div className="flex justify-end">
            <Button variant="secondary" icon="key" onClick={resetPassword} loading={pwBusy}>
              Şifreyi değiştir
            </Button>
          </div>
        </div>
      </Card>

      <TransferStudent studentId={student.id} studentName={student.full_name} />

      <Card title="Hesap durumu">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            {student.is_active ? "Hesap aktif. Pasif yapılırsa öğrenci giriş yapamaz, veriler korunur." : "Hesap pasif. Öğrenci giriş yapamaz."}
          </p>
          <Button variant="secondary" onClick={toggleActive} loading={activeBusy}>
            {student.is_active ? "Pasif yap" : "Aktif et"}
          </Button>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <p className="text-sm text-muted">Öğrenciyi ve tüm verilerini kalıcı olarak sil (KVKK silme talebi için).</p>
          <Button variant="danger" icon="trash" onClick={remove}>
            Öğrenciyi sil
          </Button>
        </div>
      </Card>
    </div>
  );
}

/* ---------------- Şifre değiştirme (kendi hesabı) ---------------- */
export function ChangeOwnPassword() {
  const toast = useToast();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setError(null);
    if (pw.length < 8) return setError("Şifre en az 8 karakter olmalı.");
    if (pw !== pw2) return setError("Şifreler aynı değil.");
    setBusy(true);
    const { error } = await sb().auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setError(errorText(error));
    setPw("");
    setPw2("");
    toast.show("Şifren değiştirildi");
  }
  return (
    <Card title="Şifre değiştir">
      <div className="space-y-3">
        <Field label="Yeni şifre" htmlFor="own-pw">
          <input id="own-pw" type="password" className="field" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
        </Field>
        <Field label="Yeni şifre (tekrar)" htmlFor="own-pw2">
          <input id="own-pw2" type="password" className="field" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
        </Field>
        {error && <ErrorBox>{error}</ErrorBox>}
        <div className="flex justify-end">
          <Button icon="key" onClick={save} loading={busy}>
            Şifreyi değiştir
          </Button>
        </div>
      </div>
    </Card>
  );
}

type Row = {
  student: Profile;
  lastLog: string | null;
  weekDone: number;
  weekTotal: number;
  motivation: number | null;
  anxiety: number | null;
  topicPct: number;
  signals: Signal[];
};

const RANK = { critical: 0, warning: 1, info: 2 } as const;

function StudentList() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      try {
        const since = addDays(todayISO(), -13);
        const [st, lg, pl, tp] = await Promise.all([
          sb().from("profiles").select("*").eq("role", "student").eq("counselor_id", profile.id).order("full_name"),
          sb().from("daily_logs").select("*").gte("log_date", since),
          sb().from("weekly_plans").select("*").gte("start_date", addDays(todayISO(), -60)),
          sb().from("topic_progress").select("student_id, topic_id, status"),
        ]);
        for (const r of [st, lg, pl, tp]) if (r.error) throw r.error;
        const students = (st.data ?? []) as Profile[];
        const logs = (lg.data ?? []) as DailyLog[];
        const plans = (pl.data ?? []) as WeeklyPlan[];
        const topics = (tp.data ?? []) as Pick<TopicProgress, "student_id" | "topic_id" | "status">[];

        const current = new Map<string, WeeklyPlan>();
        for (const s of students) {
          const p = pickCurrentPlan(plans.filter((x) => x.student_id === s.id));
          if (p) current.set(s.id, p);
        }
        const planIds = [...current.values()].map((p) => p.id);
        let tasks: PlanTask[] = [];
        if (planIds.length) {
          const t = await sb().from("plan_tasks").select("*").in("plan_id", planIds);
          if (t.error) throw t.error;
          tasks = (t.data ?? []) as PlanTask[];
        }

        const total = ALL_TOPICS.length;
        const out: Row[] = students.map((s) => {
          const sl = logs.filter((l) => l.student_id === s.id).sort((a, b) => (a.log_date < b.log_date ? 1 : -1));
          const plan = current.get(s.id) ?? null;
          const pt = plan ? tasks.filter((t) => t.plan_id === plan.id) : [];
          const withContent = pt.filter(isRealTask);
          const last7 = sl.filter((l) => l.log_date >= addDays(todayISO(), -6));
          const done = topics.filter((t) => t.student_id === s.id && isCompleted(t.status)).length;
          return {
            student: s,
            lastLog: sl[0]?.log_date ?? null,
            weekDone: withContent.filter((t) => t.done).length,
            weekTotal: withContent.length,
            motivation: avg(last7.map((l) => l.motivation)),
            anxiety: avg(last7.map((l) => l.anxiety)),
            topicPct: pct(done, total) ?? 0,
            signals: s.is_active ? computeSignals({ logs: sl, plan, tasks: pt }) : [],
          };
        });
        const worst = (r: Row) => Math.min(3, ...r.signals.filter((x) => x.level !== "info").map((x) => RANK[x.level]));
        out.sort((a, b) => worst(a) - worst(b) || a.student.full_name.localeCompare(b.student.full_name, "tr"));
        setRows(out);
      } catch (e) {
        setError(errorText(e));
      }
    })();
  }, [profile]);

  const filtered = useMemo(() => {
    const term = q.trim().toLocaleLowerCase("tr-TR");
    return (rows ?? []).filter(
      (r) =>
        (showInactive || r.student.is_active) &&
        (!term ||
          r.student.full_name.toLocaleLowerCase("tr-TR").includes(term) ||
          (r.student.username ?? "").includes(term)),
    );
  }, [rows, q, showInactive]);

  const activeRows = (rows ?? []).filter((r) => r.student.is_active);
  const todayCount = activeRows.filter((r) => r.lastLog === todayISO()).length;
  const attention = activeRows.filter((r) => r.signals.some((s) => s.level !== "info")).length;
  const inactiveCount = (rows ?? []).length - activeRows.length;

  return (
    <div>
      <PageHeader
        title="Öğrenciler"
        subtitle={profile ? `Merhaba ${profile.full_name.split(" ")[0]}` : undefined}
        action={
          <LinkButton to={{ v: "yeni" }} icon="plus">
            Yeni öğrenci
          </LinkButton>
        }
      />
      {error && <ErrorBox>{error}</ErrorBox>}
      {!rows && !error ? (
        <PageLoader />
      ) : rows && rows.length === 0 ? (
        <Card>
          <EmptyState
            icon="users"
            title="Henüz öğrenci yok"
            action={
              <LinkButton to={{ v: "yeni" }} icon="plus">
                İlk öğrenciyi ekle
              </LinkButton>
            }
          >
            Öğrenci ekleyince size bir kullanıcı adı ve şifre verilir. Öğrenci bu bilgilerle telefonundan giriş yapar.
          </EmptyState>
        </Card>
      ) : rows ? (
        <>
          <div className="mb-4 grid grid-cols-3 gap-3">
            <Summary label="Aktif öğrenci" value={activeRows.length} />
            <Summary label="Bugün günlük dolduran" value={`${todayCount}/${activeRows.length}`} />
            <Summary label="Dikkat gerektiren" value={attention} tone={attention ? "warning" : undefined} />
          </div>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative min-w-0 flex-1">
              <Icon name="search" size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
              <input className="field pl-10" placeholder="Öğrenci ara…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Öğrenci ara" />
            </div>
            {inactiveCount > 0 && (
              <label className="flex items-center gap-2 text-sm text-muted">
                <input type="checkbox" className="h-4 w-4" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
                Pasifleri göster ({inactiveCount})
              </label>
            )}
          </div>
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((r) => (
              <li key={r.student.id}>
                <StudentCard row={r} />
              </li>
            ))}
          </ul>
          {filtered.length === 0 && <p className="py-8 text-center text-sm text-muted">Eşleşen öğrenci yok.</p>}
        </>
      ) : null}
    </div>
  );
}

function Summary({ label, value, tone }: { label: string; value: string | number; tone?: "warning" }) {
  return (
    <div className="card px-3 py-3 sm:px-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={cx("mt-1 text-2xl font-semibold tabular", tone === "warning" && "text-warning")}>{value}</p>
    </div>
  );
}

function StudentCard({ row }: { row: Row }) {
  const s = row.student;
  const logTone = !row.lastLog ? "text-faint" : row.lastLog === todayISO() ? "text-success" : "text-muted";
  return (
    <A to={{ v: "ogrenci", id: s.id }} className="card block h-full p-4 transition hover:border-primary/50 hover:shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold">{s.full_name}</p>
          <p className="truncate text-xs text-faint">@{s.username}</p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          {!s.is_active && <Badge tone="danger">Pasif</Badge>}
          {s.field && <Badge tone="primary">{s.field}</Badge>}
          {s.grade && <Badge>{s.grade}</Badge>}
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <div>
          <dt className="text-[11px] text-muted">Son günlük</dt>
          <dd className={cx("font-medium", logTone)}>{relativeDay(row.lastLog)}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-muted">Motivasyon</dt>
          <dd className="font-medium tabular">{row.motivation == null ? "—" : fmtNum(row.motivation)}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-muted">Kaygı</dt>
          <dd className="font-medium tabular">{row.anxiety == null ? "—" : fmtNum(row.anxiety)}</dd>
        </div>
      </dl>
      <div className="mt-3 space-y-2">
        <div>
          <div className="mb-1 flex justify-between text-[11px] text-muted">
            <span>Bu haftaki program</span>
            <span className="tabular">{row.weekTotal ? `${row.weekDone}/${row.weekTotal}` : "program yok"}</span>
          </div>
          <ProgressBar value={pct(row.weekDone, row.weekTotal)} label="Haftalık program" />
        </div>
        <div>
          <div className="mb-1 flex justify-between text-[11px] text-muted">
            <span>Konu ilerlemesi</span>
            <span className="tabular">%{row.topicPct}</span>
          </div>
          <ProgressBar value={row.topicPct} tone="success" label="Konu ilerlemesi" />
        </div>
      </div>
      {row.signals.some((x) => x.level !== "info") && (
        <div className="mt-3 border-t border-line pt-3">
          <SignalChips signals={row.signals} />
        </div>
      )}
    </A>
  );
}

function NewStudent() {
  const toast = useToast();
  const [fields, setFields] = useState<StudentFields>({ fullName: "", field: "", grade: "", examYear: "", target: "" });
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState(() => randomPassword());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ profile: Profile; password: string } | null>(null);

  const uname = normalizeUsername(username);
  const unameOk = USERNAME_RE.test(uname);

  async function submit() {
    setError(null);
    if (!fields.fullName.trim()) return setError("Ad soyad veya öğrenci kodu gerekli.");
    if (!unameOk) return setError("Kullanıcı adı 3-30 karakter olmalı; küçük harf (a-z), rakam, nokta, tire ve alt çizgi kullanılabilir.");
    if (password.length < 8) return setError("Şifre en az 8 karakter olmalı.");
    setBusy(true);
    try {
      const res = await createStudent(await accessToken(), { ...fields, username: uname, password });
      if (!res.ok) throw new Error(res.error);
      setCreated({ profile: res.profile, password });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const text = `Merhaba! Takip uygulamasına giriş bilgilerin:\nAdres: ${origin}\nKullanıcı adı: ${created.profile.username}\nŞifre: ${created.password}\n(Telefonunda açıp "Ana ekrana ekle" diyerek uygulama gibi kullanabilirsin.)`;
    return (
      <div className="mx-auto max-w-lg">
        <PageHeader title="Öğrenci eklendi" />
        <Card>
          <div className="space-y-3">
            <p className="text-sm text-muted">Bu bilgileri öğrenciyle paylaşın. Şifre tekrar gösterilmeyecek (gerekirse Hesap sekmesinden yenisini verebilirsiniz).</p>
            <div className="rounded-xl bg-surface-2 p-4 font-mono text-sm leading-7">
              <div>Kullanıcı adı: <b>{created.profile.username}</b></div>
              <div>Şifre: <b>{created.password}</b></div>
              <div className="break-all text-muted">Adres: {origin}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                icon="copy"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(text);
                    toast.show("Kopyalandı");
                  } catch {
                    toast.show("Kopyalanamadı", "danger");
                  }
                }}
              >
                Mesajı kopyala
              </Button>
              <LinkButton to={{ v: "ogrenci", id: created.profile.id }} icon="chevronRight">
                Öğrenci sayfasına git
              </LinkButton>
            </div>
          </div>
        </Card>
        <p className="mt-4 text-center text-sm">
          <button
            className="font-medium text-primary"
            onClick={() => {
              setCreated(null);
              setFields({ fullName: "", field: "", grade: "", examYear: "", target: "" });
              setUsername("");
              setPassword(randomPassword());
            }}
          >
            Bir öğrenci daha ekle
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Yeni öğrenci" subtitle={<A to={{}} className="text-primary">← Öğrenciler</A>} />
      <div className="space-y-4">
        <Card title="Öğrenci bilgileri">
          <StudentFieldsForm value={fields} onChange={setFields} />
        </Card>
        <Card title="Giriş bilgileri" subtitle="Öğrenci e-posta yerine bu kullanıcı adıyla giriş yapar">
          <div className="space-y-4">
            <Field
              label="Kullanıcı adı"
              htmlFor="uname"
              hint="ör. ogr001, ayse.k — küçük harf, rakam, nokta, tire"
              error={username && !unameOk ? "Geçersiz kullanıcı adı" : null}
            >
              <input
                id="uname"
                className="field"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </Field>
            <Field label="Şifre" htmlFor="spw" hint="En az 8 karakter. Otomatik oluşturuldu, değiştirebilirsiniz.">
              <div className="flex gap-2">
                <input id="spw" className="field font-mono" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
                <IconButton icon="key" label="Yeni rastgele şifre" onClick={() => setPassword(randomPassword())} className="h-11 w-11 shrink-0 border border-line" />
              </div>
            </Field>
          </div>
        </Card>
        {error && <ErrorBox>{error}</ErrorBox>}
        <div className="flex justify-end">
          <Button size="lg" icon="check" onClick={submit} loading={busy}>
            Öğrenciyi oluştur
          </Button>
        </div>
      </div>
    </div>
  );
}

type Tab = "ozet" | "program" | "saatler" | "denemeler" | "gunluk" | "konular" | "notlar" | "hesap";
const TABS: { value: Tab; label: string; icon: "chart" | "calendar" | "clock" | "target" | "journal" | "book" | "note" | "user" }[] = [
  { value: "ozet", label: "Özet", icon: "chart" },
  { value: "program", label: "Program", icon: "calendar" },
  { value: "saatler", label: "Saatler", icon: "clock" },
  { value: "denemeler", label: "Denemeler", icon: "target" },
  { value: "gunluk", label: "Günlük", icon: "journal" },
  { value: "konular", label: "Konular", icon: "book" },
  { value: "notlar", label: "Notlar", icon: "note" },
  { value: "hesap", label: "Hesap", icon: "user" },
];

function StudentDetail({ id, tab: tabParam }: { id: string; tab?: string }) {
  const { go } = useRoute();
  const [student, setStudent] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tab: Tab = TABS.some((t) => t.value === tabParam) ? (tabParam as Tab) : "ozet";

  const load = useCallback(async () => {
    const { data, error } = await sb().from("profiles").select("*").eq("id", id).eq("role", "student").maybeSingle();
    if (error) setError(errorText(error));
    else if (!data) setError("Öğrenci bulunamadı veya bu öğrenciye erişiminiz yok.");
    else setStudent(data as Profile);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const changeTab = (t: Tab) => go({ v: "ogrenci", id, t: t === "ozet" ? undefined : t }, { replace: true });

  if (error)
    return (
      <div className="space-y-4">
        <A to={{}} className="text-sm text-primary">
          ← Öğrenciler
        </A>
        <ErrorBox>{error}</ErrorBox>
      </div>
    );
  if (!student) return <PageLoader />;

  return (
    <div className="space-y-4">
      <div>
        <A to={{}} className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
          <Icon name="chevronLeft" size={16} /> Öğrenciler
        </A>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{student.full_name}</h1>
          {!student.is_active && <Badge tone="danger">Pasif</Badge>}
          {student.field && <Badge tone="primary">{student.field}</Badge>}
          {student.grade && <Badge>{student.grade}</Badge>}
          {student.exam_year && <Badge>YKS {student.exam_year}</Badge>}
        </div>
        <p className="mt-0.5 text-sm text-muted">
          @{student.username}
          {student.target ? ` · Hedef: ${student.target}` : ""}
        </p>
      </div>

      <Tabs tabs={TABS} value={tab} onChange={changeTab} />

      <div className="pt-1">
        {tab === "ozet" && <StudentInsights studentId={student.id} showSignals />}
        {tab === "program" && <WeeklyPlanView key={student.id} studentId={student.id} field={student.field} />}
        {tab === "saatler" && (
          <div className="max-w-3xl">
            <ScheduleSection key={student.id} studentId={student.id} editable />
          </div>
        )}
        {tab === "denemeler" && (
          <div className="max-w-3xl">
            <ExamAnalyses studentId={student.id} />
          </div>
        )}
        {tab === "gunluk" && (
          <div className="max-w-3xl">
            <DailyLogSection studentId={student.id} studentName={student.full_name} />
          </div>
        )}
        {tab === "konular" && (
          <div className="max-w-3xl">
            <TopicTracker studentId={student.id} studentName={student.full_name} />
          </div>
        )}
        {tab === "notlar" && (
          <div className="max-w-3xl">
            <CounselorNotes studentId={student.id} />
          </div>
        )}
        {tab === "hesap" && (
          <div className="max-w-3xl">
            <StudentAccount student={student} onChanged={load} />
          </div>
        )}
      </div>
    </div>
  );
}

function CounselorSettings() {
  const { profile, session, refreshProfile, signOut } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(profile?.full_name ?? "");
  const [busy, setBusy] = useState(false);

  async function saveName() {
    if (!profile || !name.trim()) return;
    setBusy(true);
    const { error } = await sb().from("profiles").update({ full_name: name.trim() }).eq("id", profile.id);
    setBusy(false);
    if (error) return toast.show(errorText(error), "danger");
    await refreshProfile();
    toast.show("Kaydedildi");
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageHeader title="Ayarlar" />
      <Card title="Profil" subtitle={session?.user.email}>
        <div className="space-y-3">
          <Field label="Ad soyad" htmlFor="c-name">
            <input id="c-name" className="field" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="flex justify-end">
            <Button icon="check" onClick={saveName} loading={busy}>
              Kaydet
            </Button>
          </div>
        </div>
      </Card>
      <CounselorTeam />
      <ChangeOwnPassword />
      <Card title="Veri güvenliği (KVKK)">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted">
          <li>Her öğrenci yalnızca kendi verisini görür; siz yalnızca kendi öğrencilerinizi görürsünüz (veritabanı düzeyinde kural).</li>
          <li>Danışman notları öğrenciye hiçbir koşulda gösterilmez.</li>
          <li>Öğrenci adı yerine kod kullanabilirsiniz (ör. ÖĞR-001).</li>
          <li>Silme talebinde öğrencinin Hesap sekmesinden tüm verileri kalıcı olarak silebilirsiniz.</li>
        </ul>
      </Card>
      <Button variant="danger" icon="logout" className="w-full" onClick={() => signOut()}>
        Çıkış yap
      </Button>
    </div>
  );
}

/** Danışman tarafının ekran seçimi (?v=…) */
export function CounselorApp() {
  const { route } = useRoute();
  if (route.v === "yeni") return <NewStudent />;
  if (route.v === "ayarlar") return <CounselorSettings />;
  if (route.v === "ogrenci" && route.id) return <StudentDetail key={route.id} id={route.id} tab={route.t} />;
  return <StudentList />;
}
