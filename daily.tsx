"use client";
// Günlük takip formu ve geçmiş (Excel şablonunun 2. sayfası).

import { Fragment, useCallback, useEffect, useState } from "react";
import { errorText, fetchLogs, sb } from "./db";
import { addDays, type DailyLog, dayShort, downloadCSV, fmtNum, formatLong, formatShort, formatTR, todayISO, yesNo } from "./lib";
import { Badge, Button, Card, cx, EmptyState, ErrorBox, Field, Icon, IconButton, PageLoader, ScalePicker, Segmented, useToast } from "./ui";

type FormState = {
  sleep_hours: string;
  procrastinated: boolean | null;
  phone_minutes: string;
  replanned: boolean | null;
  anxiety: number | null;
  energy: number | null;
  motivation: number | null;
  obstacle: string;
  action_taken: string;
  what_worked: string;
  tomorrow_change: string;
};

const EMPTY: FormState = {
  sleep_hours: "",
  procrastinated: null,
  phone_minutes: "",
  replanned: null,
  anxiety: null,
  energy: null,
  motivation: null,
  obstacle: "",
  action_taken: "",
  what_worked: "",
  tomorrow_change: "",
};

function fromLog(l: DailyLog | null): FormState {
  if (!l) return EMPTY;
  return {
    sleep_hours: l.sleep_hours != null ? String(l.sleep_hours).replace(".", ",") : "",
    procrastinated: l.procrastinated,
    phone_minutes: l.phone_minutes != null ? String(l.phone_minutes) : "",
    replanned: l.replanned,
    anxiety: l.anxiety,
    energy: l.energy,
    motivation: l.motivation,
    obstacle: l.obstacle ?? "",
    action_taken: l.action_taken ?? "",
    what_worked: l.what_worked ?? "",
    tomorrow_change: l.tomorrow_change ?? "",
  };
}

const YES_NO = [
  { value: true as boolean | null, label: "Evet" },
  { value: false as boolean | null, label: "Hayır" },
];

