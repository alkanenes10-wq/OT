"use client";
// Ortak soru forumu: öğrenciler çözemedikleri soruları anonim paylaşır, birbirlerine cevap yazar.
// Öğrencinin paylaşımı ve cevabı kendi danışmanı onaylayınca herkese görünür (guncelleme-9.sql).
// Yazar kimliği istemciye hiç gelmez; tüm okuma/yazma güvenli veritabanı fonksiyonlarıyla yapılır.

import { useCallback, useEffect, useMemo, useState } from "react";
import { ALL_TOPICS } from "./curriculum";
import { errorText, sb } from "./db";
import { PageHeader } from "./shell";
import { compressImage, type QuestionItem } from "./soru-bankasi";
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Icon, Modal, PageLoader, Segmented, confirmAction, cx, useToast } from "./ui";

const BUCKET = "sorular";
const topicName = new Map(ALL_TOPICS.map((t) => [t.id, t.name]));
const SQL_HINT = "Ortak soru forumu için Supabase'de guncelleme-9.sql çalıştırılmalı.";
const missing = (e: unknown) => /forum_|schema cache|does not exist|Could not find the function/i.test(String((e as Error)?.message ?? e));

type Post = { id: string; subject: string; topic_id: string | null; note: string; image_path: string; status: string; solved: boolean; created_at: string; answer_count: number; mine: boolean };
type Answer = { id: string; body: string; image_path: string | null; status: string; helpful: boolean; created_at: string; mine: boolean; by_counselor: boolean };
type QueueItem = {
  kind: "post" | "answer";
  id: string;
  post_id: string;
  author_name: string;
  body: string;
  image_path: string | null;
  status: string;
  reported: boolean;
  created_at: string;
  post_note: string;
  post_image: string;
  post_subject: string;
};

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${Math.max(1, m)} dk önce`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} sa önce`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d} gün önce` : new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
};

async function signed(paths: (string | null | undefined)[]): Promise<Record<string, string>> {
  const uniq = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  if (!uniq.length) return {};
  const { data } = await sb().storage.from(BUCKET).createSignedUrls(uniq, 60 * 60);
  const out: Record<string, string> = {};
  for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  return out;
}

async function uploadForumImage(file: Blob): Promise<string> {
  const blob = file instanceof File ? await compressImage(file) : file;
  const path = `forum/${crypto.randomUUID()}.jpg`;
  const { error } = await sb().storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (error) throw error;
  return path;
}

/* ------------------------------------------------------------------ */
/* Soru bankasından forumda paylaş (öğrenci)                            */
/* ------------------------------------------------------------------ */
export function ShareToForum({ q, imageUrl }: { q: QuestionItem; imageUrl: string | undefined }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(q.note ?? "");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function share() {
    if (!imageUrl) return toast.show("Fotoğraf yüklenemedi, sayfayı yenileyip tekrar dene", "danger");
    setBusy(true);
    try {
      const blob = await (await fetch(imageUrl)).blob();
      const path = await uploadForumImage(blob);
      const { error } = await sb().rpc("forum_share", { p_question: q.id, p_image_path: path, p_note: note.trim().slice(0, 1000) });
      if (error) {
        await sb().storage.from(BUCKET).remove([path]).catch(() => null);
        throw error;
      }
      setDone(true);
      setOpen(false);
      toast.show("Gönderildi. Danışmanın onaylayınca arkadaşların görecek.");
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      toast.show(/duplicate|unique/i.test(msg) ? "Bu soruyu zaten paylaştın" : missing(e) ? SQL_HINT : errorText(e), "danger");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="soft" icon="users" className="w-full" onClick={() => setOpen(true)} disabled={done}>
        {done ? "Arkadaşlarına soruldu" : "Arkadaşlarına sor (anonim)"}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Arkadaşlarına sor"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Vazgeç
            </Button>
            <Button icon="check" onClick={share} loading={busy}>
              Paylaş
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="Paylaşılacak soru" className="max-h-60 w-full rounded-xl border border-line object-contain" />
          )}
          <Field label="Nerede takıldın? (isteğe bağlı)" htmlFor="fs-note">
            <textarea
              id="fs-note"
              className="field min-h-20"
              maxLength={1000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="ör. Denklemi kurdum ama x'i bulamadım"
            />
          </Field>
          <ul className="space-y-1 rounded-xl bg-surface-2 p-3 text-xs text-muted">
            <li>• Adın hiçbir yerde görünmez; arkadaşların sadece soruyu görür.</li>
            <li>• Önce danışmanın onaylar, sonra tüm öğrencilere açılır.</li>
            <li>• Fotoğrafta adın, yüzün ya da kişisel bir bilgi olmadığından emin ol.</li>
          </ul>
        </div>
      </Modal>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Forum akışı (öğrenci ve danışman)                                    */
/* ------------------------------------------------------------------ */
export function ForumBoard({ audience }: { audience: "student" | "counselor" }) {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"hepsi" | "acik" | "benim">("hepsi");
  const [subject, setSubject] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [more, setMore] = useState(true);

  const load = useCallback(
    async (before?: string) => {
      const { data, error } = await sb().rpc("forum_feed", { p_subject: subject || null, p_mine: view === "benim", p_limit: 30, p_before: before ?? null });
      if (error) {
        setError(missing(error) ? SQL_HINT : errorText(error));
        setPosts([]);
        return;
      }
      const rows = (data ?? []) as Post[];
      setMore(rows.length === 30);
      const u = await signed(rows.map((r) => r.image_path));
      setUrls((x) => ({ ...x, ...u }));
      setPosts((p) => (before ? [...(p ?? []), ...rows] : rows));
      setError(null);
    },
    [subject, view],
  );
  useEffect(() => {
    setPosts(null);
    load();
  }, [load]);

  const subjects = useMemo(() => [...new Set((posts ?? []).map((p) => p.subject).filter(Boolean))].sort(), [posts]);
  if (!posts) return <PageLoader />;
  const shown = view === "acik" ? posts.filter((p) => !p.solved) : posts;
  const open = posts.find((p) => p.id === openId) ?? null;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-full sm:w-auto sm:min-w-80">
            <Segmented
              size="sm"
              ariaLabel="Forum görünümü"
              value={view}
              onChange={setView}
              options={[
                { value: "hepsi", label: "Tüm sorular" },
                { value: "acik", label: "Cevapsız" },
                ...(audience === "student" ? [{ value: "benim" as const, label: "Sorduklarım" }] : []),
              ]}
            />
          </div>
          <select className="field h-9 w-auto py-1 text-sm" value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Ders">
            <option value="">Tüm dersler</option>
            {[...new Set([...subjects, subject].filter(Boolean))].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <p className="mt-2 text-xs text-faint">
          {audience === "student"
            ? "Herkes anonimdir. Bir soruyu biliyorsan çözüm yolunu yaz; cevabın danışman onayından sonra görünür. Kendi sorunu paylaşmak için Sorularım'da soruyu açıp “Arkadaşlarına sor” de."
            : "Tüm öğrencilerin onaylı soruları. Cevabınız hemen yayınlanır ve “Danışman” etiketiyle görünür."}
        </p>
      </Card>
      {error && <ErrorBox>{error}</ErrorBox>}
      {!error && shown.length === 0 ? (
        <Card>
          <EmptyState icon="users" title={view === "benim" ? "Henüz soru paylaşmadın" : "Burada henüz soru yok"}>
            {audience === "student" ? "Çözemediğin bir soruyu Sorularım'dan “Arkadaşlarına sor” ile paylaşabilirsin." : "Öğrenciler soru paylaştıkça ve siz onayladıkça burada görünür."}
          </EmptyState>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => setOpenId(p.id)} className="card block w-full overflow-hidden text-left transition hover:border-primary/40">
                <div className="relative h-40 bg-surface-2">
                  {urls[p.image_path] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={urls[p.image_path]} alt={`${p.subject} sorusu`} className="h-full w-full object-cover object-top" loading="lazy" />
                  )}
                  <div className="absolute left-2 top-2 flex gap-1">
                    {p.solved && <Badge tone="success">Çözüldü</Badge>}
                    {p.mine && p.status === "pending" && <Badge tone="warning">Onay bekliyor</Badge>}
                    {p.mine && p.status === "rejected" && <Badge tone="danger">Onaylanmadı</Badge>}
                    {p.mine && p.status === "approved" && <Badge>Senin sorun</Badge>}
                  </div>
                </div>
                <div className="p-3">
                  <p className="text-[11px] font-semibold tracking-wide text-muted">
                    {p.subject || "Ders belirtilmemiş"}
                    {p.topic_id ? ` · ${topicName.get(p.topic_id) ?? ""}` : ""}
                  </p>
                  {p.note && <p className="mt-0.5 line-clamp-2 text-sm">{p.note}</p>}
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
                    <Icon name="message" size={13} /> {p.answer_count} cevap · {ago(p.created_at)}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
      {more && shown.length > 0 && (
        <div className="flex justify-center">
          <Button variant="ghost" onClick={() => load(posts[posts.length - 1]?.created_at)}>
            Daha fazla
          </Button>
        </div>
      )}
      {open && (
        <ForumThread
          post={open}
          imageUrl={urls[open.image_path]}
          audience={audience}
          onClose={() => setOpenId(null)}
          onChanged={(patch) => setPosts((ps) => (ps ?? []).map((x) => (x.id === open.id ? { ...x, ...patch } : x)))}
          onDeleted={() => {
            setOpenId(null);
            setPosts((ps) => (ps ?? []).filter((x) => x.id !== open.id));
          }}
        />
      )}
    </div>
  );
}

function ForumThread({
  post,
  imageUrl,
  audience,
  onClose,
  onChanged,
  onDeleted,
}: {
  post: Post;
  imageUrl: string | undefined;
  audience: "student" | "counselor";
  onClose: () => void;
  onChanged: (patch: Partial<Post>) => void;
  onDeleted: () => void;
}) {
  const toast = useToast();
  const [answers, setAnswers] = useState<Answer[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await sb().rpc("forum_thread", { p_post: post.id });
    if (error) {
      toast.show(errorText(error), "danger");
      return setAnswers([]);
    }
    const rows = (data ?? []) as Answer[];
    setUrls(await signed(rows.map((r) => r.image_path)));
    setAnswers(rows);
    onChanged({ answer_count: rows.filter((a) => a.status === "approved").length });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id]);
  useEffect(() => {
    load();
  }, [load]);

  async function reply() {
    if (!body.trim()) return;
    setBusy(true);
    try {
      const path = file ? await uploadForumImage(file) : null;
      const { error } = await sb().rpc("forum_reply", { p_post: post.id, p_body: body.trim(), p_image_path: path });
      if (error) throw error;
      setBody("");
      setFile(null);
      toast.show(audience === "student" ? "Cevabın danışmanına gönderildi; onaylanınca herkes görecek" : "Cevap yayınlandı");
      load();
    } catch (e) {
      toast.show(errorText(e), "danger");
    } finally {
      setBusy(false);
    }
  }

  async function helpful(a: Answer) {
    const { error } = await sb().rpc("forum_mark_helpful", { p_answer: a.id });
    if (error) return toast.show(errorText(error), "danger");
    toast.show("Teşekkürler! Soru “çözüldü” olarak işaretlendi");
    onChanged({ solved: true });
    load();
  }

  async function report(kind: "post" | "answer", id: string) {
    if (!confirmAction("Bu içerik uygunsuz mu? Danışmana bildirilecek.")) return;
    const { error } = await sb().rpc("forum_report", { p_kind: kind, p_id: id });
    if (error) return toast.show(errorText(error), "danger");
    toast.show("Bildirildi, teşekkürler");
  }

  async function removeOwn(kind: "post" | "answer", id: string) {
    if (!confirmAction(kind === "post" ? "Sorun forumdan kaldırılsın mı? (Sorularım'da kalır)" : "Cevabın silinsin mi?")) return;
    const { error } = await sb().rpc("forum_delete_own", { p_kind: kind, p_id: id });
    if (error) return toast.show(errorText(error), "danger");
    if (kind === "post") onDeleted();
    else load();
  }

  async function hide(kind: "post" | "answer", id: string) {
    if (!confirmAction("Bu içerik forumdan gizlensin mi?")) return;
    const { error } = await sb().rpc("forum_moderate", { p_kind: kind, p_id: id, p_action: "hide" });
    if (error) return toast.show(errorText(error), "danger");
    toast.show("Gizlendi");
    if (kind === "post") onDeleted();
    else load();
  }

  return (
    <Modal open onClose={onClose} title={`${post.subject || "Soru"}${post.topic_id ? ` · ${topicName.get(post.topic_id) ?? ""}` : ""}`}>
      <div className="space-y-4">
        {imageUrl && (
          <button type="button" onClick={() => setZoom((z) => !z)} className="block w-full" aria-label="Fotoğrafı büyüt">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="Soru" className={cx("w-full rounded-xl border border-line object-contain", zoom ? "max-h-none" : "max-h-72")} />
          </button>
        )}
        {post.note && <p className="rounded-xl bg-surface-2 p-3 text-sm">“{post.note}”</p>}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span>Bir arkadaşın sordu · {ago(post.created_at)}</span>
          {post.mine && post.status === "pending" && <Badge tone="warning">Danışmanın onayını bekliyor</Badge>}
          {post.mine && post.status === "rejected" && <Badge tone="danger">Danışmanın onaylamadı</Badge>}
          <span className="ml-auto flex gap-3">
            {post.mine ? (
              <button className="hover:text-danger" onClick={() => removeOwn("post", post.id)}>
                Forumdan kaldır
              </button>
            ) : audience === "counselor" ? (
              <button className="hover:text-danger" onClick={() => hide("post", post.id)}>
                Gizle
              </button>
            ) : (
              <button className="hover:text-danger" onClick={() => report("post", post.id)}>
                Bildir
              </button>
            )}
          </span>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold">Cevaplar</p>
          {!answers ? (
            <PageLoader />
          ) : answers.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line p-3 text-sm text-muted">Henüz cevap yok. Çözüm yolunu bilen ilk kişi sen ol.</p>
          ) : (
            <ul className="space-y-2">
              {answers.map((a) => (
                <li key={a.id} className={cx("rounded-xl border p-3", a.helpful ? "border-success/40 bg-success-soft/50" : "border-line", a.status !== "approved" && "border-dashed opacity-80")}>
                  <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    <span className="font-semibold text-fg">{a.by_counselor ? "Danışman" : a.mine ? "Sen" : "Bir arkadaşın"}</span>
                    {a.by_counselor && <Badge tone="primary">Danışman</Badge>}
                    {a.helpful && <Badge tone="success">İşe yaradı</Badge>}
                    {a.status === "pending" && <Badge tone="warning">Onay bekliyor</Badge>}
                    {a.status === "rejected" && <Badge tone="danger">Onaylanmadı</Badge>}
                    <span>· {ago(a.created_at)}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{a.body}</p>
                  {a.image_path && urls[a.image_path] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={urls[a.image_path]} alt="Çözüm fotoğrafı" className="mt-2 max-h-64 rounded-lg border border-line object-contain" />
                  )}
                  <div className="mt-2 flex flex-wrap gap-3 text-xs">
                    {post.mine && !a.mine && a.status === "approved" && !a.helpful && (
                      <button className="font-medium text-success hover:underline" onClick={() => helpful(a)}>
                        ✓ İşime yaradı
                      </button>
                    )}
                    {a.mine ? (
                      <button className="text-muted hover:text-danger" onClick={() => removeOwn("answer", a.id)}>
                        Sil
                      </button>
                    ) : audience === "counselor" ? (
                      <button className="text-muted hover:text-danger" onClick={() => hide("answer", a.id)}>
                        Gizle
                      </button>
                    ) : (
                      <button className="text-muted hover:text-danger" onClick={() => report("answer", a.id)}>
                        Bildir
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {(post.status === "approved" || post.mine) && (
          <div className="space-y-2 border-t border-line pt-3">
            <textarea
              className="field min-h-24"
              maxLength={2000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={post.mine ? "Arkadaşlarına ek bilgi yaz…" : "Çözüm yolunu adım adım anlat. Sadece cevabı değil, nasıl düşündüğünü yaz."}
              aria-label="Cevabın"
            />
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm hover:bg-surface-2">
                <Icon name="plus" size={15} /> {file ? file.name.slice(0, 24) : "Çözüm fotoğrafı"}
                <input type="file" accept="image/*" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </label>
              <Button icon="message" className="ml-auto" onClick={reply} loading={busy} disabled={!body.trim()}>
                Cevabı gönder
              </Button>
            </div>
            {audience === "student" && <p className="text-xs text-faint">Adın görünmez. Cevabın danışmanın onayından sonra herkese açılır; kırıcı ya da kişisel içerik onaylanmaz.</p>}
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Danışman: onay kuyruğu                                               */
/* ------------------------------------------------------------------ */
export function ForumModeration({ onCount }: { onCount?: (n: number) => void }) {
  const toast = useToast();
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await sb().rpc("forum_queue");
    if (error) {
      setError(missing(error) ? SQL_HINT : errorText(error));
      return setItems([]);
    }
    const rows = (data ?? []) as QueueItem[];
    setUrls(await signed(rows.flatMap((r) => [r.image_path, r.post_image])));
    setItems(rows);
    onCount?.(rows.length);
  }, [onCount]);
  useEffect(() => {
    load();
  }, [load]);

  async function act(it: QueueItem, action: "approve" | "reject" | "hide" | "keep") {
    const { error } = await sb().rpc("forum_moderate", { p_kind: it.kind, p_id: it.id, p_action: action });
    if (error) return toast.show(errorText(error), "danger");
    setItems((xs) => {
      const next = (xs ?? []).filter((x) => !(x.id === it.id && x.kind === it.kind));
      onCount?.(next.length);
      return next;
    });
    toast.show(action === "approve" ? "Yayınlandı" : action === "keep" ? "Bildirim kapatıldı" : "Kaldırıldı");
  }

  if (!items) return <PageLoader />;
  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!items.length)
    return (
      <Card>
        <EmptyState icon="check" title="Onay bekleyen bir şey yok">
          Öğrencilerinizin paylaştığı sorular ve yazdığı cevaplar burada onayınızı bekler. Bildirilen içerikler de buraya düşer.
        </EmptyState>
      </Card>
    );

  return (
    <ul className="space-y-3">
      {items.map((it) => (
        <li key={`${it.kind}-${it.id}`} className="card p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="font-semibold text-fg">{it.author_name}</span>
            <Badge tone={it.kind === "post" ? "primary" : "neutral"}>{it.kind === "post" ? "Soru paylaşımı" : "Cevap"}</Badge>
            {it.reported && <Badge tone="danger">Bildirildi</Badge>}
            <span>
              {it.post_subject} · {ago(it.created_at)}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
            {urls[it.post_image] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={urls[it.post_image]} alt="Soru" className="max-h-40 w-full rounded-lg border border-line object-contain" />
            )}
            <div className="min-w-0 space-y-2">
              {it.kind === "answer" && it.post_note && <p className="text-xs text-muted">Soru notu: “{it.post_note}”</p>}
              {it.body ? <p className="whitespace-pre-wrap text-[15px]">{it.body}</p> : <p className="text-sm text-faint">(Not yazılmamış)</p>}
              {it.kind === "answer" && it.image_path && urls[it.image_path] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={urls[it.image_path]} alt="Cevap fotoğrafı" className="max-h-48 rounded-lg border border-line object-contain" />
              )}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            {it.reported && it.status === "approved" ? (
              <>
                <Button size="sm" variant="ghost" onClick={() => act(it, "keep")}>
                  Sorun yok, kalsın
                </Button>
                <Button size="sm" variant="danger" icon="trash" onClick={() => act(it, "hide")}>
                  Gizle
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="ghost" icon="x" onClick={() => act(it, "reject")}>
                  Onaylama
                </Button>
                <Button size="sm" icon="check" onClick={() => act(it, "approve")}>
                  Onayla ve yayınla
                </Button>
              </>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function CounselorForum() {
  const [view, setView] = useState<"onay" | "forum">("onay");
  const [count, setCount] = useState<number | null>(null);
  return (
    <div className="space-y-4">
      <PageHeader title="Soru forumu" subtitle="Öğrenciler birbirine anonim olarak yardım eder; kendi öğrencilerinizin paylaşımları onayınızla yayınlanır." />
      <div className="max-w-md">
        <Segmented
          ariaLabel="Forum bölümü"
          value={view}
          onChange={setView}
          options={[
            { value: "onay", label: `Onay bekleyen${count != null ? ` (${count})` : ""}` },
            { value: "forum", label: "Forum" },
          ]}
        />
      </div>
      {view === "onay" ? <ForumModeration onCount={setCount} /> : <ForumBoard audience="counselor" />}
    </div>
  );
}
