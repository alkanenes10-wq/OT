"use client";
// Yapay zekâ ile soru çözümü: öğrenci fotoğraf yükler, önce ipucu alır; isterse adım adım çözümü açar.
// Danışman öğrencinin sorduğu soruları ve çözümü açıp açmadığını görür; günlük sınırı öğrenci bazında ayarlar.

import { useCallback, useEffect, useRef, useState } from "react";
import { accessToken, errorText, sb, useStudentMeta } from "./db";
import { formatTR, relativeDay, subjectsFor } from "./lib";
import { compressImage } from "./soru-bankasi";
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Icon, PageLoader, cx, useToast } from "./ui";

type AiQuestion = { id: string; student_id: string; image_path: string; subject: string; note: string; hint: string | null; solution: string | null; solution_at: string | null; created_at: string };
type Status = { configured: boolean; limit: number; used: number; default_limit: number };

const BUCKET = "sorular";
const missing = (m: string) => /ai_questions|ai_settings|schema cache|does not exist/i.test(m);

async function api<T>(method: "GET" | "POST", body?: unknown): Promise<T & { ok: boolean; error?: string }> {
  const r = await fetch("/api/soru-coz", {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${await accessToken()}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return (await r.json().catch(() => ({ ok: false, error: "Sunucu yanıt vermedi" }))) as T & { ok: boolean; error?: string };
}

async function signed(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data } = await sb().storage.from(BUCKET).createSignedUrls(paths, 3600);
  return Object.fromEntries((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path as string, d.signedUrl as string]));
}

function useQuestions(studentId: string) {
  const [list, setList] = useState<AiQuestion[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const { data, error: e } = await sb().from("ai_questions").select("*").eq("student_id", studentId).order("created_at", { ascending: false }).limit(60);
    if (e) {
      setList([]);
      return setError(missing(e.message) ? "Yapay zekâ soru çözümü için Supabase'de guncelleme-hepsi.sql çalıştırılmalı." : errorText(e));
    }
    const rows = (data ?? []) as AiQuestion[];
    setList(rows);
    setUrls(await signed(rows.map((r) => r.image_path)));
  }, [studentId]);
  useEffect(() => {
    load();
  }, [load]);
  return { list, urls, error, load, setList };
}

