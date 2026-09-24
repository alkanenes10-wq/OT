// Kazanım karnesi ayrıştırıcı — YAPAY ZEKÂ KULLANMAZ, tamamen kurallarla çalışır.
// PDF'ten çıkarılan metin satırlarında (konum bilgisiyle) şunları arar:
//  1) "D / Y / B" (veya Doğru / Yanlış / Boş) sütun başlıkları → alttaki satırlarda sayıları sütunlara eşler
//  2) Başlık yoksa "soru = doğru + yanlış + boş" kuralını sağlayan sayı dizisini
//  3) Soru soru listelenen karnelerde her satırdaki durum işaretini (D/Y/B ya da cevap anahtarı ≠ öğrenci cevabı)
// Satırdaki metin, uygulamanın konu listesi + eş anlamlılar ile eşleştirilir.
import { ALL_TOPICS, COURSES } from "./curriculum";
import { EXAM_SECTIONS } from "./lib";

export type PdfItem = { str: string; x: number; y: number; w: number };
export type PdfLine = { page: number; y: number; items: PdfItem[]; text: string };

export type KarneParse = {
  title: string;
  exam_date: string | null;
  exam_type: "TYT" | "AYT" | "BRANS";
  nets: Record<string, { d: number | null; y: number | null }>;
  results: { topic_id: string; wrong: number; empty: number }[];
  notes: string;
  matched: { text: string; topic_id: string; wrong: number; empty: number }[];
  unmatched: string[];
};