/** Günlük takip formu (şablondaki 2. sayfa) */
export function DailyLogForm({ studentId, date, onSaved }: { studentId: string; date: string; onSaved?: (l: DailyLog) => void }) {
  const toast = useToast();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [existing, setExisting] = useState<DailyLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    sb()
      .from("daily_logs")
      .select("*")
      .eq("student_id", studentId)
      .eq("log_date", date)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setError(errorText(error));
        const l = (data as DailyLog | null) ?? null;
        setExisting(l);
        setForm(fromLog(l));
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [studentId, date]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    setError(null);
    const sleep = form.sleep_hours.trim() === "" ? null : Number(form.sleep_hours.replace(",", "."));
    const phone = form.phone_minutes.trim() === "" ? null : Number(form.phone_minutes);
    if (sleep != null && (Number.isNaN(sleep) || sleep < 0 || sleep > 24)) return setError("Uyku süresi 0 ile 24 saat arasında olmalı.");
    if (phone != null && (Number.isNaN(phone) || phone < 0 || phone > 1440)) return setError("Telefon süresi 0 ile 1440 dakika arasında olmalı.");
    setSaving(true);
    const payload = {
      student_id: studentId,
      log_date: date,
      sleep_hours: sleep == null ? null : Math.round(sleep * 10) / 10,
      procrastinated: form.procrastinated,
      phone_minutes: phone == null ? null : Math.round(phone),
      replanned: form.replanned,
      anxiety: form.anxiety,
      energy: form.energy,
      motivation: form.motivation,
      obstacle: form.obstacle.trim().slice(0, 1000) || null,
      action_taken: form.action_taken.trim().slice(0, 1000) || null,
      what_worked: form.what_worked.trim().slice(0, 1000) || null,
      tomorrow_change: form.tomorrow_change.trim().slice(0, 1000) || null,
    };
    const { data, error } = await sb().from("daily_logs").upsert(payload, { onConflict: "student_id,log_date" }).select("*").single();
    setSaving(false);
    if (error) return setError(errorText(error));
    const l = data as DailyLog;
    setExisting(l);
    toast.show("Günlük kaydedildi");
    onSaved?.(l);
  }

  async function remove() {
    if (!existing) return;
    if (!window.confirm(`${formatTR(date)} kaydı silinsin mi?`)) return;
    const { error } = await sb().from("daily_logs").delete().eq("id", existing.id);
    if (error) return toast.show(errorText(error), "danger");
    setExisting(null);
    setForm(EMPTY);
    toast.show("Kayıt silindi");
    onSaved?.({ ...existing, id: "" });
  }

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-4">
      <Card title="Gün bilgileri">
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Uyku süresi (saat)" htmlFor="sleep">
              <input
                id="sleep"
                className="field"
                inputMode="decimal"
                placeholder="ör. 7,5"
                value={form.sleep_hours}
                onChange={(e) => set("sleep_hours", e.target.value.replace(/[^\d.,]/g, ""))}
              />
            </Field>
            <Field label="Telefon / dikkat dağıtıcı (dk)" htmlFor="phone">
              <input
                id="phone"
                className="field"
                inputMode="numeric"
                placeholder="ör. 45"
                value={form.phone_minutes}
                onChange={(e) => set("phone_minutes", e.target.value.replace(/[^\d]/g, ""))}
              />
            </Field>
          </div>
          <Field label="Erteleme yaşadım mı?">
            <Segmented ariaLabel="Erteleme" options={YES_NO} value={form.procrastinated} onChange={(v) => set("procrastinated", form.procrastinated === v ? null : v)} />
          </Field>
          <Field label="Gün içinde planı yeniden düzenledin mi?">
            <Segmented ariaLabel="Plan değişikliği" options={YES_NO} value={form.replanned} onChange={(v) => set("replanned", form.replanned === v ? null : v)} />
          </Field>
        </div>
      </Card>

      <Card title="Duygu durumu" subtitle="1 = çok düşük, 5 = çok yüksek">
        <div className="space-y-5">
          <Field label="Kaygı">
            <ScalePicker ariaLabel="Kaygı" value={form.anxiety} onChange={(v) => set("anxiety", v)} low="Çok az" high="Çok fazla" />
          </Field>
          <Field label="Enerji">
            <ScalePicker ariaLabel="Enerji" value={form.energy} onChange={(v) => set("energy", v)} low="Çok düşük" high="Çok yüksek" />
          </Field>
          <Field label="Motivasyon">
            <ScalePicker ariaLabel="Motivasyon" value={form.motivation} onChange={(v) => set("motivation", v)} low="Çok düşük" high="Çok yüksek" />
          </Field>
        </div>
      </Card>

      <Card title="Günün değerlendirmesi">
        <div className="space-y-4">
          {(
            [
              ["obstacle", "Bugünkü en büyük engel", "ör. Öğleden sonra telefona dalıp 1 saat kaybettim"],
              ["action_taken", "Engel karşısında ne yaptım", "ör. Telefonu başka odaya koydum"],
              ["what_worked", "Bugün işe yarayan tek şey", "ör. 25 dk çalışma + 5 dk mola"],
              ["tomorrow_change", "Yarın için tek küçük değişiklik", "ör. Güne matematikle başlayacağım"],
            ] as const
          ).map(([k, label, ph]) => (
            <Field key={k} label={label} htmlFor={k}>
              <textarea
                id={k}
                className="field min-h-20"
                maxLength={1000}
                placeholder={ph}
                value={form[k]}
                onChange={(e) => set(k, e.target.value)}
              />
            </Field>
          ))}
        </div>
      </Card>

      {error && <ErrorBox>{error}</ErrorBox>}
      <div className="flex items-center justify-between gap-3">
        {existing ? (
          <Button variant="ghost" size="sm" icon="trash" onClick={remove}>
            Kaydı sil
          </Button>
        ) : (
          <span />
        )}
        <Button size="lg" icon="check" onClick={save} loading={saving}>
          {existing ? "Güncelle" : "Kaydet"}
        </Button>
      </div>
    </div>
  );
}

