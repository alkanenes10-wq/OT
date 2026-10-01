"use client";
// Kaynak kataloğu: kitaplar sistemde (danışmanlar tarafından) tanımlanır, öğrenci yalnızca seçer.
// Katalog tüm danışmanlar arasında ortaktır. Her kitapta hangi testin hangi konu olduğu tanımlanabilir;
// öğrenci test sonucu girince konu kendiliğinden yazılır (guncelleme-10.sql).

import { useCallback, useEffect, useMemo, useState } from "react";
import { ALL_TOPICS } from "./curriculum";
import { errorText, sb } from "./db";
import { RESOURCE_KINDS, type CatalogItem, type Resource, type ResourceKind } from "./lib";
import { RESOURCE_SUBJECTS, topicsForSubject } from "./kaynaklar";
import { Badge, Button, Card, EmptyState, ErrorBox, Field, IconButton, Modal, PageLoader, Segmented, confirmAction, cx, useToast } from "./ui";

const topicName = new Map(ALL_TOPICS.map((t) => [t.id, t.name]));
const kindLabel = (k: ResourceKind) => RESOURCE_KINDS.find((x) => x.value === k)?.label ?? k;
export const CATALOG_SQL_HINT = "Kaynak kataloğu için Supabase'de guncelleme-10.sql çalıştırılmalı.";
const missing = (e: unknown) => /resource_catalog|catalog_id|schema cache|does not exist/i.test(String((e as Error)?.message ?? e));
const trLower = (s: string) => s.toLocaleLowerCase("tr-TR");

