"use client";
// Toplu hatırlatma merkezi (danışman): bugün görevini / günlüğünü tamamlamayan öğrencileri listeler,
// öğrencinin kendi verisiyle dolan şablonlardan mesaj hazırlar; uygulama üzerinden gönderir:
// mesaj öğrencinin Bugün ekranına not olarak düşer, bildirimi açık olanlara anlık bildirim de gider.

import { useCallback, useEffect, useMemo, useState } from "react";
import { ALL_TOPICS } from "./curriculum";
import { errorText, sb } from "./db";
import { addDays, diffDays, formatShort, isRealTask, pickCurrentPlan, todayISO, type PlanTask, type Profile, type WeeklyPlan } from "./lib";
import { PageHeader } from "./shell";
import { pushStatus, sendResultText, sendToStudents } from "./bildirim";
import { Badge, Button, Card, EmptyState, ErrorBox, Icon, PageLoader, Segmented, cx, useToast } from "./ui";

const topicName = new Map(ALL_TOPICS.map((t) => [t.id, t.name]));
type MiniTask = Pick<PlanTask, "plan_id" | "day_index" | "subject" | "topic_id" | "content" | "target_questions" | "done">;
const title = (t: MiniTask) => (t.topic_id ? (topicName.get(t.topic_id) ?? t.topic_id) : t.content.trim() || t.subject);

export type Contact = { student_id: string; phone: string; parent_phone: string };

/** Türkiye numarasını wa.me biçimine çevirir: 0532… / 532… / +90 532… → 90532… */
export function normalizePhone(raw: string | null | undefined): string | null {
  let d = (raw ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = "90" + d.slice(1);
  if (d.length === 10 && d.startsWith("5")) d = "90" + d;
  return d.length >= 11 && d.length <= 15 ? d : null;
}
export function waTo(phone: string | null | undefined, text: string) {
  const p = normalizePhone(phone);
  return `https://wa.me/${p ?? ""}?text=${encodeURIComponent(text)}`;
}

/** Supabase tek seferde en fazla 1000 satır döndürür; kimlik listesini parçalara bölüp sayfalayarak okur. */
async function fetchAll<T>(ids: string[], build: (chunk: string[]) => { range: (a: number, b: number) => PromiseLike<{ data: unknown; error: { message: string } | null }> }): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 80) {
    const chunk = ids.slice(i, i + 80);
    for (let from = 0; ; from += 1000) {
      const { data, error } = await build(chunk).range(from, from + 999);
      if (error) throw error;
      const rows = (data ?? []) as T[];
      out.push(...rows);
      if (rows.length < 1000) break;
    }
  }
  return out;
}

type Row = {
  s: Profile;
  first: string;
  plan: WeeklyPlan | null;
  today: MiniTask[];
  todayDone: number;
  weekDone: number;
  weekTotal: number;
  lastLog: string | null;
  loggedToday: boolean;
  phone: string;
};

type Filter = "gorev" | "gunluk" | "uzun" | "programsiz" | "hepsi";

const TEMPLATES: { id: string; label: string; text: string }[] = [
  {
    id: "gorev",
    label: "Kalan görevler",
    text: "Merhaba {ad}, bugünkü programında {kalan} görev kaldı: {gorevler}. Akşam bitirmeye çalışalım; zorlandığın bir yer olursa yaz, planı birlikte düzenleriz.",
  },
  { id: "gunluk", label: "Günlük takip", text: "Merhaba {ad}, bugünkü günlüğünü henüz doldurmadın. 2 dakikanı ayırıp doldurur musun? Uyku ve ruh hâlindeki örüntüleri birlikte görmemiz için önemli." },
  { id: "uzun", label: "Uzun ara", text: "Merhaba {ad}, son günlük kaydın {son_gunluk}. Nasıl gidiyor? Uygun olduğunda kısa bir görüşme yapalım mı?" },
  { id: "tebrik", label: "Tebrik", text: "Tebrikler {ad}! Bu hafta {haftalik} görev tamamladın. Böyle devam 👏" },
];
const VARS = [
  { key: "{ad}", label: "Ad" },
  { key: "{kalan}", label: "Kalan görev sayısı" },
  { key: "{gorevler}", label: "Kalan görevler" },
  { key: "{haftalik}", label: "Haftalık ilerleme" },
  { key: "{son_gunluk}", label: "Son günlük" },
];

