"use client";
// Soru bankası: öğrenci çözemediği soruların fotoğrafını ekler, cevabına ve çözümüne bakar.
// Sorular uygulamada saklanır; bu sorulardan test hazırlanır, çözülür ve yazdırılır.
// Bir soru testte 2 kez doğru çözülünce "öğrenildi" olur.

import { ShareToForum } from "./forum";
import { useCallback, useEffect, useMemo, useState } from "react";
import { A, errorText, sb } from "./db";
import { DEFAULT_SUBJECTS, formatTR, relativeDay } from "./lib";
import { Badge, Button, Card, confirmAction, cx, EmptyState, ErrorBox, Field, Icon, Modal, PageLoader, Segmented, useToast } from "./ui";

const BUCKET = "sorular";
const CHOICES = ["A", "B", "C", "D", "E"] as const;
type Choice = (typeof CHOICES)[number];

export type QuestionItem = {
  id: string;
  student_id: string;
  image_path: string;
  subject: string;
  topic_id: string | null;
  source: string;
  note: string;
  answer: Choice | null;
  solution_path: string | null;
  solution_note: string;
  status: "open" | "learned";
  attempts: number;
  correct_count: number;
  last_result: "correct" | "wrong" | "empty" | null;
  created_at: string;
};

export type QuestionTest = {
  id: string;
  student_id: string;
  title: string;
  question_ids: string[];
  answers: Record<string, string>;
  correct: number | null;
  total: number | null;
  created_at: string;
  finished_at: string | null;
};

/* ------------------------------------------------------------------ */
/* Yardımcılar                                                         */
/* ------------------------------------------------------------------ */

/** Fotoğrafı en fazla 1600 px ve JPEG'e küçültür (depolama ve hız için). */
export async function compressImage(file: File, max = 1600): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Fotoğraf okunamadı. JPG veya PNG deneyin."));
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    return blob ?? file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function uploadImage(studentId: string, file: File): Promise<string> {
  const blob = await compressImage(file);
  const path = `${studentId}/${crypto.randomUUID()}.jpg`;
  const { error } = await sb().storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (error) throw error;
  return path;
}

async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  const uniq = [...new Set(paths.filter(Boolean))];
  if (!uniq.length) return {};
  const { data, error } = await sb().storage.from(BUCKET).createSignedUrls(uniq, 60 * 60);
  if (error) throw error;
  const out: Record<string, string> = {};
  for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  return out;
}

const shuffle = <T,>(xs: T[]) => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const isMissingTable = (e: unknown) => /question_items|question_tests|schema cache|does not exist|Bucket not found/i.test(String((e as Error)?.message ?? e));

/* ------------------------------------------------------------------ */
/* Ana bileşen                                                         */
/* ------------------------------------------------------------------ */

