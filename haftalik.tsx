"use client";
// Haftalık raporlar: pazar akşamı kendiliğinden oluşur (Vercel Cron) ya da danışman "şimdi oluştur" der.
// Aynı kart üç yerde kullanılır: danışman (özel bölümle), öğrenci (İlerleme) ve veli paneli.

import { useCallback, useEffect, useState } from "react";
import { A, errorText, sb } from "./db";
import { addDays, fmtNum, formatShort, minutesToText, parseISODate, todayISO, type Profile } from "./lib";
import { Badge, Button, Card, EmptyState, ErrorBox, IconButton, PageLoader, cx, useToast } from "./ui";

export type WeeklyData = {
  tasks_total: number;
  tasks_done: number;
  solved: number;
  correct: number;
  wrong: number;
  minutes: number;
  active_days: number;
  log_days: number;
  topics_done: number;
  streak: number;
  subjects: { s: string; n: number; d: number; q: number }[];
  exams: { title: string; date: string; type: string; net: number }[];
  prev?: { tasks_total: number; tasks_done: number; solved: number };
};
type WeeklyPrivate = { sleep?: number | null; phone?: number | null; anxiety?: number | null; energy?: number | null; motivation?: number | null; procrastinated?: number; replanned?: number };
type Row = { id: string; student_id: string; week_start: string; data: WeeklyData; private: WeeklyPrivate; counselor_note: string; parent_published: boolean };

export const mondayOf = (iso: string) => addDays(iso, -((parseISODate(iso).getDay() + 6) % 7));
export const weekLabel = (ws: string) => `${formatShort(ws)} – ${formatShort(addDays(ws, 6))}`;
const pctOf = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);
const missing = (m: string) => /weekly_reports|generate_weekly|my_weekly|schema cache|does not exist|Could not find/i.test(m);

