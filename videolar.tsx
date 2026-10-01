"use client";
// Rehber videoları: erteleme, sınav kaygısı, zaman yönetimi gibi konularda danışmanın eklediği YouTube videoları.
// • Danışman bağlantıyı yapıştırır, başlık ve kategori seçer (guide_videos tablosu, guncelleme-hepsi.sql).
// • Öğrenci "Videolar" sayfasında izler; son 3 günün günlüğüne göre ilgili videolar "Senin için" olarak önerilir.

import { useCallback, useEffect, useMemo, useState } from "react";
import { errorText, sb, useAuth, useRoute } from "./db";
import { addDays, todayISO, type DailyLog } from "./lib";
import { Button, Card, EmptyState, ErrorBox, Field, Icon, IconButton, Modal, PageLoader, Tabs, cx, useToast, type IconName } from "./ui";

export type VideoCategory = "erteleme" | "kaygi" | "zaman" | "motivasyon" | "uyku" | "telefon" | "diger";
export type GuideVideo = { id: string; counselor_id: string; category: VideoCategory; title: string; youtube_id: string; start_sec: number; sort: number; created_at: string };

export const VIDEO_CATEGORIES: { value: VideoCategory; label: string; icon: IconName }[] = [
  { value: "erteleme", label: "Erteleme", icon: "clock" },
  { value: "kaygi", label: "Sınav kaygısı", icon: "heart" },
  { value: "zaman", label: "Zaman yönetimi", icon: "calendar" },
  { value: "motivasyon", label: "Motivasyon", icon: "target" },
  { value: "uyku", label: "Uyku ve dinlenme", icon: "lifebuoy" },
  { value: "telefon", label: "Telefon ve dikkat", icon: "phone" },
  { value: "diger", label: "Diğer", icon: "play" },
];
const catLabel = (c: VideoCategory) => VIDEO_CATEGORIES.find((x) => x.value === c)?.label ?? c;

/** YouTube bağlantısından video kimliği ve başlangıç saniyesi */
export function parseYouTube(input: string): { id: string; start: number } | null {
  const s = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return { id: s, start: 0 };
  let u: URL;
  try {
    u = new URL(s.startsWith("http") ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = u.pathname.slice(1, 12);
  else if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
    if (u.pathname === "/watch") id = u.searchParams.get("v");
    else {
      const m = u.pathname.match(/^\/(embed|shorts|live|v)\/([A-Za-z0-9_-]{11})/);
      if (m) id = m[2];
    }
  }
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
  const t = u.searchParams.get("t") ?? u.searchParams.get("start") ?? "";
  let start = 0;
  const hms = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
  if (hms) start = Number(hms[1] ?? 0) * 3600 + Number(hms[2] ?? 0) * 60 + Number(hms[3] ?? 0);
  return { id, start: Number.isFinite(start) ? start : 0 };
}

const thumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

async function fetchVideos(): Promise<GuideVideo[]> {
  const { data, error } = await sb().from("guide_videos").select("*").order("category").order("sort").order("created_at");
  if (error) throw error;
  return (data ?? []) as GuideVideo[];
}

/* ------------------------------------------------------------------ */
/* Günlüğe göre öneri                                                   */
/* ------------------------------------------------------------------ */
export type VideoSuggestion = { category: VideoCategory; reason: string };

/** Son 3 günün günlüğünden öneri kategorileri (en yeni kayıttan başlayarak, her kategori bir kez) */
export function suggestFromLogs(logs: Pick<DailyLog, "log_date" | "procrastinated" | "replanned" | "anxiety" | "motivation" | "sleep_hours" | "phone_minutes">[], today = todayISO()): VideoSuggestion[] {
  const from = addDays(today, -2);
  const recent = logs.filter((l) => l.log_date >= from && l.log_date <= today).sort((a, b) => b.log_date.localeCompare(a.log_date));
  const when = (d: string) => (d === today ? "Bugün" : d === addDays(today, -1) ? "Dün" : "Son günlerde");
  const out = new Map<VideoCategory, string>();
  for (const l of recent) {
    if (l.procrastinated && !out.has("erteleme")) out.set("erteleme", `${when(l.log_date)} günlüğünde erteleme yaşadığını işaretledin.`);
    if (l.replanned && !out.has("zaman")) out.set("zaman", `${when(l.log_date)} planını değiştirmek zorunda kaldığını yazdın.`);
    if (l.anxiety != null && l.anxiety >= 4 && !out.has("kaygi")) out.set("kaygi", `${when(l.log_date)} kaygını ${l.anxiety}/5 olarak işaretledin.`);
    if (l.motivation != null && l.motivation <= 2 && !out.has("motivasyon")) out.set("motivasyon", `${when(l.log_date)} motivasyonunu ${l.motivation}/5 olarak işaretledin.`);
    if (l.sleep_hours != null && Number(l.sleep_hours) < 6 && !out.has("uyku")) out.set("uyku", `${when(l.log_date)} ${Number(l.sleep_hours)} saat uyuduğunu yazdın.`);
    if (l.phone_minutes != null && l.phone_minutes > 180 && !out.has("telefon")) out.set("telefon", `${when(l.log_date)} telefonda ${Math.round(l.phone_minutes / 6) / 10} saat geçirdiğini yazdın.`);
  }
  const order: VideoCategory[] = ["erteleme", "kaygi", "zaman", "motivasyon", "uyku", "telefon"];
  return order.filter((c) => out.has(c)).map((c) => ({ category: c, reason: out.get(c)! }));
}

function useStudentSuggestions(studentId: string | undefined) {
  const [state, setState] = useState<{ videos: GuideVideo[]; suggestions: VideoSuggestion[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!studentId) return;
    let alive = true;
    Promise.all([
      fetchVideos(),
      sb()
        .from("daily_logs")
        .select("log_date, procrastinated, replanned, anxiety, motivation, sleep_hours, phone_minutes")
        .eq("student_id", studentId)
        .gte("log_date", addDays(todayISO(), -2)),
    ])
      .then(([videos, logs]) => {
        if (!alive) return;
        if (logs.error) throw logs.error;
        setState({ videos, suggestions: suggestFromLogs((logs.data ?? []) as DailyLog[]) });
      })
      .catch((e) => alive && setError(errorText(e)));
    return () => {
      alive = false;
    };
  }, [studentId]);
  return { state, error };
}

