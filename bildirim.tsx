"use client";
// Telefon/bilgisayar bildirimleri (web push): abonelik, tercihler ve danışman için kurulum yardımcısı.
// iPhone'da bildirim için uygulama önce "Ana Ekrana Ekle" ile kurulmalıdır (iOS 16.4+).

import { useCallback, useEffect, useState } from "react";
import { accessToken, errorText, sb, useAuth } from "./db";
import { Button, Card, cx, useToast } from "./ui";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

const b64uToBytes = (s: string) => {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
const bytesToB64u = (b: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

type Prefs = { gunluk: boolean; gorev: boolean; ozet: boolean };
type State = "unsupported" | "ios-install" | "denied" | "off" | "on" | "loading";

function isIos() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}
function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

async function registration() {
  return (await navigator.serviceWorker.getRegistration("/")) ?? (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
}

export function NotificationsCard() {
  const toast = useToast();
  const { profile } = useAuth();
  const isCounselor = profile?.role === "counselor";
  const [state, setState] = useState<State>("loading");
  const [prefs, setPrefs] = useState<Prefs>({ gunluk: true, gorev: true, ozet: true });
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      return setState(isIos() && !isStandalone() ? "ios-install" : "unsupported");
    }
    if (Notification.permission === "denied") return setState("denied");
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    setState(sub ? "on" : "off");
  }, []);

  useEffect(() => {
    check();
    sb()
      .from("notify_prefs")
      .select("gunluk, gorev, ozet")
      .maybeSingle()
      .then(({ data }) => data && setPrefs(data as Prefs));
  }, [check]);

  async function enable() {
    if (!PUBLIC_KEY) return toast.show("Bildirimler henüz kurulmadı (danışmanın Ayarlar'dan kurması gerekiyor)", "danger");
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "off");
        return;
      }
      const reg = await registration();
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(PUBLIC_KEY) }));
      const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const { error } = await sb()
        .from("push_subscriptions")
        .upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_agent: navigator.userAgent.slice(0, 300), user_id: profile?.id }, { onConflict: "endpoint" });
      if (error) throw error;
      setState("on");
      toast.show("Bildirimler açıldı");
    } catch (e) {
      toast.show(/push_subscriptions|schema cache/i.test(String((e as Error)?.message)) ? "Bildirimler için guncelleme-hepsi.sql çalıştırılmalı" : errorText(e), "danger");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await sb().from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
      toast.show("Bu cihazda bildirimler kapatıldı");
    } finally {
      setBusy(false);
    }
  }

  async function setPref(k: keyof Prefs, v: boolean) {
    const next = { ...prefs, [k]: v };
    setPrefs(next);
    const { error } = await sb()
      .from("notify_prefs")
      .upsert({ user_id: profile?.id, ...next, updated_at: new Date().toISOString() });
    if (error) toast.show(errorText(error), "danger");
  }

  const options: { k: keyof Prefs; label: string; hint: string }[] = isCounselor
    ? [{ k: "ozet", label: "Akşam özeti", hint: "Her akşam ~21:30: günlüğünü doldurmayanlar, açık destek uyarıları, forumda onay bekleyenler" }]
    : [
        { k: "gorev", label: "Kalan görev hatırlatması", hint: "Akşamüstü ~18:00, bugünkü görevlerin bitmediyse" },
        { k: "gunluk", label: "Günlük takip hatırlatması", hint: "Akşam ~21:00, bugünkü günlüğünü doldurmadıysan" },
      ];

  return (
    <Card title="Bildirimler" subtitle={isCounselor ? "Akşam özeti telefonunuza bildirim olarak gelsin." : "Hatırlatmalar telefonuna bildirim olarak gelsin."}>
      <div className="space-y-3">
        {state === "ios-install" ? (
          <p className="rounded-xl bg-surface-2 p-3 text-sm">
            iPhone&apos;da bildirim almak için önce uygulamayı ana ekrana ekle: Safari&apos;de <b>Paylaş</b> → <b>Ana Ekrana Ekle</b>. Sonra uygulamayı ana ekrandan açıp buradan bildirimleri aç.
          </p>
        ) : state === "unsupported" ? (
          <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted">Bu tarayıcı bildirimleri desteklemiyor. Chrome, Edge ya da (ana ekrana eklenmiş) Safari kullanın.</p>
        ) : state === "denied" ? (
          <p className="rounded-xl bg-warning-soft p-3 text-sm text-warning">Bildirim izni tarayıcıda engellenmiş. Tarayıcı/telefon ayarlarından bu site için bildirimlere izin verip sayfayı yenileyin.</p>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              Bu cihazda bildirimler: <b className={state === "on" ? "text-success" : "text-muted"}>{state === "on" ? "açık" : state === "off" ? "kapalı" : "…"}</b>
            </p>
            {state === "on" ? (
              <Button size="sm" variant="ghost" onClick={disable} loading={busy}>
                Kapat
              </Button>
            ) : (
              <Button size="sm" icon="bell" onClick={enable} loading={busy} disabled={state === "loading"}>
                Bildirimleri aç
              </Button>
            )}
          </div>
        )}
        <ul className="space-y-2">
          {options.map((o) => (
            <li key={o.k}>
              <label className="flex cursor-pointer items-start gap-2.5">
                <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--primary)]" checked={prefs[o.k]} onChange={(e) => setPref(o.k, e.target.checked)} />
                <span>
                  <span className="block text-sm font-medium">{o.label}</span>
                  <span className="block text-xs text-muted">{o.hint}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        {isCounselor && !PUBLIC_KEY && <PushSetupHelper />}
      </div>
    </Card>
  );
}

