// Öğrenciyi günlük olarak etkileyen değişkenler: ne ölçtükleri, neden önemli oldukları
// ve öğrencinin KENDİ kayıtlarından çıkan kişisel yorumlar.
// Bunlar tanı değildir; öğrencinin kendi verisini anlamasına yardım eden gözlemlerdir.
// Metinleri ve eşikleri bu dosyadan değiştirebilirsiniz.

import { avg, type DailyLog, fmtNum, formatShort } from "./lib";

export type VarKey = "sleep_hours" | "phone_minutes" | "procrastinated" | "replanned" | "anxiety" | "energy" | "motivation";

export type VarInfo = {
  key: VarKey;
  label: string;
  /** Ne ölçüyor? */
  what: string;
  /** Neden önemli? (kısa, kanıta dayalı açıklama) */
  why: string;
  /** Önerilen aralık / hedef */
  target: string;
  /** Genel öneri (kişisel öneri yoksa gösterilir) */
  tip: string;
};

export const VAR_INFO: Record<VarKey, VarInfo> = {
  sleep_hours: {
    key: "sleep_hours",
    label: "Uyku süresi",
    what: "Dün gece kaç saat uyuduğun.",
    why: "Gün içinde öğrendiklerin uykuda kalıcı hafızaya geçer. Kısa uyku ertesi gün dikkati, enerjiyi ve duyguları düzenleme gücünü zayıflatır; kaygıyı da artırabilir.",
    target: "Senin yaş grubunda 8–10 saat önerilir; 7 saatin altı düzenli olmamalı.",
    tip: "Her gün aynı saatte kalk (hafta sonu dahil) ve yatmadan 1 saat önce ekranı bırak.",
  },
  phone_minutes: {
    key: "phone_minutes",
    label: "Telefon / dikkat dağıtıcı",
    what: "Planında olmayan telefon, sosyal medya, oyun ve video süresi (dakika).",
    why: "Her bildirim dikkati böler ve odağa geri dönmek zaman alır. Kısa videolar zor bir görevin yarattığı sıkıntıdan kaçmanın en kolay yoludur; bu yüzden erteleme çoğunlukla buradan başlar.",
    target: "Çalışma bloklarında 0 dakika; gün toplamında 60–90 dakikanın altı hedeflenir.",
    tip: "Çalışırken telefonu başka odaya koy; molada bile kısa video açma.",
  },
  procrastinated: {
    key: "procrastinated",
    label: "Erteleme",
    what: "Planladığın bir işi, yapabilecekken sonraya bırakıp bırakmadığın.",
    why: "Erteleme tembellik değildir: zor ya da sıkıcı bir görevin verdiği olumsuz duygudan kaçmaktır. Kısa vadede rahatlatır, uzun vadede kaygıyı ve suçluluğu artırır.",
    target: "Haftada en fazla 1–2 gün.",
    tip: "5 dakika kuralı: göreve sadece 5 dakika başlamayı kendine söz ver; başlamak çoğu zaman devamını getirir.",
  },
  replanned: {
    key: "replanned",
    label: "Planı yeniden düzenleme",
    what: "Gün içinde programını değiştirmek zorunda kalıp kalmadığın.",
    why: "Esneklik iyidir. Ama plan sık sık değişiyorsa ya plan gerçekçi değildir ya da güne ertelemeyle başlanıyordur. Planla, izle, değerlendir döngüsünün aksadığını gösterir.",
    target: "Haftada 1–2 gün normal kabul edilir.",
    tip: "Plan değiştiğinde nedenini 'Bugünkü en büyük engel' alanına yaz; tekrar eden neden, çözülecek asıl konudur.",
  },
  anxiety: {
    key: "anxiety",
    label: "Kaygı",
    what: "Gün içinde hissettiğin endişe ve gerginlik düzeyi (1–5).",
    why: "Orta düzey kaygı seni harekete geçirir ve performansı destekler. Yüksek kaygı ise dikkati ve çalışma belleğini daraltır; bildiğin soruda bile takılmana yol açabilir.",
    target: "Çoğu gün 2–3 civarı beklenir; 4–5 art arda gelmemeli.",
    tip: "Kaygı yükseldiğinde aklından geçen düşünceyi yaz ve 'Bunun kanıtı ne? Başka nasıl bakabilirim?' diye sor. Yavaş nefes (4 sn al, 6 sn ver) bedeni sakinleştirir.",
  },
  energy: {
    key: "energy",
    label: "Enerji",
    what: "Bedenen ve zihnen ne kadar dinç hissettiğin (1–5).",
    why: "Enerji uyku, beslenme, hareket ve mola düzeninden etkilenir. Düşük enerjide yeni ve zor konu verimsizleşir; tekrar ve soru çözümü daha uygundur.",
    target: "Çoğu gün 3 ve üzeri.",
    tip: "40–50 dakikalık bloklar arasında 10 dakika gerçek mola ver; ayağa kalk, su iç, kısa yürü.",
  },
  motivation: {
    key: "motivation",
    label: "Motivasyon",
    what: "Çalışmaya ne kadar istekli olduğun (1–5).",
    why: "Motivasyon çoğu zaman harekete geçmeden önce değil, geçtikten sonra gelir. Genellikle enerji ve uykuyla birlikte düşer; beklemek yerine küçük bir adımla başlamak onu geri getirir.",
    target: "Çoğu gün 3 ve üzeri.",
    tip: "Güne en kolay ve en kısa görevle başla; bitirdiğin her görevi işaretlemek motivasyonu besler.",
  },
};

