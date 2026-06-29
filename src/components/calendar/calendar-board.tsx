"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import {
  CaretLeft,
  CaretRight,
  Plus,
  X,
  InstagramLogo,
  YoutubeLogo,
} from "@phosphor-icons/react";
import {
  moveItemAction,
  deleteItemAction,
  addEventAction,
  addContentAction,
  setBlockDeliveryAction,
  createBlockRangeAction,
  resizeBlockAction,
} from "@/app/(app)/calendario/actions";
import { FORMAT_ORDER, FORMAT_LABELS } from "@/lib/format";
import { nextTitleForFormat } from "@/lib/content-title";

type Ref = "luca" | "matteo" | "publication" | "event";
type Cell = { ymd: string; day: number; inMonth: boolean; isToday: boolean };
type ItemDTO = {
  refType: Ref;
  refId: string;
  ymd: string;
  label: string;
  owner: "Luca" | "Matteo" | null;
  channel: "INSTAGRAM" | "YOUTUBE" | null;
  href: string | null;
};
type BandBlock = { id: string; label: string; start: string; end: string };

function chipTone(it: ItemDTO) {
  if (it.refType === "luca") return "bg-blush text-blush-ink";
  if (it.refType === "matteo") return "bg-lavender text-lavender-ink";
  if (it.refType === "publication") return "bg-sage text-sage-ink";
  if (it.owner === "Luca") return "bg-blush text-blush-ink";
  if (it.owner === "Matteo") return "bg-lavender text-lavender-ink";
  return "bg-butter text-butter-ink";
}

function cleanTitle(it: ItemDTO) {
  if (it.refType === "luca" || it.refType === "matteo")
    return it.label.replace(/^(Luca|Matteo) · /, "");
  return it.label;
}

function kindMeta(it: ItemDTO) {
  switch (it.refType) {
    case "luca":
      return { label: "Consegna materiali", tone: "bg-blush text-blush-ink", who: "Luca" as string | null };
    case "matteo":
      return { label: "Consegna revisione", tone: "bg-lavender text-lavender-ink", who: "Matteo" as string | null };
    case "publication":
      return { label: "Pubblicazione", tone: "bg-sage text-sage-ink", who: "Matteo" as string | null };
    default:
      return { label: "Evento", tone: "bg-butter text-butter-ink", who: it.owner };
  }
}