export function QuestionBank({ studentId, audience }: { studentId: string; audience: "student" | "counselor" }) {
  const toast = useToast();
  const [items, setItems] = useState<QuestionItem[] | null>(null);
  const [tests, setTests] = useState<QuestionTest[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [status, setStatus] = useState<"open" | "learned" | "all">("open");
  const [subject, setSubject] = useState("");
  const [adding, setAdding] = useState(false);
  const [detail, setDetail] = useState<QuestionItem | null>(null);
  const [building, setBuilding] = useState(false);
  const [running, setRunning] = useState<QuestionTest | null>(null);

  const load = useCallback(async () => {
    try {
      const [q, t] = await Promise.all([
        sb().from("question_items").select("*").eq("student_id", studentId).order("created_at", { ascending: false }),
        sb().from("question_tests").select("*").eq("student_id", studentId).order("created_at", { ascending: false }).limit(20),
      ]);
      if (q.error) throw q.error;
      if (t.error) throw t.error;
      const list = (q.data ?? []) as QuestionItem[];
      setItems(list);
      setTests((t.data ?? []) as QuestionTest[]);
      setUrls(await signedUrls(list.flatMap((x) => [x.image_path, x.solution_path ?? ""])));
    } catch (e) {
      if (isMissingTable(e)) setMissing(true);
      else setError(errorText(e));
      setItems([]);
    }
  }, [studentId]);

  useEffect(() => {
    load();
  }, [load]);

  const subjects = useMemo(() => [...new Set((items ?? []).map((i) => i.subject).filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr")), [items]);
  const shown = (items ?? []).filter((i) => (status === "all" || i.status === status) && (!subject || i.subject === subject));
  const openCount = (items ?? []).filter((i) => i.status === "open").length;
  const learnedCount = (items ?? []).length - openCount;

  if (missing)
    return (
      <Card>
        <EmptyState icon="book" title="Soru bankası için veritabanı güncellemesi gerekiyor">
          {audience === "counselor" ? "Supabase → SQL Editor'de guncelleme-5.sql dosyasını bir kez çalıştırın." : "Danışmanın kurulumu tamamladığında burada sorularını saklayabileceksin."}
        </EmptyState>
      </Card>
    );
  if (!items) return <PageLoader />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="card px-4 py-3">
          <p className="text-xs text-muted">Çözülemeyen</p>
          <p className="display text-[26px] tabular">{openCount}</p>
        </div>
        <div className="card px-4 py-3">
          <p className="text-xs text-muted">Öğrenilen</p>
          <p className="display text-[26px] tabular text-success">{learnedCount}</p>
        </div>
        <div className="card px-4 py-3">
          <p className="text-xs text-muted">Çözülen test</p>
          <p className="display text-[26px] tabular">{tests.filter((t) => t.finished_at).length}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button icon="plus" onClick={() => setAdding(true)}>
          Soru ekle
        </Button>
        <Button variant="secondary" icon="target" disabled={openCount === 0} onClick={() => setBuilding(true)}>
          Test oluştur
        </Button>
      </div>

      {error && <ErrorBox>{error}</ErrorBox>}

      <Card
        title="Sorular"
        subtitle={audience === "student" ? "Çözemediğin soruların fotoğrafı burada saklanır. Dokunup cevabına bak." : "Öğrencinin çözemediği sorular. Çözüm notu veya fotoğrafı ekleyebilirsiniz."}
      >
        <div className="mb-3 space-y-2">
          <Segmented
            size="sm"
            ariaLabel="Durum"
            value={status}
            onChange={setStatus}
            options={[
              { value: "open", label: "Çözülemeyen" },
              { value: "learned", label: "Öğrenilen" },
              { value: "all", label: "Tümü" },
            ]}
          />
          {subjects.length > 1 && (
            <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
              {["", ...subjects].map((s) => (
                <button
                  key={s || "all"}
                  type="button"
                  onClick={() => setSubject(s)}
                  className={cx("shrink-0 rounded-full border px-3 py-1 text-xs font-medium", subject === s ? "border-primary bg-primary text-primary-fg" : "border-line text-muted")}
                >
                  {s || "Tüm dersler"}
                </button>
              ))}
            </div>
          )}
        </div>
        {shown.length === 0 ? (
          <EmptyState icon="book" title={items.length ? "Bu filtrede soru yok" : "Henüz soru eklenmemiş"}>
            {items.length ? undefined : "Kitapta ya da denemede yapamadığın bir sorunun fotoğrafını çek ve ekle. Cevabını da girersen test çözerken otomatik kontrol edilir."}
          </EmptyState>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {shown.map((q) => (
              <li key={q.id}>
                <button type="button" onClick={() => setDetail(q)} className="w-full overflow-hidden rounded-xl border border-line text-left hover:border-primary/40">
                  <div className="aspect-[4/3] bg-surface-2">
                    {urls[q.image_path] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={urls[q.image_path]} alt={`${q.subject} sorusu`} className="h-full w-full object-cover object-top" loading="lazy" />
                    ) : null}
                  </div>
                  <div className="space-y-1 p-2">
                    <p className="truncate text-xs font-semibold">{q.subject || "Ders yok"}</p>
                    <div className="flex flex-wrap items-center gap-1">
                      {q.status === "learned" ? <Badge tone="success">Öğrenildi</Badge> : q.last_result === "wrong" ? <Badge tone="danger">Yine yanlış</Badge> : null}
                      {!q.answer && <Badge tone="warning">Cevap yok</Badge>}
                      <span className="text-[11px] text-faint">{relativeDay(q.created_at.slice(0, 10))}</span>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {tests.length > 0 && (
        <Card title="Testler" subtitle="Soru bankasından hazırlanan testler">
          <ul className="divide-y divide-line">
            {tests.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{t.title || `${t.question_ids.length} soruluk test`}</span>
                  <span className="text-xs text-muted">
                    {formatTR(t.created_at.slice(0, 10))} · {t.finished_at ? `${t.correct}/${t.total} doğru` : "Çözülmedi"}
                  </span>
                </span>
                <Button size="sm" variant="secondary" icon="play" onClick={() => setRunning(t)}>
                  {t.finished_at ? "Tekrar çöz" : "Çöz"}
                </Button>
                <Button size="sm" variant="ghost" icon="printer" onClick={() => printTest(t, items, urls)}>
                  Yazdır
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {adding && (
        <AddQuestion
          studentId={studentId}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            toast.show("Soru eklendi");
            load();
          }}
        />
      )}
      {detail && (
        <QuestionDetail
          q={detail}
          urls={urls}
          audience={audience}
          onClose={() => setDetail(null)}
          onChanged={() => {
            setDetail(null);
            load();
          }}
        />
      )}
      {building && (
        <TestBuilder
          studentId={studentId}
          items={items}
          subjects={subjects}
          onClose={() => setBuilding(false)}
          onCreated={(t) => {
            setBuilding(false);
            setTests((ts) => [t, ...ts]);
            setRunning(t);
          }}
        />
      )}
      {running && (
        <TestRunner
          test={running}
          items={items}
          urls={urls}
          onClose={() => {
            setRunning(null);
            load();
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Soru ekleme                                                         */
/* ------------------------------------------------------------------ */

function AddQuestion({ studentId, onClose, onSaved }: { studentId: string; onClose: () => void; onSaved: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [solution, setSolution] = useState<File | null>(null);
  const [subject, setSubject] = useState(DEFAULT_SUBJECTS[1] ?? "");
  const [source, setSource] = useState("");
  const [answer, setAnswer] = useState<Choice | "">("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) return setPreview(null);
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  async function save() {
    if (!file) return setError("Önce sorunun fotoğrafını seç.");
    setBusy(true);
    setError(null);
    try {
      const image_path = await uploadImage(studentId, file);
      const solution_path = solution ? await uploadImage(studentId, solution) : null;
      const { error } = await sb()
        .from("question_items")
        .insert({ student_id: studentId, image_path, solution_path, subject, source: source.trim(), answer: answer || null, note: note.trim() });
      if (error) throw error;
      onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Soru ekle"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Vazgeç
          </Button>
          <Button icon="check" onClick={save} loading={busy} disabled={!file}>
            Kaydet
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block cursor-pointer">
          <span className="mb-1.5 block text-sm font-medium">Sorunun fotoğrafı</span>
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Seçilen soru" className="max-h-64 w-full rounded-xl border border-line object-contain" />
          ) : (
            <span className="flex h-32 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line text-sm text-muted">
              <Icon name="plus" size={22} />
              Fotoğraf çek veya seç
            </span>
          )}
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ders">
            <select className="field" value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Ders">
              {DEFAULT_SUBJECTS.filter((s) => s !== "GÜNLÜK TEKRAR").map((s) => (
                <option key={s}>{s}</option>
              ))}
              <option value="DİĞER">DİĞER</option>
            </select>
          </Field>
          <Field label="Kaynak" htmlFor="q-src">
            <input id="q-src" className="field" maxLength={120} placeholder="ör. 3D TYT s.42" value={source} onChange={(e) => setSource(e.target.value)} />
          </Field>
        </div>
        <Field label="Doğru cevap (kitabın cevap anahtarından)" hint="Girersen test çözerken otomatik kontrol edilir.">
          <div className="grid grid-cols-6 gap-1.5">
            {[...CHOICES, ""].map((c) => (
              <button
                key={c || "none"}
                type="button"
                onClick={() => setAnswer(c as Choice | "")}
                className={cx("h-10 rounded-lg border text-sm font-semibold", answer === c ? "border-primary bg-primary text-primary-fg" : "border-line bg-surface")}
              >
                {c || "?"}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Neden yapamadım? (isteğe bağlı)" htmlFor="q-note">
          <textarea id="q-note" className="field min-h-16" maxLength={1000} placeholder="ör. Formülü hatırlamadım / süre yetmedi" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium">Çözüm fotoğrafı (isteğe bağlı)</span>
          <input type="file" accept="image/*" className="text-sm" onChange={(e) => setSolution(e.target.files?.[0] ?? null)} />
        </label>
        {error && <ErrorBox>{error}</ErrorBox>}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Soru ayrıntısı                                                      */
/* ------------------------------------------------------------------ */

function QuestionDetail({ q, urls, audience, onClose, onChanged }: { q: QuestionItem; urls: Record<string, string>; audience: "student" | "counselor"; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [reveal, setReveal] = useState(false);
  const [answer, setAnswer] = useState<Choice | "">(q.answer ?? "");
  const [solNote, setSolNote] = useState(q.solution_note);
  const [solFile, setSolFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function update(values: Partial<QuestionItem>, msg = "Kaydedildi") {
    setBusy(true);
    const { error } = await sb().from("question_items").update(values).eq("id", q.id);
    setBusy(false);
    if (error) return toast.show(errorText(error), "danger");
    toast.show(msg);
    onChanged();
  }

  async function saveSolution() {
    try {
      setBusy(true);
      const solution_path = solFile ? await uploadImage(q.student_id, solFile) : q.solution_path;
      if (solFile && q.solution_path) await sb().storage.from(BUCKET).remove([q.solution_path]);
      await update({ answer: (answer || null) as Choice | null, solution_note: solNote.trim(), solution_path });
    } catch (e) {
      setBusy(false);
      toast.show(errorText(e), "danger");
    }
  }

  async function remove() {
    if (!confirmAction("Bu soru kalıcı olarak silinsin mi?")) return;
    setBusy(true);
    await sb().storage.from(BUCKET).remove([q.image_path, ...(q.solution_path ? [q.solution_path] : [])]);
    const { error } = await sb().from("question_items").delete().eq("id", q.id);
    setBusy(false);
    if (error) return toast.show(errorText(error), "danger");
    toast.show("Soru silindi");
    onChanged();
  }

  const dirty = (answer || null) !== q.answer || solNote.trim() !== q.solution_note || Boolean(solFile);

  return (
    <Modal open onClose={onClose} title={`${q.subject || "Soru"}${q.source ? ` · ${q.source}` : ""}`}>
      <div className="space-y-4">
        {urls[q.image_path] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={urls[q.image_path]} alt="Soru" className="w-full rounded-xl border border-line" />
        )}
        <div className="flex flex-wrap gap-1.5 text-xs">
          <Badge tone={q.status === "learned" ? "success" : "neutral"}>{q.status === "learned" ? "Öğrenildi" : "Çözülemeyen"}</Badge>
          {q.attempts > 0 && (
            <Badge>
              Testte {q.attempts} kez · {q.correct_count} doğru
            </Badge>
          )}
          <span className="text-faint">Eklendi: {formatTR(q.created_at.slice(0, 10))}</span>
        </div>
        {q.note && (
          <p className="rounded-lg bg-surface-2 p-2.5 text-sm">
            <span className="font-semibold">Neden yapamadım: </span>
            {q.note}
          </p>
        )}

        {!reveal ? (
          <Button variant="soft" className="w-full" onClick={() => setReveal(true)}>
            Cevabı ve çözümü göster
          </Button>
        ) : (
          <div className="space-y-3 rounded-xl border border-line p-3">
            <p className="text-sm">
              <span className="font-semibold">Doğru cevap: </span>
              {q.answer ? <span className="display text-xl">{q.answer}</span> : <span className="text-muted">Girilmemiş</span>}
            </p>
            {q.solution_path && urls[q.solution_path] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={urls[q.solution_path]} alt="Çözüm" className="w-full rounded-lg border border-line" />
            )}
            {q.solution_note && <p className="whitespace-pre-line text-sm">{q.solution_note}</p>}
            {!q.solution_path && !q.solution_note && <p className="text-sm text-muted">Henüz çözüm eklenmemiş. Aşağıdan ekleyebilirsin.</p>}
          </div>
        )}

        <details className="rounded-xl border border-line p-3 text-sm" open={audience === "counselor" && !q.solution_note}>
          <summary className="cursor-pointer font-medium">Cevap ve çözüm ekle / düzenle</summary>
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-6 gap-1.5">
              {[...CHOICES, ""].map((c) => (
                <button
                  key={c || "none"}
                  type="button"
                  onClick={() => setAnswer(c as Choice | "")}
                  className={cx("h-9 rounded-lg border text-sm font-semibold", answer === c ? "border-primary bg-primary text-primary-fg" : "border-line bg-surface")}
                >
                  {c || "?"}
                </button>
              ))}
            </div>
            <textarea
              className="field min-h-20"
              maxLength={2000}
              placeholder={audience === "counselor" ? "Çözüm yolu, ipucu ya da hangi konuya dönmesi gerektiği" : "Çözümü öğrendiysen kendi cümlelerinle yaz"}
              value={solNote}
              onChange={(e) => setSolNote(e.target.value)}
              aria-label="Çözüm notu"
            />
            <label className="block">
              <span className="mb-1 block text-xs text-muted">Çözüm fotoğrafı</span>
              <input type="file" accept="image/*" className="text-sm" onChange={(e) => setSolFile(e.target.files?.[0] ?? null)} />
            </label>
            {dirty && (
              <Button size="sm" icon="check" onClick={saveSolution} loading={busy}>
                Kaydet
              </Button>
            )}
          </div>
        </details>

        {audience === "student" && q.status === "open" && <ShareToForum q={q} imageUrl={urls[q.image_path]} />}

        <div className="flex flex-wrap justify-between gap-2">
          {q.status === "open" ? (
            <Button variant="secondary" icon="check" onClick={() => update({ status: "learned" }, "Öğrenilenlere taşındı")} loading={busy}>
              Artık çözebiliyorum
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => update({ status: "open" }, "Çözülemeyenlere taşındı")} loading={busy}>
              Tekrar çözülemeyenlere al
            </Button>
          )}
          <Button variant="ghost" icon="trash" onClick={remove}>
            Sil
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Test oluşturma                                                      */
/* ------------------------------------------------------------------ */

function TestBuilder({ studentId, items, subjects, onClose, onCreated }: { studentId: string; items: QuestionItem[]; subjects: string[]; onClose: () => void; onCreated: (t: QuestionTest) => void }) {
  const [subject, setSubject] = useState("");
  const [count, setCount] = useState(10);
  const [withLearned, setWithLearned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pool = items.filter((i) => (withLearned || i.status === "open") && (!subject || i.subject === subject));

  async function create() {
    // Önce son testte yanlış yapılanlar, sonra hiç denenmeyenler, sonra az denenenler; eşitlikte karışık
    const rank = (i: QuestionItem) => (i.last_result === "wrong" ? 0 : i.attempts === 0 ? 1 : 2 + i.correct_count);
    const picked = shuffle(pool)
      .sort((a, b) => rank(a) - rank(b))
      .slice(0, count);
    if (!picked.length) return setError("Bu seçimde soru yok.");
    setBusy(true);
    const title = `${subject || "Karışık"} · ${picked.length} soru`;
    const { data, error } = await sb()
      .from("question_tests")
      .insert({ student_id: studentId, title, question_ids: shuffle(picked.map((p) => p.id)) })
      .select("*")
      .single();
    setBusy(false);
    if (error) return setError(errorText(error));
    onCreated(data as QuestionTest);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Test oluştur"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Vazgeç
          </Button>
          <Button icon="play" onClick={create} loading={busy} disabled={!pool.length}>
            {Math.min(count, pool.length)} soruluk testi başlat
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Ders">
          <select className="field" value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Ders">
            <option value="">Tüm dersler (karışık)</option>
            {subjects.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Soru sayısı">
          <Segmented size="sm" ariaLabel="Soru sayısı" value={count} onChange={setCount} options={[5, 10, 15, 20].map((n) => ({ value: n, label: String(n) }))} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={withLearned} onChange={(e) => setWithLearned(e.target.checked)} />
          Öğrenilen soruları da ekle (tekrar için)
        </label>
        <p className="text-sm text-muted">
          Havuzda {pool.length} soru var. Önce daha önce yanlış yaptığın ve hiç denemediğin sorular seçilir. Bir soruyu testte 2 kez doğru çözünce öğrenilmiş sayılır.
        </p>
        {error && <ErrorBox>{error}</ErrorBox>}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Test çözme                                                          */
/* ------------------------------------------------------------------ */

type Mark = Choice | "bos" | "dogru" | "yanlis";

function TestRunner({ test, items, urls, onClose }: { test: QuestionTest; items: QuestionItem[]; urls: Record<string, string>; onClose: () => void }) {
  const toast = useToast();
  const qs = test.question_ids.map((id) => items.find((i) => i.id === id)).filter((x): x is QuestionItem => Boolean(x));
  const [idx, setIdx] = useState(0);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [result, setResult] = useState<{ q: QuestionItem; r: "correct" | "wrong" | "empty" }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const q = qs[idx];

  const judge = (x: QuestionItem): "correct" | "wrong" | "empty" => {
    const m = marks[x.id];
    if (!m || m === "bos") return "empty";
    if (m === "dogru") return "correct";
    if (m === "yanlis") return "wrong";
    return x.answer ? (m === x.answer ? "correct" : "wrong") : "empty";
  };

  async function finish() {
    setBusy(true);
    const res = qs.map((x) => ({ q: x, r: judge(x) }));
    try {
      for (const { q: x, r } of res) {
        const correct = x.correct_count + (r === "correct" ? 1 : 0);
        const { error } = await sb()
          .from("question_items")
          .update({ attempts: x.attempts + 1, correct_count: correct, last_result: r, status: r === "correct" && correct >= 2 ? "learned" : x.status })
          .eq("id", x.id);
        if (error) throw error;
      }
      const { error } = await sb()
        .from("question_tests")
        .update({ answers: marks, correct: res.filter((x) => x.r === "correct").length, total: res.length, finished_at: new Date().toISOString() })
        .eq("id", test.id);
      if (error) throw error;
      setResult(res);
    } catch (e) {
      toast.show(errorText(e), "danger");
    } finally {
      setBusy(false);
    }
  }

  if (!qs.length)
    return (
      <Modal open onClose={onClose} title={test.title}>
        <p className="text-sm text-muted">Bu testteki sorular silinmiş.</p>
      </Modal>
    );

  if (result) {
    const c = result.filter((x) => x.r === "correct").length;
    const learnedNow = result.filter((x) => x.r === "correct" && x.q.correct_count + 1 >= 2 && x.q.status === "open").length;
    return (
      <Modal open onClose={onClose} title="Test sonucu" footer={<Button onClick={onClose}>Tamam</Button>}>
        <div className="space-y-4">
          <div className="text-center">
            <p className="display text-4xl tabular">
              {c}/{result.length}
            </p>
            <p className="text-sm text-muted">doğru</p>
            {learnedNow > 0 && <p className="mt-1 text-sm font-medium text-success">{learnedNow} soru artık öğrenildi olarak işaretlendi.</p>}
          </div>
          <ul className="space-y-2">
            {result.map(({ q: x, r }, i) => (
              <li key={x.id} className="flex items-center gap-3 rounded-xl border border-line p-2 text-sm">
                <span className={cx("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white", r === "correct" ? "bg-success" : r === "wrong" ? "bg-danger" : "bg-faint")}>{i + 1}</span>
                <span className="min-w-0 flex-1 truncate">{x.subject}</span>
                <span className="text-xs text-muted">
                  Senin: {marks[x.id] && CHOICES.includes(marks[x.id] as Choice) ? marks[x.id] : r === "empty" ? "boş" : r === "correct" ? "doğru" : "yanlış"}
                  {x.answer ? ` · Cevap: ${x.answer}` : ""}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-faint">Yanlış yaptığın soruların çözümüne soru bankasından bakabilirsin; bir sonraki testte önce onlar gelir.</p>
        </div>
      </Modal>
    );
  }

  const m = marks[q.id];
  const set = (v: Mark) =>
    setMarks((x) => {
      const next = { ...x };
      if (next[q.id] === v) delete next[q.id];
      else next[q.id] = v;
      return next;
    });
  const answered = qs.filter((x) => marks[x.id]).length;

  return (
    <Modal
      open
      onClose={onClose}
      title={`${test.title} · ${idx + 1}/${qs.length}`}
      footer={
        <>
          <Button variant="ghost" icon="chevronLeft" disabled={idx === 0} onClick={() => setIdx((i) => i - 1)}>
            Önceki
          </Button>
          {idx < qs.length - 1 ? (
            <Button onClick={() => setIdx((i) => i + 1)}>Sonraki</Button>
          ) : (
            <Button icon="check" onClick={finish} loading={busy}>
              Bitir ({answered}/{qs.length})
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-1">
          {qs.map((x, i) => (
            <button
              key={x.id}
              type="button"
              aria-label={`${i + 1}. soru`}
              onClick={() => setIdx(i)}
              className={cx("h-1.5 flex-1 rounded-full", i === idx ? "bg-primary" : marks[x.id] ? "bg-primary/40" : "bg-surface-2")}
            />
          ))}
        </div>
        {urls[q.image_path] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={urls[q.image_path]} alt={`${idx + 1}. soru`} className="w-full rounded-xl border border-line" />
        )}
        {q.answer ? (
          <div className="grid grid-cols-6 gap-1.5">
            {CHOICES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => set(c)}
                className={cx("h-12 rounded-xl border text-base font-semibold", m === c ? "border-primary bg-primary text-primary-fg" : "border-line bg-surface")}
              >
                {c}
              </button>
            ))}
            <button type="button" onClick={() => set("bos")} className={cx("h-12 rounded-xl border text-sm", m === "bos" ? "border-primary bg-primary text-primary-fg" : "border-line bg-surface text-muted")}>
              Boş
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted">Bu sorunun cevap anahtarı girilmemiş. Çözdükten sonra kendin işaretle.</p>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  ["dogru", "Çözdüm"],
                  ["yanlis", "Çözemedim"],
                  ["bos", "Boş"],
                ] as const
              ).map(([v, label]) => (
                <button key={v} type="button" onClick={() => set(v)} className={cx("h-11 rounded-xl border text-sm font-medium", m === v ? "border-primary bg-primary text-primary-fg" : "border-line bg-surface")}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Yazdırma: yeni pencerede sade bir test sayfası + cevap anahtarı     */
/* ------------------------------------------------------------------ */

function printTest(t: QuestionTest, items: QuestionItem[], urls: Record<string, string>) {
  const qs = t.question_ids.map((id) => items.find((i) => i.id === id)).filter((x): x is QuestionItem => Boolean(x));
  const w = window.open("", "_blank");
  if (!w) return;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
  const cells = qs
    .map((q, i) => `<div class="q"><div class="n">${i + 1}.</div><img src="${esc(urls[q.image_path] ?? "")}" alt=""></div>`)
    .join("");
  const key = qs.map((q, i) => `<span>${i + 1}. ${q.answer ?? "—"}</span>`).join("");
  w.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${esc(t.title)}</title>
<style>
  body{font-family:system-ui,sans-serif;margin:0;color:#1f2a2e}
  header{display:flex;justify-content:space-between;align-items:end;border-bottom:1px solid #ccc;padding-bottom:6px;margin-bottom:10px}
  h1{font-size:18px;margin:0}.meta{font-size:12px;color:#555}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  .q{break-inside:avoid;border:1px solid #ddd;border-radius:8px;padding:8px;position:relative}
  .q img{width:100%;display:block}.n{font-weight:700;margin-bottom:4px}
  .key{break-before:page;font-size:14px}.key div{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-top:8px}
  @page{size:A4;margin:12mm}
</style></head><body>
<header><h1>${esc(t.title)}</h1><div class="meta">Ad soyad: ______________ · Tarih: ${formatTR(new Date().toISOString().slice(0, 10))}</div></header>
<div class="grid">${cells}</div>
<section class="key"><h1>Cevap anahtarı</h1><div>${key}</div></section>
<script>window.onload=()=>setTimeout(()=>window.print(),400)</script>
</body></html>`);
  w.document.close();
}

/* ------------------------------------------------------------------ */
/* Öğrencinin Bugün ekranı için kısa kart                               */
/* ------------------------------------------------------------------ */

export function QuestionBankTeaser({ studentId }: { studentId: string }) {
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    sb()
      .from("question_items")
      .select("id", { count: "exact", head: true })
      .eq("student_id", studentId)
      .eq("status", "open")
      .then(({ count, error }) => {
        if (!error) setOpen(count ?? 0);
      });
  }, [studentId]);
  if (open == null) return null;
  return (
    <A to={{ v: "sorular" }} className="card flex items-center gap-3 p-4 text-sm transition hover:border-primary/40">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-ink">
        <Icon name="book" size={19} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">Soru bankan</span>
        <span className="text-muted">{open ? `${open} çözülemeyen soru var · test çözerek tekrar et` : "Yapamadığın bir soruyu fotoğrafla ve sakla"}</span>
      </span>
      <Icon name="chevronRight" size={18} className="text-faint" />
    </A>
  );
}
