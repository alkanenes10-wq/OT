"use client";
// Danışmanın randevu takvimi: tüm öğrencilerin görüşmeleri haftalık görünümde,
// yaklaşan görüşmeler için tek tıkla WhatsApp hatırlatması ve telefon takvimine aktarma.

import { useCallback, useEffect, useMemo, useState } from "react";
import { A, errorText, sb } from "./db";
import { type CounselingSession, downloadIcs, MODE_LABEL, type SessionMode, waLink, whenText } from "./ekler";
import { addDays, DAY_SHORT, formatTR, type Profile, todayISO } from "./lib";
import { PageHeader } from "./shell";
import { Badge, Button, Card, cx, EmptyState, ErrorBox, Field, Icon, IconButton, Modal, PageLoader, useToast } from "./ui";

type Row = CounselingSession & { student_id: string };

const mondayOf = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  return addDays(iso, -((d.getDay() + 6) % 7));
};
const localDate = (ts: string) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const hhmm = (ts: string) => new Date(ts).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });

function reminderText(s: Row, name: string) {
  const first = name.split(" ")[0];
  return `Merhaba ${first}, ${whenText(s.starts_at)} görüşmemizi hatırlatmak istedim${s.topic ? ` (konu: ${s.topic})` : ""}.${s.link ? ` Bağlantı: ${s.link}` : ""} Görüşmek üzere!`;
}