/** Tarih seçici + form + geçmiş (öğrenci ve danışman ortak) */
export function DailyLogSection({ studentId, studentName }: { studentId: string; studentName?: string }) {
  const [date, setDate] = useState(todayISO());
  const [logs, setLogs] = useState<DailyLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchLogs(studentId, addDays(todayISO(), -120))
      .then(setLogs)
      .catch((e) => setError(errorText(e)));
  }, [studentId]);

  useEffect(() => {
    load();
  }, [load]);

  const filledDates = new Set((logs ?? []).map((l) => l.log_date));
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(todayISO(), i - 6));

  return (
    <div className="space-y-4">
      <div className="card p-3">
        <div className="flex items-center gap-2">
          <IconButton icon="chevronLeft" label="Önceki gün" onClick={() => setDate((d) => addDays(d, -1))} />
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate font-semibold">{formatLong(date)}</p>
            <p className="text-xs text-muted">{filledDates.has(date) ? "Bu gün doldurulmuş" : "Bu gün henüz doldurulmamış"}</p>
          </div>
          <IconButton icon="chevronRight" label="Sonraki gün" disabled={date >= todayISO()} onClick={() => setDate((d) => addDays(d, 1))} />
        </div>
        <div className="mt-3 grid grid-cols-7 gap-1.5">
          {last7.map((d) => (
            <button
              key={d}
              onClick={() => setDate(d)}
              aria-pressed={d === date}
              className={cx(
                "flex flex-col items-center rounded-lg py-1.5 text-xs transition",
                d === date ? "bg-primary text-primary-fg" : "hover:bg-surface-2",
              )}
            >
              <span className={d === date ? "" : "text-muted"}>{dayShort(d)}</span>
              <span
                className={cx(
                  "mt-1 flex h-5 w-5 items-center justify-center rounded-full",
                  filledDates.has(d) ? (d === date ? "bg-white/25" : "bg-success-soft text-success") : "",
                )}
              >
                {filledDates.has(d) ? <Icon name="check" size={12} strokeWidth={3} /> : <span className="h-1.5 w-1.5 rounded-full bg-current opacity-30" />}
              </span>
            </button>
          ))}
        </div>
        <div className="mt-2 flex justify-center">
          <input
            type="date"
            aria-label="Tarih seç"
            className="field w-auto py-1.5 text-sm"
            max={todayISO()}
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
        </div>
      </div>

      <DailyLogForm key={date} studentId={studentId} date={date} onSaved={load} />

      {error && <ErrorBox>{error}</ErrorBox>}
      <LogHistory logs={logs} onPick={setDate} studentName={studentName} />
    </div>
  );
}

function Scale({ v }: { v: number | null }) {
  if (v == null) return <span className="text-faint">—</span>;
  return <span className="tabular font-semibold">{v}</span>;
}

