"use client";
// Kaynak (kitap) takibi: öğrencinin kullandığı soru bankaları / fasiküller, hangi testlerin bittiği
// ve kitap bazında doğru oranı. Programdaki bir göreve kaynak + test bağlanırsa görev tamamlanınca
// testler burada kendiliğinden "çözüldü" olur (guncelleme-8.sql içindeki tetikleyici).

import { useCallback, useEffect, useMemo, useState } from "react";
import { ALL_TOPICS, COURSES } from "./curriculum";
import { errorText, sb } from "./db";
import {
  RESOURCE_KINDS,
  SUBJECT_SECTIONS,
  fmtNum,
  formatShort,
  todayISO,
  type CatalogItem,
  type Resource,
  type ResourceKind,
  type ResourceProgress,
} from "./lib";
import { CatalogPicker, catalogTopicFor } from "./katalog";
import { Badge, Button, Card, EmptyState, ErrorBox, Field, IconButton, Modal, PageLoader, Segmented, confirmAction, cx, useToast } from "./ui";

const topicName = new Map(ALL_TOPICS.map((t) => [t.id, t.name]));
export const RESOURCE_SUBJECTS = Object.keys(SUBJECT_SECTIONS);
const kindLabel = (k: ResourceKind) => RESOURCE_KINDS.find((x) => x.value === k)?.label ?? k;

export function topicsForSubject(subject: string) {
  const secs = SUBJECT_SECTIONS[subject] ?? [];
  return COURSES.flatMap((c) => c.sections.filter((s) => secs.includes(s.id)).flatMap((s) => s.topics.map((t) => ({ id: t.id, name: `${s.exam} · ${t.name}` }))));
}

const missingTable = (e: unknown) => /resources|resource_progress|schema cache|does not exist/i.test(String((e as Error)?.message ?? e));
const SQL_HINT = "Kaynak takibi için Supabase'de guncelleme-8.sql çalıştırılmalı.";