export function CounselorCalendar() {
  const toast = useToast();
  const [week, setWeek] = useState(mondayOf(todayISO()));
  const [students, setStudents] = useState<Profile[]>([]);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [upcoming, setUpcoming] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [adding, setAdding] = useState<string | null>(null); // tarih

  const names = useMemo(() => new Map(students.map((s) => [s.id, s.full_name])), [students]);

  const load = useCallback(async () => {
    try {
      const from = new Date(`${week}T00:00:00`);
      const to = new Date(`${addDays(week, 7)}T00:00:00`);
      const [st, ss, up] = await Promise.all([
        sb().from("profiles").select("*").eq("role", "student").eq("is_active", true).order("full_name"),
        sb().from("counseling_sessions").select("*").gte("starts_at", from.toISOString()).lt("starts_at", to.toISOString()).order("starts_at"),
        sb()
          .from("counseling_sessions")
          .select("*")
          .eq("status", "planned")
          .gte("starts_at", new Date().toISOString())
          .lt("starts_at", new Date(Date.now() + 48 * 3600000).toISOString())
          .order("starts_at"),
      ]);
      if (st.error) throw st.error;
      if (ss.error) throw ss.error;
      if (up.error) throw up.error;
      setStudents((st.data ?? []) as Profile[]);
      setRows((ss.data ?? []) as Row[]);
      setUpcoming((up.data ?? []) as Row[]);
    } catch (e) {
      if (/counseling_sessions|schema cache|does not exist/i.test(String((e as Error)?.message ?? e))) setMissing(true);
      else setError(errorText(e));
      setRows([]);
    }
  }, [week]);

  useEffect(() => {
    load();
  }, [load]);

  async function patch(s: Row, values: Partial<Row>, msg?: string) {
    const { error } = await sb().from("counseling_sessions").update(values).eq("id", s.id);
    if (error) return toast.show(errorText(error), "danger");
    if (msg) toast.show(msg);
    load();
  }

  function remind(s: Row) {
    window.open(waLink(reminderText(s, names.get(s.student_id) ?? "")), "_blank", "noopener");
    patch(s, { reminded_at: new Date().toISOString() });
  }

  function exportAll() {
    const planned = (rows ?? []).concat(upcoming).filter((s, i, a) => s.status === "planned" && a.findIndex((x) => x.id === s.id) === i && new Date(s.starts_at).getTime() > Date.now());
    if (!planned.length) return toast.show("Aktarılacak planlı görüşme yok", "danger");
    downloadIcs(
      "gorusmelerim.ics",
      planned.map((s) => ({
        uid: `gorusme-${s.id}`,
        start: new Date(s.starts_at),
        minutes: s.duration_min,
        title: `Görüşme: ${names.get(s.student_id) ?? "Öğrenci"}${s.topic ? ` (${s.topic})` : ""}`,
        description: s.link ? `Bağlantı: ${s.link}` : MODE_LABEL[s.mode],
        location: s.link ?? undefined,
        alarmMin: 30,
      })),
    );
    toast.show("Dosya indirildi; açıp takvimine ekle");
  }

  if (missing)
    return (
      <>
        <PageHeader title="Takvim" />
        <Card>
          <EmptyState icon="calendar" title="Takvim için veritabanı güncellemesi gerekiyor">
            Supabase → SQL Editor'de guncelleme-5.sql dosyasını bir kez çalıştırın.
          </EmptyState>
        </Card>
      </>
    );

  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const today = todayISO();
  const waiting = upcoming.filter((s) => !s.reminded_at);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Takvim"
        subtitle="Tüm öğrencilerinin görüşmeleri"
        action={
          <div className="flex gap-2">
            <Button variant="secondary" icon="download" onClick={exportAll}>
              <span className="hidden sm:inline">Telefon takvimine aktar</span>
              <span className="sm:hidden">Aktar</span>
            </Button>
            <Button icon="plus" onClick={() => setAdding(today)}>
              <span className="hidden sm:inline">Görüşme ekle</span>
              <span className="sm:hidden">Ekle</span>
            </Button>
          </div>
        }
      />
      {error && <ErrorBox>{error}</ErrorBox>}

      {upcoming.length > 0 && (
        <Card
          className={waiting.length ? "border-primary/40" : undefined}
          title={
            <span className="flex items-center gap-2">
              <Icon name="bell" size={17} className="text-primary" /> Önümüzdeki 48 saat
              {waiting.length > 0 && <Badge tone="primary">{waiting.length} hatırlatma bekliyor</Badge>}
            </span>
          }
          subtitle="Öğrenci uygulamada 24 saat kala hatırlatma kartını görür. WhatsApp hatırlatması gönderdiğinde işaretlenir."
        >
          <ul className="divide-y divide-line">
            {upcoming.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <A to={{ v: "ogrenci", id: s.student_id, t: "gorusmeler" }} className="font-semibold hover:text-primary">
                    {names.get(s.student_id) ?? "Öğrenci"}
                  </A>
                  <span className="block text-xs text-muted">
                    {whenText(s.starts_at)} · {MODE_LABEL[s.mode]}
                    {s.topic ? ` · ${s.topic}` : ""}
                  </span>
                </span>
                {s.reminded_at ? (
                  <Badge tone="success" icon="check">
                    Hatırlatıldı
                  </Badge>
                ) : null}
                <Button size="sm" variant={s.reminded_at ? "ghost" : "primary"} icon="message" onClick={() => remind(s)}>
                  {s.reminded_at ? "Tekrar" : "WhatsApp hatırlat"}
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="flex items-center gap-2">
        <IconButton icon="chevronLeft" label="Önceki hafta" onClick={() => setWeek((w) => addDays(w, -7))} />
        <p className="min-w-0 flex-1 text-center font-semibold">
          {formatTR(week)} – {formatTR(addDays(week, 6))}
        </p>
        <IconButton icon="chevronRight" label="Sonraki hafta" onClick={() => setWeek((w) => addDays(w, 7))} />
        {week !== mondayOf(today) && (
          <Button size="sm" variant="ghost" onClick={() => setWeek(mondayOf(today))}>
            Bu hafta
          </Button>
        )}
      </div>

      {!rows ? (
        <PageLoader />
      ) : (
        <div className="grid gap-2 lg:grid-cols-7">
          {days.map((d) => {
            const list = rows.filter((s) => localDate(s.starts_at) === d);
            return (
              <section key={d} className={cx("card min-h-24 p-2.5", d === today && "border-primary/50")}>
                <header className="mb-2 flex items-center justify-between">
                  <span className={cx("text-sm font-semibold", d === today && "text-primary")}>
                    {DAY_SHORT[new Date(`${d}T12:00:00`).getDay()]} {d.slice(8, 10)}.{d.slice(5, 7)}
                  </span>
                  <button type="button" aria-label={`${formatTR(d)} için görüşme ekle`} onClick={() => setAdding(d)} className="rounded-md p-1 text-faint hover:bg-surface-2 hover:text-primary">
                    <Icon name="plus" size={16} />
                  </button>
                </header>
                {list.length === 0 ? (
                  <p className="text-xs text-faint lg:hidden">Görüşme yok</p>
                ) : (
                  <ul className="space-y-1.5">
                    {list.map((s) => (
                      <li
                        key={s.id}
                        className={cx(
                          "rounded-lg border-l-4 px-2 py-1.5 text-xs",
                          s.status === "done" ? "border-success bg-success-soft/60" : s.status === "cancelled" ? "border-line bg-surface-2 line-through opacity-70" : "border-primary bg-primary-soft/60",
                        )}
                      >
                        <p className="font-semibold tabular">
                          {hhmm(s.starts_at)} · {s.duration_min} dk
                        </p>
                        <A to={{ v: "ogrenci", id: s.student_id, t: "gorusmeler" }} className="block truncate font-medium hover:text-primary">
                          {names.get(s.student_id) ?? "Öğrenci"}
                        </A>
                        {s.topic && <p className="truncate text-muted">{s.topic}</p>}
                        {s.status === "planned" && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            <button type="button" className="rounded bg-surface px-1.5 py-0.5 font-medium text-primary" onClick={() => remind(s)}>
                              {s.reminded_at ? "✓ Hatırlatıldı" : "Hatırlat"}
                            </button>
                            <button type="button" className="rounded bg-surface px-1.5 py-0.5" onClick={() => patch(s, { status: "done" }, "Yapıldı olarak işaretlendi")}>
                              Yapıldı
                            </button>
                            <button type="button" className="rounded bg-surface px-1.5 py-0.5 text-muted" onClick={() => patch(s, { status: "cancelled" }, "İptal edildi")}>
                              İptal
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      {adding && (
        <AddSessionModal
          students={students}
          date={adding}
          onClose={() => setAdding(null)}
          onSaved={() => {
            setAdding(null);
            toast.show("Görüşme eklendi");
            load();
          }}
        />
      )}
    </div>
  );
}

function AddSessionModal({ students, date: initialDate, onClose, onSaved }: { students: Profile[]; date: string; onClose: () => void; onSaved: () => void }) {
  const [studentId, setStudentId] = useState(students[0]?.id ?? "");
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState("18:00");
  const [dur, setDur] = useState("45");
  const [mode, setMode] = useState<SessionMode>("online");
  const [link, setLink] = useState("");
  const [topic, setTopic] = useState("");
  const [repeat, setRepeat] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!studentId) return setError("Öğrenci seçin.");
    const start = new Date(`${date}T${time}:00`);
    if (Number.isNaN(start.getTime())) return setError("Tarih veya saat geçersiz.");
    setBusy(true);
    setError(null);
    const rows = Array.from({ length: repeat }, (_, i) => ({
      student_id: studentId,
      starts_at: new Date(start.getTime() + i * 7 * 86400000).toISOString(),
      duration_min: Number(dur) || 45,
      mode,
      link: link.trim() || null,
      topic: topic.trim(),
    }));
    const { error } = await sb().from("counseling_sessions").insert(rows);
    setBusy(false);
    if (error) return setError(errorText(error));
    onSaved();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Görüşme ekle"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Vazgeç
          </Button>
          <Button icon="check" onClick={save} loading={busy}>
            {repeat > 1 ? `${repeat} görüşme ekle` : "Ekle"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Öğrenci">
          <select className="field" value={studentId} onChange={(e) => setStudentId(e.target.value)} aria-label="Öğrenci">
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tarih" htmlFor="c-date">
            <input id="c-date" type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Saat" htmlFor="c-time">
            <input id="c-time" type="time" className="field" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
          <Field label="Süre (dk)" htmlFor="c-dur">
            <input id="c-dur" inputMode="numeric" className="field" value={dur} onChange={(e) => setDur(e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label="Tür">
            <select className="field" value={mode} onChange={(e) => setMode(e.target.value as SessionMode)} aria-label="Tür">
              <option value="online">Online</option>
              <option value="yuz_yuze">Yüz yüze</option>
              <option value="telefon">Telefon</option>
            </select>
          </Field>
        </div>
        <Field label="Konu (öğrenci görür)" htmlFor="c-topic">
          <input id="c-topic" className="field" maxLength={200} value={topic} onChange={(e) => setTopic(e.target.value)} />
        </Field>
        <Field label="Görüşme bağlantısı" htmlFor="c-link">
          <input id="c-link" className="field" maxLength={500} placeholder="Google Meet / Zoom" value={link} onChange={(e) => setLink(e.target.value)} />
        </Field>
        <Field label="Tekrar" hint="Aynı gün ve saatte her hafta tekrarlayan görüşmeler oluşturur.">
          <select className="field" value={repeat} onChange={(e) => setRepeat(Number(e.target.value))} aria-label="Tekrar">
            <option value={1}>Tek seferlik</option>
            <option value={4}>4 hafta boyunca her hafta</option>
            <option value={8}>8 hafta boyunca her hafta</option>
          </select>
        </Field>
        {error && <ErrorBox>{error}</ErrorBox>}
      </div>
    </Modal>
  );
}

/** Öğrenci listesinin üstünde: bugünkü görüşmeler */
export function TodaySessionsStrip() {
  const [list, setList] = useState<(Row & { name?: string })[] | null>(null);
  useEffect(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 86400000);
    sb()
      .from("counseling_sessions")
      .select("*, profiles!counseling_sessions_student_id_fkey(full_name)")
      .eq("status", "planned")
      .gte("starts_at", start.toISOString())
      .lt("starts_at", end.toISOString())
      .order("starts_at")
      .then(({ data, error }) => {
        if (error) return setList([]);
        setList(((data ?? []) as (Row & { profiles?: { full_name: string } | null })[]).map((r) => ({ ...r, name: r.profiles?.full_name })));
      });
  }, []);
  if (!list?.length) return null;
  return (
    <A to={{ v: "takvim" }} className="card mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm hover:border-primary/40">
      <span className="flex items-center gap-2 font-semibold">
        <Icon name="calendar" size={17} className="text-primary" /> Bugün {list.length} görüşme
      </span>
      {list.slice(0, 4).map((s) => (
        <span key={s.id} className="text-muted">
          <b className="tabular text-fg">{hhmm(s.starts_at)}</b> {s.name ?? ""}
        </span>
      ))}
    </A>
  );
}
