"use client";
// Veritabanı durumu: hangi özelliğin tablosu / fonksiyonu eksik, tek yerde gösterir.
// Eksik varsa çözüm hep aynıdır: Supabase → SQL Editor → guncelleme-hepsi.sql → Run.

import { useCallback, useEffect, useState } from "react";
import { A, sb } from "./db";
import { Button, Card, cx, Icon } from "./ui";

type Check = { label: string; table?: string; column?: string; rpc?: string; args?: Record<string, unknown> };

const CHECKS: Check[] = [
  { label: "Program ve görevler", table: "plan_tasks", column: "resource_tests" },
  { label: "Çalışma saatleri", table: "study_schedules" },
  { label: "Deneme karneleri", table: "exam_analyses" },
  { label: "Destek uyarıları", table: "support_alerts" },
  { label: "Görüşmeler ve takvim", table: "counseling_sessions" },
  { label: "Soru bankası", table: "question_items" },
  { label: "Öğrenci notları ve bildirim mesajları", table: "shared_notes" },
  { label: "Kaynak (kitap) takibi", table: "resources", column: "catalog_id" },
  { label: "Kaynak kataloğu", table: "resource_catalog" },
  { label: "Soru forumu", rpc: "forum_role" },
  { label: "Veli bağlantısı", table: "parent_links" },
  { label: "Uygulama bildirimleri", table: "push_subscriptions" },
  { label: "Aylık hedefler", table: "monthly_goals" },
  { label: "Seri ve rozetler", rpc: "students_gamification" },
  { label: "Rehber videoları", table: "guide_videos" },
  { label: "Haftalık raporlar", table: "weekly_reports" },
  { label: "Veli mesajları", table: "parent_messages" },
  { label: "Yapay zekâ soru çözümü", table: "ai_questions" },
];

const isMissing = (e: { code?: string; message?: string } | null) =>
  Boolean(e && (/PGRST20[25]|42P01|42703|42883/.test(e.code ?? "") || /could not find|does not exist|schema cache/i.test(e.message ?? "")));

async function runChecks(): Promise<{ label: string; ok: boolean }[]> {
  return Promise.all(
    CHECKS.map(async (c) => {
      const res = c.rpc ? await sb().rpc(c.rpc, c.args ?? {}).limit(1) : await sb().from(c.table!).select(c.column ?? "*").limit(1);
      return { label: c.label, ok: !isMissing(res.error) };
    }),
  );
}

/** Eksik parça sayısı (null = henüz bilinmiyor) */
const OK_KEY = "yks-db-guncel-34";
export function useDbStatus(skipIfOk = false) {
  const [results, setResults] = useState<{ label: string; ok: boolean }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const check = useCallback(() => {
    setBusy(true);
    runChecks()
      .then((r) => {
        setResults(r);
        try {
          if (r.every((x) => x.ok)) sessionStorage.setItem(OK_KEY, "1");
          else sessionStorage.removeItem(OK_KEY);
        } catch {}
      })
      .catch(() => setResults(null))
      .finally(() => setBusy(false));
  }, []);
  useEffect(() => {
    // Bu oturumda zaten "güncel" görüldüyse ana sayfada tekrar sorgulama
    try {
      if (skipIfOk && sessionStorage.getItem(OK_KEY) === "1") return;
    } catch {}
    check();
  }, [check, skipIfOk]);
  return { results, busy, check, missing: results?.filter((r) => !r.ok) ?? [] };
}

export function DbStatusCard() {
  const { results, busy, check, missing } = useDbStatus();
  const ok = results != null && missing.length === 0;
  return (
    <Card
      title="Veritabanı durumu"
      subtitle={!results ? "Kontrol ediliyor…" : ok ? "Güncel: tüm özellikler kullanılabilir." : `${missing.length} özellik için güncelleme gerekiyor`}
      action={
        <Button size="sm" variant="ghost" loading={busy} onClick={check}>
          Yeniden kontrol et
        </Button>
      }
    >
      {results && !ok && (
        <div className="mb-3 rounded-xl bg-warning-soft p-3 text-sm">
          <p className="font-semibold">Yapmanız gereken tek şey:</p>
          <ol className="mt-1 list-decimal space-y-0.5 pl-5">
            <li>Supabase → SQL Editor → New query.</li>
            <li>
              <b>guncelleme-hepsi.sql</b> dosyasının tamamını yapıştırın ve Run&apos;a basın.
            </li>
            <li>Uyarı çıkarsa &quot;Run this query&quot; deyin. Verileriniz silinmez.</li>
            <li>Bu sayfada &quot;Yeniden kontrol et&quot;e basın.</li>
          </ol>
        </div>
      )}
      {results && (
        <ul className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
          {results.map((r) => (
            <li key={r.label} className="flex items-center gap-2">
              <span className={cx("flex h-5 w-5 shrink-0 items-center justify-center rounded-full", r.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>
                <Icon name={r.ok ? "check" : "x"} size={12} strokeWidth={3} />
              </span>
              <span className={r.ok ? "text-muted" : "font-medium"}>{r.label}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Öğrenciler sayfasının üstünde: yalnızca eksik varsa görünür */
export function DbStatusBanner() {
  const { missing } = useDbStatus(true);
  if (!missing.length) return null;
  return (
    <A to={{ v: "ayarlar" }} className="card mb-4 flex items-center gap-3 border-warning/40 bg-warning-soft p-3 text-sm">
      <Icon name="alert" size={18} className="shrink-0 text-warning" />
      <span className="min-w-0 flex-1">
        <b className="font-semibold">Veritabanı güncel değil:</b> {missing.map((m) => m.label).slice(0, 3).join(", ")}
        {missing.length > 3 ? ` ve ${missing.length - 3} özellik daha` : ""} çalışmıyor. Çözüm için dokunun.
      </span>
      <Icon name="chevronRight" size={16} className="shrink-0 text-faint" />
    </A>
  );
}