export function CalendarBoard({
  monthLabel,
  year,
  weeks,
  items,
  blocks,
  defaultResponsible = null,
  contentTitles = [],
  prevHref,
  nextHref,
}: {
  monthLabel: string;
  year: number;
  weeks: Cell[][];
  items: ItemDTO[];
  blocks: BandBlock[];
  defaultResponsible?: "LUCA" | "MATTEO" | null;
  contentTitles?: string[];
  prevHref: string;
  nextHref: string;
}) {
  const router = useRouter();
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [showBlock, setShowBlock] = useState(false);
  const [selected, setSelected] = useState<ItemDTO | null>(null);
  const [inlineDay, setInlineDay] = useState<string | null>(null);

  const byDay = new Map<string, ItemDTO[]>();
  for (const it of items) {
    const arr = byDay.get(it.ymd);
    if (arr) arr.push(it);
    else byDay.set(it.ymd, [it]);
  }

  const onDrop = async (ymd: string, e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    const raw = e.dataTransfer.getData("text/plain");
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      if (data.kind === "resize") {
        await resizeBlockAction(data.id, data.edge as "start" | "end", ymd);
        toast.success("Blocco aggiornato");
      } else {
        await moveItemAction(data.refType as Ref, data.refId, ymd);
      }
      router.refresh();
    } catch {}
  };

  const onDelete = async (it: ItemDTO) => {
    await deleteItemAction(it.refType, it.refId);
    toast.success("Evento rimosso");
    router.refresh();
  };

  const DOW = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
  const navBtn =
    "flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card transition-colors hover:bg-secondary";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl">
          {monthLabel} <span className="text-muted-foreground">{year}</span>
        </h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowBlock(true)} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-transform active:scale-[0.98]">
            <Plus size={15} weight="bold" /> Nuovo blocco
          </button>
          <button onClick={() => router.push(prevHref)} className={navBtn} aria-label="Mese precedente">
            <CaretLeft size={16} />
          </button>
          <button onClick={() => router.push("/calendario")} className="rounded-full border border-border bg-card px-4 py-2 text-sm transition-colors hover:bg-secondary">
            Oggi
          </button>
          <button onClick={() => router.push(nextHref)} className={navBtn} aria-label="Mese successivo">
            <CaretRight size={16} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blush" /> Consegna Luca</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-lavender" /> Consegna Matteo</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-sage" /> Pubblicazione</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-butter" /> Evento</span>
        <span className="text-muted-foreground/70">· clic su un giorno per creare contenuto o evento · trascina per spostare, × per eliminare</span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="grid grid-cols-7 border-b border-border">
          {DOW.map((d) => (
            <div key={d} className="px-2 py-2 text-center text-xs text-muted-foreground">{d}</div>
          ))}
        </div>

        {weeks.map((week, wi) => {
          const ws = week[0].ymd;
          const we = week[6].ymd;
          const segs = blocks
            .filter((b) => b.end >= ws && b.start <= we)
            .map((b) => {
              const startCol = week.findIndex((c) => c.ymd === b.start);
              const endCol = week.findIndex((c) => c.ymd === b.end);
              return {
                id: b.id,
                label: b.label,
                startCol: startCol < 0 ? 0 : startCol,
                endCol: endCol < 0 ? 6 : endCol,
                startsHere: b.start >= ws,
                endsHere: b.end <= we,
              };
            });

          return (
            <div key={wi} className="border-b border-border last:border-b-0">
              {segs.length > 0 && (
                <div className="grid grid-cols-7 gap-1 px-1 pt-1">
                  {segs.map((seg) => (
                    <div
                      key={seg.id}
                      style={{ gridColumn: `${seg.startCol + 1} / ${seg.endCol + 2}` }}
                      className="relative truncate rounded-md border border-border bg-secondary px-3 py-0.5 text-[11px] font-medium text-ink/70"
                    >
                      {seg.startsHere && (
                        <span
                          draggable
                          onDragStart={(e) => {
                            e.stopPropagation();
                            e.dataTransfer.setData("text/plain", JSON.stringify({ kind: "resize", id: seg.id, edge: "start" }));
                          }}
                          title="Trascina su un giorno per accorciare/allungare"
                          className="absolute left-0 top-0 z-10 flex h-full w-3 cursor-ew-resize items-center justify-center rounded-l-md hover:bg-ink/10"
                        >
                          <span className="h-2.5 w-0.5 rounded bg-ink/40" />
                        </span>
                      )}
                      {seg.startsHere ? `Blocco · ${seg.label}` : `↪ ${seg.label}`}
                      {seg.endsHere && (
                        <span
                          draggable
                          onDragStart={(e) => {
                            e.stopPropagation();
                            e.dataTransfer.setData("text/plain", JSON.stringify({ kind: "resize", id: seg.id, edge: "end" }));
                          }}
                          title="Trascina su un giorno per accorciare/allungare"
                          className="absolute right-0 top-0 z-10 flex h-full w-3 cursor-ew-resize items-center justify-center rounded-r-md hover:bg-ink/10"
                        >
                          <span className="h-2.5 w-0.5 rounded bg-ink/40" />
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-7">
                {week.map((cell, di) => {
                  const dayItems = byDay.get(cell.ymd) ?? [];
                  const lastCol = di === 6;
                  return (
                    <div
                      key={cell.ymd}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOver(cell.ymd);
                      }}
                      onDragLeave={() => setDragOver((d) => (d === cell.ymd ? null : d))}
                      onDrop={(e) => onDrop(cell.ymd, e)}
                      onClick={() => setInlineDay(cell.ymd)}
                      className={`group/cell relative min-h-24 cursor-pointer p-1.5 ${lastCol ? "" : "border-r"} border-border ${
                        cell.inMonth ? "" : "bg-cream/50"
                      } ${dragOver === cell.ymd ? "bg-lavender/30 ring-1 ring-inset ring-lavender-ink/30" : ""}`}
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <span
                          className={`inline-flex h-5 min-w-5 items-center justify-center px-1 text-xs ${
                            cell.isToday
                              ? "rounded-full bg-primary font-medium text-primary-foreground"
                              : cell.inMonth
                                ? "text-ink"
                                : "text-muted-foreground"
                          }`}
                        >
                          {cell.day}
                        </span>
                        <Plus
                          size={13}
                          weight="bold"
                          aria-hidden
                          className="opacity-0 transition-opacity group-hover/cell:opacity-100 text-muted-foreground"
                        />
                      </div>
                      <div className="space-y-1">
                        {dayItems.map((it) => {
                          const Logo = it.channel === "YOUTUBE" ? YoutubeLogo : InstagramLogo;
                          return (
                            <div
                              key={`${it.refType}:${it.refId}`}
                              draggable
                              onDragStart={(e) =>
                                e.dataTransfer.setData(
                                  "text/plain",
                                  JSON.stringify({ refType: it.refType, refId: it.refId })
                                )
                              }
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelected(it);
                              }}
                              className={`group/chip flex cursor-grab items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium active:cursor-grabbing ${chipTone(it)}`}
                              title={it.label}
                            >
                              {it.channel && <Logo size={11} weight="fill" className="shrink-0" />}
                              <span className="min-w-0 flex-1 truncate">{it.label}</span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDelete(it);
                                }}
                                aria-label="Elimina"
                                className="shrink-0 opacity-0 transition-opacity group-hover/chip:opacity-100"
                              >
                                <X size={11} weight="bold" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {inlineDay && (
        <QuickCreate
          key={inlineDay}
          day={inlineDay}
          defaultResponsible={defaultResponsible}
          contentTitles={contentTitles}
          blockId={blocks.find((b) => inlineDay >= b.start && inlineDay <= b.end)?.id ?? null}
          blockLabel={blocks.find((b) => inlineDay >= b.start && inlineDay <= b.end)?.label ?? null}
          onClose={() => setInlineDay(null)}
          onCreated={() => {
            setInlineDay(null);
            router.refresh();
          }}
        />
      )}

      {showBlock && (
        <Dialog onClose={() => setShowBlock(false)} title="Nuovo blocco settimanale">
          <form
            action={async (fd) => {
              await createBlockRangeAction(fd);
              toast.success("Blocco creato — contenuti del periodo inclusi");
              setShowBlock(false);
              router.refresh();
            }}
            className="space-y-3"
          >
            <Field label="Etichetta">
              <input name="label" required placeholder='Es. "Settimana 26"' className={inputCls} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Dal">
                <input type="date" name="startDate" required className={inputCls} />
              </Field>
              <Field label="Al">
                <input type="date" name="endDate" required className={inputCls} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Consegna Luca (opz.)">
                <input type="date" name="lucaDeliveryAt" className={inputCls} />
              </Field>
              <Field label="Consegna Matteo (opz.)">
                <input type="date" name="matteoDeliveryAt" className={inputCls} />
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">
              I contenuti con pubblicazione nel periodo verranno inclusi automaticamente.
            </p>
            <DialogActions onCancel={() => setShowBlock(false)} submitLabel="Crea blocco" />
          </form>
        </Dialog>
      )}

      <AnimatePresence>
        {selected &&
          (() => {
            const meta = kindMeta(selected);
            const Logo = selected.channel === "YOUTUBE" ? YoutubeLogo : InstagramLogo;
            return (
              <motion.div
                key="cal-drawer"
                className="fixed inset-0 z-40"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div
                  className="absolute inset-0 bg-ink/20 backdrop-blur-[1px]"
                  onClick={() => setSelected(null)}
                />
                <motion.aside
                  className="absolute bottom-3 right-3 top-3 flex w-80 flex-col overflow-y-auto rounded-3xl border border-border bg-paper p-5 shadow-[0_24px_60px_rgba(26,24,19,0.22)]"
                  initial={{ x: 340 }}
                  animate={{ x: 0 }}
                  exit={{ x: 340 }}
                  transition={{ type: "spring", stiffness: 320, damping: 32 }}
                >
                  <div className="flex items-center justify-between">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${meta.tone}`}>
                      {selected.channel && <Logo size={12} weight="fill" />}
                      {meta.label}
                    </span>
                    <button
                      onClick={() => setSelected(null)}
                      aria-label="Chiudi"
                      className="rounded-full border border-border bg-paper p-1.5 text-ink/55 hover:bg-secondary hover:text-ink"
                    >
                      <X size={15} />
                    </button>
                  </div>

                  <h3 className="mt-3 font-heading text-xl text-ink">{cleanTitle(selected)}</h3>

                  <dl className="mt-4 space-y-3 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">Data</dt>
                      <dd className="mt-0.5 capitalize text-ink">
                        {new Date(selected.ymd + "T00:00:00.000Z").toLocaleDateString("it-IT", {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </dd>
                    </div>
                    {meta.who && (
                      <div>
                        <dt className="text-xs text-muted-foreground">Responsabile</dt>
                        <dd className="mt-0.5 text-ink">{meta.who}</dd>
                      </div>
                    )}
                  </dl>

                  <div className="mt-auto flex gap-2 pt-5">
                    {selected.href && (
                      <button
                        onClick={() => {
                          const h = selected.href!;
                          setSelected(null);
                          router.push(h);
                        }}
                        className="flex-1 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
                      >
                        Apri contenuto
                      </button>
                    )}
                    <button
                      onClick={async () => {
                        const it = selected;
                        setSelected(null);
                        await onDelete(it);
                      }}
                      className="rounded-full border border-coral/60 bg-coral/30 px-4 py-2.5 text-sm text-coral-ink hover:bg-coral/50"
                    >
                      Elimina
                    </button>
                  </div>
                </motion.aside>
              </motion.div>
            );
          })()}
      </AnimatePresence>
    </div>
  );
}

const inputCls =
  "w-full rounded-[12px] border border-border bg-secondary/70 px-3.5 py-2.5 text-sm outline-none transition focus:border-ink/30 focus:bg-paper";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function DialogActions({ onCancel, submitLabel }: { onCancel: () => void; submitLabel: string }) {
  return (
    <div className="flex gap-2 pt-1">
      <button className="rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground">
        {submitLabel}
      </button>
      <button type="button" onClick={onCancel} className="rounded-full border border-border px-4 py-2.5 text-sm text-muted-foreground hover:bg-secondary">
        Annulla
      </button>
    </div>
  );
}

function Dialog({ onClose, title, children }: { onClose: () => void; title: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-3xl border border-border bg-paper p-6 shadow-[0_24px_60px_rgba(26,24,19,0.22)]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-heading text-xl text-ink">{title}</h2>
          <button onClick={onClose} aria-label="Chiudi" className="rounded-full border border-border bg-paper p-1.5 text-ink/55 hover:bg-secondary hover:text-ink">
            <X size={15} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const QC_KEY = "calQuickDefaults";

const fmtDayLabel = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
};

type QuickMode = "content" | "event" | "delivery";

/** Fast creator shown as a centered card: pick Contenuto (type pre-selected,
 *  name auto by type, remembers last settings), Evento (title + responsabile),
 *  or — when the day is inside a block — Consegna (Luca/Matteo on that day). */
function QuickCreate({
  day,
  defaultResponsible,
  contentTitles,
  blockId,
  blockLabel,
  onClose,
  onCreated,
}: {
  day: string;
  defaultResponsible: "LUCA" | "MATTEO" | null;
  contentTitles: string[];
  blockId: string | null;
  blockLabel: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [mode, setMode] = useState<QuickMode>("content");
  const [format, setFormat] = useState<string>("REEL");
  const [channel, setChannel] = useState<"INSTAGRAM" | "YOUTUBE">("INSTAGRAM");
  const [responsible, setResponsible] = useState<"" | "LUCA" | "MATTEO">(
    defaultResponsible ?? ""
  );
  const [title, setTitle] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  // Remember last-used settings so the next creation starts where you left off.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(QC_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d.mode === "content" || d.mode === "event") setMode(d.mode);
        if (typeof d.format === "string") setFormat(d.format);
        if (d.channel === "INSTAGRAM" || d.channel === "YOUTUBE") setChannel(d.channel);
      }
    } catch {}
  }, []);

  const label = FORMAT_LABELS[format as keyof typeof FORMAT_LABELS] ?? format;
  const suggested =
    mode === "content" && format ? nextTitleForFormat(contentTitles, label) : "";
  const shown = touched ? title : suggested;

  const remember = () => {
    try {
      localStorage.setItem(QC_KEY, JSON.stringify({ mode, format, channel }));
    } catch {}
  };

  const submit = async () => {
    if (busy || mode === "delivery") return;
    const fd = new FormData();
    fd.set("date", day);
    if (mode === "content") {
      setBusy(true);
      remember();
      fd.set("title", shown.trim());
      fd.set("channel", channel);
      if (format) fd.set("format", format);
      await addContentAction(fd);
      toast.success("Contenuto creato");
      onCreated();
    } else {
      const t = (touched ? title : "").trim();
      if (!t) return; // an event needs a title
      setBusy(true);
      remember();
      fd.set("title", t);
      if (responsible) fd.set("responsible", responsible);
      await addEventAction(fd);
      toast.success("Evento aggiunto");
      onCreated();
    }
  };

  const setDelivery = async (who: "luca" | "matteo") => {
    if (busy || !blockId) return;
    setBusy(true);
    const fd = new FormData();
    fd.set("blockId", blockId);
    fd.set("who", who);
    fd.set("date", day);
    await setBlockDeliveryAction(fd);
    toast.success(who === "luca" ? "Consegna Luca impostata" : "Consegna Matteo impostata");
    onCreated();
  };

  const tabs: QuickMode[] = blockId ? ["content", "event", "delivery"] : ["content", "event"];
  const tabLabel: Record<QuickMode, string> = {
    content: "Contenuto",
    event: "Evento",
    delivery: "Consegna",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <div
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        className="relative z-10 w-full max-w-sm rounded-3xl border border-border bg-paper p-5 shadow-[0_24px_60px_rgba(26,24,19,0.22)]"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-heading text-lg text-ink capitalize">{fmtDayLabel(day)}</h2>
          <button
            onClick={onClose}
            aria-label="Chiudi"
            className="rounded-full border border-border bg-paper p-1.5 text-ink/55 hover:bg-secondary hover:text-ink"
          >
            <X size={15} />
          </button>
        </div>

        {blockLabel && (
          <p className="mb-3 text-xs text-muted-foreground">
            Dentro il blocco <span className="font-medium text-ink">{blockLabel}</span>
          </p>
        )}

        <div className="mb-4 flex rounded-xl bg-secondary p-1 text-sm font-medium">
          {tabs.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex-1 rounded-lg px-3 py-1.5 transition ${
                mode === m ? "bg-paper text-ink shadow-sm" : "text-muted-foreground"
              }`}
            >
              {tabLabel[m]}
            </button>
          ))}
        </div>

        {mode === "delivery" ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Imposta una scadenza su questo giorno per il blocco.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDelivery("luca")}
                disabled={busy}
                className="flex-1 rounded-full bg-blush px-4 py-2.5 text-sm font-medium text-blush-ink disabled:opacity-50"
              >
                Consegna Luca
              </button>
              <button
                type="button"
                onClick={() => setDelivery("matteo")}
                disabled={busy}
                className="flex-1 rounded-full bg-lavender px-4 py-2.5 text-sm font-medium text-lavender-ink disabled:opacity-50"
              >
                Consegna Matteo
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {mode === "content" && (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {FORMAT_ORDER.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFormat(f)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                        format === f
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-muted-foreground hover:text-ink"
                      }`}
                    >
                      {FORMAT_LABELS[f]}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  {(["INSTAGRAM", "YOUTUBE"] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setChannel(c)}
                      className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                        channel === c ? "bg-ink text-paper" : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {c === "INSTAGRAM" ? "Instagram" : "YouTube"}
                    </button>
                  ))}
                </div>
              </>
            )}

            {mode === "event" && (
              <div className="flex gap-1.5">
                {([
                  ["", "Nessuno"],
                  ["LUCA", "Luca"],
                  ["MATTEO", "Matteo"],
                ] as const).map(([val, lbl]) => (
                  <button
                    key={lbl}
                    type="button"
                    onClick={() => setResponsible(val)}
                    className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                      responsible === val ? "bg-ink text-paper" : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            )}

            <input
              autoFocus
              value={shown}
              onChange={(e) => {
                setTouched(true);
                setTitle(e.target.value);
              }}
              placeholder={mode === "content" ? "Nome (automatico)" : "Titolo evento"}
              className="w-full rounded-xl border border-border bg-paper px-3.5 py-2.5 text-sm outline-none focus:ring-1 focus:ring-primary/40"
            />

            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="w-full rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              Crea {mode === "content" ? "contenuto" : "evento"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
