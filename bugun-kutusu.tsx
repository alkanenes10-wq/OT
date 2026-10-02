"use client";
// Danışman ana sayfası: "Bugün ilgilenmem gerekenler". Her satır tek tıkla ilgili yere gider.

import { useEffect, useState } from "react";
import { A, type Route, sb } from "./db";
import { addDays, diffDays, type Profile, todayISO } from "./lib";
import { Card, cx, Icon, type IconName } from "./ui";

export type TodoRow = { student: Profile; lastLog: string | null; overdue: number; hasPlan: boolean };
type Session = { id: string; student_id: string; starts_at: string; topic: string };

const hhmm = (ts: string) => new Date(ts).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });

export function TodoBox({ rows }: { rows: TodoRow[] }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [forum, setForum] = useState(0);
  const [veli, setVeli] = useState<string[]>([]);
  const today = todayISO();

  useEffect(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 86400000);
    sb()
      .from("counseling_sessions")
      .select("id, student_id, starts_at, topic")
      .eq("status", "planned")
      .gte("starts_at", start.toISOString())
      .lt("starts_at", end.toISOString())
      .order("starts_at")
      .then(({ data }) => setSessions((data ?? []) as Session[]));
    sb()
      .rpc("forum_queue")
      .then(({ data }) => setForum(((data ?? []) as { status: string }[]).filter((x) => x.status === "pending").length));
    sb()
      .from("parent_messages")
      .select("student_id")
      .eq("from_parent", true)
      .is("read_at", null)
      .then(({ data }) => setVeli([...new Set(((data ?? []) as { student_id: string }[]).map((m) => m.student_id))]));
  }, []);

  const active = rows.filter((r) => r.student.is_active);
  const name = new Map(active.map((r) => [r.student.id, r.student.full_name]));
  const silent = active
    .filter((r) => !r.lastLog || r.lastLog <= addDays(today, -3))
    .sort((a, b) => (a.lastLog ?? "").localeCompare(b.lastLog ?? ""));
  const late = active.filter((r) => r.overdue >= 3).sort((a, b) => b.overdue - a.overdue);
  const noPlan = active.filter((r) => !r.hasPlan);
  const veliRows = veli.filter((id) => name.has(id));
  const total = sessions.length + silent.length + late.length + noPlan.length + (forum ? 1 : 0) + veliRows.length;

  return (
    <Card
      className="mb-4"
      title="Bugün ilgilenmem gerekenler"
      subtitle={total ? `${total} madde` : undefined}
    >
      {total === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Icon name="check" size={16} className="text-success" /> Bugün için bekleyen bir şey yok.
        </p>
      ) : (
        <div className="space-y-4">
          {sessions.length > 0 && (
            <Group icon="calendar" title={`Bugünkü görüşmeler (${sessions.length})`} more={{ to: { v: "takvim" }, label: "Takvim" }}>
              {sessions.map((s) => (
                <Item key={s.id} to={{ v: "gorusme", id: s.student_id, t: s.id }} main={`${hhmm(s.starts_at)} · ${name.get(s.student_id) ?? "Öğrenci"}`} sub={s.topic || undefined} action="Görüşme raporu" />
              ))}
            </Group>
          )}
          {silent.length > 0 && (
            <Group icon="journal" title={`3+ gündür günlük doldurmayan (${silent.length})`} more={{ to: { v: "hatirlatma" }, label: "Toplu hatırlat" }}>
              {silent.slice(0, 6).map((r) => (
                <Item
                  key={r.student.id}
                  to={{ v: "ogrenci", id: r.student.id, t: "gunluk" }}
                  main={r.student.full_name}
                  sub={r.lastLog ? `son kayıt ${diffDays(r.lastLog, today)} gün önce` : "son 2 haftada kayıt yok"}
                  tone={!r.lastLog || diffDays(r.lastLog, today) >= 7 ? "danger" : undefined}
                />
              ))}
              {silent.length > 6 && <li className="px-2 text-xs text-muted">ve {silent.length - 6} öğrenci daha</li>}
            </Group>
          )}
          {late.length > 0 && (
            <Group icon="list" title={`Bu hafta geciken görevi birikenler (${late.length})`} more={{ to: { v: "gorevler" }, label: "Görev panosu" }}>
              {late.slice(0, 6).map((r) => (
                <Item key={r.student.id} to={{ v: "ogrenci", id: r.student.id, t: "program" }} main={r.student.full_name} sub={`${r.overdue} geciken görev`} tone={r.overdue >= 8 ? "danger" : undefined} />
              ))}
            </Group>
          )}
          {noPlan.length > 0 && (
            <Group icon="plus" title={`Bu hafta programı olmayan (${noPlan.length})`}>
              {noPlan.slice(0, 6).map((r) => (
                <Item key={r.student.id} to={{ v: "ogrenci", id: r.student.id, t: "program" }} main={r.student.full_name} action="Program hazırla" />
              ))}
            </Group>
          )}
          {veliRows.length > 0 && (
            <Group icon="message" title={`Okunmamış veli mesajı (${veliRows.length})`}>
              {veliRows.map((id) => (
                <Item key={id} to={{ v: "ogrenci", id, t: "veli" }} main={name.get(id) ?? "Öğrenci"} sub="velisinden yeni mesaj" action="Oku" />
              ))}
            </Group>
          )}
          {forum > 0 && (
            <Group icon="question" title="Soru forumu">
              <Item to={{ v: "forum" }} main={`${forum} paylaşım onayınızı bekliyor`} action="Onayla" />
            </Group>
          )}
        </div>
      )}
    </Card>
  );
}

function Group({ icon, title, more, children }: { icon: IconName; title: string; more?: { to: Route; label: string }; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
          <Icon name={icon} size={14} /> {title}
        </p>
        {more && (
          <A to={more.to} className="text-xs font-medium text-primary">
            {more.label} →
          </A>
        )}
      </div>
      <ul className="grid gap-x-3 sm:grid-cols-2">{children}</ul>
    </section>
  );
}

function Item({ to, main, sub, action, tone }: { to: Route; main: string; sub?: string; action?: string; tone?: "danger" }) {
  return (
    <li>
      <A to={to} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-surface-2">
        <span className="min-w-0 truncate">
          <span className="font-medium">{main}</span>
          {sub && <span className={cx("ml-2 text-xs", tone === "danger" ? "text-danger" : "text-muted")}>{sub}</span>}
        </span>
        <span className="flex shrink-0 items-center gap-0.5 text-xs font-medium text-primary">
          {action}
          <Icon name="chevronRight" size={14} />
        </span>
      </A>
    </li>
  );
}
