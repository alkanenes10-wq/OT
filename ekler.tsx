"use client";
// v1.9 eklemeleri: YKS geri sayımı, 5 dakika başlama modu, akşam hatırlatması,
// telefona günlük hatırlatıcı (.ics), WhatsApp hatırlatma şablonları ve görüşme takvimi.

import { normalizePhone, waTo } from "./hatirlatma";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { errorText, fetchLogs, fetchPlans, sb } from "./db";
import { addDays, diffDays, formatLong, isRealTask, pickCurrentPlan, type PlanTask, type Profile, todayISO } from "./lib";
import { Badge, Button, Card, confirmAction, cx, EmptyState, ErrorBox, Field, Icon, Modal, PageLoader, Segmented, useToast } from "./ui";

/* ================================================================== */
/* Yardımcılar                                                         */
/* ================================================================== */

/** YKS tarihleri. ÖSYM açıkladığında buradan güncelleyin (estimated: false). */
export const YKS_DATES: Record<number, { date: string; estimated: boolean }> = {
  2027: { date: "2027-06-19", estimated: true },
  2028: { date: "2028-06-17", estimated: true },
};

export function waLink(text: string) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

const pad = (n: number) => String(n).padStart(2, "0");
const icsDate = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (m) => `\\${m}`);

export type IcsEvent = { uid: string; start: Date; minutes: number; title: string; description?: string; location?: string; rrule?: string; alarmMin?: number };

/** Telefonun takvimine eklenebilen .ics dosyası indirir (sunucu gerekmez). */
export function downloadIcs(filename: string, events: IcsEvent[]) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//YKS Takip//TR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  for (const e of events) {
    const end = new Date(e.start.getTime() + e.minutes * 60000);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}@yks-takip`,
      `DTSTAMP:${icsDate(new Date())}`,
      `DTSTART:${icsDate(e.start)}`,
      `DTEND:${icsDate(end)}`,
      `SUMMARY:${icsText(e.title)}`,
    );
    if (e.description) lines.push(`DESCRIPTION:${icsText(e.description)}`);
    if (e.location) lines.push(`LOCATION:${icsText(e.location)}`);
    if (e.rrule) lines.push(`RRULE:${e.rrule}`);
    if (e.alarmMin != null) lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsText(e.title)}`, `TRIGGER:-PT${e.alarmMin}M`, "END:VALARM");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, v: string) {
  try {
    window.localStorage.setItem(key, v);
  } catch {
    /* depolama kapalı olabilir */
  }
}

/* ================================================================== */
/* YKS geri sayımı                                                     */
/* ================================================================== */

/** Öğrencinin sınav yılı geçmişse veya yoksa bir sonraki YKS'yi kullanır. */
function nextYks(examYear: number | null): { year: number; date: string; estimated: boolean } | null {
  const today = todayISO();
  const own = examYear ? YKS_DATES[examYear] : undefined;
  if (own && own.date >= today) return { year: examYear as number, ...own };
  const next = Object.entries(YKS_DATES)
    .map(([y, v]) => ({ year: Number(y), ...v }))
    .filter((x) => x.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  return next ?? null;
}

export function yksLabel(examYear: number | null): string | null {
  const info = nextYks(examYear);
  if (!info) return null;
  return `YKS ${info.year}: ${formatLong(info.date)}${info.estimated ? " (tahmini)" : ""}`;
}

export function YksCountdown({ examYear }: { examYear: number | null }) {
  const info = nextYks(examYear);
  if (!info) return null;
  const days = diffDays(todayISO(), info.date);
  return (
    <div className="flex shrink-0 flex-col items-center rounded-2xl bg-primary px-3 py-2 text-primary-fg" title={yksLabel(examYear) ?? undefined}>
      <span className="display text-2xl leading-none tabular">{days}</span>
      <span className="mt-0.5 text-[11px] font-medium opacity-90">gün kaldı</span>
    </div>
  );
}

/* ================================================================== */
/* 5 dakika başlama modu (BDT: davranışsal aktivasyon)                 */
/* ================================================================== */

function Ring({ value }: { value: number }) {
  const r = 70;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 160 160" className="h-44 w-44" aria-hidden>
      <circle cx="80" cy="80" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="10" />
      <circle
        cx="80"
        cy="80"
        r={r}
        fill="none"
        stroke="var(--primary)"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - value)}
        transform="rotate(-90 80 80)"
        style={{ transition: "stroke-dashoffset 0.9s linear" }}
      />
    </svg>
  );
}

