// Bildirimler için servis çalışanı (service worker). /sw.js adresinden sunulur.
// Not: GitHub'a düz yüklemede bu dosyanın adı "sw-route.ts"dir; hazirla.mjs onu app/sw.js/route.ts konumuna taşır.

const SW = `
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { title: "YKS Takip", body: event.data ? event.data.text() : "" }; }
  const title = d.title || "YKS Takip";
  event.waitUntil(self.registration.showNotification(title, {
    body: d.body || "",
    icon: "/icon.png",
    badge: "/icon.png",
    tag: d.tag || "yks",
    renotify: false,
    data: { url: d.url || "/" },
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if ("focus" in c) { await c.focus(); if ("navigate" in c) { try { await c.navigate(url); } catch (e) {} } return; }
    }
    await self.clients.openWindow(url);
  })());
});
`;

export function GET() {
  return new Response(SW, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "no-cache, no-store, must-revalidate",
      "service-worker-allowed": "/",
    },
  });
}
