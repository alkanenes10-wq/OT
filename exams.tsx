"use client";
// Deneme analizi: kazanım karnesi (PDF) yükleme, netler ve konu bazlı yanlış/boş girişi.
// Girilen yanlış/boş sayıları "Otomatik program oluştur" tarafından kullanılır.

import { useEffect, useMemo, useState } from "react";
import { COURSES, type Section } from "./curriculum";
import { analyzeKarne, type KarneReport } from "./actions";
import { accessToken, errorText, fetchAnalyses, sb, useRoute } from "./db";
import { GeneratorModal } from "./plan";
import { ALL_TOPICS } from "./curriculum";
import { EXAM_SECTIONS, fmtNum, formatLong, formatTR, net, todayISO, type ExamAnalysis } from "./lib";
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Icon, IconButton, PageLoader, Segmented, Spinner, confirmAction, cx, useToast } from "./ui";

type Draft = Omit<ExamAnalysis, "id" | "created_at" | "student_id"> & { id?: string };

const empty = (): Draft => ({ exam_date: todayISO(), title: "", exam_type: "TYT", nets: {}, results: [], file_path: null, notes: "" });

function sectionsFor(type: ExamAnalysis["exam_type"]): Section[] {
  const all = COURSES.flatMap((c) => c.sections);
  if (type === "BRANS") return all;
  return all.filter((s) => s.exam === type || s.id === "geometri");
}

const totalNet = (a: Pick<ExamAnalysis, "nets">) => {
  const v = Object.values(a.nets ?? {}).map((x) => net(x.d, x.y));
  return v.some((x) => x != null) ? v.reduce<number>((s, x) => s + (x ?? 0), 0) : null;
};

export async function openKarne(path: string) {
  const { data, error } = await sb().storage.from("karneler").createSignedUrl(path, 60 * 60);
  if (error || !data?.signedUrl) throw error ?? new Error("Dosya açılamadı");
  window.open(data.signedUrl, "_blank", "noopener");
}

