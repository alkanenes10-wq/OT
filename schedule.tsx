"use client";
// Öğrencinin haftalık çalışma saatleri. Danışman girer, öğrenci yalnızca görür.
// Otomatik program bu saatleri 40 dk'lık (ayarlanabilir) bloklara böler.

import { useEffect, useState } from "react";
import { errorText, fetchPlans, fetchSchedule, sb, useRoute } from "./db";
import { WEEKDAYS, minutesToText, rangeMinutes, timeToMinutes, type StudySchedule, type TimeRange, type WeeklyPlan } from "./lib";
import { GeneratorModal } from "./plan";
import { sliceDay } from "./planner";
import { Button, Card, ErrorBox, IconButton, PageLoader, Segmented, cx, useToast } from "./ui";

const PRESETS: { label: string; r: TimeRange }[] = [
  { label: "Okul sonrası 17:00–19:30", r: { s: "17:00", e: "19:30" } },
  { label: "Akşam 20:30–22:30", r: { s: "20:30", e: "22:30" } },
  { label: "Sabah 10:00–13:00", r: { s: "10:00", e: "13:00" } },
  { label: "Öğleden sonra 14:30–17:30", r: { s: "14:30", e: "17:30" } },
];

/** Aralıkların geçerliliğini kontrol eder; hata metni veya null */
export function validateSlots(slots: TimeRange[][]): string | null {
  for (let d = 0; d < 7; d++) {
    const list = slots[d]
      .map((r) => ({ s: timeToMinutes(r.s), e: timeToMinutes(r.e), raw: r }))
      .sort((a, b) => (a.s ?? 0) - (b.s ?? 0));
    for (const r of list) {
      if (r.s == null || r.e == null) return `${WEEKDAYS[d]}: saatleri SS:DD biçiminde girin.`;
      if (r.e <= r.s) return `${WEEKDAYS[d]}: ${r.raw.s}–${r.raw.e} aralığında bitiş başlangıçtan sonra olmalı.`;
    }
    for (let i = 1; i < list.length; i++) {
      if ((list[i].s ?? 0) < (list[i - 1].e ?? 0)) return `${WEEKDAYS[d]}: aralıklar çakışıyor.`;
    }
  }
  return null;
}

export function blockCount(ranges: TimeRange[], s: Pick<StudySchedule, "block_min" | "break_min">) {
  return sliceDay(ranges, s.block_min, s.break_min, 0).length;
}

