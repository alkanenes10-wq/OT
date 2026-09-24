// Otomatik haftalık program oluşturucu (saatli).
// Girdi: öğrencinin çalışma saatleri, alanı (SAY / EA / SÖZ …), TYT ve AYT deneme analizleri,
// konu takibi ve önceki haftaların programları.
// Çıktı: her gün için saat saat bloklar; bloklar bir sayısal, bir sözel sırasıyla dizilir.
// Sonuç danışman tarafından tabloda serbestçe düzenlenebilir.
import { ALL_TOPICS, COURSES } from "./curriculum";
import {
  addDays,
  categoryOfSection,
  diffDays,
  minutesToTime,
  subjectForTopic,
  timeToMinutes,
  weekdayIndex,
  type Category,
  type ExamAnalysis,
  type StudySchedule,
  type TaskType,
  type TimeRange,
  type TopicProgress,
} from "./lib";

export type DraftTask = {
  day_index: number;
  subject: string;
  topic_id: string | null;
  task_type: TaskType;
  target_questions: number | null;
  content: string;
  sort: number;
  start_time: string | null;
  duration_min: number | null;
};

/** Önceki programlardan bir görev (geçmiş) */
export type HistoryTask = {
  plan_start: string;
  topic_id: string | null;
  task_type: TaskType;
  done: boolean;
};

export type Exam = "TYT" | "AYT";

export type Candidate = {
  topic_id: string;
  name: string;
  section: string;
  subject: string;
  category: Category;
  exam: Exam | "BOTH";
  score: number;
  mode: "konu" | "tekrar" | "soru";
  reasons: string[];
  uses: number;
};

export type PlanBlock = DraftTask & { category: Category | null; exam: Exam | null; routine: boolean };

export type TimedPlanInput = {
  start: string; // yyyy-mm-dd
  schedule: StudySchedule;
  sections: string[]; // programa girecek bölümler (alana göre)
  tyt: ExamAnalysis | null;
  ayt: ExamAnalysis | null;
  progress: TopicProgress[];
  history: HistoryTask[];
  tytShare: number; // 0-100: blokların yüzde kaçı TYT
  routines: { paragraf: boolean; problem: boolean };
  carryOver: boolean;
  excluded: string[];
  /** Sıralama: [sayısal, sözel] blok sayısı; [1,1] = bir sayısal bir sözel */
  pattern?: [number, number];
};

export type TimedPlan = {
  tasks: DraftTask[];
  blocks: PlanBlock[];
  candidates: Candidate[]; // haftada kullanılan konular (öncelik sırasıyla)
  dayMinutes: number[];
  stats: { sayisal: number; sozel: number; tyt: number; ayt: number; questions: number };
};

/* ------------------------------------------------------------------ */
const sectionOf = (topicId: string) => topicId.split(".")[0];
const SECTION_EXAM = new Map(COURSES.flatMap((c) => c.sections.map((s) => [s.id, s.exam] as const)));
const SECTION_TOPICS = new Map(COURSES.flatMap((c) => c.sections.map((s) => [s.id, s.topics] as const)));
const TOPIC_NAME = new Map(ALL_TOPICS.map((t) => [t.id, t.name]));
/** Geometri soruları hem TYT'de hem AYT'de çıkar */
const examOfSection = (sec: string): Exam | "BOTH" => (sec === "geometri" ? "BOTH" : (SECTION_EXAM.get(sec) ?? "TYT"));

const ROUTINE_MIN = 20;
const ROUTINE_BREAK = 5;
const MIN_BLOCK = 25;
const MAX_USES = 3;

