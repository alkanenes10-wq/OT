"use client";
// Konu takibi (Excel şablonundaki ders sayfaları).

import { useEffect, useMemo, useState } from "react";
import { COURSES, courseTopicIds, isCompleted, STATUS_LABELS, STATUS_ORDER, type Topic, type TopicStatus } from "./curriculum";
import { errorText, fetchTopicProgress, sb } from "./db";
import { downloadCSV, formatTR, pct, todayISO, type TopicProgress } from "./lib";
import { Badge, Button, cx, ErrorBox, Icon, PageLoader, ProgressBar, Segmented, useToast } from "./ui";

const STATUS_STYLE: Record<TopicStatus, string> = {
  not_started: "bg-surface-2 text-muted border-line",
  in_progress: "bg-warning-soft text-warning border-transparent",
  done: "bg-success-soft text-success border-transparent",
  reviewed: "bg-primary-soft text-primary-ink border-transparent",
};

export function TopicTracker({ studentId, studentName }: { studentId: string; studentName?: string }) {
  const toast = useToast();
  const [progress, setProgress] = useState<Record<string, TopicProgress>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [courseId, setCourseId] = useState(COURSES[0].id);
  const [filter, setFilter] = useState<"all" | "open">("all");
  const [openTopic, setOpenTopic] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchTopicProgress(studentId)
      .then((rows) => active && setProgress(Object.fromEntries(rows.map((r) => [r.topic_id, r]))))
      .catch((e) => active && setError(errorText(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [studentId]);

  const course = COURSES.find((c) => c.id === courseId) ?? COURSES[0];

  const stats = useMemo(() => {
    const perCourse = COURSES.map((c) => {
      const ids = courseTopicIds(c);
      const done = ids.filter((id) => isCompleted(progress[id]?.status)).length;
      return { id: c.id, total: ids.length, done };
    });
    const total = perCourse.reduce((s, c) => s + c.total, 0);
    const done = perCourse.reduce((s, c) => s + c.done, 0);
    return { perCourse, total, done };
  }, [progress]);

  async function update(topic: Topic, patch: Partial<Pick<TopicProgress, "status" | "note">>) {
    const prev = progress[topic.id];
    const next: TopicProgress = {
      student_id: studentId,
      topic_id: topic.id,
      status: patch.status ?? prev?.status ?? "not_started",
      note: patch.note ?? prev?.note ?? "",
      updated_by: prev?.updated_by ?? null,
      updated_at: new Date().toISOString(),
    };
    setProgress((p) => ({ ...p, [topic.id]: next }));
    const { error } = await sb()
      .from("topic_progress")
      .upsert({ student_id: studentId, topic_id: topic.id, status: next.status, note: next.note.slice(0, 1000) }, { onConflict: "student_id,topic_id" });
    if (error) {
      setProgress((p) => {
        const copy = { ...p };
        if (prev) copy[topic.id] = prev;
        else delete copy[topic.id];
        return copy;
      });
      toast.show(errorText(error), "danger");
    }
  }

  function exportCsv() {
    const rows: (string | number | null)[][] = [["Ders", "Bölüm", "Konu Grubu", "Alt Başlıklar", "Soru Sayısı", "Durum", "Not", "Son güncelleme"]];
    for (const c of COURSES)
      for (const s of c.sections)
        for (const t of s.topics) {
          const p = progress[t.id];
          rows.push([
            c.name,
            s.title,
            t.name,
            t.sub,
            t.q ?? "",
            STATUS_LABELS[p?.status ?? "not_started"],
            p?.note ?? "",
            p?.updated_at ? formatTR(p.updated_at.slice(0, 10)) : "",
          ]);
        }
    const name = (studentName ?? "ogrenci").replace(/[^\p{L}\p{N}]+/gu, "_");
    downloadCSV(`konu_takibi_${name}_${todayISO()}.csv`, rows);
  }

  if (loading) return <PageLoader />;

  const courseStat = stats.perCourse.find((c) => c.id === course.id)!;

  return (
    <div className="space-y-4">
      {error && <ErrorBox>{error}</ErrorBox>}

      <div className="card p-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-sm text-muted">Genel ilerleme</p>
            <p className="display text-[26px] tabular">
              %{pct(stats.done, stats.total) ?? 0}
              <span className="ml-2 text-sm font-normal text-muted">
                {stats.done} / {stats.total} konu
              </span>
            </p>
          </div>
          <Button variant="secondary" size="sm" icon="download" onClick={exportCsv}>
            CSV
          </Button>
        </div>
        <div className="mt-3">
          <ProgressBar value={pct(stats.done, stats.total)} tone="success" label="Genel konu ilerlemesi" />
        </div>
      </div>

      {/* Ders seçici */}
      <div className="no-scrollbar -mx-4 overflow-x-auto px-4">
        <div className="flex gap-2">
          {COURSES.map((c) => {
            const st = stats.perCourse.find((x) => x.id === c.id)!;
            const active = c.id === course.id;
            return (
              <button
                key={c.id}
                onClick={() => {
                  setCourseId(c.id);
                  setOpenTopic(null);
                }}
                aria-pressed={active}
                className={cx(
                  "shrink-0 rounded-xl border px-3 py-2 text-left transition",
                  active ? "border-primary bg-primary text-primary-fg" : "border-line bg-surface hover:bg-surface-2",
                )}
              >
                <span className="block text-sm font-semibold whitespace-nowrap">{c.short}</span>
                <span className={cx("block text-xs tabular", active ? "opacity-90" : "text-muted")}>
                  %{pct(st.done, st.total) ?? 0} · {st.done}/{st.total}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{course.name}</h2>
        <div className="w-full sm:w-52">
          <Segmented
            size="sm"
            ariaLabel="Filtre"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "Tümü" },
              { value: "open", label: "Bitmeyenler" },
            ]}
          />
        </div>
      </div>
      <ProgressBar value={pct(courseStat.done, courseStat.total)} tone="success" label={`${course.name} ilerlemesi`} />

      {course.sections.map((section) => {
        const topics = section.topics.filter((t) => filter === "all" || !isCompleted(progress[t.id]?.status));
        const done = section.topics.filter((t) => isCompleted(progress[t.id]?.status)).length;
        return (
          <section key={section.id} className="card overflow-hidden">
            <header className="flex items-center justify-between gap-3 border-b border-line bg-surface-2 px-4 py-2.5">
              <h3 className="text-sm font-semibold">
                {section.title} <Badge tone={section.exam === "TYT" ? "primary" : "neutral"}>{section.exam}</Badge>
              </h3>
              <span className="text-xs text-muted tabular">
                {done}/{section.topics.length}
              </span>
            </header>
            {topics.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted">Bu bölümdeki tüm konular bitti.</p>
            ) : (
              <ul className="divide-y divide-line">
                {topics.map((t) => {
                  const p = progress[t.id];
                  const status = p?.status ?? "not_started";
                  const isOpen = openTopic === t.id;
                  return (
                    <li key={t.id}>
                      <div className="flex items-center gap-2 px-4 py-2.5">
                        <button
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          onClick={() => setOpenTopic(isOpen ? null : t.id)}
                          aria-expanded={isOpen}
                        >
                          <Icon name="chevronRight" size={16} className={cx("shrink-0 text-faint transition", isOpen && "rotate-90")} />
                          <span className="min-w-0">
                            <span className={cx("block text-[15px] leading-snug", isCompleted(status) && "text-muted")}>{t.name}</span>
                            <span className="block text-xs text-faint">
                              {t.q ? `Soru: ${t.q}${t.shared ? " (ortak)" : ""}` : "Soru sayısı: —"}
                              {p?.note ? " · not var" : ""}
                            </span>
                          </span>
                        </button>
                        <select
                          aria-label={`${t.name} durumu`}
                          value={status}
                          onChange={(e) => update(t, { status: e.target.value as TopicStatus })}
                          className={cx("h-9 shrink-0 rounded-lg border px-2 text-sm font-medium", STATUS_STYLE[status])}
                        >
                          {STATUS_ORDER.map((s) => (
                            <option key={s} value={s}>
                              {STATUS_LABELS[s]}
                            </option>
                          ))}
                        </select>
                      </div>
                      {isOpen && <TopicDetail topic={t} note={p?.note ?? ""} onSaveNote={(note) => update(t, { note })} />}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function TopicDetail({ topic, note, onSaveNote }: { topic: Topic; note: string; onSaveNote: (n: string) => Promise<void> }) {
  const [value, setValue] = useState(note);
  const [saving, setSaving] = useState(false);
  return (
    <div className="space-y-3 bg-surface-2 px-4 py-3 text-sm">
      {topic.sub && (
        <div>
          <p className="text-xs font-medium text-muted">Alt başlıklar</p>
          <p className="mt-0.5">{topic.sub}</p>
        </div>
      )}
      {topic.desc && (
        <div>
          <p className="text-xs font-medium text-muted">Açıklama / soru türü</p>
          <p className="mt-0.5">{topic.desc}</p>
        </div>
      )}
      <div>
        <label className="text-xs font-medium text-muted" htmlFor={`note-${topic.id}`}>
          Notlar
        </label>
        <textarea
          id={`note-${topic.id}`}
          className="field mt-1 min-h-16 bg-surface"
          value={value}
          maxLength={1000}
          onChange={(e) => setValue(e.target.value)}
          placeholder="ör. Kaynak kitap bitti, çıkmış sorular kaldı"
        />
        <div className="mt-2 flex justify-end">
          <Button
            size="sm"
            variant="secondary"
            loading={saving}
            disabled={value === note}
            onClick={async () => {
              setSaving(true);
              await onSaveNote(value);
              setSaving(false);
            }}
          >
            Notu kaydet
          </Button>
        </div>
      </div>
    </div>
  );
}
