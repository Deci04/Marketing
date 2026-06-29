"use client";

import { useState } from "react";
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
  createBlockRangeAction,
  resizeBlockAction,
} from "@/app/(app)/calendario/actions";

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
  prevHref,
  nextHref,
}: {
  monthLabel: string;
  year: number;
  weeks: Cell[][];
  items: ItemDTO[];
  blocks: BandBlock[];
  defaultResponsible?: "LUCA" | "MATTEO" | null;
  prevHref: string;
  nextHref: string;
}) {
  const router = useRouter();
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [addDay, setAddDay] = useState<string | null>(null);
  const [showBlock, setShowBlock] = useState(false);
  const [selected, setSelected] = useState<ItemDTO | null>(null);
  const [inlineDay, setInlineDay] = useState<string | null>(null);
  const [inlineTitle, setInlineTitle] = useState("");

  const quickAdd = async (ymd: string, title: string) => {
    const fd = new FormData();
    fd.set("title", title);
    fd.set("date", ymd);
    if (defaultResponsible) fd.set("responsible", defaultResponsible);
    await addEventAction(fd);
    toast.success("Evento aggiunto");
    setInlineDay(null);
    setInlineTitle("");
    router.refresh();
  };

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
        <span className="text-muted-foreground/70">· clic su un giorno per aggiungere · trascina per spostare, × per eliminare</span>
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
                      onClick={() => {
                        setInlineTitle("");
                        setInlineDay(cell.ymd);
                      }}
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
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setAddDay(cell.ymd);
                          }}
                          aria-label="Aggiungi evento (form completo)"
                          className="opacity-0 transition-opacity hover:text-ink group-hover/cell:opacity-100 text-muted-foreground"
                        >
                          <Plus size={13} weight="bold" />
                        </button>
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
                        {inlineDay === cell.ymd && (
                          <input
                            autoFocus
                            value={inlineTitle}
                            onChange={(e) => setInlineTitle(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                              if (e.key === "Escape") {
                                setInlineDay(null);
                                return;
                              }
                              if (e.key === "Enter" && inlineTitle.trim()) {
                                e.preventDefault();
                                quickAdd(cell.ymd, inlineTitle.trim());
                              }
                            }}
                            onBlur={() => {
                              if (!inlineTitle.trim()) setInlineDay(null);
                            }}
                            placeholder="Titolo + Invio"
                            className="w-full rounded-md border border-border bg-paper px-1.5 py-1 text-[11px] outline-none focus:ring-1 focus:ring-primary/40"
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {addDay && (
        <Dialog onClose={() => setAddDay(null)} title="Nuovo evento">
          <form
            action={async (fd) => {
              await addEventAction(fd);
              toast.success("Evento aggiunto");
              setAddDay(null);
              router.refresh();
            }}
            className="space-y-3"
          >
            <input type="hidden" name="date" value={addDay} />
            <Field label="Titolo">
              <input name="title" required placeholder="Es. Call di redazione" className={inputCls} />
            </Field>
            <Field label="Data">
              <input type="date" name="date" defaultValue={addDay} className={inputCls} />
            </Field>
            <Field label="Responsabile">
              <select name="responsible" defaultValue="" className={inputCls}>
                <option value="">Nessuno</option>
                <option value="LUCA">Luca</option>
                <option value="MATTEO">Matteo</option>
              </select>
            </Field>
            <DialogActions onCancel={() => setAddDay(null)} submitLabel="Aggiungi" />
          </form>
        </Dialog>
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
