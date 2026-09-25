"use client";
// Destek / risk yönlendirmesi.
// Öğrenci: "Konuşmak istiyorum" butonu ve (otomatik uyarı olduğunda) nazik destek kartı.
// Danışman: "Destek gerekenler" listesi ve öğrenci bazında tarihli takip kaydı.
// Bu bir kriz müdahale aracı değildir; öğrenciye her zaman acil durumda 112 gösterilir.

import { useCallback, useEffect, useState } from "react";
import { A, errorText, sb } from "./db";
import { SUPPORT_ACTIONS, relativeDay, type SupportAction, type SupportActionKind, type SupportAlert } from "./lib";
import { Badge, Button, Card, ErrorBox, Icon, Modal, cx, useToast } from "./ui";

const when = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString("tr-TR", { day: "numeric", month: "long" })} ${d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`;
};

/* ================================================================== */
/* Öğrenci tarafı                                                      */
/* ================================================================== */

function EmergencyNote() {
  return (
    <div className="rounded-xl border border-danger/25 bg-danger-soft p-3 text-sm">
      <p className="font-medium text-danger">Kendini tehlikede hissediyorsan beklemeden yardım al</p>
      <p className="mt-1 text-fg">
        Danışmanın bu mesajı uygulamayı açtığında görür, hemen göremeyebilir. Acil bir durumda <b>112</b>’yi ara ya da yanındaki güvendiğin bir yetişkine (ailen,
        öğretmenin) hemen haber ver.
      </p>
      <a
        href="tel:112"
        className="mt-2 inline-flex h-11 items-center gap-2 rounded-xl bg-danger px-4 text-sm font-semibold text-white"
        aria-label="112 acil çağrı merkezini ara"
      >
        <Icon name="phone" size={17} /> 112’yi ara
      </a>
    </div>
  );
}

export function SupportModal({ onClose, onSent }: { onClose: () => void; onSent?: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    const { error } = await sb().rpc("request_support", { p_note: note.trim() || null });
    setBusy(false);
    if (error) return setError(errorText(error));
    setSent(true);
    onSent?.();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={sent ? "Danışmanına iletildi" : "Danışmanınla konuşmak istiyorum"}
      footer={
        sent ? (
          <Button onClick={onClose}>Tamam</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Vazgeç
            </Button>
            <Button icon="heart" onClick={send} loading={busy}>
              Danışmanıma ilet
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        {sent ? (
          <p className="text-[15px] leading-relaxed">
            Bunu paylaştığın için teşekkürler. Danışmanın mesajını görünce seninle iletişime geçecek. Bu arada kendine nazik davran; bugünkü programı
            yapamasan da sorun değil.
          </p>
        ) : (
          <>
            <p className="text-[15px] leading-relaxed">
              Zor bir dönemden geçiyor olabilirsin ve bunu fark edip paylaşman çok değerli. İstersen ne yaşadığını kısaca yazabilirsin; yazmak zorunda değilsin.
            </p>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Danışmanına not (isteğe bağlı)</span>
              <textarea
                className="field min-h-24"
                maxLength={1000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="ör. Son günlerde uyuyamıyorum, sınav çok kafamı meşgul ediyor…"
              />
            </label>
          </>
        )}
        <EmergencyNote />
        {error && <ErrorBox>{error}</ErrorBox>}
      </div>
    </Modal>
  );
}

/** Öğrencinin Bugün ekranı: otomatik uyarı varsa destek kartı, her zaman "konuşmak istiyorum" bağlantısı */
export function StudentSupport({ variant }: { variant: "card" | "link" }) {
  const toast = useToast();
  const [state, setState] = useState<{ show: boolean; requested_at: string | null } | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await sb().rpc("support_prompt");
    if (!error && data) setState(data as { show: boolean; requested_at: string | null });
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function dismiss() {
    setState((s) => (s ? { ...s, show: false } : s));
    await sb().rpc("dismiss_support_prompt");
    toast.show("Anlaştık. İhtiyacın olursa buradayız.");
  }

  const recentRequest = state?.requested_at && Date.now() - new Date(state.requested_at).getTime() < 3 * 86400000;

  return (
    <>
      {variant === "card" && state?.show && (
        <section className="card border-primary/30 bg-primary-soft/60 p-4" aria-label="Destek">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-primary">
              <Icon name="heart" size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Son günlerde zorlanıyor gibisin</p>
              <p className="mt-0.5 text-sm text-muted">Günlük takibindeki cevaplar biraz yorgun ve kaygılı olduğunu gösteriyor. Danışmanınla konuşmak ister misin?</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" icon="heart" onClick={() => setOpen(true)}>
                  Konuşmak istiyorum
                </Button>
                <Button size="sm" variant="ghost" onClick={dismiss}>
                  Şimdilik iyiyim
                </Button>
              </div>
            </div>
          </div>
        </section>
      )}

      {variant === "card" && recentRequest && !state?.show && (
        <p className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">
          <Icon name="check" size={16} className="text-success" /> Konuşma isteğin danışmanına iletildi ({relativeDay(state!.requested_at!.slice(0, 10))}).
        </p>
      )}

      {variant === "link" && (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-line px-4 py-3 text-left text-sm text-muted transition hover:border-primary hover:bg-primary-soft/40 hover:text-fg"
      >
        <Icon name="lifebuoy" size={20} className="shrink-0 text-primary" />
        <span className="flex-1">
          <span className="block font-medium text-fg">Zor bir gün mü?</span>
          Danışmanınla konuşmak istediğini ona bildir.
        </span>
        <Icon name="chevronRight" size={18} />
      </button>
      )}

      {open && (
        <SupportModal
          onClose={() => setOpen(false)}
          onSent={() => {
            load();
          }}
        />
      )}
    </>
  );
}

/* ================================================================== */
/* Danışman tarafı                                                     */
/* ================================================================== */

async function fetchOpenAlerts(studentId?: string) {
  let q = sb().from("support_alerts").select("*").neq("status", "closed").order("created_at", { ascending: false });
  if (studentId) q = q.eq("student_id", studentId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as SupportAlert[];
}

const priority = (a: SupportAlert) => (a.source === "student" ? 0 : 1) * 10 + (a.status === "open" ? 0 : a.status === "seen" ? 1 : 2);
const STATUS_LABEL: Record<SupportAlert["status"], string> = { open: "Yeni", seen: "Görüldü", contacted: "Görüşüldü", closed: "Kapandı" };

/** Öğrenci listesinin üstünde: açık destek uyarıları */
export function SupportInbox({ names }: { names: Map<string, string> }) {
  const [alerts, setAlerts] = useState<SupportAlert[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetchOpenAlerts()
      .then(setAlerts)
      .catch((e) => {
        // Güncelleme 4 SQL'i çalıştırılmamışsa sessizce gizle
        if (!/support_alerts|schema cache|does not exist/i.test(String(e?.message ?? e))) setError(errorText(e));
        setAlerts([]);
      });
  }, []);
  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!alerts?.length) return null;
  const list = [...alerts].sort((a, b) => priority(a) - priority(b));
  const fresh = list.filter((a) => a.status === "open").length;
  return (
    <Card
      className="mb-4 border-danger/30"
      title={
        <span className="flex items-center gap-2">
          <Icon name="heart" size={17} className="text-danger" /> Destek gerekenler
          {fresh > 0 && <Badge tone="danger">{fresh} yeni</Badge>}
        </span>
      }
      subtitle="Otomatik uyarılar günlük takip örüntülerinden, istekler öğrencinin kendisinden gelir."
    >
      <ul className="-mx-1 divide-y divide-line">
        {list.map((a) => (
          <li key={a.id}>
            <A to={{ v: "ogrenci", id: a.student_id }} className="flex items-center gap-3 rounded-lg px-1 py-2.5 hover:bg-surface-2">
              <span className={cx("h-2.5 w-2.5 shrink-0 rounded-full", a.status === "open" ? "bg-danger" : "bg-faint")} />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                  {names.get(a.student_id) ?? "Öğrenci"}
                  <Badge tone={a.source === "student" ? "danger" : "warning"}>{a.source === "student" ? "Konuşmak istiyor" : "Otomatik"}</Badge>
                  <span className="text-xs font-normal text-muted">{STATUS_LABEL[a.status]}</span>
                </span>
                <span className="block truncate text-xs text-muted">
                  {a.student_note ? `“${a.student_note}”` : a.reasons.join(" · ")} · {when(a.created_at)}
                </span>
              </span>
              <Icon name="chevronRight" size={18} className="text-faint" />
            </A>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Öğrenci detayı (Özet sekmesi): uyarılar ve takip kaydı */
export function SupportPanel({ studentId }: { studentId: string }) {
  const toast = useToast();
  const [alerts, setAlerts] = useState<SupportAlert[] | null>(null);
  const [actions, setActions] = useState<SupportAction[]>([]);
  const [showClosed, setShowClosed] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data, error } = await sb().from("support_alerts").select("*").eq("student_id", studentId).order("created_at", { ascending: false }).limit(30);
      if (error) throw error;
      const list = (data ?? []) as SupportAlert[];
      setAlerts(list);
      if (list.length) {
        const { data: acts, error: e2 } = await sb()
          .from("support_actions")
          .select("*")
          .in(
            "alert_id",
            list.map((a) => a.id),
          )
          .order("created_at");
        if (e2) throw e2;
        setActions((acts ?? []) as SupportAction[]);
      }
    } catch (e) {
      if (/support_alerts|schema cache|does not exist/i.test(String((e as Error)?.message ?? e))) setMissing(true);
      else setError(errorText(e));
      setAlerts([]);
    }
  }, [studentId]);
  useEffect(() => {
    load();
  }, [load]);

  async function act(a: SupportAlert, kind: SupportActionKind) {
    const note = (draft[a.id] ?? "").trim();
    if (kind === "note" && !note) return toast.show("Önce notu yaz", "danger");
    setBusy(a.id + kind);
    setError(null);
    try {
      const { error } = await sb().from("support_actions").insert({ alert_id: a.id, student_id: studentId, action: kind, note });
      if (error) throw error;
      const st = SUPPORT_ACTIONS.find((x) => x.value === kind)?.status;
      if (st) {
        const { error: e2 } = await sb().from("support_alerts").update({ status: st }).eq("id", a.id);
        if (e2) throw e2;
      }
      setDraft((d) => ({ ...d, [a.id]: "" }));
      toast.show("Kaydedildi");
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  if (missing || !alerts) return null;
  const open = alerts.filter((a) => a.status !== "closed");
  const closed = alerts.filter((a) => a.status === "closed");
  if (!open.length && !closed.length) return null;

  const renderAlert = (a: SupportAlert) => {
    const acts = actions.filter((x) => x.alert_id === a.id);
    const isOpen = a.status !== "closed";
    return (
      <div key={a.id} className={cx("rounded-xl border p-3", isOpen ? "border-danger/30 bg-danger-soft/40" : "border-line")}>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={a.source === "student" ? "danger" : "warning"}>{a.source === "student" ? "Öğrenci konuşmak istedi" : "Otomatik uyarı"}</Badge>
          <Badge>{STATUS_LABEL[a.status]}</Badge>
          <span className="text-xs text-muted">{when(a.created_at)}</span>
        </div>
        {a.student_note && <p className="mt-2 rounded-lg bg-surface p-2 text-sm">“{a.student_note}”</p>}
        {a.source === "auto" && (
          <ul className="mt-2 list-disc pl-5 text-sm text-fg">
            {a.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
        {a.source === "auto" && a.student_dismissed_at && <p className="mt-1 text-xs text-muted">Öğrenci destek kartını “Şimdilik iyiyim” ile kapattı ({when(a.student_dismissed_at)}).</p>}

        {acts.length > 0 && (
          <ol className="mt-3 space-y-1 border-l-2 border-line pl-3 text-sm">
            {acts.map((x) => (
              <li key={x.id}>
                <span className="font-medium">{SUPPORT_ACTIONS.find((s) => s.value === x.action)?.label}</span>
                <span className="text-xs text-muted"> · {when(x.created_at)}</span>
                {x.note && <span className="block text-muted">{x.note}</span>}
              </li>
            ))}
          </ol>
        )}

        {isOpen && (
          <div className="mt-3 space-y-2">
            <textarea
              className="field min-h-16 text-sm"
              maxLength={2000}
              placeholder="Not (isteğe bağlı): ne konuşuldu, hangi adım atıldı…"
              value={draft[a.id] ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, [a.id]: e.target.value }))}
              aria-label="Takip notu"
            />
            <div className="flex flex-wrap gap-1.5">
              {SUPPORT_ACTIONS.map((s) => (
                <Button
                  key={s.value}
                  size="sm"
                  variant={s.value === "closed" ? "ghost" : s.value === "contacted" ? "primary" : "secondary"}
                  loading={busy === a.id + s.value}
                  onClick={() => act(a, s.value)}
                >
                  {s.value === "note" ? "Not ekle" : s.label}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <Card
      className={open.length ? "border-danger/30" : undefined}
      title={
        <span className="flex items-center gap-2">
          <Icon name="heart" size={17} className="text-danger" /> Destek ve takip
        </span>
      }
      subtitle={open.length ? `${open.length} açık uyarı · attığın her adım tarihiyle kaydedilir` : "Açık uyarı yok"}
    >
      <div className="space-y-3">
        {open.map(renderAlert)}
        {closed.length > 0 && (
          <button className="text-sm text-primary" onClick={() => setShowClosed((x) => !x)}>
            {showClosed ? "Kapanan uyarıları gizle" : `Kapanan uyarılar (${closed.length})`}
          </button>
        )}
        {showClosed && closed.map(renderAlert)}
        {error && <ErrorBox>{error}</ErrorBox>}
        <p className="text-xs text-muted">Uyarıları yalnızca öğrencinin danışmanı görür; öğrenci uyarı nedenlerini ve bu notları göremez.</p>
      </div>
    </Card>
  );
}
