"use client";
// Değişken rehberi: her değişkenin açıklaması + öğrencinin kendi verisinden kişisel yorum,
// günlük kayıttan sonra ayrıntılı geri bildirim ve ayrıntılı uyarı kartları.

import { useState } from "react";
import { type DayNote, type InsightStatus, personalInsight, VAR_INFO, VAR_ORDER, type VarKey } from "./degiskenler";
import type { DailyLog, Signal } from "./lib";
import { Badge, Card, cx, Icon } from "./ui";

const STATUS: Record<InsightStatus, { label: string; tone: "success" | "warning" | "danger" | "neutral"; dot: string }> = {
  good: { label: "İyi gidiyor", tone: "success", dot: "bg-success" },
  watch: { label: "Dikkat", tone: "warning", dot: "bg-warning" },
  problem: { label: "Öncelikli", tone: "danger", dot: "bg-danger" },
  nodata: { label: "Veri az", tone: "neutral", dot: "bg-faint" },
};

type Audience = "student" | "counselor";

/** Tek bir değişkenin açıklaması + kişisel yorum (açılır). Günlük formda alanların altında kullanılır. */
export function VarHelp({ k, logs, audience = "student" }: { k: VarKey; logs: DailyLog[]; audience?: Audience }) {
  const [open, setOpen] = useState(false);
  const info = VAR_INFO[k];
  const ins = open ? personalInsight(k, logs) : null;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
      >
        <Icon name="info" size={14} />
        {open ? "Açıklamayı gizle" : `${info.label} neden önemli? ${audience === "student" ? "Sende nasıl?" : "Öğrencide nasıl?"}`}
      </button>
      {open && ins && (
        <div className="mt-2 space-y-2 rounded-xl border border-line bg-surface-2 p-3 text-sm">
          <p>
            <span className="font-semibold">Ne ölçer? </span>
            {info.what}
          </p>
          <p>
            <span className="font-semibold">Neden önemli? </span>
            {info.why}
          </p>
          <p className="text-muted">
            <span className="font-semibold text-fg">Hedef: </span>
            {info.target}
          </p>
          <InsightBody ins={ins} audience={audience} compact />
        </div>
      )}
    </div>
  );
}

function RecentStrip({ recent }: { recent: { date: string; value: string }[] }) {
  if (!recent.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {recent.map((r) => (
        <span key={r.date} className="rounded-lg border border-line bg-surface px-2 py-1 text-xs tabular">
          <span className="text-faint">{r.date.slice(8, 10)}.{r.date.slice(5, 7)} </span>
          <span className="font-medium">{r.value}</span>
        </span>
      ))}
    </div>
  );
}