/** Danışman: bildirim anahtarlarını tarayıcıda üretir; Vercel'e eklenecek değerleri gösterir. */
function PushSetupHelper() {
  const toast = useToast();
  const [keys, setKeys] = useState<{ pub: string; priv: string; cron: string } | null>(null);
  async function generate() {
    const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const pub = bytesToB64u(await crypto.subtle.exportKey("raw", kp.publicKey));
    const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
    const cronBytes = crypto.getRandomValues(new Uint8Array(24));
    setKeys({ pub, priv: jwk.d ?? "", cron: bytesToB64u(cronBytes) });
  }
  const copy = async (v: string) => {
    try {
      await navigator.clipboard.writeText(v);
      toast.show("Kopyalandı");
    } catch {
      toast.show("Kopyalanamadı", "danger");
    }
  };
  const rows = keys
    ? [
        { k: "NEXT_PUBLIC_VAPID_PUBLIC_KEY", v: keys.pub },
        { k: "VAPID_PRIVATE_KEY", v: keys.priv },
        { k: "VAPID_SUBJECT", v: "mailto:" },
        { k: "CRON_SECRET", v: keys.cron },
      ]
    : [];
  return (
    <div className="rounded-xl border border-dashed border-line p-3 text-sm">
      <p className="font-medium">Bildirim kurulumu (bir kez)</p>
      <p className="mt-1 text-xs text-muted">
        Otomatik bildirimler için Vercel&apos;e 4 ortam değişkeni eklenmeli. Anahtarları burada üretin, Vercel → Settings → Environment Variables&apos;a ekleyip yeniden dağıtın (Redeploy). Gizli anahtarı kimseyle paylaşmayın.
      </p>
      {!keys ? (
        <Button size="sm" variant="soft" className="mt-2" onClick={generate}>
          Anahtarları üret
        </Button>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {rows.map((r) => (
            <li key={r.k} className="flex items-center gap-2">
              <code className="w-56 shrink-0 truncate text-[11px] font-semibold">{r.k}</code>
              <code className={cx("min-w-0 flex-1 truncate rounded bg-surface-2 px-1.5 py-1 text-[11px]")}>{r.k === "VAPID_SUBJECT" ? "mailto:sizin@epostaniz.com" : r.v}</code>
              <button type="button" className="text-xs font-medium text-primary" onClick={() => copy(r.k === "VAPID_SUBJECT" ? "mailto:" : r.v)}>
                Kopyala
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Danışman → öğrenci: anında uygulama bildirimi + uygulama içi not      */
/* ------------------------------------------------------------------ */
export type SendResult = { ok: boolean; error?: string; push_ready: boolean; students: number; notified: number; sent: number };

export async function sendToStudents(items: { student_id: string; message: string }[], title = "Danışmanından mesaj"): Promise<SendResult> {
  const r = await fetch("/api/bildirim/gonder", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${await accessToken()}` },
    body: JSON.stringify({ items, title }),
  });
  const j = (await r.json().catch(() => ({ ok: false, error: "Sunucu yanıt vermedi" }))) as SendResult;
  if (!r.ok || !j.ok) throw new Error(j.error || "Gönderilemedi");
  return j;
}

/** Hangi öğrencilerin bildirimi açık (en az bir cihazda) */
export async function pushStatus(studentIds: string[]): Promise<{ push_ready: boolean; enabled: Set<string> } | null> {
  if (!studentIds.length) return { push_ready: false, enabled: new Set() };
  try {
      const r = await fetch("/api/bildirim/gonder", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${await accessToken()}` },
      body: JSON.stringify({ student_ids: studentIds, check_only: true }),
    });
    const j = (await r.json()) as { ok: boolean; push_ready: boolean; enabled: string[] };
    return j.ok ? { push_ready: j.push_ready, enabled: new Set(j.enabled) } : null;
  } catch {
    return null;
  }
}

export function sendResultText(r: SendResult) {
  if (!r.push_ready) return `${r.students} öğrenciye uygulama içi not gönderildi (anlık bildirim kurulumu henüz yapılmadı)`;
  const off = r.students - r.notified;
  return `${r.students} öğrenciye gönderildi · ${r.notified} kişiye anlık bildirim${off ? ` · ${off} kişi bildirimi kapalı, uygulamayı açınca görecek` : ""}`;
}