/* ------------------------------------------------------------------ */
/* Ortak parçalar                                                       */
/* ------------------------------------------------------------------ */
function VideoThumb({ v, onPlay, size = "md" }: { v: GuideVideo; onPlay: () => void; size?: "sm" | "md" }) {
  return (
    <button type="button" onClick={onPlay} className={cx("group block w-full text-left", size === "sm" && "flex items-center gap-3")}>
      <span className={cx("relative block overflow-hidden rounded-xl bg-surface-2", size === "sm" ? "aspect-video w-28 shrink-0" : "aspect-video w-full")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumb(v.youtube_id)}
          alt=""
          loading="lazy"
          onError={(e) => (e.currentTarget.style.visibility = "hidden")}
          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
        />
        <span className="absolute inset-0 flex items-center justify-center bg-black/10 transition group-hover:bg-black/25">
          <span className={cx("flex items-center justify-center rounded-full bg-black/60 text-white", size === "sm" ? "h-8 w-8" : "h-12 w-12")}>
            <Icon name="play" size={size === "sm" ? 16 : 22} />
          </span>
        </span>
      </span>
      <span className={cx("block", size === "sm" ? "min-w-0 text-sm" : "mt-2 text-sm")}>
        <span className="line-clamp-2 font-medium leading-snug">{v.title}</span>
        <span className="mt-0.5 block text-xs text-muted">{catLabel(v.category)}</span>
      </span>
    </button>
  );
}