export function ScheduleSection({ studentId, editable }: { studentId: string; editable: boolean }) {
  const toast = useToast();
  const { go } = useRoute();
  const [saved, setSaved] = useState<StudySchedule | null>(null);
  const [draft, setDraft] = useState<StudySchedule | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [plans, setPlans] = useState<WeeklyPlan[] | null>(null);
  const [genOpen, setGenOpen] = useState(false);

  useEffect(() => {
    fetchSchedule(studentId)
      .then((s) => {
        setSaved(s);
        setDraft(s);
      })
      .catch((e) => setError(errorText(e)));
  }, [studentId]);

  if (!draft || !saved) return error ? <ErrorBox>{error}</ErrorBox> : <PageLoader />;

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const setDay = (d: number, list: TimeRange[]) => setDraft((x) => (x ? { ...x, slots: x.slots.map((r, i) => (i === d ? list : r)) } : x));
  const weekMin = draft.slots.reduce((s, r) => s + rangeMinutes(r), 0);
  const weekBlocks = draft.slots.reduce((s, r) => s + blockCount(r, draft), 0);
  const empty = weekMin === 0;

  async function save() {
    if (!draft) return;
    setError(null);
    const v = validateSlots(draft.slots);
    if (v) return setError(v);
    setBusy(true);
    const clean = { ...draft, slots: draft.slots.map((r) => [...r].sort((a, b) => a.s.localeCompare(b.s))) };
    const { data, error } = await sb()
      .from("study_schedules")
      .upsert({ student_id: studentId, slots: clean.slots, block_min: clean.block_min, break_min: clean.break_min })
      .select("*")
      .single();
    setBusy(false);
    if (error) return setError(errorText(error));
    const s = { ...clean, ...(data as StudySchedule), slots: clean.slots };
    setSaved(s);
    setDraft(s);
    toast.show("Çalışma saatleri kaydedildi");
  }

  async function openGenerator() {
    try {
      setPlans(await fetchPlans(studentId));
      setGenOpen(true);
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <div className="space-y-4">
      <Card
        title="Çalışma saatleri"
        subtitle={
          editable
            ? "Öğrencinin her gün çalışabileceği saat aralıklarını gir. Otomatik program bu saatleri ders bloklarına böler."
            : "Danışmanının belirlediği çalışma saatlerin. Haftalık program bu saatlere göre hazırlanır."
        }
      >
        <div className="divide-y divide-line">
          {draft.slots.map((ranges, d) => {
            const mins = rangeMinutes(ranges);
            const blocks = blockCount(ranges, draft);
            return (
              <div key={d} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start">
                <div className="flex w-full items-center justify-between sm:w-32 sm:flex-col sm:items-start sm:pt-1.5">
                  <span className="text-sm font-semibold">{WEEKDAYS[d]}</span>
                  <span className={cx("text-xs tabular", mins ? "text-muted" : "text-faint")}>
                    {mins ? `${minutesToText(mins)} · ${blocks} blok` : "Çalışma yok"}
                  </span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  {ranges.length === 0 && !editable && <span className="pt-1.5 text-sm text-faint">—</span>}
                  {ranges.map((r, i) =>
                    editable ? (
                      <div key={i} className="flex items-center gap-1.5">
                        <input
                          type="time"
                          aria-label={`${WEEKDAYS[d]} başlangıç`}
                          className="field h-10 w-[8.5rem] px-2 py-1 tabular"
                          value={r.s}
                          onChange={(e) => setDay(d, ranges.map((x, j) => (j === i ? { ...x, s: e.target.value } : x)))}
                        />
                        <span className="text-muted">–</span>
                        <input
                          type="time"
                          aria-label={`${WEEKDAYS[d]} bitiş`}
                          className="field h-10 w-[8.5rem] px-2 py-1 tabular"
                          value={r.e}
                          onChange={(e) => setDay(d, ranges.map((x, j) => (j === i ? { ...x, e: e.target.value } : x)))}
                        />
                        <IconButton icon="x" label="Aralığı sil" className="h-9 w-9" onClick={() => setDay(d, ranges.filter((_, j) => j !== i))} />
                      </div>
                    ) : (
                      <span key={i} className="pt-1 text-sm tabular">
                        {r.s} – {r.e}
                      </span>
                    ),
                  )}
                  {editable && (
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        className="rounded-lg border border-dashed border-line px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary-soft"
                        onClick={() => {
                          const last = ranges[ranges.length - 1];
                          const start = last ? (timeToMinutes(last.e) ?? 1020) + 30 : 1020;
                          const hh = (m: number) => `${String(Math.min(23, Math.floor(m / 60))).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
                          setDay(d, [...ranges, { s: hh(start), e: hh(Math.min(start + 120, 23 * 60 + 59)) }]);
                        }}
                      >
                        + Aralık
                      </button>
                      {ranges.length === 0 &&
                        PRESETS.map((p) => (
                          <button
                            key={p.label}
                            type="button"
                            className="rounded-lg border border-line px-2.5 py-1 text-xs text-muted hover:bg-surface-2"
                            onClick={() => setDay(d, [p.r])}
                          >
                            {p.label}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {editable && (
          <div className="mt-2 flex flex-wrap gap-2 border-t border-line pt-3">
            <Button
              size="sm"
              variant="secondary"
              icon="copy"
              disabled={!draft.slots[0].length}
              onClick={() => setDraft((x) => (x ? { ...x, slots: x.slots.map((r, i) => (i >= 1 && i <= 4 ? x.slots[0].map((y) => ({ ...y })) : r)) } : x))}
            >
              Pazartesi’yi hafta içine kopyala
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon="trash"
              disabled={empty}
              onClick={() => setDraft((x) => (x ? { ...x, slots: [[], [], [], [], [], [], []] } : x))}
            >
              Temizle
            </Button>
          </div>
        )}
      </Card>

      <Card title="Blok ayarları" subtitle="Her çalışma bloğu bir ders/konudur. Bloklar bir sayısal, bir sözel sırasıyla dizilir.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 text-sm font-medium">Blok süresi</p>
            {editable ? (
              <Segmented
                size="sm"
                ariaLabel="Blok süresi"
                value={draft.block_min}
                onChange={(v) => setDraft((x) => (x ? { ...x, block_min: v } : x))}
                options={[30, 40, 50, 60].map((n) => ({ value: n, label: `${n} dk` }))}
              />
            ) : (
              <p className="text-sm">{draft.block_min} dk</p>
            )}
          </div>
          <div>
            <p className="mb-1.5 text-sm font-medium">Mola</p>
            {editable ? (
              <Segmented
                size="sm"
                ariaLabel="Mola"
                value={draft.break_min}
                onChange={(v) => setDraft((x) => (x ? { ...x, break_min: v } : x))}
                options={[5, 10, 15, 20].map((n) => ({ value: n, label: `${n} dk` }))}
              />
            ) : (
              <p className="text-sm">{draft.break_min} dk</p>
            )}
          </div>
        </div>
        <p className="mt-3 text-sm text-muted tabular">
          Haftalık toplam: <b className="text-fg">{minutesToText(weekMin)}</b> · {weekBlocks} ders bloğu
        </p>
      </Card>

      {error && <ErrorBox>{error}</ErrorBox>}

      {editable && (
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-end gap-2 rounded-2xl border border-line bg-surface/95 p-2 shadow-sm backdrop-blur">
          {dirty && <span className="mr-auto pl-2 text-xs text-warning">Kaydedilmemiş değişiklik var</span>}
          <Button variant={dirty ? "primary" : "secondary"} icon="check" onClick={save} loading={busy} disabled={!dirty}>
            Kaydet
          </Button>
          <Button variant={dirty ? "secondary" : "primary"} icon="target" onClick={openGenerator} disabled={dirty || empty}>
            Bu saatlere göre program oluştur
          </Button>
        </div>
      )}

      {genOpen && plans && (
        <GeneratorModal
          studentId={studentId}
          plans={plans}
          onClose={() => setGenOpen(false)}
          onCreated={() => {
            setGenOpen(false);
            go({ v: "ogrenci", id: studentId, t: "program" });
          }}
        />
      )}
    </div>
  );
}