export async function fetchResources(studentId: string): Promise<Resource[]> {
  const { data, error } = await sb().from("resources").select("*").eq("student_id", studentId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Resource[];
}

export const resourceLabel = (r: Pick<Resource, "title" | "publisher">) => (r.publisher ? `${r.publisher} · ${r.title}` : r.title);

function acc(c: number | null, w: number | null) {
  const t = (c ?? 0) + (w ?? 0);
  return t ? Math.round(((c ?? 0) / t) * 100) : null;
}
const accTone = (a: number | null) => (a == null ? "primary" : a >= 75 ? "success" : a >= 50 ? "warning" : "danger");
const toneCls: Record<string, string> = {
  primary: "bg-primary-soft text-primary-ink border-primary/30",
  success: "bg-success-soft text-success border-success/30",
  warning: "bg-warning-soft text-warning border-warning/30",
  danger: "bg-danger-soft text-danger border-danger/30",
};

/* ------------------------------------------------------------------ */
export function ResourceTracker({ studentId, audience = "counselor" }: { studentId: string; audience?: "student" | "counselor" }) {
  const [list, setList] = useState<Resource[] | null>(null);
  const [progress, setProgress] = useState<ResourceProgress[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"active" | "all">("active");

  const load = useCallback(async () => {
    try {
      const [rs, pr] = await Promise.all([
        fetchResources(studentId),
        sb().from("resource_progress").select("*").eq("student_id", studentId).then(({ data, error }) => {
          if (error) throw error;
          return (data ?? []) as ResourceProgress[];
        }),
      ]);
      setList(rs);
      setProgress(pr);
      setError(null);
    } catch (e) {
      setError(missingTable(e) ? SQL_HINT : errorText(e));
      setList([]);
    }
  }, [studentId]);
  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const m = new Map<string, { done: number; c: number; w: number; last: string | null }>();
    for (const p of progress) {
      const s = m.get(p.resource_id) ?? { done: 0, c: 0, w: 0, last: null };
      s.done++;
      s.c += p.correct ?? 0;
      s.w += p.wrong ?? 0;
      if (!s.last || p.done_on > s.last) s.last = p.done_on;
      m.set(p.resource_id, s);
    }
    return m;
  }, [progress]);

  if (!list) return <PageLoader />;
  const shown = filter === "active" ? list.filter((r) => r.status !== "done") : list;
  const open = list.find((r) => r.id === openId) ?? null;
  const totalDone = progress.length;
  const weekDone = progress.filter((p) => p.done_on >= isoDaysAgo(6)).length;

  return (
    <div className="space-y-4">
      <Card
        title="Kaynaklar"
        subtitle={
          list.length
            ? `${list.length} kaynak · toplam ${totalDone} test çözüldü · son 7 günde ${weekDone}`
            : audience === "student"
              ? "Kullandığın kitapları listeden seç; çözdüğün testleri işaretle."
              : "Öğrencinin kullandığı kitapları katalogdan seçin; test test ilerlemeyi izleyin."
        }
        action={
          <Button size="sm" icon="plus" onClick={() => setAdding(true)} disabled={Boolean(error)}>
            Kaynak ekle
          </Button>
        }
      >
        {error && <ErrorBox>{error}</ErrorBox>}
        {!error && list.length === 0 ? (
          <EmptyState icon="book" title="Henüz kaynak yok">
            {audience === "student"
              ? "“Kaynak ekle” ile kullandığın kitabı listeden seç. Aradığın kitap yoksa danışmanına söyle."
              : "“Kaynak ekle” ile katalogdan seçin. Kitap katalogda yoksa oradan tanımlayabilirsiniz (Ayarlar → Kaynak kataloğu). Programdaki görevlere kitap ve test bağlayınca, görev bitince test burada otomatik işaretlenir."}
          </EmptyState>
        ) : (
          !error && (
            <>
              {list.some((r) => r.status === "done") && (
                <div className="mb-3 w-48">
                  <Segmented
                    size="sm"
                    ariaLabel="Kaynak filtresi"
                    value={filter}
                    onChange={setFilter}
                    options={[
                      { value: "active", label: "Devam eden" },
                      { value: "all", label: "Tümü" },
                    ]}
                  />
                </div>
              )}
              <ul className="grid gap-3 sm:grid-cols-2">
                {shown.map((r) => {
                  const s = stats.get(r.id) ?? { done: 0, c: 0, w: 0, last: null };
                  const a = acc(s.c, s.w);
                  const pctDone = r.total_tests ? Math.min(100, Math.round((s.done / r.total_tests) * 100)) : null;
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => setOpenId(r.id)}
                        className="block w-full rounded-xl border border-line p-3 text-left transition hover:border-primary/40 hover:bg-surface-2/60"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-semibold">{r.title}</p>
                            <p className="truncate text-xs text-muted">
                              {[r.publisher, r.subject, kindLabel(r.kind)].filter(Boolean).join(" · ")}
                            </p>
                          </div>
                          {r.status === "done" ? <Badge tone="success">Bitti</Badge> : r.status === "paused" ? <Badge>Ara verildi</Badge> : null}
                        </div>
                        <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-surface-2">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${pctDone ?? 0}%` }} />
                        </div>
                        <div className="mt-1.5 flex justify-between text-xs text-muted tabular">
                          <span>
                            {s.done}
                            {r.total_tests ? ` / ${r.total_tests}` : ""} test{pctDone != null ? ` · %${pctDone}` : ""}
                          </span>
                          <span>
                            {a != null ? `doğru %${a}` : "D/Y girilmemiş"}
                            {s.last ? ` · ${formatShort(s.last)}` : ""}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )
        )}
      </Card>
      {adding && (
        <CatalogPicker
          studentId={studentId}
          existing={list}
          audience={audience}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            load();
          }}
        />
      )}
      {open && (
        <ResourceDetail
          resource={open}
          progress={progress.filter((p) => p.resource_id === open.id)}
          audience={audience}
          onClose={() => setOpenId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

function isoDaysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ */
function ResourceForm({ studentId, resource, onClose, onSaved }: { studentId: string; resource?: Resource; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState(resource?.title ?? "");
  const [publisher, setPublisher] = useState(resource?.publisher ?? "");
  const [subject, setSubject] = useState(resource?.subject ?? "TYT MATEMATİK");
  const [kind, setKind] = useState<ResourceKind>(resource?.kind ?? "soru_bankasi");
  const [total, setTotal] = useState(resource ? String(resource.total_tests || "") : "");
  const [status, setStatus] = useState<Resource["status"]>(resource?.status ?? "active");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!title.trim()) return toast.show("Kaynak adını yazın", "danger");
    setBusy(true);
    const row = {
      title: title.trim().slice(0, 120),
      publisher: publisher.trim().slice(0, 80),
      subject,
      kind,
      total_tests: Math.max(0, Math.min(1000, parseInt(total, 10) || 0)),
      status,
    };
    const { error } = resource
      ? await sb().from("resources").update(row).eq("id", resource.id)
      : await sb().from("resources").insert({ ...row, student_id: studentId });
    setBusy(false);
    if (error) return toast.show(errorText(error), "danger");
    toast.show(resource ? "Kaydedildi" : "Kaynak eklendi");
    onSaved();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={resource ? "Kaynağı düzenle" : "Kaynak ekle"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Vazgeç
          </Button>
          <Button icon="check" onClick={save} loading={busy}>
            Kaydet
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Kaynak adı" htmlFor="r-title">
          <input id="r-title" className="field" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="ör. TYT Matematik Soru Bankası" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Yayınevi" htmlFor="r-pub">
            <input id="r-pub" className="field" value={publisher} maxLength={80} onChange={(e) => setPublisher(e.target.value)} placeholder="ör. 3D" />
          </Field>
          <Field label="Test sayısı" htmlFor="r-total" hint="Bilmiyorsanız boş bırakın">
            <input id="r-total" className="field" inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value.replace(/\D/g, ""))} placeholder="ör. 64" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ders" htmlFor="r-subject">
            <select id="r-subject" className="field" value={subject} onChange={(e) => setSubject(e.target.value)}>
              {RESOURCE_SUBJECTS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Tür" htmlFor="r-kind">
            <select id="r-kind" className="field" value={kind} onChange={(e) => setKind(e.target.value as ResourceKind)}>
              {RESOURCE_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {resource && (
          <Field label="Durum">
            <Segmented
              size="sm"
              ariaLabel="Kaynak durumu"
              value={status}
              onChange={setStatus}
              options={[
                { value: "active", label: "Devam ediyor" },
                { value: "paused", label: "Ara verildi" },
                { value: "done", label: "Bitti" },
              ]}
            />
          </Field>
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
function ResourceDetail({
  resource,
  progress,
  audience,
  onClose,
  onChanged,
}: {
  resource: Resource;
  progress: ResourceProgress[];
  audience: "student" | "counselor";
  onClose: () => void;
  onChanged: () => void;
}) {
  const [catalog, setCatalog] = useState<CatalogItem | null>(null);
  useEffect(() => {
    if (!resource.catalog_id) return;
    sb()
      .from("resource_catalog")
      .select("*")
      .eq("id", resource.catalog_id)
      .maybeSingle()
      .then(({ data }) => setCatalog((data as CatalogItem | null) ?? null));
  }, [resource.catalog_id]);
  async function setStatus(status: Resource["status"]) {
    const { error } = await sb().from("resources").update({ status }).eq("id", resource.id);
    if (error) return toast.show(errorText(error), "danger");
    toast.show(status === "done" ? "Kaynak bitti olarak işaretlendi 🎉" : "Kaydedildi");
    onChanged();
  }
  const toast = useToast();
  const [edit, setEdit] = useState(false);
  const [testNo, setTestNo] = useState<number | null>(null);
  const byNo = useMemo(() => new Map(progress.map((p) => [p.test_no, p])), [progress]);
  const maxNo = Math.max(resource.total_tests, ...progress.map((p) => p.test_no), 0);
  const count = Math.max(maxNo, 20);
  const c = progress.reduce((s, p) => s + (p.correct ?? 0), 0);
  const w = progress.reduce((s, p) => s + (p.wrong ?? 0), 0);
  const a = acc(c, w);
  const nextNo = Array.from({ length: count + 1 }, (_, i) => i + 1).find((n) => !byNo.has(n)) ?? count + 1;

  // Konu bazında: bu kaynakta en düşük doğru oranlı konular
  const weakTopics = useMemo(() => {
    const m = new Map<string, { c: number; w: number; n: number }>();
    for (const p of progress) {
      if (!p.topic_id || p.correct == null) continue;
      const s = m.get(p.topic_id) ?? { c: 0, w: 0, n: 0 };
      s.c += p.correct ?? 0;
      s.w += p.wrong ?? 0;
      s.n++;
      m.set(p.topic_id, s);
    }
    return [...m.entries()]
      .map(([id, s]) => ({ id, ...s, a: acc(s.c, s.w) }))
      .filter((x) => x.a != null)
      .sort((p, q) => (p.a ?? 0) - (q.a ?? 0))
      .slice(0, 5);
  }, [progress]);

  async function remove() {
    if (!confirmAction(`"${resource.title}" ve tüm test kayıtları silinsin mi?`)) return;
    const { error } = await sb().from("resources").delete().eq("id", resource.id);
    if (error) return toast.show(errorText(error), "danger");
    onChanged();
    onClose();
  }

  return (
    <>
      <Modal
        open={!edit && testNo == null}
        onClose={onClose}
        title={resource.title}
        footer={
          <>
            {audience === "counselor" && <IconButton icon="trash" label="Kaynağı öğrencinin listesinden kaldır" onClick={remove} />}
            {audience === "counselor" && !resource.catalog_id && (
              <Button variant="ghost" icon="edit" onClick={() => setEdit(true)}>
                Düzenle
              </Button>
            )}
            <Button icon="plus" onClick={() => setTestNo(nextNo)}>
              Test {nextNo} sonucu
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Mini label="Çözülen test" value={`${progress.length}${resource.total_tests ? `/${resource.total_tests}` : ""}`} />
            <Mini label="Doğru oranı" value={a != null ? `%${a}` : "—"} />
            <Mini label="Doğru · yanlış" value={c + w ? `${fmtNum(c, 0)} · ${fmtNum(w, 0)}` : "—"} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted">{[resource.publisher, resource.subject, resource.total_tests ? `${resource.total_tests} test` : null].filter(Boolean).join(" · ")}</p>
            <div className="w-full sm:w-72">
              <Segmented
                size="sm"
                ariaLabel="Kaynak durumu"
                value={resource.status}
                onChange={setStatus}
                options={[
                  { value: "active", label: "Devam" },
                  { value: "paused", label: "Ara verdim" },
                  { value: "done", label: "Bitti" },
                ]}
              />
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Testler {audience === "student" && <span className="font-normal text-muted">· çözdüğün testin numarasına dokun</span>}</p>
            <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-10">
              {Array.from({ length: count }, (_, i) => i + 1).map((n) => {
                const p = byNo.get(n);
                const ac = p ? acc(p.correct, p.wrong) : null;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setTestNo(n)}
                    title={p ? `Test ${n} · ${formatShort(p.done_on)}${ac != null ? ` · %${ac} doğru` : ""}` : `Test ${n}`}
                    className={cx(
                      "flex h-10 flex-col items-center justify-center rounded-lg border text-xs font-semibold tabular transition",
                      p ? toneCls[accTone(ac)] : "border-line bg-surface text-faint hover:border-primary/40",
                    )}
                  >
                    {n}
                    {p && <span className="text-[9.5px] font-medium leading-none">{ac != null ? `%${ac}` : "✓"}</span>}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
              <Legend cls={toneCls.success} label="%75+" />
              <Legend cls={toneCls.warning} label="%50–74" />
              <Legend cls={toneCls.danger} label="%50 altı" />
              <Legend cls={toneCls.primary} label="çözüldü, D/Y yok" />
            </p>
          </div>
          {weakTopics.length > 0 && (
            <div>
              <p className="mb-1.5 text-sm font-medium">Bu kaynakta zorlanılan konular</p>
              <ul className="space-y-1 text-sm">
                {weakTopics.map((t) => (
                  <li key={t.id} className="flex justify-between gap-2">
                    <span className="truncate">{topicName.get(t.id) ?? t.id}</span>
                    <span className="shrink-0 text-muted tabular">
                      %{t.a} · {t.n} test
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Modal>
      {edit && (
        <ResourceForm
          studentId={resource.student_id}
          resource={resource}
          onClose={() => setEdit(false)}
          onSaved={() => {
            setEdit(false);
            onChanged();
          }}
        />
      )}
      {testNo != null && (
        <TestResultForm
          resource={resource}
          catalog={catalog}
          audience={audience}
          testNo={testNo}
          existing={byNo.get(testNo) ?? null}
          onClose={() => setTestNo(null)}
          onSaved={() => {
            setTestNo(null);
            onChanged();
          }}
        />
      )}
    </>
  );
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={cx("h-3 w-3 rounded border", cls)} /> {label}
    </span>
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

function TestResultForm({
  resource,
  catalog,
  audience,
  testNo,
  existing,
  onClose,
  onSaved,
}: {
  resource: Resource;
  catalog: CatalogItem | null;
  audience: "student" | "counselor";
  testNo: number;
  existing: ResourceProgress | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const topics = useMemo(() => topicsForSubject(resource.subject), [resource.subject]);
  const [no, setNo] = useState(String(testNo));
  const [correct, setCorrect] = useState(existing?.correct != null ? String(existing.correct) : "");
  const [wrong, setWrong] = useState(existing?.wrong != null ? String(existing.wrong) : "");
  const [empty, setEmpty] = useState(existing?.empty != null ? String(existing.empty) : "");
  const [topic, setTopic] = useState(existing?.topic_id ?? "");
  const [date, setDate] = useState(existing?.done_on ?? todayISO());
  const [busy, setBusy] = useState(false);
  const num = (v: string) => (v === "" ? null : Math.max(0, Math.min(500, parseInt(v, 10) || 0)));
  const catalogTopic = catalogTopicFor(catalog, parseInt(no, 10) || 0);

  async function save() {
    const n = parseInt(no, 10);
    if (!n || n < 1 || n > 1000) return toast.show("Test numarası 1–1000 arasında olmalı", "danger");
    setBusy(true);
    const row = {
      resource_id: resource.id,
      student_id: resource.student_id,
      test_no: n,
      // Öğrenci konu seçmez: katalogdaki test → konu eşleşmesi kullanılır (veritabanı da doldurur)
      topic_id: audience === "counselor" ? topic || null : (existing?.topic_id ?? catalogTopicFor(catalog, parseInt(no, 10) || 0)),
      correct: num(correct),
      wrong: num(wrong),
      empty: num(empty),
      done_on: date || todayISO(),
    };
    const { error } = existing
      ? await sb().from("resource_progress").update(row).eq("id", existing.id)
      : await sb().from("resource_progress").upsert(row, { onConflict: "resource_id,test_no" });
    setBusy(false);
    if (error) return toast.show(errorText(error), "danger");
    toast.show(`Test ${n} kaydedildi`);
    onSaved();
  }

  async function remove() {
    if (!existing) return;
    const { error } = await sb().from("resource_progress").delete().eq("id", existing.id);
    if (error) return toast.show(errorText(error), "danger");
    onSaved();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`${resource.title} · Test ${testNo}`}
      footer={
        <>
          {existing && <IconButton icon="trash" label="Test kaydını sil" onClick={remove} />}
          <Button variant="ghost" onClick={onClose}>
            Vazgeç
          </Button>
          <Button icon="check" onClick={save} loading={busy}>
            {existing ? "Kaydet" : "Çözüldü olarak kaydet"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-4 gap-2">
          <Field label="Test no" htmlFor="t-no">
            <input id="t-no" className="field" inputMode="numeric" value={no} onChange={(e) => setNo(e.target.value.replace(/\D/g, ""))} disabled={Boolean(existing)} />
          </Field>
          <Field label="Doğru" htmlFor="t-c">
            <input id="t-c" className="field" inputMode="numeric" value={correct} onChange={(e) => setCorrect(e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label="Yanlış" htmlFor="t-w">
            <input id="t-w" className="field" inputMode="numeric" value={wrong} onChange={(e) => setWrong(e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label="Boş" htmlFor="t-e">
            <input id="t-e" className="field" inputMode="numeric" value={empty} onChange={(e) => setEmpty(e.target.value.replace(/\D/g, ""))} />
          </Field>
        </div>
        {audience === "counselor" ? (
          <Field
            label="Konu"
            htmlFor="t-topic"
            hint={catalogTopic ? `Boş bırakılırsa katalogdaki konu kullanılır: ${topicName.get(catalogTopic) ?? catalogTopic}` : "Seçilirse konu başarı analizine de eklenir."}
          >
            <select id="t-topic" className="field" value={topic} onChange={(e) => setTopic(e.target.value)}>
              <option value="">— Konu seçilmedi —</option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          (existing?.topic_id ?? catalogTopic) && (
            <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
              <span className="text-muted">Konu: </span>
              {topicName.get((existing?.topic_id ?? catalogTopic)!) ?? existing?.topic_id ?? catalogTopic}
            </p>
          )
        )}
        <Field label="Tarih" htmlFor="t-date">
          <input id="t-date" type="date" className="field" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Görev satırlarında kaynak adını göstermek için küçük önbellek        */
/* ------------------------------------------------------------------ */
const titleCache = new Map<string, Promise<string | null>>();
export function useResourceTitle(id: string | null | undefined) {
  const [title, setTitle] = useState<string | null>(null);
  useEffect(() => {
    if (!id) return setTitle(null);
    if (!titleCache.has(id)) {
      titleCache.set(
        id,
        Promise.resolve(
          sb()
            .from("resources")
            .select("title, publisher")
            .eq("id", id)
            .maybeSingle()
            .then(({ data }) => (data ? resourceLabel(data as Pick<Resource, "title" | "publisher">) : null)),
        ).catch(() => null),
      );
    }
    let live = true;
    titleCache.get(id)!.then((t) => live && setTitle(t));
    return () => {
      live = false;
    };
  }, [id]);
  return title;
}

export function TaskResourceLine({ task }: { task: { resource_id?: string | null; resource_tests?: string | null } }) {
  const title = useResourceTitle(task.resource_id);
  if (!task.resource_id || !title) return null;
  return (
    <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-primary-ink">
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 19.5V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2" />
      </svg>
      {title}
      {task.resource_tests ? ` · Test ${task.resource_tests}` : ""}
    </p>
  );
}