/* ------------------------------------------------------------------ */
const TR: Record<string, string> = { ç: "c", ğ: "g", ı: "i", i̇: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };
export function norm(s: string): string {
  return s
    .toLocaleLowerCase("tr-TR")
    .replace(/[çğıöşüâîû]|i̇/g, (c) => TR[c] ?? c)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Karnelerde sık geçen, konu adından farklı ifadeler → konu
const SYNONYMS: Record<string, string[]> = {
  "tyt-turkce.sozcukte-anlam": ["sozcukte anlam", "kelimede anlam", "deyim", "atasozu", "soz obekleri"],
  "tyt-turkce.cumlede-anlam": ["cumlede anlam", "cumle yorumu", "cumle anlami"],
  "tyt-turkce.paragrafta-anlam": ["paragraf", "paragrafta anlam", "ana dusunce", "yardimci dusunce", "anlatim bicimleri", "dusunceyi gelistirme"],
  "tyt-turkce.paragrafta-yapi": ["paragrafta yapi", "paragraf yapisi", "akisi bozan", "paragraf olusturma", "paragrafi ikiye bolme"],
  "tyt-turkce.ses-bilgisi": ["ses bilgisi", "ses olaylari"],
  "tyt-turkce.yazim-kurallari": ["yazim kurallari", "yazim yanlisi", "imla"],
  "tyt-turkce.noktalama-isaretleri": ["noktalama"],
  "tyt-turkce.sozcukte-yapi": ["sozcukte yapi", "yapim eki", "cekim eki", "kok ve ek"],
  "tyt-turkce.sozcuk-turleri": ["sozcuk turleri", "isimler", "sifatlar", "zamirler", "zarflar", "edat baglac unlem", "edat", "baglac"],
  "tyt-turkce.fiilimsiler-fiilde-cati": ["fiilimsi", "eylemsi", "fiilde cati", "cati", "fiiller", "ek fiil", "fiilde anlam", "fiilde kip"],
  "tyt-turkce.cumlenin-ogeleri": ["cumlenin ogeleri", "ogeler", "cumle turleri"],
  "tyt-turkce.anlatim-bozukluklari": ["anlatim bozuklugu", "anlatim bozukluklari"],
  "tyt-matematik.temel-kavramlar-sayi-basamaklari-1": ["temel kavramlar", "sayi basamaklari", "basamak analizi", "ardisik sayilar", "tek cift"],
  "tyt-matematik.bolme-ve-bolunebilme": ["bolme bolunebilme", "bolunebilme", "asal sayilar", "asal carpan"],
  "tyt-matematik.ebob-ekok": ["ebob", "ekok"],
  "tyt-matematik.rasyonel-sayilar": ["rasyonel sayilar", "ondalik sayilar", "kesirler"],
  "tyt-matematik.basit-esitsizlikler": ["basit esitsizlik", "esitsizlikler", "araliklar"],
  "tyt-matematik.mutlak-deger": ["mutlak deger"],
  "tyt-matematik.uslu-ifadeler": ["uslu sayilar", "uslu ifadeler", "uslu"],
  "tyt-matematik.koklu-ifadeler": ["koklu sayilar", "koklu ifadeler", "koklu"],
  "tyt-matematik.carpanlara-ayirma": ["carpanlara ayirma", "ozdeslik"],
  "tyt-matematik.denklem-cozme": ["denklem cozme", "birinci dereceden denklem"],
  "tyt-matematik.oran-oranti": ["oran oranti", "oranti"],
  "tyt-matematik.problemler": ["problem", "problemler", "sayi problemleri", "kesir problemleri", "yas problemleri", "isci problemleri", "havuz problemleri", "hareket problemleri", "yuzde", "kar zarar", "karisim problemleri", "faiz", "grafik problemleri", "rutin olmayan"],
  "tyt-matematik.kumeler": ["kumeler", "kartezyen"],
  "tyt-matematik.mantik": ["mantik", "onermeler"],
  "tyt-matematik.fonksiyonlar": ["fonksiyon", "fonksiyonlar"],
  "tyt-matematik.veri-ve-istatistik": ["veri", "istatistik", "grafik okuma", "aritmetik ortalama", "medyan"],
  "tyt-matematik.permutasyon-kombinasyon": ["permutasyon", "kombinasyon", "sayma", "binom"],
  "tyt-matematik.olasilik": ["olasilik"],
  "ayt-matematik.polinomlar": ["polinom"],
  "ayt-matematik.2-dereceden-denklemler": ["ikinci dereceden denklem", "2 dereceden denklem", "karmasik sayilar", "diskriminant"],
  "ayt-matematik.esitsizlikler": ["ikinci dereceden esitsizlik"],
  "ayt-matematik.parabol": ["parabol"],
  "ayt-matematik.logaritma": ["logaritma", "ustel fonksiyon"],
  "ayt-matematik.diziler": ["diziler", "aritmetik dizi", "geometrik dizi"],
  "ayt-matematik.trigonometri": ["trigonometri"],
  "ayt-matematik.limit-ve-sureklilik": ["limit", "sureklilik"],
  "ayt-matematik.turev": ["turev"],
  "ayt-matematik.integral": ["integral"],
  "geometri.acilar-ve-ucgenler": ["acilar", "ucgen", "ucgende", "dik ucgen", "ikizkenar", "eskenar ucgen", "benzerlik", "aciortay", "kenarortay", "ucgende alan", "dogruda aci"],
  "geometri.cokgenler-ve-dortgenler": ["cokgen", "dortgen", "yamuk", "paralelkenar", "eskenar dortgen", "dikdortgen", "kare", "deltoid"],
  "geometri.cember-ve-daire": ["cember", "daire"],
  "geometri.kati-cisimler-uzay-geometri": ["kati cisim", "prizma", "piramit", "koni", "silindir", "kure", "kup"],
  "geometri.analitik-geometri": ["analitik", "dogrunun analitigi", "noktanin analitigi", "donusum geometrisi"],
  "geometri.cemberin-analitigi": ["cemberin analitigi", "cember denklemi"],
  "tyt-fizik.hareket-ve-kuvvet-tyt": ["dogrusal hareket", "newton", "hiz ve ivme"],
  "tyt-fizik.is-enerji-ve-guc-tyt": ["is guc enerji", "enerji korunumu"],
  "tyt-fizik.isi-sicaklik-ve-genlesme": ["isi ve sicaklik", "genlesme", "hal degisimi"],
  "tyt-fizik.basinc-ve-kaldirma-kuvveti": ["basinc", "kaldirma kuvveti"],
  "tyt-fizik.elektrik-ve-manyetizma-tyt": ["elektrik akimi", "ohm", "manyetizma", "miknatis"],
  "tyt-fizik.dalgalar-tyt": ["dalgalar", "ses dalgalari"],
  "tyt-fizik.optik": ["aynalar", "mercek", "kirilma", "yansima", "golge"],
  "tyt-kimya.atom-ve-periyodik-sistem": ["atom modelleri", "periyodik sistem", "periyodik tablo"],
  "tyt-kimya.kimyasal-turler-arasi-etkilesimler": ["kimyasal baglar", "iyonik bag", "kovalent bag", "zayif etkilesim"],
  "tyt-kimya.kimyanin-temel-kanunlari-ve-kimyasal-hesaplamalar": ["mol kavrami", "kimyasal hesaplamalar", "kimyasal tepkime", "temel kanunlar"],
  "tyt-kimya.karisimlar-tyt": ["karisimlar", "derisim", "cozunurluk"],
  "tyt-kimya.asitler-bazlar-ve-tuzlar": ["asit", "baz", "tuzlar", "ph"],
  "tyt-biyoloji.canlilarin-temel-bilesenleri": ["organik bilesik", "inorganik bilesik", "enzim", "vitamin", "karbonhidrat", "protein", "yag"],
  "tyt-biyoloji.hucrenin-yapisi-ve-islevleri": ["hucre", "hucre zari", "organel", "madde gecisleri"],
  "tyt-biyoloji.hucre-bolunmeleri-ve-ureme": ["mitoz", "mayoz", "hucre bolunmesi", "ureme"],
  "tyt-biyoloji.kalitimin-temel-ilkeleri-genetik": ["kalitim", "genetik", "caprazlama"],
  "tyt-biyoloji.ekosistem-ekolojisi-ve-guncel-cevre-sorunlari": ["ekosistem", "ekoloji", "besin zinciri", "cevre sorunlari"],
  "tyt-biyoloji.canlilarin-cesitliligi-ve-siniflandirilmasi": ["siniflandirma", "canli alemleri"],
  "tyt-tarih.islamiyet-oncesi-turk-tarihi": ["ilk turk devletleri", "orta asya turk", "turk tarihi islamiyet oncesi"],
  "tyt-tarih.ilk-turk-islam-devletleri": ["turk islam devletleri", "karahanli", "gazneli", "buyuk selcuklu"],
  "tyt-tarih.milli-mucadele-ve-kurtulus-savasi": ["kurtulus savasi", "milli mucadele", "lozan"],
  "tyt-tarih.ataturk-ilkeleri-ve-inkilaplari": ["inkilap", "ataturk ilkeleri"],
  "tyt-cografya.iklim-bilgisi": ["iklim", "atmosfer", "basinc ve ruzgar", "yagis"],
  "tyt-cografya.harita-bilgisi": ["harita", "olcek", "izohips"],
  "tyt-cografya.cografi-konum": ["cografi konum", "enlem", "boylam", "yerel saat"],
  "tyt-cografya.dunya-nin-sekli-ve-hareketleri": ["dunyanin sekli", "dunyanin hareketleri", "eksen hareketi", "yorunge hareketi"],
  "tyt-cografya.nufus-ve-yerlesme": ["nufus", "yerlesme"],
  "tyt-cografya.gocler": ["goc"],
  "tyt-cografya.yer-in-yapisi-ve-ic-kuvvetler": ["ic kuvvetler", "levha", "deprem ve volkan"],
  "tyt-cografya.dis-kuvvetler": ["dis kuvvetler", "akarsu", "karstik"],
  "tyt-cografya.dogal-afetler": ["dogal afet", "afetler"],
  "tyt-felsefe.felsefenin-temel-konulari": ["bilgi felsefesi", "varlik felsefesi", "ahlak felsefesi", "bilim felsefesi", "sanat felsefesi", "siyaset felsefesi", "din felsefesi"],
  "tyt-din.islam-ve-ibadet": ["ibadet"],
  "tyt-din.hz-muhammed-s-a-v-ve-ornekligi": ["hz muhammed", "peygamber"],
};

type Entry = { topic_id: string; phrase: string; section: string };

const topicSection = new Map(COURSES.flatMap((c) => c.sections.flatMap((s) => s.topics.map((t) => [t.id, s.id] as const))));

const ENTRIES: Entry[] = (() => {
  const out: Entry[] = [];
  const add = (topic_id: string, raw: string) => {
    const p = norm(raw.replace(/\((tyt|ayt)\)/gi, ""));
    if (p.length >= 4) out.push({ topic_id, phrase: p, section: topicSection.get(topic_id) ?? "" });
  };
  for (const t of ALL_TOPICS) {
    add(t.id, t.name);
    for (const part of t.sub.split(/[,/;]|\(|\)/)) if (norm(part).length >= 7) add(t.id, part);
  }
  for (const [id, list] of Object.entries(SYNONYMS)) for (const p of list) add(id, p);
  // uzun ifadeler önce
  return out.sort((a, b) => b.phrase.length - a.phrase.length);
})();

// Ders başlığı → izin verilen bölümler
const COURSE_HEADERS: [string, string[]][] = [
  ["turk dili ve edebiyati", ["ayt-edebiyat"]],
  ["edebiyat", ["ayt-edebiyat"]],
  ["turkce", ["tyt-turkce"]],
  ["temel matematik", ["tyt-matematik", "geometri"]],
  ["matematik", ["tyt-matematik", "ayt-matematik", "geometri"]],
  ["geometri", ["geometri"]],
  ["fizik", ["tyt-fizik", "ayt-fizik"]],
  ["kimya", ["tyt-kimya", "ayt-kimya"]],
  ["biyoloji", ["tyt-biyoloji", "ayt-biyoloji"]],
  ["tarih", ["tyt-tarih", "ayt-tarih"]],
  ["cografya", ["tyt-cografya", "ayt-cografya"]],
  ["felsefe", ["tyt-felsefe"]],
  ["din kulturu", ["tyt-din"]],
  ["fen bilimleri", ["tyt-fizik", "tyt-kimya", "tyt-biyoloji"]],
  ["sosyal bilimler", ["tyt-tarih", "tyt-cografya", "tyt-felsefe", "tyt-din"]],
];

// Net satırları için bölüm adları
const NET_SECTIONS: [string, string][] = [
  ["turk dili ve edebiyati", "Edebiyat"],
  ["edebiyat sosyal bilimler 1", "Edebiyat"],
  ["turkce", "Türkçe"],
  ["sosyal bilimler", "Sosyal"],
  ["sosyal", "Sosyal"],
  ["temel matematik", "Matematik"],
  ["matematik", "Matematik"],
  ["fen bilimleri", "Fen"],
  ["fizik", "Fizik"],
  ["kimya", "Kimya"],
  ["biyoloji", "Biyoloji"],
  ["tarih 1", "Tarih-1"],
  ["cografya 1", "Coğrafya-1"],
];

// Türkçe ekleri için: ifadedeki her sözcük, metindeki sözcüğün başı olabilir
// ("paragraf" → "paragrafın", "problem" → "problemlerini", "bozukluk" → "bozukluğu").
const SOFT: Record<string, string> = { k: "g", p: "b", t: "d", c: "c" };
function wordMatch(tw: string, pw: string): boolean {
  if (tw === pw) return true;
  if (pw.length < 4) return false;
  if (tw.startsWith(pw)) return true;
  const last = pw[pw.length - 1];
  return pw.length >= 5 && last in SOFT && tw.startsWith(pw.slice(0, -1) + SOFT[last]);
}
function hasWord(text: string, phrase: string): boolean {
  const tw = text.split(" ");
  const pw = phrase.split(" ");
  outer: for (let i = 0; i + pw.length <= tw.length; i++) {
    for (let j = 0; j < pw.length; j++) if (!wordMatch(tw[i + j], pw[j])) continue outer;
    return true;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/** unpdf / pdf.js metin öğelerini satırlara dönüştürür */
export function toLines(pages: { items: PdfItem[] }[]): PdfLine[] {
  const lines: PdfLine[] = [];
  pages.forEach((pg, pi) => {
    const items = pg.items.filter((i) => i.str.trim());
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    let cur: PdfItem[] = [];
    let cy = Number.NaN;
    const flush = () => {
      if (!cur.length) return;
      cur.sort((a, b) => a.x - b.x);
      lines.push({ page: pi, y: cy, items: cur, text: cur.map((i) => i.str).join(" ").replace(/\s+/g, " ").trim() });
      cur = [];
    };
    for (const it of items) {
      if (cur.length && Math.abs(it.y - cy) > 3) flush();
      if (!cur.length) cy = it.y;
      cur.push(it);
    }
    flush();
  });
  return lines;
}

type Cols = { d?: number; y?: number; b?: number; soru?: number };

function headerCols(line: PdfLine): Cols | null {
  if (/\d/.test(line.text)) return null; // başlık satırında sayı olmaz
  const cols: Cols = {};
  for (const it of line.items) {
    const t = norm(it.str);
    const cx = it.x + it.w / 2;
    for (const tok of t.split(" ")) {
      if (tok === "d" || tok === "dogru" || tok === "dogr") cols.d = cx;
      else if (tok === "y" || tok === "yanlis" || tok === "yanl") cols.y = cx;
      else if (tok === "b" || tok === "bos") cols.b = cx;
      else if (tok === "soru" || tok === "ss" || tok === "s") cols.soru ??= cx;
    }
  }
  const n = [cols.d, cols.y, cols.b].filter((v) => v != null).length;
  return n >= 2 ? cols : null;
}

type Num = { v: number; x: number; int: boolean };
function numbersOf(line: PdfLine): Num[] {
  const out: Num[] = [];
  for (const it of line.items) {
    const parts = it.str.trim().split(/\s+/);
    const step = it.w / Math.max(1, it.str.length);
    let offset = 0;
    for (const p of parts) {
      const idx = it.str.indexOf(p, offset);
      offset = idx + p.length;
      if (/%/.test(p)) continue;
      const m = /^-?\d+(?:[.,]\d+)?$/.exec(p);
      if (!m) continue;
      out.push({ v: Number(p.replace(",", ".")), x: it.x + (idx + p.length / 2) * step, int: !/[.,]/.test(p) });
    }
  }
  return out;
}

function nearest(cols: Cols, x: number): keyof Cols | null {
  let best: keyof Cols | null = null;
  let dist = 28;
  for (const k of ["d", "y", "b", "soru"] as const) {
    const cx = cols[k];
    if (cx == null) continue;
    const dd = Math.abs(cx - x);
    if (dd < dist) {
      dist = dd;
      best = k;
    }
  }
  return best;
}

/** Sayılardan doğru/yanlış/boş çıkarır */
function countsFrom(nums: Num[], cols: Cols | null): { d: number; y: number; b: number } | null {
  if (cols) {
    const r: { d?: number; y?: number; b?: number } = {};
    for (const n of nums) {
      if (!n.int) continue;
      const k = nearest(cols, n.x);
      if (k && k !== "soru" && r[k] == null) r[k] = n.v;
    }
    if (r.y != null || r.b != null) return { d: r.d ?? 0, y: r.y ?? 0, b: r.b ?? 0 };
  }
  const ints = nums.filter((n) => n.int && n.v >= 0 && n.v <= 60).map((n) => n.v);
  for (let i = 0; i + 3 < ints.length; i++) {
    const [s, d, y, b] = ints.slice(i, i + 4);
    if (s > 0 && s === d + y + b) return { d, y, b };
  }
  return null;
}

const STATUS_WRONG = new Set(["y", "yanlis", "x", "hatali"]);
const STATUS_EMPTY = new Set(["b", "bos"]);
const STATUS_RIGHT = new Set(["d", "dogru"]);

/** Soru soru listelenen karneler için satırın durumu */
const isAns = (t: string) => /^[A-E]$/.test(t);
const isBlank = (t: string) => t === "-" || t === "*" || t === "_" || t === "—";
function statusOf(raw: string): "d" | "y" | "b" | null {
  const t = norm(raw) || raw;
  if (STATUS_WRONG.has(t) || raw === "✗" || raw === "✘") return "y";
  if (STATUS_EMPTY.has(t) || isBlank(raw)) return "b";
  if (STATUS_RIGHT.has(t) || raw === "✓" || raw === "✔") return "d";
  return null;
}
function questionStatus(line: PdfLine): "d" | "y" | "b" | null {
  const toks = line.items.flatMap((i) => i.str.trim().split(/\s+/)).filter(Boolean);
  const n = toks.length;
  if (n < 2) return null;
  const [a, b, c] = [toks[n - 3] ?? "", toks[n - 2], toks[n - 1]];
  // "… Cevap Öğrenci Durum" → B C Y
  if ((isAns(a) || isBlank(a)) && (isAns(b) || isBlank(b))) return statusOf(c);
  // "… Cevap Öğrenci" → B C  /  B -
  if (isAns(b) && (isAns(c) || isBlank(c))) return isBlank(c) ? "b" : b === c ? "d" : "y";
  // yalnızca durum sütunu: tam sözcük veya işaret; tek harf ancak önünde sayı yoksa
  const st = statusOf(c);
  if (st && (c.length > 1 || !/^\d/.test(b))) return st;
  return null;
}

function matchTopic(text: string, allowed: string[] | null, examType: string): string | null {
  let best: Entry | null = null;
  for (const e of ENTRIES) {
    if (best && e.phrase.length < best.phrase.length) break;
    if (!hasWord(text, e.phrase)) continue;
    if (allowed && !allowed.includes(e.section)) continue;
    if (!best) best = e;
    else if (best.phrase.length === e.phrase.length) {
      // eşitlikte sınav türüne uyan bölüm
      const pref = examType.toLowerCase();
      if (!best.section.startsWith(pref) && e.section.startsWith(pref)) best = e;
    }
  }
  if (!best && allowed) return matchTopic(text, null, examType);
  return best?.topic_id ?? null;
}

/* ------------------------------------------------------------------ */
export function parseKarne(lines: PdfLine[]): KarneParse {
  const all = lines.map((l) => norm(l.text)).join(" ");
  const tyt = (all.match(/\btyt\b|temel yeterlilik/g) ?? []).length;
  const ayt = (all.match(/\bayt\b|alan yeterlilik/g) ?? []).length;
  const exam_type: KarneParse["exam_type"] = ayt > tyt ? "AYT" : tyt > 0 ? "TYT" : "TYT";

  let title = "";
  let exam_date: string | null = null;
  for (const l of lines.slice(0, 40)) {
    const n = norm(l.text);
    if (!title && /deneme|sinav/.test(n) && n.split(" ").length <= 12 && !/ogrenci|adi soyadi/.test(n)) title = l.text.trim().slice(0, 120);
    const dm = /(\d{1,2})[./-](\d{1,2})[./-](20\d{2})/.exec(l.text);
    if (!exam_date && dm) exam_date = `${dm[3]}-${dm[2].padStart(2, "0")}-${dm[1].padStart(2, "0")}`;
  }

  const netNames = new Set(EXAM_SECTIONS[exam_type].map((s) => s.name));
  const nets: KarneParse["nets"] = {};
  const agg = new Map<string, { wrong: number; empty: number }>();
  const matched: KarneParse["matched"] = [];
  const unmatched: string[] = [];
  let cols: Cols | null = null;
  let allowed: string[] | null = null;

  for (const l of lines) {
    const n = norm(l.text);
    if (!n) continue;
    const h = headerCols(l);
    if (h) {
      cols = h;
      continue;
    }
    const words = n.split(" ");
    const alpha = words.filter((w) => !/^\d+$/.test(w));
    const nums = numbersOf(l);
    const qs0 = questionStatus(l);
    if (!nums.length && /\b(kazanim|konu|soru no)\b/.test(n)) cols = null; // başka bir tablonun başlığı

    // Ders başlığı (kısa satır, sayı yok veya az)
    if (words.length <= 5 && nums.length <= 1 && !qs0) {
      const ch = COURSE_HEADERS.find(([k]) => n.includes(k));
      if (ch) {
        allowed = ch[1].filter((s) => s.startsWith(exam_type.toLowerCase()) || s === "geometri");
        if (!allowed.length) allowed = ch[1];
        continue;
      }
      if (!nums.length) continue;
    }
    if (/^(toplam|genel toplam|genel|ortalama|puan)\b/.test(n)) continue;

    // Bölüm net satırı (ör. "TEMEL MATEMATİK 40 22 8 10 20,00")
    const ns = NET_SECTIONS.find(([k, name]) => n.startsWith(k + " ") && alpha.length <= k.split(" ").length + 1 && netNames.has(name));
    if (ns && nums.length >= 3) {
      const c = countsFrom(nums, cols);
      if (c && !nets[ns[1]]) nets[ns[1]] = { d: c.d, y: c.y };
      const ch = COURSE_HEADERS.find(([k]) => n.startsWith(k));
      if (ch) allowed = ch[1];
      continue;
    }

    if (!nums.length && !qs0) continue;
    const topic = matchTopic(n, allowed, exam_type);
    if (!topic) {
      if (nums.length >= 2 && words.length >= 2 && /[a-z]{4}/.test(n)) unmatched.push(l.text.slice(0, 140));
      continue;
    }
    // Önce soru-soru biçimi (tek soru satırı), sonra toplam biçimi
    let wrong = 0;
    let empty = 0;
    const agg4 = countsFrom(nums, cols);
    const qs = qs0;
    if (agg4 && !(qs && nums.filter((x) => x.int).length <= 2)) {
      wrong = agg4.y;
      empty = agg4.b;
    } else if (qs) {
      wrong = qs === "y" ? 1 : 0;
      empty = qs === "b" ? 1 : 0;
    } else {
      unmatched.push(l.text.slice(0, 140));
      continue;
    }
    matched.push({ text: l.text.slice(0, 140), topic_id: topic, wrong, empty });
    if (wrong + empty > 0) {
      const cur = agg.get(topic) ?? { wrong: 0, empty: 0 };
      cur.wrong += wrong;
      cur.empty += empty;
      agg.set(topic, cur);
    }
  }

  const results = [...agg.entries()]
    .map(([topic_id, v]) => ({ topic_id, wrong: Math.min(99, v.wrong), empty: Math.min(99, v.empty) }))
    .sort((a, b) => b.wrong + b.empty - (a.wrong + a.empty));
  const names = new Map(ALL_TOPICS.map((t) => [t.id, t.name]));
  const top = results.slice(0, 4).map((r) => `${names.get(r.topic_id)} (${r.wrong + r.empty})`);
  const notes = results.length
    ? `En çok kayıp: ${top.join(", ")}. Toplam ${results.reduce((s, r) => s + r.wrong, 0)} yanlış, ${results.reduce((s, r) => s + r.empty, 0)} boş.`
    : "";
  return { title, exam_date, exam_type, nets, results, notes, matched, unmatched: unmatched.slice(0, 30) };
}