/** Raporun herkese gösterilebilen bölümü */
export function WeeklyReportBody({ d, audience }: { d: WeeklyData; audience: "student" | "parent" | "counselor" }) {
  const done = pctOf(d.tasks_done, d.tasks_total);
  const acc = pctOf(d.correct, d.correct + d.wrong);
  const diff = d.prev ? d.solved - d.prev.solved : null;
  const prevDone = d.prev ? pctOf(d.prev.tasks_done, d.prev.tasks_total) : null;
  const maxQ = Math.max(0, ...d.subjects.map((s) => s.q));
  const tiles: [string, string, string][] = [
    ["Görev", done != null ? `%${done}` : "—", `${d.tasks_done}/${d.tasks_total} tamamlandı`],
    ["Soru", fmtNum(d.solved, 0), diff == null || d.prev!.solved === 0 ? "çözüldü" : `geçen haftaya göre ${diff >= 0 ? "+" : ""}${fmtNum(diff, 0)}`],
    ["Doğruluk", acc != null ? `%${acc}` : "—", d.correct + d.wrong ? `${d.correct} D · ${d.wrong} Y` : "D/Y girilmedi"],
    ["Aktif gün", `${d.active_days}/7`, d.minutes ? minutesToText(d.minutes) : `günlük ${d.log_days}/7`],
  ];
  const who = audience === "student" ? "" : "Öğrenci ";
  const lines: string[] = [];
  if (done != null && done >= 80) lines.push(`${who}programın %${done}'ini tamamladı${audience === "student" ? "n" : ""}; güçlü bir hafta.`);
  else if (done != null && prevDone != null && done > prevDone) lines.push(`Program tamamlama geçen haftaya göre %${prevDone}'den %${done}'e yükseldi.`);
  if (diff != null && diff > 0 && d.prev!.solved > 0) lines.push(`Geçen haftadan ${fmtNum(diff, 0)} soru fazla çözüldü.`);
  if (d.topics_done > 0) lines.push(`${d.topics_done} konu bitirildi.`);
  if (d.streak >= 7) lines.push(`${d.streak} günlük çalışma serisi sürüyor.`);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map(([label, value, sub]) => (
          <div key={label} className="rounded-xl bg-surface-2 p-2.5">
            <p className="text-[11px] text-muted">{label}</p>
            <p className="display text-xl leading-tight tabular">{value}</p>
            <p className="text-[11px] text-faint">{sub}</p>
          </div>
        ))}
      </div>
      {lines.length > 0 && (
        <ul className="space-y-0.5 text-sm">
          {lines.map((l) => (
            <li key={l} className="flex gap-1.5">
              <span className="text-success" aria-hidden>
                ✓
              </span>
              {l}
            </li>
          ))}
        </ul>
      )}
      {d.subjects.length > 0 && (
        <ul className="space-y-1.5">
          {d.subjects.slice(0, 8).map((s) => (
            <li key={s.s} className="flex items-center gap-2 text-xs">
              <span className="w-28 shrink-0 truncate">{s.s}</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                <span className="bar-grow block h-full rounded-full bg-primary" style={{ width: `${Math.round((maxQ > 0 ? s.q / maxQ : s.n > 0 ? s.d / s.n : 0) * 100)}%` }} />
              </span>
              <span className="w-24 shrink-0 text-right text-muted tabular">
                {s.q ? `${fmtNum(s.q, 0)} soru · ` : ""}
                {s.d}/{s.n}
              </span>
            </li>
          ))}
        </ul>
      )}
      {d.exams.length > 0 && (
        <p className="text-sm">
          <span className="text-muted">Denemeler: </span>
          {d.exams.map((e) => `${e.title} (${fmtNum(e.net, 2)} net)`).join(", ")}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Öğrenci: İlerleme sayfasındaki kart                                  */
/* ------------------------------------------------------------------ */
export function StudentWeeklyCard() {
  const [rows, setRows] = useState<{ week_start: string; data: WeeklyData }[] | null>(null);
  const [i, setI] = useState(0);
  useEffect(() => {
    sb()
      .rpc("my_weekly_reports")
      .then(({ data, error }) => setRows(error ? [] : ((data ?? []) as { week_start: string; data: WeeklyData }[])));
  }, []);
  if (!rows?.length) return null;
  const r = rows[Math.min(i, rows.length - 1)];
  return (
    <Card
      title="Haftalık özetim"
      subtitle={weekLabel(r.week_start)}
      action={
        rows.length > 1 ? (
          <div className="flex">
            <IconButton icon="chevronLeft" label="Önceki hafta" className="h-9 w-9" disabled={i >= rows.length - 1} onClick={() => setI(i + 1)} />
            <IconButton icon="chevronRight" label="Sonraki hafta" className="h-9 w-9" disabled={i === 0} onClick={() => setI(i - 1)} />
          </div>
        ) : undefined
      }
    >
      <WeeklyReportBody d={r.data} audience="student" />
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Danışman: Haftalık raporlar sayfası                                  */
/* ------------------------------------------------------------------ */
export function CounselorWeeklyReports() {
  const toast = useToast();
  const [week, setWeek] = useState(mondayOf(todayISO()));
  const [rows, setRows] = useState<Row[] | null>(null);
  const [students, setStudents] = useState<Map<string, Profile>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [autoPub, setAutoPub] = useState(true);
  const thisWeek = mondayOf(todayISO());

  const load = useCallback(async () => {
    setRows(null);
    setError(null);
    const [st, rp] = await Promise.all([sb().from("profiles").select("*").eq("role", "student").eq("is_active", true), sb().from("weekly_reports").select("*").eq("week_start", week)]);
    if (rp.error) {
      setRows([]);
      return setError(missing(rp.error.message) ? "Haftalık raporlar için Supabase'de guncelleme-hepsi.sql çalıştırılmalı." : errorText(rp.error));
    }
    const map = new Map(((st.data ?? []) as Profile[]).map((s) => [s.id, s]));
    setStudents(map);
    setRows(((rp.data ?? []) as Row[]).filter((r) => map.has(r.student_id)).sort((a, b) => map.get(a.student_id)!.full_name.localeCompare(map.get(b.student_id)!.full_name, "tr")));
  }, [week]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    sb()
      .from("notify_prefs")
      .select("veli_rapor")
      .maybeSingle()
      .then(({ data }) => setAutoPub((data as { veli_rapor?: boolean } | null)?.veli_rapor ?? true));
  }, []);

  async function generate() {
    setBusy(true);
    const { data, error: e } = await sb().rpc("generate_weekly_reports", { p_week: week });
    setBusy(false);
    if (e) return toast.show(missing(e.message) ? "guncelleme-hepsi.sql çalıştırılmalı" : errorText(e), "danger");
    toast.show(`${data ?? 0} öğrencinin raporu güncellendi`);
    load();
  }
  async function patch(r: Row, values: Partial<Row>) {
    setRows((x) => (x ?? []).map((y) => (y.id === r.id ? { ...y, ...values } : y)));
    const { error: e } = await sb().from("weekly_reports").update(values).eq("id", r.id);
    if (e) toast.show(errorText(e), "danger");
  }
  async function saveAutoPub(v: boolean) {
    setAutoPub(v);
    const { data: u } = await sb().auth.getUser();
    if (!u.user) return;
    const { error: e } = await sb().from("notify_prefs").upsert({ user_id: u.user.id, veli_rapor: v, updated_at: new Date().toISOString() });
    toast.show(e ? errorText(e) : v ? "Yeni raporlar veliye kendiliğinden yayınlanacak" : "Yeni raporlar siz onaylayınca yayınlanacak", e ? "danger" : "success");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-2xl sm:text-[32px]">Haftalık raporlar</h1>
          <p className="text-sm text-muted">Her pazar akşamı kendiliğinden oluşur; öğrenci İlerleme sayfasında, veli kendi panelinde görür.</p>
        </div>
        <Button icon="check" loading={busy} onClick={generate} className="no-print">
          {week === thisWeek ? "Bu haftayı şimdi oluştur" : "Bu haftayı yeniden oluştur"}
        </Button>
      </div>

      <div className="card no-print flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex items-center gap-1">
          <IconButton icon="chevronLeft" label="Önceki hafta" onClick={() => setWeek(addDays(week, -7))} />
          <p className="min-w-44 text-center text-sm font-semibold">
            {weekLabel(week)}
            {week === thisWeek && <span className="ml-1.5 font-normal text-muted">(bu hafta)</span>}
          </p>
          <IconButton icon="chevronRight" label="Sonraki hafta" disabled={week >= thisWeek} onClick={() => setWeek(addDays(week, 7))} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={autoPub} onChange={(e) => saveAutoPub(e.target.checked)} />
          Yeni raporlar veliye kendiliğinden yayınlansın
        </label>
      </div>

      {error && <ErrorBox>{error}</ErrorBox>}
      {!rows ? (
        <PageLoader />
      ) : rows.length === 0 ? (
        !error && (
          <Card>
            <EmptyState icon="chart" title="Bu hafta için rapor yok">
              Raporlar pazar akşamı kendiliğinden oluşur. Beklemeden görmek için &quot;şimdi oluştur&quot;a basın.
            </EmptyState>
          </Card>
        )
      ) : (
        <ul className="grid gap-4 xl:grid-cols-2">
          {rows.map((r) => {
            const s = students.get(r.student_id)!;
            const p = r.private ?? {};
            return (
              <li key={r.id} className="card p-4 sm:p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <A to={{ v: "ogrenci", id: s.id }} className="text-[15px] font-semibold hover:text-primary">
                    {s.full_name}
                  </A>
                  <label className="no-print flex items-center gap-2 text-xs">
                    <input type="checkbox" className="h-4 w-4" checked={r.parent_published} onChange={(e) => patch(r, { parent_published: e.target.checked })} />
                    {r.parent_published ? <Badge tone="success">Veliye yayında</Badge> : <Badge>Veliye kapalı</Badge>}
                  </label>
                </div>
                <WeeklyReportBody d={r.data} audience="counselor" />
                {(p.sleep != null || p.anxiety != null) && (
                  <p className="mt-3 rounded-xl border border-dashed border-line px-3 py-2 text-xs text-muted">
                    <b className="font-semibold text-fg">Yalnızca siz görürsünüz:</b> uyku {p.sleep != null ? `${fmtNum(p.sleep)} sa` : "—"} · telefon {p.phone != null ? minutesToText(p.phone) : "—"} · kaygı{" "}
                    {p.anxiety != null ? `${fmtNum(p.anxiety)}/5` : "—"} · motivasyon {p.motivation != null ? `${fmtNum(p.motivation)}/5` : "—"} · erteleme {p.procrastinated ?? 0} gün
                  </p>
                )}
                <NoteBox value={r.counselor_note} onSave={(v) => patch(r, { counselor_note: v })} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function NoteBox({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  const dirty = v !== value;
  return (
    <div className="no-print mt-3">
      <textarea className="field min-h-16 text-sm" maxLength={1500} value={v} onChange={(e) => setV(e.target.value)} placeholder="Veliye not (isteğe bağlı): bu haftayla ilgili kısa değerlendirmeniz" />
      {dirty && (
        <div className={cx("mt-1.5 flex justify-end")}>
          <Button size="sm" onClick={() => onSave(v.trim())}>
            Notu kaydet
          </Button>
        </div>
      )}
    </div>
  );
}