export function ExamAnalyses({ studentId }: { studentId: string }) {
  const toast = useToast();
  const { go } = useRoute();
  const [list, setList] = useState<ExamAnalysis[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<"idle" | "upload" | "analyze">("idle");
  const [failedPath, setFailedPath] = useState<string | null>(null);
  const [genFor, setGenFor] = useState<string | null>(null);
  const [report, setReport] = useState<KarneReport | null>(null);

  async function uploadAndAnalyze(file: File) {
    setError(null);
    setFailedPath(null);
    setReport(null);
    if (file.size > 10 * 1024 * 1024) return setError("Dosya en fazla 10 MB olabilir.");
    setStage("upload");
    const safe = file.name.normalize("NFKD").replace(/[^\w.-]+/g, "_").slice(-60);
    const path = `${studentId}/${Date.now()}-${safe}`;
    const up = await sb().storage.from("karneler").upload(path, file, { contentType: file.type || "application/pdf" });
    if (up.error) {
      setStage("idle");
      return setError(errorText(up.error));
    }
    setStage("analyze");
    try {
      const r = await analyzeKarne(await accessToken(), studentId, path);
      if (!r.ok) throw new Error(r.error);
      const k = r.result;
      const { data, error } = await sb()
        .from("exam_analyses")
        .insert({
          student_id: studentId,
          title: k.title,
          exam_date: k.exam_date ?? todayISO(),
          exam_type: k.exam_type,
          nets: k.nets,
          results: k.results,
          notes: k.notes,
          file_path: path,
        })
        .select("id")
        .single();
      if (error) throw error;
      setReport(r.report);
      toast.show(`Karne okundu: ${k.results.length} eksik konu bulundu`);
      await load();
      setGenFor((data as { id: string }).id);
    } catch (e) {
      setFailedPath(path);
      setError(errorText(e));
    } finally {
      setStage("idle");
    }
  }

  const load = () =>
    fetchAnalyses(studentId)
      .then(setList)
      .catch((e) => setError(errorText(e)));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  async function remove(a: ExamAnalysis) {
    if (!confirmAction(`"${a.title}" analizi silinsin mi?`)) return;
    if (a.file_path) await sb().storage.from("karneler").remove([a.file_path]);
    const { error } = await sb().from("exam_analyses").delete().eq("id", a.id);
    if (error) return toast.show(errorText(error), "danger");
    toast.show("Silindi");
    load();
  }

  if (draft) {
    return (
      <AnalysisEditor
        studentId={studentId}
        initial={draft}
        onCancel={() => setDraft(null)}
        onSaved={() => {
          setDraft(null);
          load();
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <label
        className={cx(
          "card flex cursor-pointer flex-col items-center gap-2 border-2 border-dashed p-6 text-center transition hover:border-primary hover:bg-primary-soft/40",
          stage !== "idle" && "pointer-events-none opacity-80",
        )}
      >
        <input
          type="file"
          accept="application/pdf"
          className="sr-only"
          disabled={stage !== "idle"}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) uploadAndAnalyze(f);
          }}
        />
        {stage === "idle" ? (
          <>
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-fg">
              <Icon name="download" size={24} className="rotate-180" />
            </span>
            <span className="text-base font-semibold">Kazanım karnesini yükle</span>
            <span className="max-w-md text-sm text-muted">
              Yayınevinin verdiği PDF. Karne kodla okunur (yapay zekâ yok), yanlış ve boş bırakılan konular bulunur, ardından bu eksiklere göre haftalık program oluşturulur. Fotoğraf karneler için elle giriş kullan.
            </span>
          </>
        ) : (
          <>
            <Spinner size={32} />
            <span className="text-base font-semibold">{stage === "upload" ? "Yükleniyor…" : "Karne okunuyor…"}</span>
            <span className="text-sm text-muted">{stage === "analyze" ? "Birkaç saniye sürer." : ""}</span>
          </>
        )}
      </label>
      {report && (
        <details className="card p-3 text-sm">
          <summary className="cursor-pointer text-muted">
            Okuma raporu: {report.lines} satır okundu, {report.matched} konu satırı eşleşti
            {report.unmatched.length ? `, ${report.unmatched.length} satır eşleşmedi` : ""}
          </summary>
          {report.unmatched.length > 0 ? (
            <div className="mt-2 space-y-1">
              <p className="text-muted">Aşağıdaki satırlar hiçbir konuya eşlenemedi. Önemliyse analizi açıp elle ekleyebilirsin:</p>
              <ul className="list-disc pl-5">
                {report.unmatched.map((u, i) => (
                  <li key={i} className="break-words">{u}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-2 text-muted">Tüm konu satırları eşleşti.</p>
          )}
        </details>
      )}
      {failedPath && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Karne kaydedildi ama otomatik okunamadı.</span>
          <Button size="sm" variant="secondary" onClick={() => setDraft({ ...empty(), file_path: failedPath })}>
            Sonuçları elle gir
          </Button>
        </div>
      )}
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" icon="plus" onClick={() => setDraft(empty())}>
          Karnesiz elle giriş
        </Button>
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}
      {!list ? (
        <PageLoader />
      ) : list.length === 0 ? (
        <Card>
          <EmptyState icon="chart" title="Henüz deneme analizi yok">
            Yukarıdan ilk kazanım karnesini yükle.
          </EmptyState>
        </Card>
      ) : (
        <ul className="space-y-3">
          {list.map((a, i) => {
            const n = totalNet(a);
            const wrong = a.results.reduce((s, r) => s + (r.wrong ?? 0), 0);
            const emptyN = a.results.reduce((s, r) => s + (r.empty ?? 0), 0);
            return (
              <li key={a.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {a.title} <Badge tone="primary">{a.exam_type === "BRANS" ? "Branş" : a.exam_type}</Badge> {i === 0 && <Badge tone="success">Son</Badge>}
                    </p>
                    <p className="text-sm text-muted">{formatLong(a.exam_date)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {a.file_path && (
                      <Button
                        variant="secondary"
                        size="sm"
                        icon="download"
                        onClick={() => openKarne(a.file_path as string).catch((e) => toast.show(errorText(e), "danger"))}
                      >
                        Karne
                      </Button>
                    )}
                    <IconButton icon="edit" label="Düzenle" onClick={() => setDraft({ ...a })} />
                    <IconButton icon="trash" label="Sil" onClick={() => remove(a)} />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  <span>
                    Toplam net: <b className="tabular">{n == null ? "—" : fmtNum(n, 2)}</b>
                  </span>
                  {Object.entries(a.nets ?? {}).map(([k, v]) => (
                    <span key={k} className="text-muted">
                      {k}: <span className="tabular text-fg">{fmtNum(net(v.d, v.y), 2)}</span>
                    </span>
                  ))}
                </div>
                <p className="mt-1 text-sm text-muted">
                  {a.results.length} konuda {wrong} yanlış, {emptyN} boş
                </p>
                {a.notes && <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">{a.notes}</p>}
                {a.results.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {[...a.results]
                      .sort((x, y) => (y.wrong ?? 0) + (y.empty ?? 0) - (x.wrong ?? 0) - (x.empty ?? 0))
                      .slice(0, 8)
                      .map((r) => (
                        <Badge key={r.topic_id} tone="danger">
                          {topicName.get(r.topic_id) ?? r.topic_id} · {(r.wrong ?? 0) + (r.empty ?? 0)}
                        </Badge>
                      ))}
                  </div>
                )}
                <div className="mt-3">
                  <Button variant={i === 0 ? "primary" : "soft"} size="sm" icon="calendar" onClick={() => setGenFor(a.id)}>
                    Bu analizle program oluştur
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {genFor && (
        <GeneratorModal
          studentId={studentId}
          initialAnalysisId={genFor}
          onClose={() => setGenFor(null)}
          onCreated={() => {
            setGenFor(null);
            go({ v: "ogrenci", id: studentId, t: "program" }, { replace: true });
          }}
        />
      )}
    </div>
  );
}

const topicName = new Map(ALL_TOPICS.map((t) => [t.id, t.name]));

/* ------------------------------------------------------------------ */
function AnalysisEditor({ studentId, initial, onCancel, onSaved }: { studentId: string; initial: Draft; onCancel: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [d, setD] = useState<Draft>(initial);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sections = useMemo(() => sectionsFor(d.exam_type), [d.exam_type]);
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? "");
  useEffect(() => {
    if (!sections.some((s) => s.id === sectionId)) setSectionId(sections[0]?.id ?? "");
  }, [sections, sectionId]);

  const res = new Map(d.results.map((r) => [r.topic_id, r]));
  const setRes = (topic_id: string, k: "wrong" | "empty", v: string) => {
    const n = v === "" ? 0 : Math.min(99, Number(v.replace(/[^\d]/g, "")) || 0);
    const cur = res.get(topic_id) ?? { topic_id, wrong: 0, empty: 0 };
    const next = { ...cur, [k]: n };
    const others = d.results.filter((r) => r.topic_id !== topic_id);
    setD({ ...d, results: (next.wrong ?? 0) + (next.empty ?? 0) > 0 ? [...others, next] : others });
  };
  const setNet = (name: string, k: "d" | "y", v: string) => {
    const n = v === "" ? null : Math.min(200, Number(v.replace(/[^\d]/g, "")) || 0);
    setD({ ...d, nets: { ...d.nets, [name]: { ...(d.nets[name] ?? {}), [k]: n } } });
  };
  const countIn = (s: Section) => s.topics.filter((t) => res.has(t.id)).length;
  const section = sections.find((s) => s.id === sectionId);
  const tn = totalNet(d);

  async function save() {
    setError(null);
    if (!d.title.trim()) return setError("Deneme adı gerekli (ör. 3D TYT Deneme 4).");
    if (file && file.size > 10 * 1024 * 1024) return setError("Dosya en fazla 10 MB olabilir.");
    setBusy(true);
    try {
      let file_path = d.file_path;
      if (file) {
        const safe = file.name.normalize("NFKD").replace(/[^\w.-]+/g, "_").slice(-60);
        const path = `${studentId}/${Date.now()}-${safe}`;
        const up = await sb().storage.from("karneler").upload(path, file, { contentType: file.type || "application/pdf", upsert: false });
        if (up.error) throw up.error;
        if (d.file_path) await sb().storage.from("karneler").remove([d.file_path]);
        file_path = path;
      }
      const cleanNets = Object.fromEntries(Object.entries(d.nets).filter(([, v]) => v.d != null || v.y != null));
      const payload = {
        student_id: studentId,
        exam_date: d.exam_date,
        title: d.title.trim().slice(0, 120),
        exam_type: d.exam_type,
        nets: cleanNets,
        results: d.results,
        file_path,
        notes: d.notes.slice(0, 2000),
      };
      const q = d.id ? sb().from("exam_analyses").update(payload).eq("id", d.id) : sb().from("exam_analyses").insert(payload);
      const { error } = await q;
      if (error) throw error;
      toast.show("Deneme analizi kaydedildi");
      onSaved();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <button onClick={onCancel} className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
          <Icon name="chevronLeft" size={16} /> Denemeler
        </button>
        <Button icon="check" onClick={save} loading={busy}>
          Kaydet
        </Button>
      </div>

      <Card title={d.id ? "Denemeyi düzenle" : "Yeni deneme analizi"}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Deneme adı" htmlFor="ex-title">
            <input id="ex-title" className="field" value={d.title} maxLength={120} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="ör. 3D TYT Deneme 4" />
          </Field>
          <Field label="Tarih" htmlFor="ex-date">
            <input id="ex-date" type="date" className="field" value={d.exam_date} onChange={(e) => e.target.value && setD({ ...d, exam_date: e.target.value })} />
          </Field>
          <Field label="Tür">
            <Segmented
              value={d.exam_type}
              onChange={(v) => setD({ ...d, exam_type: v, nets: {} })}
              ariaLabel="Deneme türü"
              options={[
                { value: "TYT", label: "TYT" },
                { value: "AYT", label: "AYT" },
                { value: "BRANS", label: "Branş" },
              ]}
            />
          </Field>
        </div>
        <div className="mt-4 rounded-xl border border-dashed border-line p-4">
          <p className="text-sm font-medium">Kazanım karnesi (PDF veya fotoğraf, en fazla 10 MB)</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              type="file"
              accept="application/pdf,image/png,image/jpeg"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary-soft file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-ink"
            />
            {d.file_path && !file && (
              <Button variant="secondary" size="sm" icon="download" onClick={() => openKarne(d.file_path as string).catch((e) => toast.show(errorText(e), "danger"))}>
                Yüklü karneyi aç
              </Button>
            )}
          </div>
          <p className="mt-2 text-xs text-muted">Karneyi yanda açıp aşağıdaki tabloya konu konu yanlış ve boş sayılarını gir.</p>
        </div>
      </Card>

      <Card title="Netler" subtitle={tn != null ? `Toplam net: ${fmtNum(tn, 2)}` : "Doğru ve yanlış sayısını gir, net otomatik hesaplanır"}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-1.5 font-medium">Bölüm</th>
                <th className="py-1.5 font-medium">Soru</th>
                <th className="py-1.5 font-medium">Doğru</th>
                <th className="py-1.5 font-medium">Yanlış</th>
                <th className="py-1.5 font-medium">Boş</th>
                <th className="py-1.5 font-medium">Net</th>
              </tr>
            </thead>
            <tbody>
              {EXAM_SECTIONS[d.exam_type].map((s) => {
                const v = d.nets[s.name] ?? {};
                const b = v.d != null || v.y != null ? Math.max(0, s.count - (v.d ?? 0) - (v.y ?? 0)) : null;
                return (
                  <tr key={s.name} className="border-t border-line">
                    <td className="py-1.5 font-medium">{s.name}</td>
                    <td className="py-1.5 tabular text-muted">{s.count}</td>
                    {(["d", "y"] as const).map((k) => (
                      <td key={k} className="py-1.5 pr-2">
                        <input
                          inputMode="numeric"
                          aria-label={`${s.name} ${k === "d" ? "doğru" : "yanlış"}`}
                          className="field h-9 w-16 px-2 py-1 text-center"
                          value={v[k] ?? ""}
                          onChange={(e) => setNet(s.name, k, e.target.value)}
                        />
                      </td>
                    ))}
                    <td className="py-1.5 tabular text-muted">{b ?? "—"}</td>
                    <td className="py-1.5 font-semibold tabular">{fmtNum(net(v.d, v.y), 2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Konu analizi" subtitle={`${d.results.length} konuda yanlış/boş girildi`}>
        <div className="no-scrollbar -mx-4 mb-3 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
          <div className="flex gap-1.5">
            {sections.map((s) => {
              const c = countIn(s);
              return (
                <button
                  key={s.id}
                  onClick={() => setSectionId(s.id)}
                  aria-pressed={s.id === sectionId}
                  className={cx(
                    "shrink-0 rounded-lg border px-2.5 py-1.5 text-sm font-medium whitespace-nowrap",
                    s.id === sectionId ? "border-primary bg-primary text-primary-fg" : "border-line bg-surface hover:bg-surface-2",
                  )}
                >
                  {s.title}
                  {c > 0 && <span className={cx("ml-1.5 rounded-full px-1.5 text-xs", s.id === sectionId ? "bg-white/25" : "bg-danger-soft text-danger")}>{c}</span>}
                </button>
              );
            })}
          </div>
        </div>
        {section && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-1.5 font-medium">Konu</th>
                <th className="w-20 py-1.5 text-center font-medium">Yanlış</th>
                <th className="w-20 py-1.5 text-center font-medium">Boş</th>
              </tr>
            </thead>
            <tbody>
              {section.topics.map((t) => {
                const r = res.get(t.id);
                return (
                  <tr key={t.id} className={cx("border-t border-line", r && "bg-danger-soft/40")}>
                    <td className="py-1.5 pr-2">
                      {t.name}
                      {t.q && <span className="ml-1 text-xs text-faint">({t.q} soru)</span>}
                    </td>
                    {(["wrong", "empty"] as const).map((k) => (
                      <td key={k} className="py-1 text-center">
                        <input
                          inputMode="numeric"
                          aria-label={`${t.name} ${k === "wrong" ? "yanlış" : "boş"}`}
                          className="field h-9 w-14 px-1 py-1 text-center"
                          value={r?.[k] ? String(r[k]) : ""}
                          onChange={(e) => setRes(t.id, k, e.target.value)}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Not">
        <textarea
          className="field min-h-20"
          maxLength={2000}
          value={d.notes}
          onChange={(e) => setD({ ...d, notes: e.target.value })}
          placeholder="ör. Süre yetmedi, son 10 soruyu boş bıraktı"
        />
      </Card>

      {error && <ErrorBox>{error}</ErrorBox>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Vazgeç
        </Button>
        <Button icon="check" onClick={save} loading={busy}>
          Kaydet
        </Button>
      </div>
    </div>
  );
}