export const VAR_ORDER: VarKey[] = ["sleep_hours", "phone_minutes", "procrastinated", "replanned", "anxiety", "energy", "motivation"];

/* ------------------------------------------------------------------ */
/* Yardımcılar                                                         */
/* ------------------------------------------------------------------ */

const num = (v: number | string | null | undefined): number | null => (v == null || v === "" ? null : Number(v));
const byNewest = (logs: DailyLog[]) => [...logs].sort((a, b) => (a.log_date < b.log_date ? 1 : -1));
const pctText = (a: number, b: number) => (b ? `%${Math.round((a / b) * 100)}` : "—");

/** İki grup arasındaki ortalama farkı (her grupta en az 2 kayıt). */
function compare(logs: DailyLog[], inA: (l: DailyLog) => boolean | null, value: (l: DailyLog) => number | null) {
  const a: number[] = [];
  const b: number[] = [];
  for (const l of logs) {
    const g = inA(l);
    const v = value(l);
    if (g == null || v == null) continue;
    (g ? a : b).push(v);
  }
  if (a.length < 2 || b.length < 2) return null;
  return { a: avg(a) as number, b: avg(b) as number, na: a.length, nb: b.length };
}

/** Evet/hayır değişkeninin iki gruptaki oranı. */
function rate(logs: DailyLog[], inA: (l: DailyLog) => boolean | null, flag: (l: DailyLog) => boolean | null) {
  let aYes = 0, aN = 0, bYes = 0, bN = 0;
  for (const l of logs) {
    const g = inA(l);
    const f = flag(l);
    if (g == null || f == null) continue;
    if (g) {
      aN++;
      if (f) aYes++;
    } else {
      bN++;
      if (f) bYes++;
    }
  }
  if (aN < 2 || bN < 2) return null;
  return { a: aYes / aN, b: bYes / bN, aN, bN };
}

/** Öğrencinin kendi yazdığı metinlerden (son kayıtlar) en fazla n tanesi. */
function ownWords(logs: DailyLog[], pick: (l: DailyLog) => string | null, filter: (l: DailyLog) => boolean = () => true, n = 2) {
  return byNewest(logs)
    .filter(filter)
    .map((l) => ({ date: l.log_date, text: (pick(l) ?? "").trim() }))
    .filter((x) => x.text.length >= 3)
    .slice(0, n);
}

const quote = (xs: { date: string; text: string }[]) => xs.map((x) => `“${x.text.length > 90 ? x.text.slice(0, 88) + "…" : x.text}” (${formatShort(x.date)})`).join(" · ");

/* ------------------------------------------------------------------ */
/* Kişisel yorum                                                       */
/* ------------------------------------------------------------------ */

export type InsightStatus = "good" | "watch" | "problem" | "nodata";

export type PersonalInsight = {
  key: VarKey;
  status: InsightStatus;
  /** Tek cümlelik özet, öğrencinin kendi sayılarıyla */
  headline: string;
  /** Son 7 kaydın değerleri (grafik yerine kısa şerit) */
  recent: { date: string; value: string }[];
  /** Öğrencinin verisinden çıkan bağlantılar ve ayrıntılar */
  findings: string[];
  /** Öğrenciye özel öneri */
  tip: string;
};

