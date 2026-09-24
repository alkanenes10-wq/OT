// Otomatik haftalık program oluşturucu.
// Deneme analizindeki yanlış/boş sayılarına ve öğrencinin günlük müsaitliğine göre
// hangi gün hangi konudan kaç soru çözüleceğini hesaplar. Sonuç danışman tarafından düzenlenebilir.
import { ALL_TOPICS } from "./curriculum";
import { subjectForTopic, type DayLevel, type ExamAnalysis, type TaskType, type TopicProgress } from "./lib";

export type DraftTask = {
  day_index: number;
  subject: string;
  topic_id: string | null;
  task_type: TaskType;
  target_questions: number | null;
  content: string;
  sort: number;
};

export type PriorityTopic = {
  topic_id: string;
  name: string;
  subject: string;
  wrong: number;
  empty: number;
  weight: number;
  questions: number;
};

export type PlanInput = {
  levels: DayLevel[]; // 7 gün
  levelQuestions: Record<DayLevel, number>; // seviye başına günlük soru hedefi
  analysis: ExamAnalysis | null;
  progress: TopicProgress[];
  daily: { paragraf: number; problem: number; tekrar: boolean };
  maxTopics: number;
  excluded?: string[]; // önizlemede çıkarılan konular
};

const topicName = new Map(ALL_TOPICS.map((t) => [t.id, t.name]));
const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);
/** Bir konuya haftada en fazla bu kadar soru verilir */
export const MAX_PER_TOPIC = 160;

/** Öncelikli konular: denemedeki yanlış/boş; yoksa "çalışılıyor" durumundaki konular */
export function priorityTopics(input: Pick<PlanInput, "analysis" | "progress" | "maxTopics" | "excluded">): PriorityTopic[] {
  const excluded = new Set(input.excluded ?? []);
  let list: PriorityTopic[] = [];
  if (input.analysis) {
    list = input.analysis.results
      .filter((r) => topicName.has(r.topic_id))
      .map((r) => {
        const wrong = r.wrong ?? 0;
        const empty = r.empty ?? 0;
        return {
          topic_id: r.topic_id,
          name: topicName.get(r.topic_id) ?? r.topic_id,
          subject: subjectForTopic(r.topic_id),
          wrong,
          empty,
          weight: wrong + 0.7 * empty,
          questions: 0,
        };
      })
      .filter((t) => t.weight > 0);
  }
  if (!list.length) {
    list = input.progress
      .filter((p) => p.status === "in_progress" && topicName.has(p.topic_id))
      .map((p) => ({
        topic_id: p.topic_id,
        name: topicName.get(p.topic_id) ?? p.topic_id,
        subject: subjectForTopic(p.topic_id),
        wrong: 0,
        empty: 0,
        weight: 1,
        questions: 0,
      }));
  }
  return list
    .filter((t) => !excluded.has(t.topic_id))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, input.maxTopics);
}

export function buildPlan(input: PlanInput): { tasks: DraftTask[]; priorities: PriorityTopic[]; dayTargets: number[]; total: number } {
  const open = input.levels.map((l) => input.levelQuestions[l] > 0);
  const remaining = input.levels.map((l) => input.levelQuestions[l]);
  const tasks: DraftTask[] = [];
  const sortOf = Array(7).fill(0);
  const push = (t: Omit<DraftTask, "sort">) => tasks.push({ ...t, sort: sortOf[t.day_index]++ });

  // 1) Her gün sabit görevler
  for (let d = 0; d < 7; d++) {
    if (!open[d]) continue;
    if (input.daily.paragraf > 0) {
      push({ day_index: d, subject: "PARAGRAF", topic_id: null, task_type: "soru", target_questions: input.daily.paragraf, content: "Paragraf" });
      remaining[d] -= input.daily.paragraf;
    }
    if (input.daily.problem > 0) {
      push({ day_index: d, subject: "PROBLEM", topic_id: null, task_type: "soru", target_questions: input.daily.problem, content: "Problem" });
      remaining[d] -= input.daily.problem;
    }
  }

  // 2) Öncelikli konulara kalan kapasiteyi yanlış ağırlığına göre dağıt
  const priorities = priorityTopics(input);
  const openDays = open.filter(Boolean).length;
  const budget = remaining.reduce((s, r, d) => s + (open[d] ? Math.max(0, r) : 0), 0);
  const W = priorities.reduce((s, p) => s + p.weight, 0);

  if (openDays && W > 0 && budget > 0) {
    for (const p of priorities) p.questions = Math.min(MAX_PER_TOPIC, Math.max(10, round5((budget * p.weight) / W)));
    for (const p of priorities) {
      const chunks = Math.max(1, Math.ceil(p.questions / 40));
      const base = round5(p.questions / chunks);
      const perDay = new Map<number, number>();
      for (let c = 0; c < chunks; c++) {
        const size = c === chunks - 1 ? Math.max(5, p.questions - base * (chunks - 1)) : base;
        // en çok boş kapasitesi olan gün; aynı konuyu farklı günlere yaymak için küçük ceza
        let best = -1;
        let bestScore = -Infinity;
        for (let d = 0; d < 7; d++) {
          if (!open[d]) continue;
          const score = remaining[d] - (perDay.has(d) ? 45 : 0);
          if (score > bestScore) {
            bestScore = score;
            best = d;
          }
        }
        if (best === -1) break;
        remaining[best] -= size;
        perDay.set(best, (perDay.get(best) ?? 0) + size);
      }
      // Kısa konu tekrarı, konunun ilk soru gününde soru çözümünden önce
      [...perDay.entries()]
        .sort((x, y) => x[0] - y[0])
        .forEach(([d, size], i) => {
          if (i === 0) push({ day_index: d, subject: p.subject, topic_id: p.topic_id, task_type: "tekrar", target_questions: null, content: "Kısa konu tekrarı (20-30 dk)" });
          push({ day_index: d, subject: p.subject, topic_id: p.topic_id, task_type: "soru", target_questions: size, content: "" });
        });
    }
  }

  // 3) Günlük tekrar
  if (input.daily.tekrar) {
    for (let d = 0; d < 7; d++) {
      if (open[d]) push({ day_index: d, subject: "GÜNLÜK TEKRAR", topic_id: null, task_type: "diger", target_questions: null, content: "Günün konularını 15 dk tekrar et" });
    }
  }

  const dayTargets = Array.from({ length: 7 }, (_, d) =>
    tasks.filter((t) => t.day_index === d).reduce((s, t) => s + (t.target_questions ?? 0), 0),
  );
  return { tasks, priorities, dayTargets, total: dayTargets.reduce((a, b) => a + b, 0) };
}
