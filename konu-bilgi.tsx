"use client";
// Bir konunun alt başlıkları ve kazanımları (Konu takibi, program görevleri ve konu analizinde ortak).

import { ALL_TOPICS } from "./curriculum";
import { KAZANIMLAR, splitSub } from "./kazanimlar";
import { cx } from "./ui";

export const topicById = (id: string | null | undefined) => (id ? ALL_TOPICS.find((t) => t.id === id) : undefined);

export function TopicOutcomes({ topicId, compact = false, className }: { topicId: string; compact?: boolean; className?: string }) {
  const topic = topicById(topicId);
  if (!topic) return null;
  const subs = topic.sub ? splitSub(topic.sub) : [];
  const outcomes = KAZANIMLAR[topic.id] ?? [];
  return (
    <div className={cx("space-y-3", className)}>
      {subs.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted">Alt başlıklar ({subs.length})</p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {subs.map((s) => (
              <li key={s} className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs">
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}
      {outcomes.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted">Kazanımlar ({outcomes.length})</p>
          <ol className={cx("mt-1.5 space-y-1", compact ? "text-xs" : "text-sm")}>
            {outcomes.map((k, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[11px] font-semibold text-primary-ink tabular">{i + 1}</span>
                <span className="leading-snug">{k}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