function valueText(key: VarKey, l: DailyLog): string | null {
  const v = l[key];
  if (v == null) return null;
  if (key === "sleep_hours") return `${fmtNum(Number(v))} sa`;
  if (key === "phone_minutes") return `${v} dk`;
  if (key === "procrastinated" || key === "replanned") return v ? "Evet" : "Hayır";
  return `${v}/5`;
}

/**
 * Bir değişken için öğrenciye özel açıklama üretir.
 * logs: öğrencinin kayıtları (sıra önemsiz; son 60 gün yeterli).
 */
export function personalInsight(key: VarKey, allLogs: DailyLog[]): PersonalInsight {
  const logs = byNewest(allLogs);
  const withVal = logs.filter((l) => l[key] != null);
  const last7 = withVal.slice(0, 7);
  const prev7 = withVal.slice(7, 14);
  const recent = last7
    .slice()
    .reverse()
    .map((l) => ({ date: l.log_date, value: valueText(key, l) ?? "—" }));
  const info = VAR_INFO[key];

  if (last7.length < 2) {
    return {
      key,
      status: "nodata",
      headline: "Kişisel yorum için en az 2 günlük kayıt gerekiyor. Birkaç gün doldurduğunda burada kendi örüntülerini göreceksin.",
      recent,
      findings: [],
      tip: info.tip,
    };
  }

  const findings: string[] = [];
  let status: InsightStatus = "good";
  let headline = "";
  let tip = info.tip;
  const worked = ownWords(logs, (l) => l.what_worked);

  switch (key) {
    case "sleep_hours": {
      const a = avg(last7.map((l) => num(l.sleep_hours))) as number;
      const p = avg(prev7.map((l) => num(l.sleep_hours)));
      const short = last7.filter((l) => Number(l.sleep_hours) < 7).length;
      status = a < 6 ? "problem" : a < 7 || short >= 3 ? "watch" : "good";
      headline = `Son ${last7.length} kayıtta ortalama ${fmtNum(a)} saat uyumuşsun; ${short} gece 7 saatin altında kalmış.`;
      if (p != null) findings.push(`Bir önceki döneme göre ${a >= p ? "+" : ""}${fmtNum(a - p)} saat (${fmtNum(p)} → ${fmtNum(a)}).`);
      const en = compare(logs, (l) => (l.sleep_hours == null ? null : Number(l.sleep_hours) < 7), (l) => l.energy);
      if (en && en.b - en.a >= 0.5) findings.push(`7 saatten az uyuduğun günlerde enerjin ortalama ${fmtNum(en.a)}/5; 7 saat ve üzeri uyuduğun günlerde ${fmtNum(en.b)}/5.`);
      const ax = compare(logs, (l) => (l.sleep_hours == null ? null : Number(l.sleep_hours) < 7), (l) => l.anxiety);
      if (ax && ax.a - ax.b >= 0.5) findings.push(`Az uyuduğun günlerde kaygın daha yüksek: ${fmtNum(ax.a)}/5'e karşı ${fmtNum(ax.b)}/5.`);
      const best = withVal.slice(0, 14).reduce((m, l) => (Number(l.sleep_hours) > Number(m.sleep_hours) ? l : m), withVal[0]);
      if (status !== "good") tip = `Uyku saatini her gece 15 dakika öne çek. ${formatShort(best.log_date)} gecesi ${fmtNum(Number(best.sleep_hours))} saat uyumuşsun; o günün düzenini örnek al.`;
      break;
    }
    case "phone_minutes": {
      const a = avg(last7.map((l) => l.phone_minutes)) as number;
      const p = avg(prev7.map((l) => l.phone_minutes));
      const high = last7.filter((l) => (l.phone_minutes ?? 0) > 120).length;
      status = a > 180 ? "problem" : a > 90 || high >= 3 ? "watch" : "good";
      headline = `Son ${last7.length} kayıtta günde ortalama ${fmtNum(a, 0)} dakika dikkat dağıtıcıya gitmiş; bu, haftada yaklaşık ${fmtNum((a * 7) / 60, 0)} saat demek.`;
      if (p != null) findings.push(`Bir önceki döneme göre ${a >= p ? "+" : ""}${fmtNum(a - p, 0)} dk (${fmtNum(p, 0)} → ${fmtNum(a, 0)}).`);
      const pr = rate(logs, (l) => (l.phone_minutes == null ? null : l.phone_minutes > 120), (l) => l.procrastinated);
      if (pr && pr.a - pr.b >= 0.2)
        findings.push(`Telefonun 2 saati geçtiği günlerde erteleme oranın ${pctText(pr.a * pr.aN, pr.aN)}; diğer günlerde ${pctText(pr.b * pr.bN, pr.bN)}.`);
      const mo = compare(logs, (l) => (l.phone_minutes == null ? null : l.phone_minutes > 120), (l) => l.motivation);
      if (mo && mo.b - mo.a >= 0.5) findings.push(`Telefonun az olduğu günlerde motivasyonun daha yüksek: ${fmtNum(mo.b)}/5'e karşı ${fmtNum(mo.a)}/5.`);
      if (status !== "good") tip = `Hedefini ${fmtNum(Math.max(30, Math.round((a * 0.75) / 10) * 10), 0)} dakikaya indir (şu ankinin dörtte üçü). Çalışma bloklarında telefonu başka odaya koy.`;
      break;
    }
    case "procrastinated": {
      const yes = last7.filter((l) => l.procrastinated).length;
      status = yes >= 4 ? "problem" : yes >= 3 ? "watch" : "good";
      headline = `Son ${last7.length} kaydın ${yes} gününde erteleme yaşamışsın.`;
      const ax = compare(logs, (l) => l.procrastinated, (l) => l.anxiety);
      if (ax && ax.a - ax.b >= 0.5) findings.push(`Ertelediğin günlerde kaygın ortalama ${fmtNum(ax.a)}/5, ertelemediğin günlerde ${fmtNum(ax.b)}/5. Erteleme kaygıdan kaçışla bağlantılı olabilir.`);
      const ph = compare(logs, (l) => l.procrastinated, (l) => l.phone_minutes);
      if (ph && ph.a - ph.b >= 20) findings.push(`Ertelediğin günlerde telefon süren ortalama ${fmtNum(ph.a, 0)} dk; diğer günlerde ${fmtNum(ph.b, 0)} dk.`);
      const obs = ownWords(logs, (l) => l.obstacle, (l) => l.procrastinated === true);
      if (obs.length) findings.push(`Ertelediğin günlerde yazdığın engeller: ${quote(obs)}`);
      if (status !== "good") tip = worked.length ? `Sana daha önce işe yarayanı tekrar dene: ${quote(worked.slice(0, 1))}. Yarın ilk görevin ilk 5 dakikasına odaklan.` : info.tip;
      break;
    }
    case "replanned": {
      const yes = last7.filter((l) => l.replanned).length;
      status = yes >= 4 ? "problem" : yes >= 3 ? "watch" : "good";
      headline = `Son ${last7.length} kaydın ${yes} gününde planını yeniden düzenlemişsin.`;
      const pr = rate(logs, (l) => l.replanned, (l) => l.procrastinated);
      if (pr && pr.a - pr.b >= 0.2) findings.push(`Plan değiştirdiğin günlerde erteleme oranın ${pctText(pr.a * pr.aN, pr.aN)}; diğer günlerde ${pctText(pr.b * pr.bN, pr.bN)}. Plan değişikliği ertelemenin sonucu olabilir.`);
      const obs = ownWords(logs, (l) => l.obstacle, (l) => l.replanned === true);
      if (obs.length) findings.push(`Plan değiştirdiğin günlerde yazdığın engeller: ${quote(obs)}`);
      if (status !== "good") tip = "Planındaki günlük görev sayısını bir azaltmayı danışmanınla konuş; gerçekçi bir plan, sık değişen bir plandan daha çok iş çıkarır.";
      break;
    }
    case "anxiety":
    case "energy":
    case "motivation": {
      const a = avg(last7.map((l) => l[key])) as number;
      const p = avg(prev7.map((l) => l[key]));
      const name = info.label.toLowerCase();
      if (key === "anxiety") {
        const hi = last7.filter((l) => (l.anxiety ?? 0) >= 4).length;
        status = a >= 4 || hi >= 3 ? "problem" : a >= 3.3 || hi >= 2 ? "watch" : "good";
        headline = `Son ${last7.length} kayıtta kaygın ortalama ${fmtNum(a)}/5; ${hi} gün 4 veya 5 işaretlemişsin.`;
        const sl = compare(logs, (l) => (l.anxiety == null ? null : l.anxiety >= 4), (l) => num(l.sleep_hours));
        if (sl && sl.b - sl.a >= 0.5) findings.push(`Kaygının yüksek olduğu günlerde ortalama ${fmtNum(sl.a)} saat, diğer günlerde ${fmtNum(sl.b)} saat uyumuşsun.`);
        const pr = rate(logs, (l) => (l.anxiety == null ? null : l.anxiety >= 4), (l) => l.procrastinated);
        if (pr && pr.a - pr.b >= 0.2) findings.push(`Kaygının yüksek olduğu günlerde erteleme oranın ${pctText(pr.a * pr.aN, pr.aN)}; diğer günlerde ${pctText(pr.b * pr.bN, pr.bN)}.`);
        if (status !== "good") tip = "Kaygı 4 veya 5 olduğunda 2 dakika ayır: aklındaki düşünceyi yaz, 'Bunun kanıtı ne?' diye sor. Bir hafta boyunca sürerse danışmanınla konuş.";
      } else {
        const low = last7.filter((l) => (l[key] ?? 5) <= 2).length;
        status = a <= 2 || low >= 3 ? "problem" : a < 3 || low >= 2 ? "watch" : "good";
        headline = `Son ${last7.length} kayıtta ${name} ortalaman ${fmtNum(a)}/5; ${low} gün 1 veya 2 işaretlemişsin.`;
        const sl = compare(logs, (l) => (l[key] == null ? null : (l[key] as number) <= 2), (l) => num(l.sleep_hours));
        if (sl && sl.b - sl.a >= 0.5) findings.push(`${key === "energy" ? "Enerjinin" : "Motivasyonunun"} düşük olduğu günlerde ortalama ${fmtNum(sl.a)} saat, diğer günlerde ${fmtNum(sl.b)} saat uyumuşsun.`);
        const pr = rate(logs, (l) => (l[key] == null ? null : (l[key] as number) <= 2), (l) => l.procrastinated);
        if (pr && pr.a - pr.b >= 0.2) findings.push(`${info.label} düşükken erteleme oranın ${pctText(pr.a * pr.aN, pr.aN)}, diğer günlerde ${pctText(pr.b * pr.bN, pr.bN)}.`);
        if (status !== "good")
          tip =
            key === "energy"
              ? "Enerjinin düşük olduğu günlerde yeni konu yerine tekrar ve soru çözümü planla; bloklar arasında gerçek mola ver."
              : worked.length
                ? `Motivasyonu beklemeden küçük bir adımla başla. Sana daha önce işe yarayan: ${quote(worked.slice(0, 1))}`
                : info.tip;
      }
      if (p != null) findings.unshift(`Bir önceki döneme göre ${a >= p ? "+" : ""}${fmtNum(a - p)} (${fmtNum(p)} → ${fmtNum(a)}).`);
      break;
    }
  }

  if (status === "good" && worked.length && (key === "procrastinated" || key === "motivation")) findings.push(`İşe yaradığını yazdığın şeyler: ${quote(worked)}`);
  return { key, status, headline, recent, findings, tip };
}

