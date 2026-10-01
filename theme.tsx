"use client";
// Kişisel görünüm: renk paleti ve açık/koyu mod.
// Seçim hesabına kaydedilir (profiles.accent, profiles.color_mode), bu yüzden telefonda da
// bilgisayarda da aynı görünür. Ayrıca cihazda saklanır ki sayfa açılırken renk sıçraması olmasın.

import { useEffect, useState } from "react";
import { errorText, sb, useAuth } from "./db";
import { THEME_STORAGE_KEY, type Profile } from "./lib";
import { Card, Segmented, cx, useToast } from "./ui";

export type Accent = "petrol" | "okyanus" | "mor" | "gul" | "gunbatimi" | "orman" | "grafit";
export type ColorMode = "auto" | "light" | "dark";

export const ACCENTS: { id: Accent; label: string; swatch: string }[] = [
  { id: "petrol", label: "Petrol", swatch: "#0e7066" },
  { id: "okyanus", label: "Okyanus", swatch: "#1d5fc4" },
  { id: "mor", label: "Mor", swatch: "#6b46c1" },
  { id: "gul", label: "Gül", swatch: "#c0306b" },
  { id: "gunbatimi", label: "Gün batımı", swatch: "#c2410c" },
  { id: "orman", label: "Orman", swatch: "#2f7d32" },
  { id: "grafit", label: "Grafit", swatch: "#3f4a5a" },
];

const KEY = THEME_STORAGE_KEY;
const isAccent = (v: unknown): v is Accent => ACCENTS.some((a) => a.id === v);
const isMode = (v: unknown): v is ColorMode => v === "auto" || v === "light" || v === "dark";


export function applyTheme(accent: Accent, mode: ColorMode) {
  const r = document.documentElement;
  if (accent === "petrol") delete r.dataset.accent;
  else r.dataset.accent = accent;
  if (mode === "auto") delete r.dataset.mode;
  else r.dataset.mode = mode;
  try {
    localStorage.setItem(KEY, JSON.stringify({ a: accent, m: mode }));
  } catch {}
}

function cached(): { accent: Accent; mode: ColorMode } {
  try {
    const t = JSON.parse(localStorage.getItem(KEY) || "{}");
    return { accent: isAccent(t.a) ? t.a : "petrol", mode: isMode(t.m) ? t.m : "auto" };
  } catch {
    return { accent: "petrol", mode: "auto" };
  }
}

/** Giriş yapan kullanıcının kayıtlı görünümünü uygular. */
export function ThemeSync() {
  const { profile } = useAuth();
  useApplyProfileTheme(profile);
  return null;
}

function useApplyProfileTheme(profile: Profile | null) {
  useEffect(() => {
    if (!profile) return;
    const p = profile as Profile & { accent?: string | null; color_mode?: string | null };
    // Sütunlar henüz yoksa (guncelleme-7.sql çalıştırılmadıysa) cihazdaki seçim kullanılır.
    if (!("accent" in p)) return;
    applyTheme(isAccent(p.accent) ? p.accent : "petrol", isMode(p.color_mode) ? p.color_mode : "auto");
  }, [profile]);
}

export function AppearanceCard() {
  const toast = useToast();
  const { refreshProfile } = useAuth();
  const [accent, setAccent] = useState<Accent>("petrol");
  const [mode, setMode] = useState<ColorMode>("auto");
  const [warn, setWarn] = useState<string | null>(null);

  useEffect(() => {
    const c = cached();
    setAccent(c.accent);
    setMode(c.mode);
  }, []);

  async function save(a: Accent, m: ColorMode) {
    setAccent(a);
    setMode(m);
    applyTheme(a, m);
    const { error } = await sb().rpc("set_my_theme", { p_accent: a, p_mode: m });
    if (error) {
      const missing = /set_my_theme|schema cache|does not exist|function/i.test(error.message);
      setWarn(
        missing
          ? "Seçim bu cihazda uygulandı. Diğer cihazlarda da görünmesi için danışmanın Supabase'de guncelleme-hepsi.sql dosyasını çalıştırmalı."
          : errorText(error),
      );
      if (!missing) toast.show(errorText(error), "danger");
    } else {
      setWarn(null);
      refreshProfile();
    }
  }

  return (
    <Card title="Görünüm" subtitle="Uygulamanın rengini kendine göre seç. Seçimin hesabına kaydedilir.">
      <div className="space-y-4">
        <div role="radiogroup" aria-label="Renk paleti" className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {ACCENTS.map((a) => {
            const active = a.id === accent;
            return (
              <button
                key={a.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => save(a.id, mode)}
                className={cx(
                  "flex flex-col items-center gap-1.5 rounded-xl border p-2 text-xs font-medium transition",
                  active ? "border-primary bg-primary-soft text-primary-ink" : "border-line hover:bg-surface-2",
                )}
              >
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-full ring-2 ring-surface"
                  style={{ background: a.swatch, boxShadow: active ? `0 0 0 2px ${a.swatch}` : undefined }}
                  aria-hidden
                >
                  {active && (
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  )}
                </span>
                {a.label}
              </button>
            );
          })}
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium">Tema</p>
          <Segmented
            ariaLabel="Açık veya koyu tema"
            value={mode}
            onChange={(m) => save(accent, m)}
            options={[
              { value: "auto", label: "Otomatik" },
              { value: "light", label: "Açık" },
              { value: "dark", label: "Koyu" },
            ]}
          />
          <p className="mt-1.5 text-xs text-faint">Otomatik: telefonun/bilgisayarın ayarına göre açık ya da koyu olur.</p>
        </div>
        {warn && <p className="rounded-lg bg-warning-soft p-2.5 text-xs text-warning">{warn}</p>}
      </div>
    </Card>
  );
}