function InsightBody({ ins, audience, compact = false, headline = true }: { ins: ReturnType<typeof personalInsight>; audience: Audience; compact?: boolean; headline?: boolean }) {
  const st = STATUS[ins.status];
  return (
    <div className={cx("space-y-2", compact && "border-t border-line pt-2")}>
      <p className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{audience === "student" ? "Senin verilerinde:" : "Öğrencinin ekranında görünen yorum:"}</span>
        <Badge tone={st.tone}>{st.label}</Badge>
      </p>
      {headline && <p>{ins.headline}</p>}
      <RecentStrip recent={ins.recent} />
      {ins.findings.length > 0 && (
        <ul className="list-disc space-y-1 pl-5">
          {ins.findings.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
      <p className="rounded-lg bg-primary-soft px-3 py-2 text-primary-ink">
        <span className="font-semibold">{audience === "student" ? "Sana özel öneri: " : "Öğrenciye önerilen: "}</span>
        {ins.tip}
      </p>
    </div>
  );
}

/** Tüm değişkenlerin kişisel özeti (İlerleme / öğrenci özeti ekranı). */
export function VariablesCard({ logs, audience = "student" }: { logs: DailyLog[]; audience?: Audience }) {
  const [open, setOpen] = useState<VarKey | null>(null);
  const insights = VAR_ORDER.map((k) => personalInsight(k, logs));
  const rank: Record<InsightStatus, number> = { problem: 0, watch: 1, good: 2, nodata: 3 };
  const sorted = [...insights].sort((a, b) => rank[a.status] - rank[b.status]);
  const attention = insights.filter((i) => i.status === "problem" || i.status === "watch").length;

  return (
    <Card
      title={audience === "student" ? "Seni etkileyen değişkenler" : "Günlük değişkenler: kişisel analiz"}
      subtitle={
        attention
          ? `${attention} değişken dikkat istiyor · her birine dokunarak ${audience === "student" ? "ne anlama geldiğini ve sana özel öneriyi" : "ayrıntıyı ve önerilen adımı"} gör`
          : "Son kayıtlara göre · her birine dokunarak açıklamayı gör"
      }
      bodyClassName="px-0 sm:px-0"
    >
      <ul className="divide-y divide-line">
        {sorted.map((ins) => {
          const info = VAR_INFO[ins.key];
          const st = STATUS[ins.status];
          const isOpen = open === ins.key;
          return (
            <li key={ins.key}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : ins.key)}
                aria-expanded={isOpen}
                className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-2 sm:px-5"
              >
                <span className={cx("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", st.dot)} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    {info.label}
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </span>
                  <span className="mt-0.5 block text-sm text-muted">{ins.headline}</span>
                </span>
                <Icon name="chevronDown" size={18} className={cx("mt-1 shrink-0 text-faint transition", isOpen && "rotate-180")} />
              </button>
              {isOpen && (
                <div className="space-y-2 px-4 pb-4 text-sm sm:px-5 sm:pl-10">
                  <p>
                    <span className="font-semibold">Ne ölçer? </span>
                    {info.what}
                  </p>
                  <p>
                    <span className="font-semibold">Neden önemli? </span>
                    {info.why}
                  </p>
                  <p className="text-muted">
                    <span className="font-semibold text-fg">Hedef: </span>
                    {info.target}
                  </p>
                  <InsightBody ins={ins} audience={audience} compact headline={false} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="px-4 pt-3 text-xs text-faint sm:px-5">Bu yorumlar tanı değildir; {audience === "student" ? "kendi verini anlamana" : "görüşmede konuşulacakları belirlemeye"} yardım eden gözlemlerdir.</p>
    </Card>
  );
}

const NOTE_STYLE: Record<DayNote["level"], { cls: string; icon: "alert" | "check" }> = {
  critical: { cls: "border-danger/30 bg-danger-soft/60", icon: "alert" },
  warning: { cls: "border-warning/30 bg-warning-soft/60", icon: "alert" },
  good: { cls: "border-success/30 bg-success-soft/60", icon: "check" },
};

/** Günlük kayıt kaydedildikten sonra çıkan ayrıntılı geri bildirim. */
export function DayFeedback({ notes, audience = "student", onClose }: { notes: DayNote[]; audience?: Audience; onClose?: () => void }) {
  if (!notes.length) return null;
  const problems = notes.filter((n) => n.level !== "good").length;
  return (
    <Card
      title={problems ? (audience === "student" ? `Bugünkü kaydın: ${problems} konuda dikkat` : `Bu kayıtta ${problems} konuda dikkat`) : "Bugünkü kaydın"}
      subtitle={audience === "student" ? "Kendi ortalamanla karşılaştırıldı" : "Öğrencinin kendi ortalamasıyla karşılaştırıldı"}
      action={
        onClose ? (
          <button type="button" onClick={onClose} className="text-sm text-muted hover:text-fg" aria-label="Geri bildirimi kapat">
            <Icon name="x" size={18} />
          </button>
        ) : undefined
      }
    >
      <ul className="space-y-2">
        {notes.map((n) => {
          const st = NOTE_STYLE[n.level];
          return (
            <li key={n.key + n.title} className={cx("rounded-xl border p-3 text-sm", st.cls)}>
              <p className="flex items-center gap-2 font-semibold">
                <Icon name={st.icon} size={16} className="shrink-0" />
                {n.title}
              </p>
              <p className="mt-1">{n.detail}</p>
              <p className="mt-2 text-muted">
                <span className="font-semibold text-fg">Ne yapabilirsin? </span>
                {n.tip}
              </p>
              {n.level !== "good" && (
                <p className="mt-1 text-xs text-faint">
                  Neden önemli: {VAR_INFO[n.key].why}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Ayrıntılı uyarı (danışman ekranı)                                   */
/* ------------------------------------------------------------------ */

const SIG_STYLE: Record<Signal["level"], { cls: string; icon: "alert" | "info"; label: string }> = {
  critical: { cls: "bg-danger-soft text-danger", icon: "alert", label: "Önemli" },
  warning: { cls: "bg-warning-soft text-warning", icon: "alert", label: "Dikkat" },
  info: { cls: "bg-surface-2 text-muted", icon: "info", label: "Bilgi" },
};

export function DetailedSignalList({ signals, empty }: { signals: Signal[]; empty?: string }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!signals.length) {
    return (
      <p className="flex items-center gap-2 text-sm text-success">
        <Icon name="check" size={16} strokeWidth={2.6} /> {empty ?? "Uyarı yok"}
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {signals.map((s, i) => {
        const st = SIG_STYLE[s.level];
        const hasDetail = Boolean(s.evidence?.length || s.suggestion || s.key);
        const isOpen = open === i;
        return (
          <li key={i} className={cx("rounded-xl text-sm", st.cls)}>
            <button
              type="button"
              disabled={!hasDetail}
              onClick={() => setOpen(isOpen ? null : i)}
              aria-expanded={hasDetail ? isOpen : undefined}
              className="flex w-full items-start gap-2 px-3 py-2 text-left"
            >
              <Icon name={st.icon} size={16} className="mt-0.5 shrink-0" />
              <span className="flex-1">
                <span className="font-semibold">{st.label}:</span> {s.text}
              </span>
              {hasDetail && <Icon name="chevronDown" size={16} className={cx("mt-0.5 shrink-0 transition", isOpen && "rotate-180")} />}
            </button>
            {isOpen && (
              <div className="space-y-1.5 border-t border-current/10 px-3 pb-3 pt-2 text-fg">
                {s.evidence && s.evidence.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted">Kayıtlar</p>
                    <ul className="mt-0.5 space-y-0.5">
                      {s.evidence.map((e) => (
                        <li key={e} className="tabular">
                          {e}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {s.key && s.key in VAR_INFO && (
                  <p>
                    <span className="font-semibold">Neden önemli? </span>
                    {VAR_INFO[s.key as VarKey].why}
                  </p>
                )}
                {s.suggestion && (
                  <p>
                    <span className="font-semibold">Önerilen adım: </span>
                    {s.suggestion}
                  </p>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