/** Günün zaman aralıklarını çalışma bloklarına böler */
export function sliceDay(ranges: TimeRange[], blockMin: number, breakMin: number, routines: number) {
  const out: { start: number; dur: number; routine: boolean }[] = [];
  let left = routines;
  const sorted = [...ranges]
    .map((r) => ({ s: timeToMinutes(r.s), e: timeToMinutes(r.e) }))
    .filter((r): r is { s: number; e: number } => r.s != null && r.e != null && r.e > r.s)
    .sort((a, b) => a.s - b.s);
  for (const r of sorted) {
    let t = r.s;
    for (;;) {
      const rem = r.e - t;
      if (left > 0 && rem >= ROUTINE_MIN) {
        out.push({ start: t, dur: ROUTINE_MIN, routine: true });
        t += ROUTINE_MIN + ROUTINE_BREAK;
        left--;
        continue;
      }
      if (rem < MIN_BLOCK) break;
      const dur = Math.min(blockMin, rem);
      out.push({ start: t, dur, routine: false });
      t += dur + breakMin;
    }
  }
  return out;
}

/** Blok süresine göre hedef soru (sayısal ~1,6 dk/soru, sözel ~1,2 dk/soru) */
function questionsFor(cat: Category, minutes: number, factor = 1) {
  const perMin = cat === "sayisal" ? 0.6 : 0.8;
  return Math.max(5, Math.round((minutes * perMin * factor) / 5) * 5);
}

