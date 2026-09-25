"use client";
// Danışman ekibi: yönetici danışman (ilk kurulan hesap) yeni danışman ekler, şifre sıfırlar,
// pasif yapar, siler ve öğrenci aktarır. Her danışman yalnızca kendi öğrencilerini görür.

import { useCallback, useEffect, useState } from "react";
import { createCounselor, deleteCounselor, listCounselors, transferStudent, updateCounselor, type CounselorRow } from "./actions";
import { accessToken, errorText, useRoute } from "./db";
import { Badge, Button, Card, ErrorBox, Field, IconButton, confirmAction, useToast } from "./ui";

function randomPassword(len = 10) {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join("");
}

export function useCounselors() {
  const [state, setState] = useState<{ isAdmin: boolean; counselors: CounselorRow[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await listCounselors(await accessToken());
      if (!r.ok) throw new Error(r.error);
      setState({ isAdmin: r.isAdmin, counselors: r.counselors });
    } catch (e) {
      setError(errorText(e));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return { state, error, reload: load };
}

/** Ayarlar sayfasındaki "Danışmanlar" kartı (yalnızca yöneticiye görünür) */
export function CounselorTeam() {
  const toast = useToast();
  const { state, error: loadError, reload } = useCounselors();
  const [form, setForm] = useState({ fullName: "", email: "", password: randomPassword() });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<string | null>(null);

  if (!state?.isAdmin) return null;

  async function add() {
    setError(null);
    setBusy(true);
    try {
      const r = await createCounselor(await accessToken(), form);
      if (!r.ok) throw new Error(r.error);
      setShown(
        `Merhaba ${form.fullName},\nYKS Takip danışman hesabın açıldı.\nAdres: ${window.location.origin}\nE-posta: ${form.email.trim().toLowerCase()}\nŞifre: ${form.password}\nİlk girişten sonra Ayarlar'dan şifreni değiştirebilirsin.`,
      );
      setForm({ fullName: "", email: "", password: randomPassword() });
      setOpen(false);
      toast.show("Danışman eklendi");
      reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function act(c: CounselorRow, kind: "password" | "active" | "delete") {
    setError(null);
    try {
      const token = await accessToken();
      if (kind === "password") {
        const pw = randomPassword();
        if (!confirmAction(`${c.full_name} için yeni şifre oluşturulsun mu?`)) return;
        const r = await updateCounselor(token, c.id, { password: pw });
        if (!r.ok) throw new Error(r.error);
        setShown(`${c.full_name} yeni şifre: ${pw}\nE-posta: ${c.email}`);
      } else if (kind === "active") {
        if (c.active && !confirmAction(`${c.full_name} pasif yapılsın mı? Giriş yapamaz, öğrencileri ve verileri korunur.`)) return;
        const r = await updateCounselor(token, c.id, { active: !c.active });
        if (!r.ok) throw new Error(r.error);
        toast.show(c.active ? "Pasif yapıldı" : "Aktif edildi");
      } else {
        if (!confirmAction(`${c.full_name} silinsin mi?\n\n${c.students} öğrencisi ve notları sana aktarılır. Hesap kalıcı olarak silinir.`)) return;
        const r = await deleteCounselor(token, c.id);
        if (!r.ok) throw new Error(r.error);
        toast.show("Danışman silindi, öğrencileri sana aktarıldı");
      }
      reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <Card
      title="Danışmanlar"
      subtitle="Yöneticisin. Eklediğin danışmanlar kendi e-postalarıyla giriş yapar ve yalnızca kendi ekledikleri öğrencileri görür."
      action={
        !open && (
          <Button size="sm" icon="plus" onClick={() => setOpen(true)}>
            Danışman ekle
          </Button>
        )
      }
    >
      <ul className="-mx-1 divide-y divide-line">
        {state.counselors.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-2 px-1 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                {c.full_name}
                {c.isAdmin && <Badge tone="primary">Yönetici</Badge>}
                {!c.active && <Badge tone="danger">Pasif</Badge>}
              </p>
              <p className="truncate text-xs text-muted">
                {c.email} · {c.students} öğrenci
              </p>
            </div>
            {!c.isAdmin && (
              <div className="flex items-center gap-1">
                <IconButton icon="key" label="Yeni şifre oluştur" className="h-9 w-9" onClick={() => act(c, "password")} />
                <Button size="sm" variant="ghost" onClick={() => act(c, "active")}>
                  {c.active ? "Pasif yap" : "Aktif et"}
                </Button>
                <IconButton icon="trash" label="Danışmanı sil" className="h-9 w-9" onClick={() => act(c, "delete")} />
              </div>
            )}
          </li>
        ))}
      </ul>

      {open && (
        <div className="mt-3 space-y-3 rounded-xl border border-line p-3">
          <Field label="Ad soyad" htmlFor="nc-name">
            <input id="nc-name" className="field" maxLength={120} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          </Field>
          <Field label="E-posta (giriş için)" htmlFor="nc-email">
            <input id="nc-email" type="email" className="field" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="off" />
          </Field>
          <Field label="Geçici şifre" hint="En az 8 karakter. Danışman girişten sonra Ayarlar'dan değiştirebilir." htmlFor="nc-pw">
            <input id="nc-pw" className="field font-mono" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="off" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Vazgeç
            </Button>
            <Button icon="check" onClick={add} loading={busy}>
              Hesabı oluştur
            </Button>
          </div>
        </div>
      )}

      {shown && (
        <div className="mt-3 rounded-xl bg-success-soft p-3 text-sm text-success">
          <pre className="whitespace-pre-wrap font-sans">{shown}</pre>
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              icon="copy"
              onClick={() => {
                navigator.clipboard?.writeText(shown).then(() => toast.show("Kopyalandı"));
              }}
            >
              Mesajı kopyala
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShown(null)}>
              Kapat
            </Button>
          </div>
          <p className="mt-1 text-xs">Şifre tekrar gösterilmez.</p>
        </div>
      )}
      {(error || loadError) && (
        <div className="mt-3">
          <ErrorBox>{error || loadError}</ErrorBox>
        </div>
      )}
    </Card>
  );
}

/** Öğrencinin Hesap sekmesinde: başka danışmana aktar (yalnızca yönetici) */
export function TransferStudent({ studentId, studentName }: { studentId: string; studentName: string }) {
  const toast = useToast();
  const { go } = useRoute();
  const { state } = useCounselors();
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const others = (state?.counselors ?? []).filter((c) => !c.isAdmin && c.active);
  if (!state?.isAdmin || others.length === 0) return null;

  async function move() {
    const c = others.find((x) => x.id === target);
    if (!c) return;
    if (!confirmAction(`${studentName}, ${c.full_name} adlı danışmana aktarılsın mı?\n\nÖğrenci artık senin listende görünmez; programı, günlükleri ve senin notların yeni danışmana geçer.`)) return;
    setBusy(true);
    setError(null);
    try {
      const r = await transferStudent(await accessToken(), studentId, target);
      if (!r.ok) throw new Error(r.error);
      toast.show("Öğrenci aktarıldı");
      go({}, { replace: true });
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  return (
    <Card title="Başka danışmana aktar" subtitle="Öğrenci ve tüm verileri seçtiğin danışmana geçer.">
      <div className="flex flex-wrap items-center gap-2">
        <select className="field min-w-0 flex-1" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Danışman">
          <option value="">Danışman seç…</option>
          {others.map((c) => (
            <option key={c.id} value={c.id}>
              {c.full_name} ({c.students} öğrenci)
            </option>
          ))}
        </select>
        <Button variant="secondary" onClick={move} loading={busy} disabled={!target}>
          Aktar
        </Button>
      </div>
      {error && (
        <div className="mt-3">
          <ErrorBox>{error}</ErrorBox>
        </div>
      )}
    </Card>
  );
}
