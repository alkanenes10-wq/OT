"use client";
// Uygulama iskeleti: sağlayıcılar, üst menü / alt menü, giriş ve ilk kurulum ekranları.

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { setupCounselor, setupStatus } from "./actions";
import { A, AuthProvider, RouterProvider, errorText, isSupabaseConfigured, sb, useAuth, useRoute, type Route } from "./db";
import { APP_NAME, loginIdToEmail } from "./lib";
import { Button, ErrorBox, Field, Icon, IconButton, PageLoader, ToastProvider, cx, type IconName } from "./ui";

/* ------------------------------------------------------------------ */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <RouterProvider>
        <ToastProvider>
          <OfflineBanner />
          {children}
        </ToastProvider>
      </RouterProvider>
    </AuthProvider>
  );
}

function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  if (!offline) return null;
  return (
    <div className="pt-safe fixed inset-x-0 top-0 z-[70] flex items-center justify-center gap-2 bg-warning px-3 py-1.5 text-sm font-medium text-white">
      <Icon name="wifiOff" size={16} />
      İnternet bağlantısı yok — değişiklikler kaydedilemez.
    </div>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-fg">
        <Icon name="check" size={18} strokeWidth={2.6} />
      </span>
      <span className="text-[15px] font-semibold tracking-tight">{APP_NAME}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
type NavItem = { to: Route; label: string; icon: IconName };

const STUDENT_NAV: NavItem[] = [
  { to: {}, label: "Bugün", icon: "home" },
  { to: { v: "program" }, label: "Program", icon: "calendar" },
  { to: { v: "gunluk" }, label: "Günlük", icon: "journal" },
  { to: { v: "konular" }, label: "Konular", icon: "book" },
  { to: { v: "ilerleme" }, label: "İlerleme", icon: "chart" },
];

function UserMenu() {
  const { profile, signOut } = useAuth();
  const { go } = useRoute();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  const initials = (profile?.full_name ?? "?")
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toLocaleUpperCase("tr-TR");
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary-ink"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Hesap menüsü"
      >
        {initials}
      </button>
      {open && (
        <div role="menu" className="card absolute right-0 top-11 z-40 w-56 overflow-hidden p-1 shadow-lg">
          <div className="px-3 py-2">
            <p className="truncate text-sm font-medium">{profile?.full_name}</p>
            <p className="truncate text-xs text-faint">{profile?.role === "counselor" ? "Danışman" : `@${profile?.username}`}</p>
          </div>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              go({ v: "ayarlar" });
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2"
          >
            <Icon name="settings" size={16} /> Ayarlar
          </button>
          <button
            role="menuitem"
            onClick={() => signOut()}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-danger-soft"
          >
            <Icon name="logout" size={16} /> Çıkış yap
          </button>
        </div>
      )}
    </div>
  );
}

