import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { APP_NAME, THEME_BOOT_SCRIPT } from "./lib";
import { Providers } from "./shell";

// Karne analizi gibi uzun sunucu işlemleri için (saniye)
export const maxDuration = 120;

export const metadata: Metadata = {
  title: APP_NAME,
  description: "YKS öğrencileri için akademik ve psikolojik takip uygulaması",
  applicationName: APP_NAME,
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "default" },
  formatDetection: { telephone: false },
  // Öğrenci verisi içeren özel bir uygulama: arama motorlarında listelenmesin
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f6f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0c1117" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
        />
      </head>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