/* ------------------------------------------------------------------ */
/* Günlük kayıt sonrası ayrıntılı geri bildirim                        */
/* ------------------------------------------------------------------ */

export type DayNote = { level: "critical" | "warning" | "good"; key: VarKey; title: string; detail: string; tip: string };

/**
 * Kaydedilen günün değerlerini öğrencinin kendi ortalamasıyla karşılaştırır ve
 * sorun görülen her değişken için ayrıntılı bir not üretir.
 */
export function dayNotes(log: DailyLog, allLogs: DailyLog[]): DayNote[] {
  const others = allLogs.filter((l) => l.log_date !== log.log_date && l.log_date < log.log_date);
  const base = byNewest(others).slice(0, 14);
  const mean = (k: VarKey) => avg(base.map((l) => num(l[k] as number | null)));
  const out: DayNote[] = [];
  const cmp = (k: VarKey, digits = 1, unit = "") => {
    const m = mean(k);
    return m == null ? "" : ` Son iki haftadaki ortalaman ${fmtNum(m, digits)}${unit}.`;
  };

  const sleep = num(log.sleep_hours);
  if (sleep != null && sleep < 6)
    out.push({
      level: sleep < 5 ? "critical" : "warning",
      key: "sleep_hours",
      title: `Uyku kısa: ${fmtNum(sleep)} saat`,
      detail: `Dün gece ${fmtNum(sleep)} saat uyumuşsun.${cmp("sleep_hours", 1, " saat")} Bugün dikkatin ve enerjin düşük olabilir; bu senin suçun değil, bedenin dinlenmeye ihtiyaç duyuyor.`,
      tip: "Bugün zor ve yeni konu yerine tekrar ve soru çözümü planla. Bu akşam her zamankinden 30 dakika erken yatmayı dene.",
    });

  const phone = log.phone_minutes;
  if (phone != null && phone > 120)
    out.push({
      level: phone > 240 ? "critical" : "warning",
      key: "phone_minutes",
      title: `Dikkat dağıtıcı süresi yüksek: ${phone} dk`,
      detail: `Bugün ${phone} dakika (${fmtNum(phone / 60)} saat) planında olmayan ekran süresi girmişsin.${cmp("phone_minutes", 0, " dk")}${log.procrastinated ? " Aynı gün erteleme de yaşamışsın; ikisi çoğu zaman birlikte gelir." : ""}`,
      tip: "Yarın çalışma bloklarında telefonu başka odaya koy; molada kısa video yerine ayağa kalk.",
    });

  if (log.procrastinated) {
    const worked = ownWords(allLogs, (l) => l.what_worked, (l) => l.log_date !== log.log_date, 1);
    const recentCount = byNewest(allLogs).slice(0, 7).filter((l) => l.procrastinated).length;
    out.push({
      level: recentCount >= 4 ? "critical" : "warning",
      key: "procrastinated",
      title: "Bugün erteleme yaşadın",
      detail: `Son 7 kaydının ${recentCount} gününde erteleme var.${log.obstacle ? ` Engel olarak “${log.obstacle.slice(0, 120)}” yazmışsın.` : ""} Erteleme çoğunlukla görevin kendisinden değil, onun yarattığı sıkıntıdan kaçmaktan doğar.`,
      tip: worked.length ? `Daha önce sana işe yarayan: ${quote(worked)}. Yarın ilk görevin sadece ilk 5 dakikasına odaklan.` : VAR_INFO.procrastinated.tip,
    });
  }

  if (log.anxiety != null && log.anxiety >= 4)
    out.push({
      level: log.anxiety === 5 ? "critical" : "warning",
      key: "anxiety",
      title: `Kaygı yüksek: ${log.anxiety}/5`,
      detail: `Bugün kaygını ${log.anxiety}/5 olarak işaretledin.${cmp("anxiety", 1, "/5")}${sleep != null && sleep < 6 ? " Az uykuyla birlikte kaygı daha kolay yükselir." : ""} Yüksek kaygı dikkati daraltır; bildiğin bir şeyi hatırlamakta zorlanman bundan olabilir.`,
      tip: "2 dakika ayır: aklından geçen düşünceyi yaz ve 'Bunun kanıtı ne?' diye sor. 4 saniye nefes al, 6 saniye ver; 5 kez tekrarla.",
    });

  for (const k of ["energy", "motivation"] as const) {
    const v = log[k];
    if (v != null && v <= 2)
      out.push({
        level: "warning",
        key: k,
        title: `${VAR_INFO[k].label} düşük: ${v}/5`,
        detail: `Bugün ${VAR_INFO[k].label.toLowerCase()} düzeyini ${v}/5 olarak işaretledin.${cmp(k, 1, "/5")}${sleep != null && sleep < 7 ? ` Uyku süren (${fmtNum(sleep)} saat) bunu etkilemiş olabilir.` : ""}`,
        tip: k === "energy" ? VAR_INFO.energy.tip : VAR_INFO.motivation.tip,
      });
  }

  if (!out.length) {
    const anyValue = VAR_ORDER.some((k) => log[k] != null);
    if (anyValue)
      out.push({
        level: "good",
        key: "motivation",
        title: "Bugünkü kaydında dikkat gerektiren bir değer yok",
        detail: log.what_worked ? `İşe yarayan olarak “${log.what_worked.slice(0, 120)}” yazmışsın; bunu yarın da tekrarlamaya değer.` : "Günü değerlendirmen, örüntülerini görmeni kolaylaştırıyor.",
        tip: "Yarın için tek küçük değişikliğini yazdıysan sabah Bugün ekranında göreceksin.",
      });
  }
  const rank = { critical: 0, warning: 1, good: 2 } as const;
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}

