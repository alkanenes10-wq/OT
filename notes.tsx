"use client";
// Danışmanın öğrenciyle paylaştığı notlar.
// Danışman yazar (Notlar sekmesi veya Destek panelinden "Öğrenciye gönder"), öğrenci Bugün ekranında görür.
// Danışmanın ÖZEL görüşme notları (counselor_notes) bundan ayrıdır ve öğrenciye hiç görünmez.

import { useCallback, useEffect, useState } from "react";
import { errorText, sb } from "./db";
import { Button, Card, ErrorBox, Field, IconButton, PageLoader, cx, confirmAction, useToast } from "./ui";

export type SharedNote = {
  id: string;
  student_id: string;
  counselor_id: string | null;
  body: string;
  alert_id: string | null;
  read_at: string | null;
  created_at: string;
};

const when = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString("tr-TR", { day: "numeric", month: "long" })} ${d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`;
};

async function fetchNotes(studentId: string, limit = 50) {
  const { data, error } = await sb().from("shared_notes").select("*").eq("student_id", studentId).order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []) as SharedNote[];
}

const missingTable = (e: unknown) => /shared_notes|schema cache|does not exist/i.test(String((e as Error)?.message ?? e));

/* ------------------------------------------------------------------ */
/* Danışman: öğrenciyle paylaşılan notlar                              */
/* ------------------------------------------------------------------ */
export function SharedNotesCounselor({ studentId }: { studentId: string }) {
  const toast = useToast();
  const [notes, setNotes] = useState<SharedNote[] | null>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchNotes(studentId)
      .then(setNotes)
      .catch((e) => {
        setError(missingTable(e) ? "Paylaşılan notlar için Supabase'de guncelleme-5.sql çalıştırılmalı." : errorText(e));
        setNotes([]);
      });
  }, [studentId]);
  useEffect(() => {
    load();
  }, [load]);

  async function send() {
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    const { error } = await sb().from("shared_notes").insert({ student_id: studentId, body: text.slice(0, 4000) });
    setBusy(false);
    if (error) return toast.show(errorText(error), "danger");
    setBody("");
    toast.show("Not öğrenciye gönderildi");
    load();
  }

  async function remove(n: SharedNote) {
    if (!confirmAction("Bu not silinsin mi? Öğrenci artık göremez.")) return;
    const { error } = await sb().from("shared_notes").delete().eq("id", n.id);
    if (error) return toast.show(errorText(error), "danger");
    setNotes((ns) => (ns ?? []).filter((x) => x.id !== n.id));
  }

  return (
    <Card title="Öğrenciyle paylaşılan notlar" subtitle="Öğrenci bu notları uygulamanın Bugün ekranında görür.">
      <div className="space-y-3">
        <Field label="Öğrenciye not" htmlFor="shared-body">
          <textarea
            id="shared-body"
            className="field min-h-24"
            maxLength={4000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="ör. Bu hafta paragrafta çok iyi ilerledin. Perşembe 17:00'de görüşelim; o güne kadar deneme analizini tamamla."
          />
        </Field>
        <div className="flex justify-end">
          <Button icon="note" onClick={send} loading={busy} disabled={!body.trim()}>
            Öğrenciye gönder
          </Button>
        </div>
        {error && <ErrorBox>{error}</ErrorBox>}
        {!notes ? (
          <PageLoader />
        ) : notes.length === 0 ? (
          <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted">Henüz paylaşılan not yok.</p>
        ) : (
          <ul className="space-y-2">
            {notes.map((n) => (
              <li key={n.id} className="rounded-xl border border-line p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs text-muted">
                    {when(n.created_at)} ·{" "}
                    <span className={n.read_at ? "text-success" : "text-warning"}>{n.read_at ? `Okundu (${when(n.read_at)})` : "Henüz okunmadı"}</span>
                    {n.alert_id ? " · destek notuna yanıt" : ""}
                  </p>
                  <IconButton icon="trash" label="Notu sil" className="-mr-1 -mt-1 h-8 w-8" onClick={() => remove(n)} />
                </div>
                <p className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed">{n.body}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Öğrenci: Danışmanından notlar                                       */
/* ------------------------------------------------------------------ */
export function StudentNotes({ studentId }: { studentId: string }) {
  const [notes, setNotes] = useState<SharedNote[] | null>(null);
  const [all, setAll] = useState(false);

  const load = useCallback(() => {
    fetchNotes(studentId, 30)
      .then(setNotes)
      .catch(() => setNotes([]));
  }, [studentId]);
  useEffect(() => {
    load();
  }, [load]);

  if (!notes || notes.length === 0) return null;
  const unread = notes.filter((n) => !n.read_at);
  const shown = all ? notes : unread.length ? unread : notes.slice(0, 1);

  async function markRead() {
    await sb().rpc("mark_shared_notes_read");
    const now = new Date().toISOString();
    setNotes((ns) => (ns ?? []).map((n) => (n.read_at ? n : { ...n, read_at: now })));
  }

  return (
    <Card
      className={cx(unread.length > 0 && "border-primary/40")}
      title={unread.length ? `Danışmanından ${unread.length} yeni not` : "Danışmanından notlar"}
      action={
        notes.length > 1 && (
          <button className="text-sm font-medium text-primary" onClick={() => setAll((x) => !x)}>
            {all ? "Daha az" : `Tümü (${notes.length})`}
          </button>
        )
      }
    >
      <ul className="space-y-2">
        {shown.map((n) => (
          <li key={n.id} className={cx("rounded-xl p-3", n.read_at ? "bg-surface-2" : "bg-primary-soft")}>
            <p className="text-xs text-muted">{when(n.created_at)}</p>
            <p className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed">{n.body}</p>
          </li>
        ))}
      </ul>
      {unread.length > 0 && (
        <div className="mt-3 flex justify-end">
          <Button size="sm" variant="soft" icon="check" onClick={markRead}>
            Okudum
          </Button>
        </div>
      )}
    </Card>
  );
}