/* ------------------------------------------------------------------ */
/* Öğrenci                                                              */
/* ------------------------------------------------------------------ */
export function StudentAi({ studentId }: { studentId: string }) {
  const toast = useToast();
  const meta = useStudentMeta(studentId);
  const subjects = subjectsFor(meta.field).filter((s) => s !== "GÜNLÜK TEKRAR");
  const { list, urls, error, load } = useQuestions(studentId);
  const [status, setStatus] = useState<Status | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"" | "ipucu" | string>("");
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const refreshStatus = useCallback(() => {
    api<Status>("GET").then((s) => s.ok && setStatus(s));
  }, []);
  useEffect(refreshStatus, [refreshStatus]);
  useEffect(() => {
    if (!file) return setPreview(null);
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  async function askHint() {
    if (!file) return;
    setErr(null);
    setBusy("ipucu");
    try {
      const blob = await compressImage(file, 1400);
      const path = `${studentId}/yz-${crypto.randomUUID()}.jpg`;
      const up = await sb().storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (up.error) throw up.error;
      const res = await api<{ id: string; hint: string; left: number }>("POST", { mode: "ipucu", image_path: path, subject, note });
      if (!res.ok) {
        await sb().storage.from(BUCKET).remove([path]);
        throw new Error(res.error);
      }
      setFile(null);
      setNote("");
      if (input.current) input.current.value = "";
      toast.show("İpucun hazır");
      await load();
      refreshStatus();
    } catch (e) {
      setErr(errorText(e));
    }
    setBusy("");
  }

  async function openSolution(q: AiQuestion) {
    setBusy(q.id);
    const res = await api<{ solution: string }>("POST", { mode: "cozum", id: q.id });
    setBusy("");
    if (!res.ok) return toast.show(res.error ?? "Çözüm alınamadı", "danger");
    await load();
  }

  const left = status ? Math.max(0, status.limit - status.used) : null;
  const closed = status?.limit === 0;

  return (
    <div className="space-y-4">
      <Card title="Yapay zekâya sor" subtitle="Önce ipucu alırsın; kendin denedikten sonra istersen çözümü açarsın.">
        {status && !status.configured ? (
          <p className="rounded-xl bg-warning-soft p-3 text-sm">Yapay zekâ henüz kurulmadı. Danışmanın kurulumu tamamladığında buradan soru sorabilirsin.</p>
        ) : closed ? (
          <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted">Bu özellik danışmanın tarafından kapatılmış. Sorularını Sorularım bölümüne ekleyebilir ya da foruma sorabilirsin.</p>
        ) : (
          <div className="space-y-3">
            <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            {preview ? (
              <div className="relative overflow-hidden rounded-xl border border-line bg-surface-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="Soru fotoğrafı" className="mx-auto max-h-72 object-contain" />
                <button type="button" onClick={() => input.current?.click()} className="absolute right-2 top-2 rounded-lg bg-black/60 px-2.5 py-1 text-xs font-medium text-white">
                  Değiştir
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => input.current?.click()}
                className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-line px-4 py-8 text-sm text-muted transition-colors hover:border-primary/50 hover:text-fg"
              >
                <Icon name="plus" size={26} />
                <span className="font-semibold text-fg">Sorunun fotoğrafını çek ya da seç</span>
                <span className="text-xs">Tek soru, net ve düz çekilmiş olsun</span>
              </button>
            )}
            {file && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Ders (isteğe bağlı)" htmlFor="yz-ders">
                  <select id="yz-ders" className="field" value={subject} onChange={(e) => setSubject(e.target.value)}>
                    <option value="">Seçilmedi</option>
                    {subjects.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Nerede takıldın? (isteğe bağlı)" htmlFor="yz-not">
                  <input id="yz-not" className="field" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="ör. Denklemi kurdum ama çözemedim" />
                </Field>
              </div>
            )}
            {err && <ErrorBox>{err}</ErrorBox>}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted">{left != null ? `Bugün ${left}/${status!.limit} soru hakkın var` : ""}</p>
              <Button icon="lifebuoy" loading={busy === "ipucu"} disabled={!file || left === 0} onClick={askHint}>
                İpucu al
              </Button>
            </div>
          </div>
        )}
      </Card>

      {error && <ErrorBox>{error}</ErrorBox>}
      {!list ? (
        <PageLoader />
      ) : list.length === 0 ? (
        !error && (
          <Card>
            <EmptyState icon="question" title="Henüz soru sormadın">
              Takıldığın sorunun fotoğrafını yükle; önce yol gösteren bir ipucu alırsın.
            </EmptyState>
          </Card>
        )
      ) : (
        <ul className="space-y-4">
          {list.map((q) => (
            <li key={q.id}>
              <QuestionCard q={q} url={urls[q.image_path]} action={!q.solution ? <Button size="sm" variant="secondary" loading={busy === q.id} onClick={() => openSolution(q)}>Denedim, çözümü göster</Button> : null} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function QuestionCard({ q, url, action }: { q: AiQuestion; url?: string; action?: React.ReactNode }) {
  const [zoom, setZoom] = useState(false);
  return (
    <section className="card overflow-hidden">
      <div className="flex gap-3 p-4">
        <button type="button" onClick={() => setZoom(!zoom)} className={cx("shrink-0 overflow-hidden rounded-lg border border-line bg-surface-2", zoom ? "w-full" : "h-20 w-20")} aria-label="Fotoğrafı büyüt">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {url ? <img src={url} alt="Soru" className={cx(zoom ? "max-h-[70vh] w-full object-contain" : "h-full w-full object-cover")} /> : null}
        </button>
        {!zoom && (
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
              {q.subject && <Badge tone="primary">{q.subject}</Badge>}
              <span>{relativeDay(q.created_at.slice(0, 10))}</span>
              {q.solution ? <Badge tone="success">Çözüm açıldı</Badge> : <Badge>Yalnızca ipucu</Badge>}
            </p>
            {q.note && <p className="mt-1 text-sm text-muted">“{q.note}”</p>}
          </div>
        )}
      </div>
      <div className="space-y-3 border-t border-line p-4">
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-primary-ink">İpucu</p>
          <p className="whitespace-pre-line text-sm leading-relaxed">{q.hint}</p>
        </div>
        {q.solution ? (
          <div className="rounded-xl bg-surface-2 p-3">
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Adım adım çözüm</p>
            <p className="whitespace-pre-line text-sm leading-relaxed">{q.solution}</p>
          </div>
        ) : (
          action && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted">Önce ipucuyla kendin dene.</p>
              {action}
            </div>
          )
        )}
        <p className="text-[11px] text-faint">Yapay zekâ hata yapabilir; emin olmadığın çözümü danışmanına sor.</p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Danışman: öğrencinin sorduğu sorular + günlük sınır                   */
/* ------------------------------------------------------------------ */
export function CounselorAi({ studentId }: { studentId: string }) {
  const toast = useToast();
  const { list, urls, error } = useQuestions(studentId);
  const [limit, setLimit] = useState<string>("");
  const [saved, setSaved] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    sb()
      .from("ai_settings")
      .select("daily_limit")
      .eq("student_id", studentId)
      .maybeSingle()
      .then(({ data }) => {
        const v = (data as { daily_limit: number } | null)?.daily_limit ?? null;
        setSaved(v);
        setLimit(v == null ? "" : String(v));
      });
  }, [studentId]);

  async function save() {
    const n = limit.trim() === "" ? null : Math.max(0, Math.min(50, Math.round(Number(limit))));
    setBusy(true);
    const res = n == null ? await sb().from("ai_settings").delete().eq("student_id", studentId) : await sb().from("ai_settings").upsert({ student_id: studentId, daily_limit: n, updated_at: new Date().toISOString() });
    setBusy(false);
    if (res.error) return toast.show(missing(res.error.message) ? "guncelleme-hepsi.sql çalıştırılmalı" : errorText(res.error), "danger");
    setSaved(n);
    toast.show(n === 0 ? "Bu öğrenci için kapatıldı" : n == null ? "Varsayılan sınıra dönüldü" : `Günlük sınır ${n} soru`);
  }

  const opened = (list ?? []).filter((q) => q.solution).length;
  return (
    <div className="space-y-4">
      <Card title="Yapay zekâ ile soru çözümü" subtitle="Öğrenci önce ipucu alır; çözümü ancak kendisi isterse açar.">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-muted">
            Günlük soru sınırı
            <input className="field mt-1 h-9 w-28 text-sm" inputMode="numeric" placeholder="varsayılan 5" value={limit} onChange={(e) => setLimit(e.target.value.replace(/\D/g, ""))} />
          </label>
          <Button size="sm" loading={busy} onClick={save}>
            Kaydet
          </Button>
          <p className="basis-full text-xs text-muted">
            Boş = varsayılan (5). 0 = bu öğrenci için kapalı. Şu an: {saved == null ? "varsayılan" : saved === 0 ? "kapalı" : `${saved} soru/gün`}.
          </p>
        </div>
        {list && list.length > 0 && (
          <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-sm">
            Son {list.length} sorunun <b className="font-semibold">{opened}</b>&apos;inde çözümü açtı, {list.length - opened}&apos;ini ipucuyla bıraktı.
          </p>
        )}
      </Card>
      {error && <ErrorBox>{error}</ErrorBox>}
      {!list ? (
        <PageLoader />
      ) : list.length === 0 ? (
        !error && <p className="py-4 text-center text-sm text-muted">Öğrenci henüz yapay zekâya soru sormadı.</p>
      ) : (
        <ul className="space-y-4">
          {list.map((q) => (
            <li key={q.id}>
              <p className="mb-1 text-xs text-faint">{formatTR(q.created_at.slice(0, 10))}</p>
              <QuestionCard q={q} url={urls[q.image_path]} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
