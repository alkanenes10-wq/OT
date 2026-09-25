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
  "karne.ts",
];

mkdirSync("app", { recursive: true });

let moved = 0;
for (const f of APP_FILES) {
  if (existsSync(f)) {
    renameSync(f, `app/${f}`);
    moved++;
  }
}

const missing = APP_FILES.filter((f) => !existsSync(`app/${f}`));
if (missing.length) {
  console.error("\n[hazirla] EKSİK DOSYA: " + missing.join(", "));
  console.error("[hazirla] Bu dosyaları GitHub deposuna yükleyip tekrar deneyin.\n");
  process.exit(1);
}
console.log(moved ? `[hazirla] ${moved} dosya app/ klasörüne taşındı.` : "[hazirla] app/ klasörü hazır.");