export function LogHistory({
  logs,
  onPick,
  studentName,
}: {
  logs: DailyLog[] | null;
  onPick?: (date: string) => void;
  studentName?: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  if (!logs) return <PageLoader />;

  const exportCsv = () => {
    const rows = [
      [
        "Tarih",
        "Uyku süresi (saat)",
        "Erteleme yaşadım mı?",
        "Telefon / dikkat dağıtıcı (dk)",
        "Planı yeniden düzenledin mi?",
        "Kaygı (1-5)",
        "Enerji (1-5)",
        "Motivasyon (1-5)",
        "Bugünkü en büyük engel",
        "Engel karşısında ne yaptım",
        "Bugün işe yarayan tek şey",
        "Yarın için tek küçük değişiklik",
      ],
      ...[...logs]
        .sort((a, b) => (a.log_date < b.log_date ? -1 : 1))
        .map((l) => [
          formatTR(l.log_date),
          l.sleep_hours,
          l.procrastinated,
          l.phone_minutes,
          l.replanned,
          l.anxiety,
          l.energy,
          l.motivation,
          l.obstacle,
          l.action_taken,
          l.what_worked,
          l.tomorrow_change,
        ]),
    ];
    const name = (studentName ?? "ogrenci").replace(/[^\p{L}\p{N}]+/gu, "_");
    downloadCSV(`gunluk_takip_${name}_${todayISO()}.csv`, rows);
  };

  return (
    <Card
      title="Geçmiş kayıtlar"
      subtitle={`${logs.length} kayıt (son 120 gün)`}
      action={
        logs.length > 0 ? (
          <Button variant="secondary" size="sm" icon="download" onClick={exportCsv}>
            Excel (CSV)
          </Button>
        ) : undefined
      }
      bodyClassName="px-0 sm:px-0"
    >
      {logs.length === 0 ? (
        <EmptyState icon="journal" title="Henüz kayıt yok">
          Her akşam 1-2 dakikada günü değerlendirmek, örüntüleri görmeyi kolaylaştırır.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-4 py-2 font-medium sm:px-5">Tarih</th>
                <th className="px-2 py-2 font-medium">Uyku</th>
                <th className="px-2 py-2 font-medium">Erteleme</th>
                <th className="px-2 py-2 font-medium">Telefon</th>
                <th className="px-2 py-2 font-medium">Plan değ.</th>
                <th className="px-2 py-2 font-medium">Kaygı</th>
                <th className="px-2 py-2 font-medium">Enerji</th>
                <th className="px-2 py-2 font-medium">Motiv.</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => {
                const hasText = l.obstacle || l.action_taken || l.what_worked || l.tomorrow_change;
                const isOpen = open === l.id;
                return (
                  <Fragment key={l.id}>
                    <tr className="border-b border-line align-middle hover:bg-surface-2">
                      <td className="px-4 py-2.5 sm:px-5">
                        <button className="text-left font-medium hover:text-primary" onClick={() => onPick?.(l.log_date)}>
                          {formatShort(l.log_date)}
                          <span className="ml-1 text-xs text-faint">{dayShort(l.log_date)}</span>
                        </button>
                      </td>
                      <td className="px-2 py-2.5 tabular">{l.sleep_hours != null ? `${fmtNum(l.sleep_hours)} sa` : "—"}</td>
                      <td className="px-2 py-2.5">
                        {l.procrastinated == null ? "—" : l.procrastinated ? <Badge tone="warning">Evet</Badge> : <Badge>Hayır</Badge>}
                      </td>
                      <td className="px-2 py-2.5 tabular">{l.phone_minutes != null ? `${l.phone_minutes} dk` : "—"}</td>
                      <td className="px-2 py-2.5">{yesNo(l.replanned)}</td>
                      <td className="px-2 py-2.5">
                        <Scale v={l.anxiety} />
                      </td>
                      <td className="px-2 py-2.5">
                        <Scale v={l.energy} />
                      </td>
                      <td className="px-2 py-2.5">
                        <Scale v={l.motivation} />
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        {hasText && (
                          <IconButton
                            icon="chevronDown"
                            label={isOpen ? "Yanıtları gizle" : "Yanıtları göster"}
                            className={cx("h-8 w-8 transition", isOpen && "rotate-180")}
                            onClick={() => setOpen(isOpen ? null : l.id)}
                          />
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b border-line bg-surface-2">
                        <td colSpan={9} className="px-4 py-3 sm:px-5">
                          <dl className="grid gap-3 sm:grid-cols-2">
                            <QA q="Bugünkü en büyük engel" a={l.obstacle} />
                            <QA q="Engel karşısında ne yaptım" a={l.action_taken} />
                            <QA q="Bugün işe yarayan tek şey" a={l.what_worked} />
                            <QA q="Yarın için tek küçük değişiklik" a={l.tomorrow_change} />
                          </dl>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function QA({ q, a }: { q: string; a: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted">{q}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap text-sm">{a || <span className="text-faint">—</span>}</dd>
    </div>
  );
}
