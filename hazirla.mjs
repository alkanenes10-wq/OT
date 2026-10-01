// Derlemeden önce otomatik çalışır (npm run build / npm run dev).
// Next.js uygulama dosyalarının "app" klasöründe olmasını ister. Dosyalar GitHub'a
// klasörsüz (hepsi en üstte) yüklendiyse bu betik "app" klasörünü oluşturup dosyaları taşır.
// Dosyalar zaten app/ içindeyse hiçbir şey yapmaz.
import { existsSync, mkdirSync, renameSync } from "node:fs";

const APP_FILES = [
  "layout.tsx",
  "page.tsx",
  "globals.css",
  "manifest.ts",
  "icon.png",
  "apple-icon.png",
  "actions.ts",
  "lib.ts",
  "curriculum.ts",
  "db.tsx",
  "ui.tsx",
  "shell.tsx",
  "plan.tsx",
  "daily.tsx",
  "topics.tsx",
  "insights.tsx",
  "counselor.tsx",
  "student.tsx",
  "planner.ts",
  "exams.tsx",
  "schedule.tsx",
  "team.tsx",
  "support.tsx",
  "notes.tsx",
  "calendar.tsx",
  "progress.tsx",
  "karne.ts",
  "degiskenler.ts",
  "rehber.tsx",
  "ekler.tsx",
  "veli-raporu.tsx",
  "soru-bankasi.tsx",
  "takvim.tsx",
  "theme.tsx",
  "kaynaklar.tsx",
  "konu-analizi.tsx",
  "hatirlatma.tsx",
  "forum.tsx",
  "katalog.tsx",
  "yerlestir.ts",
  "veli.tsx",
  "bildirim.tsx",
  "oyun.tsx",
];

// Alt klasör isteyen dosyalar (düz yüklemedeki adı → app içindeki yeri)
const NESTED = {
  "sw-route.ts": "app/sw.js/route.ts",
  "bildirim-route.ts": "app/api/bildirim/[tur]/route.ts",
};

mkdirSync("app", { recursive: true });

let moved = 0;
for (const f of APP_FILES) {
  if (existsSync(f)) {
    renameSync(f, `app/${f}`);
    moved++;
  }
}

for (const [flat, target] of Object.entries(NESTED)) {
  if (existsSync(flat)) {
    mkdirSync(target.slice(0, target.lastIndexOf("/")), { recursive: true });
    renameSync(flat, target);
    moved++;
  }
}

const missing = [...APP_FILES.filter((f) => !existsSync(`app/${f}`)), ...Object.entries(NESTED).filter(([, t]) => !existsSync(t)).map(([f]) => f)];
if (missing.length) {
  console.error("\n[hazirla] EKSİK DOSYA: " + missing.join(", "));
  console.error("[hazirla] Bu dosyaları GitHub deposuna yükleyip tekrar deneyin.\n");
  process.exit(1);
}
console.log(moved ? `[hazirla] ${moved} dosya app/ klasörüne taşındı.` : "[hazirla] app/ klasörü hazır.");