export function StudentShell({ children }: { children: ReactNode }) {
  const { route } = useRoute();
  const isActive = (item: NavItem) => (item.to.v ?? "") === (route.v ?? "");
  return (
    <div className="min-h-dvh">
      <header className="pt-safe sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4">
          <A to={{}} aria-label="Ana sayfa">
            <Logo />
          </A>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Ana menü">
            {STUDENT_NAV.map((item) => (
              <A
                key={item.label}
                to={item.to}
                className={cx(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition",
                  isActive(item) ? "bg-primary-soft text-primary-ink" : "text-muted hover:text-fg",
                )}
              >
                {item.label}
              </A>
            ))}
          </nav>
          <UserMenu />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-28 pt-4 md:pb-12">{children}</main>
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur md:hidden" aria-label="Alt menü">
        <div className="mx-auto grid max-w-md grid-cols-5">
          {STUDENT_NAV.map((item) => {
            const active = isActive(item);
            return (
              <A
                key={item.label}
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={cx("flex flex-col items-center gap-0.5 pb-2 pt-2.5 text-[11px] font-medium transition", active ? "text-primary" : "text-faint")}
              >
                <Icon name={item.icon} size={22} strokeWidth={active ? 2.2 : 1.8} />
                {item.label}
              </A>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export function CounselorShell({ children }: { children: ReactNode }) {
  const { route } = useRoute();
  const settings = route.v === "ayarlar";
  const link = (active: boolean) =>
    cx("hidden rounded-lg px-3 py-1.5 text-sm font-medium transition sm:inline-flex", active ? "bg-primary-soft text-primary-ink" : "text-muted hover:text-fg");
  return (
    <div className="min-h-dvh">
      <header className="pt-safe sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <A to={{}} aria-label="Öğrenciler">
            <Logo />
          </A>
          <div className="flex items-center gap-1">
            <A to={{}} className={link(!settings)}>
              Öğrenciler
            </A>
            <A to={{ v: "ayarlar" }} className={link(settings)}>
              Ayarlar
            </A>
            <UserMenu />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-5">{children}</main>
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
const INSTALL_KEY = "yks-install-hint-dismissed";

/** "Ana ekrana ekle" önerisi (Android: tek tık, iPhone: talimat) */
export function InstallHint() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(INSTALL_KEY) === "1";
    } catch {}
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (dismissed || standalone) return;
    if (/iPhone|iPad|iPod/i.test(navigator.userAgent) && !/CriOS|FxiOS/i.test(navigator.userAgent)) {
      setIos(true);
      setHidden(false);
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
      setHidden(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(INSTALL_KEY, "1");
    } catch {}
  };

  if (hidden) return null;
  return (
    <div className="card mb-4 flex items-start gap-3 p-3.5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-ink">
        <Icon name="phone" />
      </div>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium text-fg">Uygulamayı telefonuna ekle</p>
        {ios && !deferred ? (
          <p className="mt-0.5 text-muted">
            Safari&apos;de alttaki <Icon name="share" size={14} className="-mt-0.5 inline" /> <b>Paylaş</b> düğmesine, ardından <b>Ana Ekrana Ekle</b>&apos;ye dokun.
          </p>
        ) : (
          <div className="mt-2">
            <Button
              size="sm"
              onClick={async () => {
                if (!deferred) return;
                await deferred.prompt();
                await deferred.userChoice.catch(() => null);
                dismiss();
              }}
            >
              Yükle
            </Button>
          </div>
        )}
      </div>
      <IconButton icon="x" label="Kapat" onClick={dismiss} className="-mr-1 -mt-1 h-8 w-8" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
export function ConfigMissing() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 px-5 py-10">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-warning-soft text-warning">
        <Icon name="settings" size={26} />
      </div>
      <h1 className="text-xl font-semibold">Kurulum tamamlanmamış</h1>
      <p className="text-muted">Uygulamanın veritabanına bağlanabilmesi için Vercel&apos;de şu ortam değişkenleri tanımlanmalı:</p>
      <ul className="space-y-1 rounded-xl bg-surface-2 p-4 font-mono text-sm">
        <li>NEXT_PUBLIC_SUPABASE_URL</li>
        <li>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</li>
        <li>SUPABASE_SECRET_KEY</li>
        <li>SETUP_SECRET</li>
      </ul>
      <p className="text-sm text-muted">
        Değişkenleri ekledikten sonra Vercel&apos;de <b>Deployments → Redeploy</b> yapın.
      </p>
    </main>
  );
}

export function ProfileProblem({ message }: { message: string }) {
  const { signOut } = useAuth();
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 px-5 py-10">
      <h1 className="text-xl font-semibold">Hesap bilgisi alınamadı</h1>
      <p className="text-muted">{message}</p>
      <p className="text-sm text-muted">
        Veritabanı şeması (schema.sql) çalıştırılmamış olabilir veya bu hesap uygulama üzerinden oluşturulmamış olabilir.
      </p>
      <div>
        <Button variant="secondary" icon="logout" onClick={() => signOut()}>
          Çıkış yap
        </Button>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */
export function LoginScreen() {
  const { go } = useRoute();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupAvailable, setSetupAvailable] = useState(false);

  useEffect(() => {
    setupStatus()
      .then((r) => setSetupAvailable(r.ok && r.setupAvailable))
      .catch(() => {});
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!loginId.trim() || !password) return setError("Kullanıcı adı ve şifre gerekli.");
    setBusy(true);
    const { error } = await sb().auth.signInWithPassword({ email: loginIdToEmail(loginId), password });
    setBusy(false);
    if (error) return setError(errorText(error));
    go({}, { replace: true });
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-8 flex justify-center">
        <Logo />
      </div>
      <InstallHint />
      <div className="card p-6">
        <h1 className="text-xl font-semibold">Giriş yap</h1>
        <p className="mt-1 text-sm text-muted">{APP_NAME} hesabınla devam et.</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
          <Field label="Kullanıcı adı veya e-posta" htmlFor="login">
            <input
              id="login"
              className="field"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              placeholder="ör. ogr001"
            />
          </Field>
          <Field label="Şifre" htmlFor="password">
            <input id="password" type="password" className="field" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {error && <ErrorBox>{error}</ErrorBox>}
          <Button type="submit" size="lg" className="w-full" loading={busy}>
            Giriş yap
          </Button>
        </form>
        <p className="mt-5 text-center text-xs text-faint">Şifreni unuttuysan danışmanınla iletişime geç.</p>
      </div>
      {setupAvailable && (
        <p className="mt-6 text-center text-sm text-muted">
          İlk kez mi kuruyorsunuz?{" "}
          <A to={{ v: "kurulum" }} className="font-medium text-primary underline-offset-2 hover:underline">
            Danışman hesabı oluştur
          </A>
        </p>
      )}
    </main>
  );
}

export function SetupScreen() {
  const { go } = useRoute();
  const [status, setStatus] = useState<"loading" | "open" | "done" | "closed" | "error">("loading");
  const [statusMsg, setStatusMsg] = useState("");
  const [form, setForm] = useState({ secret: "", fullName: "", email: "", password: "", password2: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setupStatus()
      .then((r) => {
        if (!r.ok) {
          setStatus("error");
          setStatusMsg(r.error);
        } else setStatus(r.setupDone ? "done" : r.setupAvailable ? "open" : "closed");
      })
      .catch(() => {
        setStatus("error");
        setStatusMsg("Sunucuya ulaşılamadı.");
      });
  }, []);

  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.password !== form.password2) return setError("Şifreler aynı değil.");
    setBusy(true);
    try {
      const r = await setupCounselor({ secret: form.secret, fullName: form.fullName, email: form.email, password: form.password });
      if (!r.ok) throw new Error(r.error);
      const { error } = await sb().auth.signInWithPassword({ email: form.email.trim().toLowerCase(), password: form.password });
      if (error) throw error;
      go({}, { replace: true });
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-8 flex justify-center">
        <Logo />
      </div>
      <div className="card p-6">
        <h1 className="text-xl font-semibold">İlk kurulum</h1>
        {status === "loading" && <PageLoader text="Kontrol ediliyor…" />}
        {status === "error" && (
          <div className="mt-4">
            <ErrorBox>{statusMsg}</ErrorBox>
          </div>
        )}
        {status === "done" && (
          <div className="mt-3 space-y-4 text-sm text-muted">
            <p>Danışman hesabı zaten oluşturulmuş.</p>
            <A to={{}} className="font-medium text-primary">
              Giriş sayfasına git →
            </A>
          </div>
        )}
        {status === "closed" && (
          <p className="mt-3 text-sm text-muted">
            Kurulum kapalı. Vercel&apos;de <code className="rounded bg-surface-2 px-1">SETUP_SECRET</code> ortam değişkenini tanımlayıp yeniden dağıtım (redeploy) yapın.
          </p>
        )}
        {status === "open" && (
          <>
            <p className="mt-1 text-sm text-muted">Danışman (yönetici) hesabınızı oluşturun. Bu işlem yalnızca bir kez yapılır.</p>
            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <Field label="Kurulum parolası" hint="Vercel'de SETUP_SECRET olarak girdiğiniz değer" htmlFor="secret">
                <input id="secret" type="password" className="field" value={form.secret} onChange={set("secret")} required />
              </Field>
              <Field label="Ad soyad" htmlFor="name">
                <input id="name" className="field" value={form.fullName} onChange={set("fullName")} required autoComplete="name" />
              </Field>
              <Field label="E-posta" htmlFor="email" hint="Giriş yaparken kullanacaksınız">
                <input id="email" type="email" className="field" value={form.email} onChange={set("email")} required autoComplete="email" />
              </Field>
              <Field label="Şifre" htmlFor="pw" hint="En az 8 karakter">
                <input id="pw" type="password" className="field" value={form.password} onChange={set("password")} required autoComplete="new-password" />
              </Field>
              <Field label="Şifre (tekrar)" htmlFor="pw2">
                <input id="pw2" type="password" className="field" value={form.password2} onChange={set("password2")} required autoComplete="new-password" />
              </Field>
              {error && <ErrorBox>{error}</ErrorBox>}
              <Button type="submit" size="lg" className="w-full" loading={busy}>
                Hesabı oluştur
              </Button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