export function StartMode() {
  const [open, setOpen] = useState(false);
  const [total, setTotal] = useState(300);
  const [endAt, setEndAt] = useState<number | null>(null);
  const [left, setLeft] = useState(300);
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => {
    if (endAt == null) return;
    stop();
    timer.current = setInterval(() => {
      const s = Math.max(0, Math.round((endAt - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) {
        stop();
        setEndAt(null);
        setDone(true);
        try {
          navigator.vibrate?.(300);
        } catch {
          /* yok */
        }
      }
    }, 500);
    return stop;
  }, [endAt, stop]);

  const start = (sec: number) => {
    setTotal(sec);
    setLeft(sec);
    setDone(false);
    setEndAt(Date.now() + sec * 1000);
  };
  const close = () => {
    stop();
    setEndAt(null);
    setDone(false);
    setLeft(300);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="card flex w-full items-center gap-3 p-4 text-left transition hover:border-primary/40"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-ink">
          <Icon name="play" size={18} />
        </span>
        <span className="min-w-0 flex-1 text-sm">
          <span className="block font-semibold">Başlayamıyor musun? 5 dakika modu</span>
          <span className="text-muted">Sadece 5 dakika. Başlamak, devam etmekten daha zordur.</span>
        </span>
        <Icon name="chevronRight" size={18} className="text-faint" />
      </button>

      <Modal open={open} onClose={close} title="5 dakika modu">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="relative">
            <Ring value={endAt == null && !done ? 1 : left / total} />
            <span className="display absolute inset-0 flex items-center justify-center text-4xl tabular">
              {Math.floor(left / 60)}:{pad(left % 60)}
            </span>
          </div>
          {done ? (
            <>
              <p className="text-[15px] font-semibold">Başladın, en zor kısım bitti.</p>
              <p className="text-sm text-muted">Devam etmek ister misin? İstemiyorsan da sorun değil; bugün bir adım attın.</p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button icon="play" onClick={() => start(25 * 60)}>
                  25 dakika devam
                </Button>
                <Button variant="secondary" onClick={close}>
                  Bitir
                </Button>
              </div>
            </>
          ) : endAt == null ? (
            <>
              <ul className="space-y-1 text-left text-sm text-muted">
                <li>1. Telefonu başka odaya koy.</li>
                <li>2. Görevin sadece ilk adımını seç (ör. ilk 3 soru).</li>
                <li>3. Bitirmek zorunda değilsin; 5 dakika sonra karar vereceksin.</li>
              </ul>
              <Button size="lg" icon="play" onClick={() => start(300)}>
                Başla
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted">Şu an sadece bu göreve odaklan. Aklına başka bir şey gelirse not al, sonra dön.</p>
              <Button variant="ghost" onClick={close}>
                Vazgeç
              </Button>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}

/* ================================================================== */
/* Akşam hatırlatması ve telefona günlük hatırlatıcı                    */
/* ================================================================== */

/** Saat 19'dan sonra bugünün günlüğü boşsa görünür. */
export function EveningNudge({ hasTodayLog, onOpen }: { hasTodayLog: boolean; onOpen: () => void }) {
  const [hour, setHour] = useState<number | null>(null);
  useEffect(() => setHour(new Date().getHours()), []);
  if (hasTodayLog || hour == null || hour < 19) return null;
  return (
    <button type="button" onClick={onOpen} className="card flex w-full items-center gap-3 border-warning/40 bg-warning-soft/60 p-4 text-left">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-warning">
        <Icon name="bell" size={19} />
      </span>
      <span className="min-w-0 flex-1 text-sm">
        <span className="block font-semibold">Bugünün günlüğü henüz boş</span>
        <span className="text-muted">2 dakikada doldur; yarın sabah sana özel geri bildirimini gör.</span>
      </span>
      <Icon name="chevronRight" size={18} className="text-faint" />
    </button>
  );
}

const REMINDER_KEY = "yks-daily-reminder";

export function DailyReminderCard({ compact = false }: { compact?: boolean }) {
  const toast = useToast();
  const [time, setTime] = useState("21:30");
  const [saved, setSaved] = useState<string | null>(null);
  useEffect(() => setSaved(safeGet(REMINDER_KEY)), []);
  if (compact && saved) return null;

  const add = () => {
    const [h, m] = time.split(":").map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
    downloadIcs("gunluk-hatirlatici.ics", [
      {
        uid: `gunluk-${Date.now()}`,
        start: d,
        minutes: 5,
        title: "Günlüğünü doldur (2 dk)",
        description: "Uyku, telefon, erteleme, kaygı, enerji ve motivasyon. Doldurduğunda sana özel geri bildirim çıkar.",
        rrule: "FREQ=DAILY",
        alarmMin: 0,
      },
    ]);
    safeSet(REMINDER_KEY, time);
    setSaved(time);
    toast.show("Dosya indirildi; açıp takvimine ekle");
  };

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Icon name="bell" size={17} className="text-primary" /> Her akşam hatırlat
        </span>
      }
      subtitle={saved ? `Hatırlatıcı ${saved} için oluşturuldu. Saati değiştirmek için yenisini ekleyebilirsin.` : "Telefonunun takvimine her gün tekrarlayan bir hatırlatıcı eklenir."}
    >
      <div className="flex items-end gap-2">
        <Field label="Saat" htmlFor="rem-time">
          <input id="rem-time" type="time" className="field w-36" value={time} onChange={(e) => setTime(e.target.value || "21:30")} />
        </Field>
        <Button icon="calendar" onClick={add}>
          Takvimime ekle
        </Button>
      </div>
      <p className="mt-2 text-xs text-faint">İndirilen dosyayı açınca telefonun takvim uygulaması eklemeni ister. Uygulama kapalıyken de çalışır.</p>
    </Card>
  );
}

/* ================================================================== */
/* Görüşme takvimi                                                     */
/* ================================================================== */

export type SessionMode = "online" | "yuz_yuze" | "telefon";
export type CounselingSession = {
  id: string;
  student_id?: string;
  starts_at: string;
  duration_min: number;
  mode: SessionMode;
  link: string | null;
  topic: string;
  status: "planned" | "done" | "cancelled";
  notes?: string;
  reminded_at?: string | null;
};

export const MODE_LABEL: Record<SessionMode, string> = { online: "Online", yuz_yuze: "Yüz yüze", telefon: "Telefon" };
export const whenText = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" })} ${d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`;
};
export const sessionIcs = (s: CounselingSession, who: string) =>
  downloadIcs("gorusme.ics", [
    {
      uid: `gorusme-${s.id}`,
      start: new Date(s.starts_at),
      minutes: s.duration_min,
      title: `Görüşme${who ? `: ${who}` : ""}${s.topic ? ` (${s.topic})` : ""}`,
      description: s.link ? `Bağlantı: ${s.link}` : MODE_LABEL[s.mode],
      location: s.link ?? undefined,
      alarmMin: 30,
    },
  ]);

/** Öğrencinin Bugün ekranı: sıradaki görüşme */
export function NextSessionCard() {
  const [next, setNext] = useState<CounselingSession | null>(null);
  useEffect(() => {
    sb()
      .rpc("my_sessions")
      .then(({ data, error }) => {
        if (error || !Array.isArray(data)) return; // güncelleme 5 çalıştırılmamışsa sessizce gizle
        const now = Date.now();
        const up = (data as CounselingSession[]).filter((s) => s.status === "planned" && new Date(s.starts_at).getTime() + s.duration_min * 60000 > now);
        setNext(up[0] ?? null);
      });
  }, []);
  if (!next) return null;
  const ms = new Date(next.starts_at).getTime() - Date.now();
  const soon = ms < 30 * 60000;
  const sameDay = new Date(next.starts_at).toDateString() === new Date().toDateString();
  const within24 = ms < 24 * 3600000;
  const heading = soon ? "Görüşmen başlamak üzere" : sameDay ? "Bugün görüşmen var" : within24 ? "Yarın görüşmen var" : "Sıradaki görüşmen";
  return (
    <div className={cx("card flex items-start gap-3 p-4", within24 && "border-primary/40 bg-primary-soft/50")}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-ink">
        <Icon name="video" size={19} />
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="flex items-center gap-1.5 font-semibold">
          {within24 && <Icon name="bell" size={15} className="text-primary" />}
          {heading}
        </p>
        <p className="text-fg">{whenText(next.starts_at)}</p>
        <p className="text-muted">
          {MODE_LABEL[next.mode]} · {next.duration_min} dk{next.topic ? ` · ${next.topic}` : ""}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {next.link && (
            <a href={next.link} target="_blank" rel="noreferrer" className={cx("inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium", soon ? "bg-primary text-primary-fg" : "border border-line bg-surface")}>
              <Icon name="video" size={16} /> Görüşmeye katıl
            </a>
          )}
          <Button size="sm" variant="secondary" icon="calendar" onClick={() => sessionIcs(next, "Danışmanım")}>
            Takvimime ekle
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Danışman: öğrenci detayındaki Görüşmeler sekmesi */
export function CounselorSessions({ student }: { student: Profile }) {
  const toast = useToast();
  const [list, setList] = useState<CounselingSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [date, setDate] = useState(addDays(todayISO(), 1));
  const [time, setTime] = useState("18:00");
  const [dur, setDur] = useState("45");
  const [mode, setMode] = useState<SessionMode>("online");
  const [link, setLink] = useState("");
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const first = student.full_name.split(" ")[0];

  const load = useCallback(async () => {
    const { data, error } = await sb().from("counseling_sessions").select("*").eq("student_id", student.id).order("starts_at", { ascending: false });
    if (error) {
      if (/counseling_sessions|schema cache|does not exist/i.test(error.message)) setMissing(true);
      else setError(errorText(error));
      setList([]);
      return;
    }
    setList((data ?? []) as CounselingSession[]);
  }, [student.id]);
  useEffect(() => {
    load();
  }, [load]);

  async function add() {
    const starts = new Date(`${date}T${time}:00`);
    if (Number.isNaN(starts.getTime())) return setError("Tarih veya saat geçersiz.");
    setBusy(true);
    setError(null);
    const { error } = await sb()
      .from("counseling_sessions")
      .insert({ student_id: student.id, starts_at: starts.toISOString(), duration_min: Number(dur) || 45, mode, link: link.trim() || null, topic: topic.trim() });
    setBusy(false);
    if (error) return setError(errorText(error));
    setTopic("");
    toast.show("Görüşme eklendi");
    load();
  }

  async function removeSession(s: CounselingSession) {
    if (!confirmAction(`${whenText(s.starts_at)} görüşmesi silinsin mi? Notlarıyla birlikte kalıcı olarak silinir.`)) return;
    const { error } = await sb().from("counseling_sessions").delete().eq("id", s.id);
    if (error) return toast.show(errorText(error), "danger");
    toast.show("Görüşme silindi");
    load();
  }

  async function patch(s: CounselingSession, values: Partial<CounselingSession>) {
    const { error } = await sb().from("counseling_sessions").update(values).eq("id", s.id);
    if (error) return toast.show(errorText(error), "danger");
    toast.show("Kaydedildi");
    load();
  }

  if (missing)
    return (
      <Card>
        <EmptyState icon="calendar" title="Görüşme takvimi için veritabanı güncellemesi gerekiyor">
          Supabase → SQL Editor'de guncelleme-5.sql dosyasını bir kez çalıştırın.
        </EmptyState>
      </Card>
    );
  if (!list) return <PageLoader />;

  const now = Date.now();
  const upcoming = list.filter((s) => s.status === "planned" && new Date(s.starts_at).getTime() >= now - 3600000).reverse();
  const past = list.filter((s) => !upcoming.includes(s));

  const reminder = (s: CounselingSession) =>
    `Merhaba ${first}, ${whenText(s.starts_at)} görüşmemizi hatırlatmak istedim${s.topic ? ` (konu: ${s.topic})` : ""}.${s.link ? ` Bağlantı: ${s.link}` : ""} Görüşmek üzere!`;

  return (
    <div className="space-y-4">
      <Card title="Yeni görüşme" subtitle="Öğrenci Bugün ekranında sıradaki görüşmesini ve bağlantıyı görür; notlarını göremez.">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Tarih" htmlFor="s-date">
            <input id="s-date" type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Saat" htmlFor="s-time">
            <input id="s-time" type="time" className="field" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
          <Field label="Süre (dk)" htmlFor="s-dur">
            <input id="s-dur" inputMode="numeric" className="field" value={dur} onChange={(e) => setDur(e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label="Tür">
            <select className="field" value={mode} onChange={(e) => setMode(e.target.value as SessionMode)} aria-label="Görüşme türü">
              <option value="online">Online</option>
              <option value="yuz_yuze">Yüz yüze</option>
              <option value="telefon">Telefon</option>
            </select>
          </Field>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Konu (öğrenci görür)" htmlFor="s-topic">
            <input id="s-topic" className="field" maxLength={200} placeholder="ör. Deneme sonrası değerlendirme" value={topic} onChange={(e) => setTopic(e.target.value)} />
          </Field>
          <Field label="Görüşme bağlantısı" htmlFor="s-link">
            <input id="s-link" className="field" maxLength={500} placeholder="ör. Google Meet / Zoom bağlantısı" value={link} onChange={(e) => setLink(e.target.value)} />
          </Field>
        </div>
        {error && (
          <div className="mt-3">
            <ErrorBox>{error}</ErrorBox>
          </div>
        )}
        <div className="mt-3 flex justify-end">
          <Button icon="plus" onClick={add} loading={busy}>
            Görüşme ekle
          </Button>
        </div>
      </Card>

      <Card title="Yaklaşan görüşmeler" subtitle={upcoming.length ? `${upcoming.length} görüşme` : undefined}>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted">Planlanmış görüşme yok.</p>
        ) : (
          <ul className="space-y-3">
            {upcoming.map((s) => (
              <li key={s.id} className="rounded-xl border border-line p-3 text-sm">
                <p className="font-semibold">{whenText(s.starts_at)}</p>
                <p className="text-muted">
                  {MODE_LABEL[s.mode]} · {s.duration_min} dk{s.topic ? ` · ${s.topic}` : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <a href={waLink(reminder(s))} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm font-medium">
                    <Icon name="message" size={15} /> WhatsApp ile hatırlat
                  </a>
                  <Button size="sm" variant="secondary" icon="calendar" onClick={() => sessionIcs(s, student.full_name)}>
                    Takvime ekle
                  </Button>
                  <Button size="sm" variant="soft" icon="check" onClick={() => patch(s, { status: "done" })}>
                    Yapıldı
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => patch(s, { status: "cancelled" })}>
                    İptal
                  </Button>
                  <Button size="sm" variant="ghost" icon="trash" onClick={() => removeSession(s)}>
                    Sil
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {past.length > 0 && (
        <Card title="Geçmiş görüşmeler" subtitle="Notlar yalnızca size görünür">
          <ul className="space-y-3">
            {past.map((s) => (
              <li key={s.id} className="rounded-xl border border-line p-3 text-sm">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  <span className="flex-1">{whenText(s.starts_at)}</span>
                  <button type="button" onClick={() => removeSession(s)} className="order-last rounded-lg p-1 text-faint hover:bg-danger-soft hover:text-danger" aria-label="Görüşmeyi sil">
                    <Icon name="trash" size={16} />
                  </button>
                  <Badge tone={s.status === "done" ? "success" : s.status === "cancelled" ? "neutral" : "warning"}>
                    {s.status === "done" ? "Yapıldı" : s.status === "cancelled" ? "İptal" : "Bekliyor"}
                  </Badge>
                </p>
                <p className="text-muted">
                  {MODE_LABEL[s.mode]} · {s.duration_min} dk{s.topic ? ` · ${s.topic}` : ""}
                </p>
                <textarea
                  className="field mt-2 min-h-16 text-sm"
                  maxLength={3000}
                  placeholder="Görüşme notu: konuşulanlar, verilen ödev, bir sonraki adım…"
                  aria-label="Görüşme notu"
                  value={notes[s.id] ?? s.notes ?? ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [s.id]: e.target.value }))}
                />
                {(notes[s.id] ?? s.notes ?? "") !== (s.notes ?? "") && (
                  <div className="mt-2 flex justify-end">
                    <Button size="sm" icon="check" onClick={() => patch(s, { notes: notes[s.id] ?? "" })}>
                      Notu kaydet
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/* ================================================================== */
/* WhatsApp hatırlatma şablonları (danışman)                           */
/* ================================================================== */

export function WhatsAppReminder({ student }: { student: Profile }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [ctx, setCtx] = useState<{ lastLog: string | null; done: number; total: number; next: CounselingSession | null } | null>(null);
  const [phone, setPhone] = useState<string>("");
  const [kind, setKind] = useState<"gunluk" | "program" | "destek" | "gorusme">("gunluk");
  const [text, setText] = useState("");
  const first = student.full_name.split(" ")[0];

  useEffect(() => {
    if (!open || ctx) return;
    (async () => {
      const [logs, plans] = await Promise.all([fetchLogs(student.id, addDays(todayISO(), -30)).catch(() => []), fetchPlans(student.id).catch(() => [])]);
      const plan = pickCurrentPlan(plans);
      let tasks: PlanTask[] = [];
      if (plan) {
        const { data } = await sb().from("plan_tasks").select("*").eq("plan_id", plan.id);
        tasks = ((data ?? []) as PlanTask[]).filter(isRealTask);
      }
      const { data: ct } = await sb().from("student_contacts").select("phone").eq("student_id", student.id).maybeSingle();
      setPhone((ct as { phone?: string } | null)?.phone ?? "");
      const { data: ss } = await sb().from("counseling_sessions").select("*").eq("student_id", student.id).eq("status", "planned").gte("starts_at", new Date().toISOString()).order("starts_at").limit(1);
      setCtx({ lastLog: logs[0]?.log_date ?? null, done: tasks.filter((t) => t.done).length, total: tasks.length, next: ((ss ?? []) as CounselingSession[])[0] ?? null });
    })();
  }, [open, ctx, student.id]);

  const templates = useMemo(() => {
    const c = ctx;
    const gap = c?.lastLog ? diffDays(c.lastLog, todayISO()) : null;
    return {
      gunluk:
        gap == null
          ? `Merhaba ${first}, günlük takibini henüz hiç doldurmadın. Bu akşam 2 dakikanı ayırıp doldurur musun? Uyku, telefon ve ruh halindeki örüntüleri birlikte görmemiz için çok önemli.`
          : gap === 0
            ? `Merhaba ${first}, bugünkü günlüğünü doldurduğun için teşekkürler. Uygulamada sana özel geri bildirimlere göz atmayı unutma.`
            : `Merhaba ${first}, son günlük kaydın ${formatLong(c!.lastLog!)} (${gap} gün önce). Bu akşam 2 dakikanı ayırıp doldurur musun? Kayıtların arttıkça sana özel öneriler de netleşiyor.`,
      program: c?.total
        ? `Merhaba ${first}, bu haftaki programında ${c.done}/${c.total} görev tamamlandı. Kalan günlerde en kolay görevle başlamayı dene. Zorlanırsan yaz; planı birlikte hafifletebiliriz.`
        : `Merhaba ${first}, bu hafta için programını birlikte güncelleyelim mi? Uygun olduğun bir saati yazar mısın?`,
      destek: `Merhaba ${first}, son günlerde biraz yorulmuş gibisin. Nasılsın? Uygun olduğunda kısa bir görüşme yapalım mı? Programını da bu hafta biraz hafifletebiliriz.`,
      gorusme: c?.next
        ? `Merhaba ${first}, ${whenText(c.next.starts_at)} görüşmemizi hatırlatmak istedim.${c.next.link ? ` Bağlantı: ${c.next.link}` : ""} Görüşmek üzere!`
        : `Merhaba ${first}, bu hafta bir görüşme planlayalım mı? Uygun olduğun gün ve saati yazar mısın?`,
    };
  }, [ctx, first]);

  useEffect(() => setText(templates[kind]), [templates, kind]);

  return (
    <>
      <Button size="sm" variant="secondary" icon="message" onClick={() => setOpen(true)}>
        WhatsApp hatırlatma
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`${first} için hatırlatma`}
        footer={
          <>
            <Button
              variant="ghost"
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
              Kopyala
            </Button>
            <a href={waTo(phone, text)} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-[15px] font-medium text-primary-fg">
              <Icon name="message" size={17} /> WhatsApp'ta aç
            </a>
          </>
        }
      >
        {!ctx ? (
          <PageLoader />
        ) : (
          <div className="space-y-3">
            <Segmented
              size="sm"
              ariaLabel="Hatırlatma türü"
              value={kind}
              onChange={setKind}
              options={[
                { value: "gunluk", label: "Günlük" },
                { value: "program", label: "Program" },
                { value: "gorusme", label: "Görüşme" },
                { value: "destek", label: "Destek" },
              ]}
            />
            <textarea className="field min-h-36 text-sm" value={text} onChange={(e) => setText(e.target.value)} aria-label="Mesaj" />
            <p className="text-xs text-faint">Mesaj öğrencinin kendi verisinden hazırlandı; göndermeden önce düzenleyebilirsin. {normalizePhone(phone) ? `WhatsApp ${phone} numarasında açılır.` : "Telefon kayıtlı değilse WhatsApp'ta kişiyi sen seçersin (Hesap sekmesinden ekleyebilirsin)."}</p>
          </div>
        )}
      </Modal>
    </>
  );
}

/* ================================================================== */
/* Bir günün saatlerini diğer günlere kopyalama                        */
/* ================================================================== */

export function CopyDaysModal({
  source,
  labels,
  weekdayIdx = [0, 1, 2, 3, 4],
  weekendIdx = [5, 6],
  onClose,
  onApply,
}: {
  source: number;
  labels: string[];
  weekdayIdx?: number[];
  weekendIdx?: number[];
  onClose: () => void;
  onApply: (targets: number[]) => void | Promise<void>;
}) {
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const others = labels.map((_, i) => i).filter((i) => i !== source);
  const pick = (idx: number[]) => setSel(new Set(idx.filter((i) => i !== source)));
  const toggle = (i: number) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  return (
    <Modal
      open
      onClose={onClose}
      title={`${labels[source]} saatlerini kopyala`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Vazgeç
          </Button>
          <Button
            icon="copy"
            disabled={!sel.size}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              await onApply([...sel].sort((a, b) => a - b));
              setBusy(false);
            }}
          >
            {sel.size ? `${sel.size} güne kopyala` : "Gün seç"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="secondary" onClick={() => pick(weekdayIdx)}>
            Hafta içi
          </Button>
          <Button size="sm" variant="secondary" onClick={() => pick(weekendIdx)}>
            Hafta sonu
          </Button>
          <Button size="sm" variant="secondary" onClick={() => pick(others)}>
            Tüm günler
          </Button>
          {sel.size > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>
              Temizle
            </Button>
          )}
        </div>
        <ul className="grid grid-cols-2 gap-2">
          {others.map((i) => (
            <li key={i}>
              <label className={cx("flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm", sel.has(i) ? "border-primary bg-primary-soft" : "border-line")}>
                <input type="checkbox" checked={sel.has(i)} onChange={() => toggle(i)} />
                {labels[i]}
              </label>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted">Seçilen günlerdeki mevcut saatlerin yerine {labels[source]} günündeki saatler yazılır.</p>
      </div>
    </Modal>
  );
}