export function VideoPlayer({ v, onClose }: { v: GuideVideo; onClose: () => void }) {
  const src = `https://www.youtube-nocookie.com/embed/${v.youtube_id}?rel=0&modestbranding=1&playsinline=1&autoplay=1${v.start_sec ? `&start=${v.start_sec}` : ""}`;
  return (
    <Modal open onClose={onClose} title={v.title}>
      <div className="-mx-5 -mt-4 aspect-video bg-black sm:mx-0 sm:mt-0 sm:overflow-hidden sm:rounded-xl">
        <iframe
          src={src}
          title={v.title}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
      <p className="mt-3 text-xs text-muted">{catLabel(v.category)}</p>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Öğrenci: "Bugün" ekranındaki öneri kartı                              */
/* ------------------------------------------------------------------ */
export function VideoSuggestionsCard() {
  const { profile } = useAuth();
  const { go } = useRoute();
  const { state } = useStudentSuggestions(profile?.id);
  const [playing, setPlaying] = useState<GuideVideo | null>(null);
  if (!state || !state.suggestions.length) return null;
  const items = state.suggestions
    .map((s) => ({ s, videos: state.videos.filter((v) => v.category === s.category) }))
    .filter((x) => x.videos.length > 0)
    .slice(0, 2);
  if (!items.length) return null;
  return (
    <Card title="Senin için videolar" subtitle="Son günlüklerine göre seçildi" action={<Button size="sm" variant="ghost" onClick={() => go({ v: "videolar" })}>Tümü</Button>}>
      <div className="space-y-4">
        {items.map(({ s, videos }) => (
          <div key={s.category}>
            <p className="mb-2 text-xs text-muted">
              <b className="font-semibold text-fg">{catLabel(s.category)}:</b> {s.reason}
            </p>
            <ul className="space-y-2">
              {videos.slice(0, 2).map((v) => (
                <li key={v.id}>
                  <VideoThumb v={v} size="sm" onPlay={() => setPlaying(v)} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {playing && <VideoPlayer v={playing} onClose={() => setPlaying(null)} />}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Öğrenci: Videolar sayfası                                            */
/* ------------------------------------------------------------------ */
export function StudentVideos() {
  const { profile } = useAuth();
  const { state, error } = useStudentSuggestions(profile?.id);
  const [cat, setCat] = useState<"hepsi" | VideoCategory>("hepsi");
  const [playing, setPlaying] = useState<GuideVideo | null>(null);

  if (error) return <ErrorBox>{/guide_videos/.test(error) ? "Videolar henüz hazır değil. Danışmanının güncellemeyi tamamlaması gerekiyor." : error}</ErrorBox>;
  if (!state) return <PageLoader />;
  const { videos, suggestions } = state;
  const cats = VIDEO_CATEGORIES.filter((c) => videos.some((v) => v.category === c.value));
  const suggested = suggestions.flatMap((s) => videos.filter((v) => v.category === s.category).slice(0, 3).map((v) => ({ v, reason: s.reason })));
  const shown = cat === "hepsi" ? videos : videos.filter((v) => v.category === cat);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="display text-[28px] leading-tight">Videolar</h1>
        <p className="text-sm text-muted">Erteleme, sınav kaygısı, zaman yönetimi ve daha fazlası</p>
      </div>

      {suggested.length > 0 && (
        <Card title="Senin için önerilenler" subtitle="Son 3 günün günlüğüne göre">
          <ul className="grid gap-3 sm:grid-cols-2">
            {suggested.map(({ v, reason }) => (
              <li key={v.id}>
                <VideoThumb v={v} size="sm" onPlay={() => setPlaying(v)} />
                <p className="mt-1 text-xs text-faint">{reason}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {videos.length === 0 ? (
        <Card>
          <EmptyState icon="video" title="Henüz video yok">
            Danışmanın video eklediğinde burada görünecek.
          </EmptyState>
        </Card>
      ) : (
        <>
          <Tabs tabs={[{ value: "hepsi" as const, label: "Tümü" }, ...cats.map((c) => ({ value: c.value, label: c.label, icon: c.icon }))]} value={cat} onChange={setCat} />
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((v) => (
              <li key={v.id} className="card p-3">
                <VideoThumb v={v} onPlay={() => setPlaying(v)} />
              </li>
            ))}
          </ul>
        </>
      )}
      {playing && <VideoPlayer v={playing} onClose={() => setPlaying(null)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Danışman: video yönetimi                                             */
/* ------------------------------------------------------------------ */
export function CounselorVideos() {
  const toast = useToast();
  const [videos, setVideos] = useState<GuideVideo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<VideoCategory>("erteleme");
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState<GuideVideo | null>(null);
  const parsed = useMemo(() => (url.trim() ? parseYouTube(url) : null), [url]);

  const load = useCallback(() => {
    fetchVideos()
      .then(setVideos)
      .catch((e) => setError(errorText(e)));
  }, []);
  useEffect(load, [load]);

  // Başlığı YouTube'dan doldurmayı dene (olmazsa elle yazılır)
  useEffect(() => {
    if (!parsed || title.trim()) return;
    const ctrl = new AbortController();
    fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${parsed.id}`)}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { title?: string } | null) => j?.title && setTitle((t) => t || String(j.title).slice(0, 150)))
      .catch(() => {});
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed?.id]);

  async function add() {
    if (!parsed) return toast.show("Geçerli bir YouTube bağlantısı yapıştırın", "danger");
    if (!title.trim()) return toast.show("Video başlığı yazın", "danger");
    setBusy(true);
    const sort = (videos ?? []).filter((v) => v.category === category).length;
    const { error: e } = await sb().from("guide_videos").insert({ category, title: title.trim().slice(0, 150), youtube_id: parsed.id, start_sec: parsed.start, sort });
    setBusy(false);
    if (e) return toast.show(/guide_videos/.test(e.message) ? "Önce guncelleme-hepsi.sql çalıştırılmalı" : errorText(e), "danger");
    setUrl("");
    setTitle("");
    toast.show("Video eklendi");
    load();
  }

  async function patch(v: GuideVideo, values: Partial<GuideVideo>) {
    const { error: e } = await sb().from("guide_videos").update(values).eq("id", v.id);
    if (e) return toast.show(errorText(e), "danger");
    load();
  }
  async function remove(v: GuideVideo) {
    if (!window.confirm(`"${v.title}" silinsin mi?`)) return;
    const { error: e } = await sb().from("guide_videos").delete().eq("id", v.id);
    if (e) return toast.show(errorText(e), "danger");
    toast.show("Video silindi");
    load();
  }
  async function move(v: GuideVideo, dir: -1 | 1) {
    const list = (videos ?? []).filter((x) => x.category === v.category);
    const i = list.findIndex((x) => x.id === v.id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const reordered = [...list];
    [reordered[i], reordered[j]] = [reordered[j], reordered[i]];
    await Promise.all(reordered.map((x, k) => (x.sort === k ? null : sb().from("guide_videos").update({ sort: k }).eq("id", x.id))));
    load();
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="display text-2xl sm:text-[32px]">Rehber videoları</h1>
        <p className="text-sm text-muted">
          Öğrenciler videoları kendi &quot;Videolar&quot; sayfasında izler. Günlüğünde erteleme, plan değişikliği, yüksek kaygı, düşük motivasyon, kısa uyku ya da uzun telefon süresi işaretleyen öğrenciye ilgili kategorideki videolar ana ekranında önerilir.
        </p>
      </div>
      {error && <ErrorBox>{/guide_videos/.test(error) ? "Video tablosu bulunamadı: Supabase'de guncelleme-hepsi.sql dosyasını bir kez çalıştırın." : error}</ErrorBox>}

      <Card title="Video ekle">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="YouTube bağlantısı" hint={url && !parsed ? "Bağlantı tanınmadı" : "youtube.com/watch?v=…, youtu.be/…, shorts bağlantıları olur"}>
            <input className="field" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://youtu.be/…" inputMode="url" />
          </Field>
          <Field label="Kategori">
            <select className="field" value={category} onChange={(e) => setCategory(e.target.value as VideoCategory)}>
              {VIDEO_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Başlık">
              <input className="field" value={title} maxLength={150} onChange={(e) => setTitle(e.target.value)} placeholder="ör. Ertelemeyi 5 dakika kuralıyla kırmak" />
            </Field>
          </div>
        </div>
        {parsed && (
          <div className="mt-3 flex items-center gap-3 rounded-xl bg-surface-2 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumb(parsed.id)} alt="" className="aspect-video w-28 rounded-lg object-cover" />
            <p className="text-xs text-muted">Önizleme{parsed.start ? ` · ${parsed.start}. saniyeden başlar` : ""}</p>
          </div>
        )}
        <div className="mt-3 flex justify-end">
          <Button icon="plus" loading={busy} onClick={add} disabled={!parsed}>
            Ekle
          </Button>
        </div>
      </Card>

      {!videos && !error ? (
        <PageLoader />
      ) : (
        VIDEO_CATEGORIES.map((c) => {
          const list = (videos ?? []).filter((v) => v.category === c.value);
          if (!list.length) return null;
          return (
            <Card key={c.value} title={c.label} subtitle={`${list.length} video`}>
              <ul className="divide-y divide-line">
                {list.map((v, i) => (
                  <li key={v.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <VideoThumb v={v} size="sm" onPlay={() => setPlaying(v)} />
                    </div>
                    <select className="field hidden h-9 w-40 text-sm sm:block" value={v.category} onChange={(e) => patch(v, { category: e.target.value as VideoCategory })} aria-label="Kategori">
                      {VIDEO_CATEGORIES.map((x) => (
                        <option key={x.value} value={x.value}>
                          {x.label}
                        </option>
                      ))}
                    </select>
                    <div className="flex shrink-0 items-center">
                      <IconButton icon="chevronLeft" label="Yukarı taşı" className="rotate-90" disabled={i === 0} onClick={() => move(v, -1)} />
                      <IconButton icon="chevronRight" label="Aşağı taşı" className="rotate-90" disabled={i === list.length - 1} onClick={() => move(v, 1)} />
                      <IconButton icon="trash" label="Sil" onClick={() => remove(v)} />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })
      )}
      {videos && videos.length === 0 && (
        <Card>
          <EmptyState icon="video" title="Henüz video eklenmedi">
            İlk videonuzu yukarıdan ekleyin. Kategori, öğrenciye hangi durumda önerileceğini belirler.
          </EmptyState>
        </Card>
      )}
      {playing && <VideoPlayer v={playing} onClose={() => setPlaying(null)} />}
    </div>
  );
}