const TPL_KEY = "yks-hatirlatma-sablon";
const sentKey = (d: string) => `yks-hatirlatma-gonderilen-${d}`;
function readJSON<T>(k: string, fallback: T): T {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJSON(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
}

function fill(text: string, r: Row) {
  const remaining = r.today.filter((t) => !t.done);
  const gap = r.lastLog ? diffDays(r.lastLog, todayISO()) : null;
  const names = remaining.slice(0, 4).map(title);
  const list = names.join(", ") + (remaining.length > 4 ? ` ve ${remaining.length - 4} görev daha` : "");
  return text
    .replaceAll("{ad}", r.first)
    .replaceAll("{kalan}", String(remaining.length))
    .replaceAll("{gorevler}", list || "—")
    .replaceAll("{haftalik}", r.weekTotal ? `${r.weekDone}/${r.weekTotal}` : "—")
    .replaceAll("{son_gunluk}", r.lastLog ? `${formatShort(r.lastLog)} (${gap} gün önce)` : "hiç girilmemiş");
}

export function ReminderCenter() {
  const toast = useToast();
  const today = todayISO();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pushInfo, setPushInfo] = useState<{ push_ready: boolean; enabled: Set<string> } | null>(null);
  const [filter, setFilter] = useState<Filter>("gorev");
  const [tplId, setTplId] = useState("gorev");
  const [text, setText] = useState(TEMPLATES[0].text);
  const [sent, setSent] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    setSent(readJSON<string[]>(sentKey(today), []));
    const saved = readJSON<Record<string, string>>(TPL_KEY, {});
    setText(saved.gorev ?? TEMPLATES[0].text);
  }, [today]);

  const load = useCallback(async () => {
    try {
      const { data: st, error: e1 } = await sb().from("profiles").select("*").eq("role", "student").eq("is_active", true).order("full_name");
      if (e1) throw e1;
      const students = (st ?? []) as Profile[];
      const ids = students.map((s) => s.id);
      if (!ids.length) return setRows([]);
      const since = addDays(today, -13);
      const plans = await fetchAll<WeeklyPlan>(ids, (c) => sb().from("weekly_plans").select("*").in("student_id", c).gte("start_date", since).order("start_date"));
      const plansBy = new Map<string, WeeklyPlan[]>();
      for (const p of plans) plansBy.set(p.student_id, [...(plansBy.get(p.student_id) ?? []), p]);
      const current = new Map<string, WeeklyPlan>();
      for (const [sid, ps] of plansBy) {
        const p = pickCurrentPlan(ps, today);
        if (p && p.start_date <= today && today <= addDays(p.start_date, 6)) current.set(sid, p);
      }
      const planIds = [...current.values()].map((p) => p.id);
      const [tasks, logs, contacts] = await Promise.all([
        planIds.length
          ? fetchAll<MiniTask>(planIds, (c) => sb().from("plan_tasks").select("plan_id, day_index, subject, topic_id, content, target_questions, done").in("plan_id", c).order("id"))
          : Promise.resolve([] as MiniTask[]),
        fetchAll<{ student_id: string; log_date: string }>(ids, (c) => sb().from("daily_logs").select("student_id, log_date").in("student_id", c).gte("log_date", addDays(today, -60)).order("log_date", { ascending: false })),
        pushStatus(ids).then((p) => {
          setPushInfo(p);
          return [] as Contact[];
        }),
      ]);
      const tasksBy = new Map<string, MiniTask[]>();
      for (const t of tasks) if (isRealTask(t)) tasksBy.set(t.plan_id, [...(tasksBy.get(t.plan_id) ?? []), t]);
      const lastLog = new Map<string, string>();
      for (const l of logs) if (!lastLog.has(l.student_id) || l.log_date > lastLog.get(l.student_id)!) lastLog.set(l.student_id, l.log_date);
      const phone = new Map(contacts.map((c) => [c.student_id, c.phone]));
      setRows(
        students.map((s) => {
          const plan = current.get(s.id) ?? null;
          const all = plan ? (tasksBy.get(plan.id) ?? []) : [];
          const di = plan ? diffDays(plan.start_date, today) : -1;
          const td = all.filter((t) => t.day_index === di);
          const ll = lastLog.get(s.id) ?? null;
          return {
            s,
            first: s.full_name.split(" ")[0],
            plan,
            today: td,
            todayDone: td.filter((t) => t.done).length,
            weekDone: all.filter((t) => t.done).length,
            weekTotal: all.length,
            lastLog: ll,
            loggedToday: ll === today,
            phone: phone.get(s.id) ?? "",
          };
        }),
      );
      setError(null);
    } catch (e) {
      setError(errorText(e));
      setRows([]);
    }
  }, [today]);
  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const r = rows ?? [];
    return {
      gorev: r.filter((x) => x.today.length > 0 && x.todayDone < x.today.length).length,
      gunluk: r.filter((x) => !x.loggedToday).length,
      uzun: r.filter((x) => !x.lastLog || diffDays(x.lastLog, today) >= 3).length,
      programsiz: r.filter((x) => !x.plan).length,
      hepsi: r.length,
    };
  }, [rows, today]);

  const list = useMemo(() => {
    const r = rows ?? [];
    switch (filter) {
      case "gorev":
        return r.filter((x) => x.today.length > 0 && x.todayDone < x.today.length).sort((a, b) => a.todayDone / a.today.length - b.todayDone / b.today.length);
      case "gunluk":
        return r.filter((x) => !x.loggedToday);
      case "uzun":
        return r.filter((x) => !x.lastLog || diffDays(x.lastLog, today) >= 3).sort((a, b) => (a.lastLog ?? "").localeCompare(b.lastLog ?? ""));
      case "programsiz":
        return r.filter((x) => !x.plan);
      default:
        return r;
    }
  }, [rows, filter, today]);

  function chooseTemplate(id: string) {
    const saved = readJSON<Record<string, string>>(TPL_KEY, {});
    setTplId(id);
    setText(saved[id] ?? TEMPLATES.find((t) => t.id === id)!.text);
  }
  function editText(v: string) {
    setText(v);
    const saved = readJSON<Record<string, string>>(TPL_KEY, {});
    writeJSON(TPL_KEY, { ...saved, [tplId]: v });
  }
  function resetTemplate() {
    const saved = readJSON<Record<string, string>>(TPL_KEY, {});
    delete saved[tplId];
    writeJSON(TPL_KEY, saved);
    setText(TEMPLATES.find((t) => t.id === tplId)!.text);
  }
  function markSent(id: string) {
    setSent((xs) => {
      const next = xs.includes(id) ? xs : [...xs, id];
      writeJSON(sentKey(today), next);
      return next;
    });
  }
  function setFilterAndTpl(f: Filter) {
    setFilter(f);
    setSelected(new Set());
    if (f === "gorev") chooseTemplate("gorev");
    else if (f === "gunluk") chooseTemplate("gunluk");
    else if (f === "uzun") chooseTemplate("uzun");
  }

  async function sendNotes(all: Row[]) {
    // "Kalan görevler" şablonu görevi kalmayan öğrenciye anlamsız olur: onları atla
    const needsTasks = /\{(kalan|gorevler)\}/.test(text);
    const targets = needsTasks ? all.filter((r) => r.today.some((t) => !t.done)) : all;
    const skipped = all.length - targets.length;
    if (!targets.length) return toast.show("Seçilenlerin bugün kalan görevi yok; başka şablon seçin", "danger");
    setBusy(true);
    try {
      const r = await sendToStudents(
        targets.map((t) => ({ student_id: t.s.id, message: fill(text, t).slice(0, 1000) })),
        TEMPLATES.find((t) => t.id === tplId)?.label ?? "Hatırlatma",
      );
      targets.forEach((t) => markSent(t.s.id));
      setSelected(new Set());
      toast.show(sendResultText(r) + (skipped ? ` · ${skipped} kişinin kalan görevi olmadığı için atlandı` : ""));
    } catch (e) {
      toast.show(/shared_notes|schema cache/i.test(String((e as Error)?.message)) ? "Uygulama içi not için guncelleme-6.sql çalıştırılmalı." : errorText(e), "danger");
    } finally {
      setBusy(false);
    }
  }

  if (!rows) return <PageLoader />;
  const selRows = list.filter((r) => selected.has(r.s.id));
  const hour = new Date().getHours();

  return (
    <div className="space-y-4">
      <PageHeader title="Hatırlatma" subtitle={`${formatShort(today)} · ${rows.length} aktif öğrenci${hour < 17 ? " · görev hatırlatmaları akşamüstü daha anlamlıdır" : ""}`} />
      {error && <ErrorBox>{error}</ErrorBox>}

      <Card>
        <div className="space-y-3">
          <Segmented
            size="sm"
            ariaLabel="Öğrenci süzgeci"
            value={filter}
            onChange={setFilterAndTpl}
            options={[
              { value: "gorev", label: `Görevi eksik (${counts.gorev})` },
              { value: "gunluk", label: `Günlük yok (${counts.gunluk})` },
              { value: "uzun", label: `3+ gün (${counts.uzun})` },
              { value: "programsiz", label: `Programsız (${counts.programsiz})` },
              { value: "hepsi", label: `Tümü (${counts.hepsi})` },
            ]}
          />
          <div>
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-sm font-medium">Şablon</span>
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => chooseTemplate(t.id)}
                  aria-pressed={tplId === t.id}
                  className={cx("rounded-lg border px-2.5 py-1 text-xs font-medium", tplId === t.id ? "border-primary bg-primary text-primary-fg" : "border-line hover:bg-surface-2")}
                >
                  {t.label}
                </button>
              ))}
              <button type="button" onClick={resetTemplate} className="ml-auto text-xs text-muted hover:text-fg">
                Varsayılana dön
              </button>
            </div>
            <textarea className="field min-h-24 text-sm" value={text} maxLength={1500} onChange={(e) => editText(e.target.value)} aria-label="Mesaj şablonu" />
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted">Ekle:</span>
              {VARS.map((v) => (
                <button key={v.key} type="button" onClick={() => editText(`${text}${text.endsWith(" ") ? "" : " "}${v.key}`)} className="rounded-md bg-surface-2 px-2 py-0.5 text-xs hover:bg-primary-soft" title={v.key}>
                  {v.label}
                </button>
              ))}
              <span className="text-xs text-faint">Değişkenler her öğrencinin kendi verisiyle dolar. Düzenlediğin şablon bu cihazda saklanır.</span>
            </div>
          </div>
        </div>
      </Card>

      {list.length === 0 ? (
        <Card>
          <EmptyState icon="check" title="Bu listede kimse yok">
            {filter === "gorev" ? "Bugün programı olan herkes görevlerini tamamlamış ya da bugün görev yok." : "Seçili duruma uyan öğrenci yok."}
          </EmptyState>
        </Card>
      ) : (
        <Card
          title={`${list.length} öğrenci`}
          subtitle={`${list.filter((r) => sent.includes(r.s.id)).length} kişiye bugün hatırlatma gönderildi`}
          action={
            pushInfo?.push_ready ? (
              <span className="text-xs text-muted">{list.filter((r) => pushInfo.enabled.has(r.s.id)).length}/{list.length} kişinin bildirimi açık</span>
            ) : null
          }
        >
          <div className="mb-2 flex flex-wrap items-center gap-2 border-b border-line pb-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--primary)]"
                checked={selRows.length === list.length}
                onChange={(e) => setSelected(e.target.checked ? new Set(list.map((r) => r.s.id)) : new Set())}
              />
              Tümünü seç
            </label>
            <Button size="sm" icon="bell" disabled={!selRows.length} loading={busy} onClick={() => sendNotes(selRows)} className="ml-auto">
              Seçilenlere gönder ({selRows.length})
            </Button>
          </div>
          <ul className="divide-y divide-line">
            {list.map((r) => {
              const msg = fill(text, r);
              const isSent = sent.includes(r.s.id);
              const gap = r.lastLog ? diffDays(r.lastLog, today) : null;
              return (
                <li key={r.s.id} className={cx("py-3", isSent && "opacity-60")}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <input
                      type="checkbox"
                      aria-label={`${r.s.full_name} seç`}
                      className="h-4 w-4 accent-[var(--primary)]"
                      checked={selected.has(r.s.id)}
                      onChange={(e) =>
                        setSelected((xs) => {
                          const n = new Set(xs);
                          if (e.target.checked) n.add(r.s.id);
                          else n.delete(r.s.id);
                          return n;
                        })
                      }
                    />
                    <div className="min-w-0 flex-1 basis-48">
                      <p className="flex items-center gap-2 font-semibold">
                        <a href={`?v=ogrenci&id=${r.s.id}`} className="truncate hover:underline">
                          {r.s.full_name}
                        </a>
                        {isSent && <Badge tone="success">Gönderildi</Badge>}
                        {pushInfo?.push_ready && !pushInfo.enabled.has(r.s.id) && <Badge>Bildirimi kapalı</Badge>}
                      </p>
                      <p className="text-xs text-muted">
                        {r.today.length ? `Bugün ${r.todayDone}/${r.today.length} görev` : r.plan ? "Bugün görev yok" : "Bu hafta program yok"}
                        {r.weekTotal ? ` · hafta ${r.weekDone}/${r.weekTotal}` : ""}
                        {" · "}
                        <span className={cx(!r.loggedToday && (gap == null || gap >= 3) && "text-danger")}>
                          {r.loggedToday ? "günlük dolduruldu" : r.lastLog ? `son günlük ${gap} gün önce` : "günlük hiç yok"}
                        </span>
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button type="button" onClick={() => setPreview((p) => (p === r.s.id ? null : r.s.id))} className="h-9 rounded-lg px-2.5 text-sm text-muted hover:bg-surface-2" aria-expanded={preview === r.s.id}>
                        Mesaj
                      </button>
                      <Button size="sm" variant="secondary" icon="bell" onClick={() => sendNotes([r])} disabled={busy}>
                        Gönder
                      </Button>
                    </div>
                  </div>
                  {preview === r.s.id && (
                    <div className="mt-2 space-y-2 rounded-xl bg-surface-2 p-3 text-sm">
                      <p className="whitespace-pre-wrap">{msg}</p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-faint">
            Mesaj öğrencinin Bugün ekranına not olarak düşer; bildirimi açık olanların telefonuna anlık bildirim de gider.
            {pushInfo && !pushInfo.push_ready ? " Anlık bildirim için Ayarlar → Bildirimler kurulumu gerekli." : ""}
          </p>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Öğrenci → Hesap: iletişim bilgileri (yalnızca danışman görür)        */
/* ------------------------------------------------------------------ */
export function StudentContactCard({ studentId }: { studentId: string }) {
  const toast = useToast();
  const [c, setC] = useState<Contact | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    sb()
      .from("student_contacts")
      .select("*")
      .eq("student_id", studentId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) return setMissing(true);
        setC((data as Contact | null) ?? { student_id: studentId, phone: "", parent_phone: "" });
      });
  }, [studentId]);
  if (missing) return null;
  if (!c) return null;
  async function save() {
    if (!c) return;
    setBusy(true);
    const { error } = await sb()
      .from("student_contacts")
      .upsert({ student_id: studentId, phone: c.phone.trim().slice(0, 30), parent_phone: c.parent_phone.trim().slice(0, 30), updated_at: new Date().toISOString() });
    setBusy(false);
    if (error) return toast.show(errorText(error), "danger");
    toast.show("İletişim bilgileri kaydedildi");
  }
  return (
    <Card title="İletişim" subtitle="Yalnızca danışman görür. Veli telefonu, veli bağlantısını gönderirken kullanılır.">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Öğrenci telefonu</span>
          <input className="field" inputMode="tel" placeholder="05xx xxx xx xx" value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Veli telefonu</span>
          <input className="field" inputMode="tel" placeholder="05xx xxx xx xx" value={c.parent_phone} onChange={(e) => setC({ ...c, parent_phone: e.target.value })} />
        </label>
      </div>
      <div className="mt-3 flex justify-end">
        <Button icon="check" onClick={save} loading={busy}>
          Kaydet
        </Button>
      </div>
    </Card>
  );
}