/** Aday konuları ve önceliklerini hesaplar */
export function buildCandidates(input: TimedPlanInput): Candidate[] {
  const excluded = new Set(input.excluded);
  const status = new Map(input.progress.map((p) => [p.topic_id, p.status]));
  const deficit = new Map<string, { wrong: number; empty: number; exam: Exam }>();
  for (const [a, exam] of [
    [input.tyt, "TYT"],
    [input.ayt, "AYT"],
  ] as const) {
    for (const r of a?.results ?? []) {
      const cur = deficit.get(r.topic_id) ?? { wrong: 0, empty: 0, exam };
      cur.wrong += r.wrong ?? 0;
      cur.empty += r.empty ?? 0;
      deficit.set(r.topic_id, cur);
    }
  }
  // Geçmiş: en son hangi hafta, hangi türle, tamamlandı mı
  const hist = new Map<string, { weeksAgo: number; lastTypes: Set<TaskType>; lastDone: boolean; pending: TaskType | null }>();
  const lastPlan = input.history.reduce<string | null>((m, h) => (h.plan_start < input.start && (!m || h.plan_start > m) ? h.plan_start : m), null);
  for (const h of input.history) {
    if (!h.topic_id || h.plan_start >= input.start) continue;
    const weeksAgo = Math.max(1, Math.round(diffDays(h.plan_start, input.start) / 7));
    const cur = hist.get(h.topic_id);
    if (!cur || weeksAgo < cur.weeksAgo) {
      hist.set(h.topic_id, { weeksAgo, lastTypes: new Set([h.task_type]), lastDone: h.done, pending: !h.done && h.plan_start === lastPlan ? h.task_type : null });
    } else if (weeksAgo === cur.weeksAgo) {
      cur.lastTypes.add(h.task_type);
      cur.lastDone = cur.lastDone && h.done;
      if (!h.done && h.plan_start === lastPlan) cur.pending = cur.pending ?? h.task_type;
    }
  }

  const out: Candidate[] = [];
  for (const sec of input.sections) {
    const topics = SECTION_TOPICS.get(sec) ?? [];
    let newSlots = 1; // her bölümde sıradaki ilk başlanmamış konu "yeni konu" olur
    for (const t of topics) {
      if (excluded.has(t.id)) continue;
      const st = status.get(t.id) ?? "not_started";
      const def = deficit.get(t.id);
      const h = hist.get(t.id);
      const reasons: string[] = [];
      let score = 0;
      let mode: Candidate["mode"] = "soru";

      if (def && def.wrong + def.empty > 0) {
        score += 10 + 6 * (def.wrong + 0.7 * def.empty);
        mode = st === "not_started" ? "konu" : "tekrar";
        reasons.push(`${def.exam} denemesi: ${def.wrong} yanlış${def.empty ? `, ${def.empty} boş` : ""}`);
      }
      if (input.carryOver && h?.pending) {
        score += 9;
        if (!def) mode = h.pending === "konu" ? "konu" : h.pending === "tekrar" ? "tekrar" : "soru";
        reasons.push("Geçen haftadan kalan");
      }
      if (h && h.weeksAgo === 1 && h.lastDone && h.lastTypes.has("konu") && !h.pending) {
        score += 7;
        if (!def) mode = "soru";
        reasons.push("Geçen hafta konu çalışıldı → soru");
      }
      if (st === "in_progress") {
        score += 5;
        if (!reasons.length) reasons.push("Çalışılıyor");
      }
      if (st === "not_started" && !def && !h && newSlots > 0) {
        newSlots--;
        score += 5;
        mode = "konu";
        reasons.push("Sıradaki yeni konu");
      }
      if ((st === "done" || st === "reviewed") && !def && !h?.pending) {
        const weeks = h?.weeksAgo ?? 4;
        if (weeks >= 2) {
          score += 1 + Math.min(weeks, 6) * 0.5;
          mode = "tekrar";
          reasons.push(h ? `${weeks} haftadır tekrar edilmedi` : "Tekrar zamanı");
        }
      }
      if (score <= 0) continue;
      // Geçen hafta tamamlanıp başka sebebi olmayan konular bu hafta biraz geri çekilir (rotasyon)
      if (h && h.weeksAgo === 1 && h.lastDone && !def && !h.pending && !h.lastTypes.has("konu")) score *= 0.6;
      out.push({
        topic_id: t.id,
        name: TOPIC_NAME.get(t.id) ?? t.id,
        section: sec,
        subject: subjectForTopic(t.id),
        category: categoryOfSection(sec),
        exam: examOfSection(sec),
        score,
        mode,
        reasons,
        uses: 0,
      });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

export function buildTimedPlan(input: TimedPlanInput): TimedPlan {
  const candidates = buildCandidates(input);
  const [nSay, nSoz] = input.pattern ?? [1, 1];
  const seq: Category[] = [...Array(Math.max(1, nSay)).fill("sayisal"), ...Array(Math.max(1, nSoz)).fill("sozel")];
  const blocks: PlanBlock[] = [];
  const dayMinutes: number[] = [];
  const sectionsSet = new Set(input.sections);
  const hasAyt = input.sections.some((s) => SECTION_EXAM.get(s) === "AYT");
  const share = hasAyt ? Math.min(100, Math.max(0, input.tytShare)) / 100 : 1;
  const routineParagraf = input.routines.paragraf && sectionsSet.has("tyt-turkce");
  const routineProblem = input.routines.problem && sectionsSet.has("tyt-matematik");
  const routineCount = Number(routineParagraf) + Number(routineProblem);
  // Günlük paragraf/problem rutini varsa aynı konuların ayrıca blok alması azalır
  for (const c of candidates) {
    if (routineParagraf && c.topic_id.startsWith("tyt-turkce.paragrafta")) c.score *= 0.5;
    if (routineProblem && c.topic_id === "tyt-matematik.problemler") c.score *= 0.5;
  }
  candidates.sort((a, b) => b.score - a.score);
  const counts = { TYT: 0, AYT: 0 };
  const catCounts = { sayisal: 0, sozel: 0 };
  const usedPerDay = new Map<string, Set<number>>();

  const pool = (cat: Category, exam: Exam | null) =>
    candidates.filter((c) => c.category === cat && c.uses < MAX_USES && (!exam || c.exam === exam || c.exam === "BOTH"));

  for (let d = 0; d < 7; d++) {
    const date = addDays(input.start, d);
    const ranges = input.schedule.slots[weekdayIndex(date)] ?? [];
    const slots = sliceDay(ranges, input.schedule.block_min, input.schedule.break_min, routineCount);
    dayMinutes.push(slots.reduce((s, x) => s + x.dur, 0));
    let sort = 0;
    let prevCat: Category | null = null;
    let prevSection = "";
    let k = 0; // günün kaçıncı çalışma bloğu
    let seqStart = -1;
    const routinesLeft = [...(routineParagraf ? ["paragraf"] : []), ...(routineProblem ? ["problem"] : [])];

    for (const slot of slots) {
      const base = { day_index: d, sort: sort++, start_time: minutesToTime(slot.start), duration_min: slot.dur };
      if (slot.routine) {
        const r = routinesLeft.shift();
        if (r === "paragraf")
          blocks.push({ ...base, subject: "PARAGRAF", topic_id: null, task_type: "soru", target_questions: 15, content: "Paragraf (günlük rutin)", category: "sozel", exam: "TYT", routine: true });
        else
          blocks.push({ ...base, subject: "PROBLEM", topic_id: null, task_type: "soru", target_questions: 10, content: "Problem (günlük rutin)", category: "sayisal", exam: "TYT", routine: true });
        prevCat = r === "paragraf" ? "sozel" : "sayisal";
        continue;
      }
      // Sıralama (varsayılan bir sayısal bir sözel); günün başlangıcı günlere göre kayar,
      // rutinden sonra aynı kategoriyle başlamamaya çalışır
      if (seqStart < 0) {
        // Günün ilk bloğu: haftalık sayısal/sözel dengesinde geride kalan kategori
        const tot = catCounts.sayisal + catCounts.sozel;
        const sayShare = nSay / (nSay + nSoz);
        const want: Category =
          tot === 0 ? (prevCat === "sayisal" ? "sozel" : prevCat === "sozel" ? "sayisal" : d % 2 === 0 ? "sayisal" : "sozel") : catCounts.sayisal / tot < sayShare ? "sayisal" : "sozel";
        seqStart = d % seq.length;
        for (let i = 0; i < seq.length && seq[seqStart % seq.length] !== want; i++) seqStart++;
      }
      let cat: Category = seq[(seqStart + k) % seq.length];
      k++;
      if (!pool(cat, null).length) cat = cat === "sayisal" ? "sozel" : "sayisal";
      // TYT / AYT dengesi
      const total = counts.TYT + counts.AYT;
      let exam: Exam = total === 0 ? (share >= 0.5 ? "TYT" : "AYT") : counts.TYT / total < share ? "TYT" : "AYT";
      if (share >= 1) exam = "TYT";
      if (!pool(cat, exam).length) exam = exam === "TYT" ? "AYT" : "TYT";
      let list = pool(cat, exam);
      if (!list.length) list = pool(cat, null);
      if (!list.length) continue;

      const pick = list
        .map((c) => {
          const days = usedPerDay.get(c.topic_id);
          let eff = c.score / (1 + 1.5 * c.uses);
          if (days?.has(d)) eff *= 0.15; // aynı gün aynı konu olmasın
          if (c.section === prevSection) eff *= 0.6; // arka arkaya aynı ders olmasın
          return { c, eff };
        })
        .sort((a, b) => b.eff - a.eff)[0].c;

      const first = pick.uses === 0;
      pick.uses++;
      if (!usedPerDay.has(pick.topic_id)) usedPerDay.set(pick.topic_id, new Set());
      usedPerDay.get(pick.topic_id)?.add(d);
      prevSection = pick.section;
      prevCat = pick.category;
      const realExam: Exam = pick.exam === "BOTH" ? exam : pick.exam;
      counts[realExam]++;
      catCounts[pick.category]++;

      let task_type: TaskType = "soru";
      let target: number | null = questionsFor(pick.category, slot.dur);
      let content = "";
      if (first && pick.mode === "konu") {
        task_type = "konu";
        target = null;
        content = "Konu çalışması + örnek sorular";
      } else if (first && pick.mode === "tekrar") {
        task_type = "tekrar";
        target = questionsFor(pick.category, slot.dur, 0.5);
        content = "Kısa konu tekrarı, ardından soru";
      }
      blocks.push({ ...base, subject: pick.subject, topic_id: pick.topic_id, task_type, target_questions: target, content, category: pick.category, exam: realExam, routine: false });
    }
  }

  const tasks: DraftTask[] = blocks.map(({ category: _c, exam: _e, routine: _r, ...t }) => t);
  return {
    tasks,
    blocks,
    candidates: candidates.filter((c) => c.uses > 0),
    dayMinutes,
    stats: {
      sayisal: catCounts.sayisal,
      sozel: catCounts.sozel,
      tyt: counts.TYT,
      ayt: counts.AYT,
      questions: blocks.reduce((s, b) => s + (b.target_questions ?? 0), 0),
    },
  };
}