export async function fetchCatalog(activeOnly = true): Promise<CatalogItem[]> {
  let q = sb().from("resource_catalog").select("*").order("subject").order("publisher").order("title");
  if (activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as CatalogItem[];
}

/** Katalogdaki test → konu eşleşmesi */
export function catalogTopicFor(item: Pick<CatalogItem, "test_topics"> | null | undefined, testNo: number): string | null {
  const r = item?.test_topics?.find((x) => testNo >= x.from && testNo <= (x.to || x.from));
  return r?.topic_id ?? null;
}

const label = (c: Pick<CatalogItem, "publisher" | "title">) => (c.publisher ? `${c.publisher} · ${c.title}` : c.title);

/* ------------------------------------------------------------------ */
/* Öğrencinin listesine katalogdan kaynak ekle                          */
/* ------------------------------------------------------------------ */
export function CatalogPicker({
  studentId,
  existing,
  audience,
  onClose,
  onAdded,
}: {
  studentId: string;
  existing: Resource[];
  audience: "student" | "counselor";
  onClose: () => void;
  onAdded: () => void;
}) {
  const toast = useToast();
  const [items, setItems] = useState<CatalogItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [subject, setSubject] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const owned = useMemo(() => new Set(existing.map((r) => r.catalog_id).filter(Boolean)), [existing]);

  const load = useCallback(() => {
    fetchCatalog()
      .then(setItems)
      .catch((e) => {
        setError(missing(e) ? CATALOG_SQL_HINT : errorText(e));
        setItems([]);
      });
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function add(c: CatalogItem) {
    setBusy(c.id);
    const { error } = await sb().from("resources").insert({ student_id: studentId, catalog_id: c.id, title: c.title, publisher: c.publisher, subject: c.subject, kind: c.kind, total_tests: c.total_tests });
    setBusy(null);
    if (error) return toast.show(/duplicate|unique/i.test(error.message) ? "Bu kaynak zaten listende" : errorText(error), "danger");
    toast.show(`${c.title} eklendi`);
    onAdded();
  }

  const subjects = useMemo(() => [...new Set((items ?? []).map((c) => c.subject).filter(Boolean))], [items]);
  const shown = (items ?? []).filter(
    (c) => (!subject || c.subject === subject) && (!q.trim() || trLower(`${c.publisher} ${c.title} ${c.subject}`).includes(trLower(q.trim()))),
  );

  return (
    <>
      <Modal open={!creating} onClose={onClose} title="Kaynak seç">
        <div className="space-y-3">
          {error && <ErrorBox>{error}</ErrorBox>}
          <div className="flex gap-2">
            <input className="field min-w-0 flex-1" placeholder="Ara: yayınevi veya kitap adı" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Kaynak ara" />
            <select className="field w-40" value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Ders">
              <option value="">Tüm dersler</option>
              {subjects.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          {!items ? (
            <PageLoader />
          ) : shown.length === 0 ? (
            <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted">
              {items.length === 0
                ? audience === "student"
                  ? "Danışmanın henüz kaynak tanımlamamış. Kullandığın kitabı danışmanına söyle; kataloğa eklesin."
                  : "Katalog boş. Aşağıdan ilk kaynağı tanımlayın."
                : audience === "student"
                  ? "Aradığın kaynak katalogda yok. Danışmanına söyle; kataloğa eklesin."
                  : "Aramaya uyan kaynak yok."}
            </p>
          ) : (
            <ul className="max-h-[55vh] divide-y divide-line overflow-y-auto">
              {shown.map((c) => {
                const has = owned.has(c.id);
                return (
                  <li key={c.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{label(c)}</p>
                      <p className="text-xs text-muted">
                        {[c.subject, kindLabel(c.kind), c.total_tests ? `${c.total_tests} test` : null].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    {has ? (
                      <Badge tone="success">Listende</Badge>
                    ) : (
                      <Button size="sm" variant="soft" icon="plus" loading={busy === c.id} onClick={() => add(c)}>
                        Ekle
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {audience === "counselor" && !error && (
            <button type="button" onClick={() => setCreating(true)} className="text-sm font-medium text-primary hover:underline">
              + Katalogda yok mu? Yeni kaynak tanımla
            </button>
          )}
        </div>
      </Modal>
      {creating && (
        <CatalogForm
          onClose={() => setCreating(false)}
          onSaved={(c) => {
            setCreating(false);
            load();
            if (c) add(c);
          }}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Katalog kaydı ekle / düzenle (danışman)                               */
/* ------------------------------------------------------------------ */
type Range = { from: string; to: string; topic_id: string };

export function CatalogForm({ item, onClose, onSaved }: { item?: CatalogItem; onClose: () => void; onSaved: (c: CatalogItem | null) => void }) {
  const toast = useToast();
  const [title, setTitle] = useState(item?.title ?? "");
  const [publisher, setPublisher] = useState(item?.publisher ?? "");
  const [subject, setSubject] = useState(item?.subject ?? "TYT MATEMATİK");
  const [kind, setKind] = useState<ResourceKind>(item?.kind ?? "soru_bankasi");
  const [total, setTotal] = useState(item?.total_tests ? String(item.total_tests) : "");
  const [ranges, setRanges] = useState<Range[]>((item?.test_topics ?? []).map((r) => ({ from: String(r.from), to: String(r.to), topic_id: r.topic_id })));
  const [busy, setBusy] = useState(false);
  const topics = useMemo(() => topicsForSubject(subject), [subject]);

  function setRange(i: number, patch: Partial<Range>) {
    setRanges((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }
  function addRange() {
    const last = ranges[ranges.length - 1];
    const start = last ? (parseInt(last.to || last.from, 10) || 0) + 1 : 1;
    setRanges((rs) => [...rs, { from: String(start), to: String(start), topic_id: "" }]);
  }

  async function save() {
    if (!title.trim()) return toast.show("Kitap adını yazın", "danger");
    const test_topics = ranges
      .map((r) => ({ from: parseInt(r.from, 10) || 0, to: parseInt(r.to || r.from, 10) || 0, topic_id: r.topic_id }))
      .filter((r) => r.from > 0 && r.to >= r.from && r.topic_id);
    setBusy(true);
    const row = {
      title: title.trim().slice(0, 120),
      publisher: publisher.trim().slice(0, 80),
      subject,
      kind,
      total_tests: Math.max(0, Math.min(1000, parseInt(total, 10) || 0)),
      test_topics,
    };
    const { data, error } = item
      ? await sb().from("resource_catalog").update(row).eq("id", item.id).select("*").single()
      : await sb().from("resource_catalog").insert(row).select("*").single();
    setBusy(false);
    if (error) return toast.show(missing(error) ? CATALOG_SQL_HINT : errorText(error), "danger");
    toast.show(item ? "Kaynak güncellendi; öğrencilerin listesi de güncellendi" : "Kataloğa eklendi");
    onSaved(data as CatalogItem);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={item ? "Kaynağı düzenle" : "Kataloğa kaynak ekle"}
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
        <div className="grid grid-cols-2 gap-3">
          <Field label="Yayınevi" htmlFor="c-pub">
            <input id="c-pub" className="field" value={publisher} maxLength={80} onChange={(e) => setPublisher(e.target.value)} placeholder="ör. 3D" />
          </Field>
          <Field label="Test sayısı" htmlFor="c-total">
            <input id="c-total" className="field" inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value.replace(/\D/g, ""))} placeholder="ör. 64" />
          </Field>
        </div>
        <Field label="Kitap adı" htmlFor="c-title">
          <input id="c-title" className="field" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="ör. TYT Matematik Soru Bankası" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ders" htmlFor="c-subject">
            <select id="c-subject" className="field" value={subject} onChange={(e) => setSubject(e.target.value)}>
              {RESOURCE_SUBJECTS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Tür" htmlFor="c-kind">
            <select id="c-kind" className="field" value={kind} onChange={(e) => setKind(e.target.value as ResourceKind)}>
              {RESOURCE_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="rounded-xl border border-line p-3">
          <p className="text-sm font-medium">Testlerin konuları (isteğe bağlı)</p>
          <p className="mb-2 text-xs text-muted">Tanımlarsanız öğrenci test sonucunu girince konu kendiliğinden yazılır ve konu başarı analizine girer.</p>
          {ranges.length > 0 && (
            <ul className="mb-2 space-y-1.5">
              {ranges.map((r, i) => (
                <li key={i} className="flex items-center gap-1.5">
                  <input className="field h-9 w-14 px-2 text-center text-sm" inputMode="numeric" value={r.from} onChange={(e) => setRange(i, { from: e.target.value.replace(/\D/g, "") })} aria-label="İlk test" />
                  <span className="text-muted">–</span>
                  <input className="field h-9 w-14 px-2 text-center text-sm" inputMode="numeric" value={r.to} onChange={(e) => setRange(i, { to: e.target.value.replace(/\D/g, "") })} aria-label="Son test" />
                  <select className="field h-9 min-w-0 flex-1 py-1 text-sm" value={r.topic_id} onChange={(e) => setRange(i, { topic_id: e.target.value })} aria-label="Konu">
                    <option value="">— Konu —</option>
                    {topics.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <IconButton icon="x" label="Aralığı sil" className="h-9 w-9" onClick={() => setRanges((rs) => rs.filter((_, j) => j !== i))} />
                </li>
              ))}
            </ul>
          )}
          <Button size="sm" variant="ghost" icon="plus" onClick={addRange}>
            Test aralığı ekle
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Ayarlar → Kaynak kataloğu (danışman)                                  */
/* ------------------------------------------------------------------ */
export function CatalogManager() {
  const toast = useToast();
  const [items, setItems] = useState<CatalogItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<CatalogItem | "new" | null>(null);
  const [bulk, setBulk] = useState(false);
  const [q, setQ] = useState("");
  const [show, setShow] = useState<"active" | "all">("active");

  const load = useCallback(() => {
    fetchCatalog(false)
      .then((x) => {
        setItems(x);
        setError(null);
      })
      .catch((e) => {
        setError(missing(e) ? CATALOG_SQL_HINT : errorText(e));
        setItems([]);
      });
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function toggle(c: CatalogItem) {
    if (c.is_active && !confirmAction(`"${c.title}" katalogdan kaldırılsın mı? Öğrenciler artık seçemez; zaten listesinde olanlar etkilenmez.`)) return;
    const { error } = await sb().from("resource_catalog").update({ is_active: !c.is_active }).eq("id", c.id);
    if (error) return toast.show(errorText(error), "danger");
    load();
  }

  const shown = (items ?? []).filter((c) => (show === "all" || c.is_active) && (!q.trim() || trLower(`${c.publisher} ${c.title} ${c.subject}`).includes(trLower(q.trim()))));
  const groups = useMemo(() => {
    const m = new Map<string, CatalogItem[]>();
    for (const c of shown) m.set(c.subject || "Diğer", [...(m.get(c.subject || "Diğer") ?? []), c]);
    return [...m.entries()];
  }, [shown]);

  return (
    <Card
      title="Kaynak kataloğu"
      subtitle="Öğrenciler kitaplarını yalnızca bu listeden seçer. Katalog tüm danışmanlar için ortaktır."
      action={
        !error && (
          <div className="flex gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => setBulk(true)}>
              Toplu ekle
            </Button>
            <Button size="sm" icon="plus" onClick={() => setEditing("new")}>
              Kaynak
            </Button>
          </div>
        )
      }
    >
      {error && <ErrorBox>{error}</ErrorBox>}
      {!items ? (
        <PageLoader />
      ) : !error && items.length === 0 ? (
        <EmptyState icon="book" title="Katalog boş">
          Öğrencilerinizin kullandığı kitapları ekleyin. Birçok kitabı tek seferde eklemek için &quot;Toplu ekle&quot;yi kullanın.
        </EmptyState>
      ) : (
        !error && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <input className="field h-9 min-w-0 flex-1 text-sm" placeholder="Ara" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Katalogda ara" />
              <div className="w-48">
                <Segmented
                  size="sm"
                  ariaLabel="Katalog süzgeci"
                  value={show}
                  onChange={setShow}
                  options={[
                    { value: "active", label: `Etkin (${items.filter((c) => c.is_active).length})` },
                    { value: "all", label: "Tümü" },
                  ]}
                />
              </div>
            </div>
            {groups.map(([subj, list]) => (
              <div key={subj}>
                <p className="mb-1 text-[11px] font-bold tracking-wide text-muted">{subj}</p>
                <ul className="divide-y divide-line rounded-xl border border-line">
                  {list.map((c) => (
                    <li key={c.id} className={cx("flex items-center gap-2 px-3 py-2", !c.is_active && "opacity-55")}>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{label(c)}</p>
                        <p className="text-xs text-muted">
                          {[kindLabel(c.kind), c.total_tests ? `${c.total_tests} test` : null, c.test_topics?.length ? `${c.test_topics.length} konu aralığı` : null].filter(Boolean).join(" · ")}
                          {!c.is_active && " · katalogdan kaldırıldı"}
                        </p>
                      </div>
                      <IconButton icon="edit" label="Düzenle" className="h-8 w-8" onClick={() => setEditing(c)} />
                      <button type="button" className="text-xs text-muted hover:text-fg" onClick={() => toggle(c)}>
                        {c.is_active ? "Kaldır" : "Geri al"}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )
      )}
      {editing && (
        <CatalogForm
          item={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
      {bulk && (
        <BulkCatalog
          onClose={() => setBulk(false)}
          onSaved={() => {
            setBulk(false);
            load();
          }}
        />
      )}
    </Card>
  );
}

/** "Yayınevi | Kitap adı | Ders | Test sayısı" satırlarından toplu ekleme */
function BulkCatalog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const subjectOf = (s: string) => RESOURCE_SUBJECTS.find((x) => trLower(x) === trLower(s.trim())) ?? "";
  const rows = text
    .split("\n")
    .map((l) => l.split(/\s*[|;\t]\s*/).map((x) => x.trim()))
    .filter((p) => p.some(Boolean))
    .map(([publisher = "", title = "", subject = "", total = ""]) => ({
      publisher: publisher.slice(0, 80),
      title: title.slice(0, 120),
      subject: subjectOf(subject),
      rawSubject: subject,
      total_tests: Math.max(0, Math.min(1000, parseInt(total, 10) || 0)),
    }));
  const valid = rows.filter((r) => r.title);

  async function save() {
    if (!valid.length) return;
    setBusy(true);
    const { error } = await sb()
      .from("resource_catalog")
      .insert(valid.map(({ rawSubject, ...r }) => (void rawSubject, { ...r, kind: "soru_bankasi" })));
    setBusy(false);
    if (error) return toast.show(missing(error) ? CATALOG_SQL_HINT : errorText(error), "danger");
    toast.show(`${valid.length} kaynak kataloğa eklendi`);
    onSaved();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Toplu kaynak ekle"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Vazgeç
          </Button>
          <Button icon="check" onClick={save} loading={busy} disabled={!valid.length}>
            {valid.length ? `${valid.length} kaynağı ekle` : "Ekle"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-muted">
          Her satıra bir kaynak: <span className="font-mono text-xs">Yayınevi | Kitap adı | Ders | Test sayısı</span>. Excel&apos;den sütunları kopyalayıp yapıştırabilirsiniz.
        </p>
        <textarea
          className="field min-h-40 font-mono text-xs"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"3D | TYT Matematik Soru Bankası | TYT MATEMATİK | 64\nLimit | Paragraf Soru Bankası | PARAGRAF | 40"}
          aria-label="Kaynak listesi"
        />
        {rows.length > 0 && (
          <ul className="max-h-48 space-y-1 overflow-y-auto text-xs">
            {rows.map((r, i) => (
              <li key={i} className={cx("flex gap-2", !r.title && "text-danger")}>
                <span className="w-5 text-faint">{i + 1}.</span>
                <span className="flex-1 truncate">
                  {r.title ? `${r.publisher ? `${r.publisher} · ` : ""}${r.title}` : "Kitap adı eksik — atlanacak"}
                </span>
                <span className={cx(r.rawSubject && !r.subject ? "text-warning" : "text-muted")}>
                  {r.subject || (r.rawSubject ? `“${r.rawSubject}” tanınmadı` : "ders yok")}
                  {r.total_tests ? ` · ${r.total_tests} test` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-faint">Tanınan ders adları: {RESOURCE_SUBJECTS.join(", ")}.</p>
      </div>
    </Modal>
  );
}

export { topicName as catalogTopicNames };
