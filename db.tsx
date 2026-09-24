"use client";
// Tarayıcı tarafı: Supabase bağlantısı, oturum (giriş) durumu, veri okuma yardımcıları ve basit sayfa yönlendirici.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import type { DailyLog, PlanDay, PlanTask, Profile, TopicProgress, WeeklyPlan } from "./lib";

/* ------------------------------------------------------------------ */
/* Supabase istemcisi                                                  */
/* ------------------------------------------------------------------ */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && key);

let client: SupabaseClient | null = null;

export function sb(): SupabaseClient {
  if (!isSupabaseConfigured) throw new Error("Supabase ortam değişkenleri tanımlı değil.");
  if (!client) {
    client = createClient(url as string, key as string, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "yks-takip-auth" },
    });
  }
  return client;
}

export async function accessToken(): Promise<string> {
  const { data } = await sb().auth.getSession();
  return data.session?.access_token ?? "";
}

/** Hataları Türkçe, anlaşılır mesaja çevirir. */
export function errorText(err: unknown): string {
  if (!err) return "Bilinmeyen bir hata oluştu.";
  const msg =
    typeof err === "string"
      ? err
      : typeof err === "object" && err && "message" in err
        ? String((err as { message: unknown }).message)
        : String(err);
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return "İnternet bağlantısı yok gibi görünüyor. Lütfen tekrar deneyin.";
  if (/Invalid login credentials/i.test(msg)) return "Kullanıcı adı / e-posta veya şifre hatalı.";
  if (/banned/i.test(msg)) return "Hesabın pasif durumda. Danışmanınla iletişime geç.";
  if (/rate limit|too many/i.test(msg)) return "Çok fazla deneme yapıldı. Biraz bekleyip tekrar deneyin.";
  if (/row-level security|permission denied/i.test(msg)) return "Bu işlem için yetkiniz yok.";
  if (/duplicate key|unique/i.test(msg)) return "Bu kayıt zaten mevcut.";
  if (/JWT expired|jwt/i.test(msg)) return "Oturum süresi doldu, lütfen tekrar giriş yapın.";
  return msg;
}

/* ------------------------------------------------------------------ */
/* Veri okuma                                                          */
/* ------------------------------------------------------------------ */
export async function fetchPlans(studentId: string): Promise<WeeklyPlan[]> {
  const { data, error } = await sb().from("weekly_plans").select("*").eq("student_id", studentId).order("start_date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as WeeklyPlan[];
}

export async function fetchPlanDetail(planId: string): Promise<{ tasks: PlanTask[]; days: PlanDay[] }> {
  const [t, d] = await Promise.all([
    sb().from("plan_tasks").select("*").eq("plan_id", planId),
    sb().from("plan_days").select("*").eq("plan_id", planId),
  ]);
  if (t.error) throw t.error;
  if (d.error) throw d.error;
  return {
    tasks: (t.data ?? []) as PlanTask[],
    days: ((d.data ?? []) as PlanDay[]).map((x) => ({ ...x, time_blocks: Array.isArray(x.time_blocks) ? x.time_blocks : [] })),
  };
}

export async function fetchLogs(studentId: string, from?: string): Promise<DailyLog[]> {
  let q = sb().from("daily_logs").select("*").eq("student_id", studentId).order("log_date", { ascending: false });
  if (from) q = q.gte("log_date", from);
  const { data, error } = await q.limit(400);
  if (error) throw error;
  return ((data ?? []) as DailyLog[]).map((l) => ({ ...l, sleep_hours: l.sleep_hours == null ? null : Number(l.sleep_hours) }));
}

export async function fetchTopicProgress(studentId: string): Promise<TopicProgress[]> {
  const { data, error } = await sb().from("topic_progress").select("*").eq("student_id", studentId);
  if (error) throw error;
  return (data ?? []) as TopicProgress[];
}

/* ------------------------------------------------------------------ */
/* Oturum                                                              */
/* ------------------------------------------------------------------ */
type AuthState = {
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  profileError: string | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const loadedFor = useRef<string | null>(null);

  const loadProfile = useCallback(async (s: Session | null) => {
    loadedFor.current = s?.user.id ?? null;
    if (!s) {
      setProfile(null);
      setProfileError(null);
      return;
    }
    const { data, error } = await sb().from("profiles").select("*").eq("id", s.user.id).maybeSingle();
    if (error) {
      setProfile(null);
      setProfileError(error.message);
    } else if (!data) {
      setProfile(null);
      setProfileError("Bu hesap için profil bulunamadı.");
    } else {
      setProfile(data as Profile);
      setProfileError(null);
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    let active = true;
    sb()
      .auth.getSession()
      .then(async ({ data }) => {
        if (!active) return;
        setSession(data.session);
        await loadProfile(data.session);
        if (active) setLoading(false);
      });
    const { data: sub } = sb().auth.onAuthStateChange((_event, s) => {
      setSession(s);
      const uid = s?.user.id ?? null;
      // Yalnızca kullanıcı değiştiğinde (giriş/çıkış) profili yeniden yükle
      if (uid !== loadedFor.current) {
        loadedFor.current = uid;
        if (uid) setLoading(true);
        setTimeout(() => {
          loadProfile(s).finally(() => setLoading(false));
        }, 0);
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      session,
      profile,
      profileError,
      refreshProfile: () => loadProfile(session),
      signOut: async () => {
        await sb().auth.signOut();
        setProfile(null);
        setSession(null);
      },
    }),
    [loading, session, profile, profileError, loadProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth, AuthProvider içinde kullanılmalı");
  return ctx;
}

/* ------------------------------------------------------------------ */
/* Basit yönlendirici — tüm ekranlar tek sayfada, adres çubuğunda ?v=… */
/* (v: ekran, id: öğrenci, t: sekme). Geri tuşu çalışır.              */
/* ------------------------------------------------------------------ */
export type Route = { v?: string; id?: string; t?: string };

function parseRoute(): Route {
  const p = new URLSearchParams(window.location.search);
  return { v: p.get("v") ?? undefined, id: p.get("id") ?? undefined, t: p.get("t") ?? undefined };
}

export function routeHref(r: Route): string {
  const p = new URLSearchParams();
  if (r.v) p.set("v", r.v);
  if (r.id) p.set("id", r.id);
  if (r.t) p.set("t", r.t);
  const q = p.toString();
  return q ? `/?${q}` : "/";
}

const RouteContext = createContext<{ route: Route; go: (r: Route, opts?: { replace?: boolean }) => void } | null>(null);

export function RouterProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>({});
  useEffect(() => {
    setRoute(parseRoute());
    const onPop = () => setRoute(parseRoute());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const go = useCallback((r: Route, opts?: { replace?: boolean }) => {
    const href = routeHref(r);
    if (opts?.replace) window.history.replaceState(null, "", href);
    else window.history.pushState(null, "", href);
    setRoute(r);
    if (!opts?.replace) window.scrollTo(0, 0);
  }, []);
  return <RouteContext.Provider value={{ route, go }}>{children}</RouteContext.Provider>;
}

export function useRoute() {
  const ctx = useContext(RouteContext);
  if (!ctx) throw new Error("useRoute, RouterProvider içinde kullanılmalı");
  return ctx;
}

/** Uygulama içi bağlantı (yeni sekmede açma da çalışır) */
export function A({ to, className, children, ...rest }: { to: Route; className?: string; children: ReactNode; "aria-label"?: string; "aria-current"?: "page" }) {
  const { go } = useRoute();
  return (
    <a
      href={routeHref(to)}
      className={className}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        go(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
