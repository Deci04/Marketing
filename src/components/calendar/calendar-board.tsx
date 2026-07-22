"use client";

import { useState, useEffect, useRef } from "react";
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
  updateEventNotesAction,
  updateBlockNotesAction,
  setBlockContentsAction,
} from "@/app/(app)/calendario/actions";
import { updateContentFieldsAction } from "@/app/(app)/contenuti/actions";
import { blockCandidateContents } from "@/lib/block-select";
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
  title?: string;
  notes?: string | null;
};
type BandBlock = { id: string; label: string; start: string; end: string; notes: string | null };
type ContentDTO = { id: string; title: string; publishAt: string | null; blockId: string | null };

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

function deleteToastLabel(it: ItemDTO) {
  if (it.refType === "publication") return "Contenuto rimosso dal calendario";
  if (it.refType === "luca" || it.refType === "matteo") return "Scadenza rimossa";
  return "Evento rimosso";
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
  items: initialItems,
  blocks: initialBlocks,
  contents = [],
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
  contents?: ContentDTO[];
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
  const [editBlock, setEditBlock] = useState<{ id: string; label: string; start: string; end: string } | null>(null);
  // Checklist of contents falling in the block's period, default-checked; the
  // user can deselect. Recomputed (during render, not an effect) whenever a
  // different block dialog opens — `checkedForBlock` tracks which block the
  // current `checkedIds` snapshot belongs to.
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [checkedForBlock, setCheckedForBlock] = useState<string | null>(null);
  const blockContents = editBlock ? blockCandidateContents(contents, editBlock) : [];
  if (editBlock && checkedForBlock !== editBlock.id) {
    setCheckedForBlock(editBlock.id);
    setCheckedIds(new Set(blockContents.map((c) => c.id)));
  }
  const closeEditBlock = () => {
    setEditBlock(null);
    setCheckedForBlock(null);
  };
  const toggleContentChecked = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const saveBlockContents = async () => {
    if (!editBlock) return;
    const fd = new FormData();
    fd.set("blockId", editBlock.id);
    for (const id of checkedIds) fd.append("contentIds", id);
    const ok = await setBlockContentsAction(fd);
    if (ok) {
      toast.success("Blocco aggiornato");
      closeEditBlock();
      router.refresh();
    } else {
      toast.error("Non salvato, riprova");
    }
  };
  // Local item state so the drawer's quick-edit (title/notes) can update the
  // chip optimistically without a blocking `router.refresh()`. Resynced when
  // the server-provided items change (navigation, revalidate) — adjusted
  // during render rather than in an effect (avoids an extra render pass).
  const [items, setItems] = useState(initialItems);
  const [syncedItems, setSyncedItems] = useState(initialItems);
  if (initialItems !== syncedItems) {
    setSyncedItems(initialItems);
    setItems(initialItems);
  }
  // Stable, non-colliding suffix for optimistic item ids (quick-create) —
  // avoids Math.random()/Date.now() for React keys.
  const optimisticIdRef = useRef(0);

  // Local block state so the block-notes onBlur save can update the note
  // in place (reopening the same block in the same session shouldn't show a
  // stale value). Resynced when the server-provided blocks change, same
  // pattern as `items`/`syncedItems` above.
  const [blocks, setBlocks] = useState(initialBlocks);
  const [syncedBlocks, setSyncedBlocks] = useState(initialBlocks);
  if (initialBlocks !== syncedBlocks) {
    setSyncedBlocks(initialBlocks);
    setBlocks(initialBlocks);
  }

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

  // Delete feels instant: remove the item from local state right away and
  // only fall back to a rollback (re-inserting it) if the server call fails.
  // No `router.refresh()` on success — the revalidate from the action already
  // covers the next navigation, and local state is already correct.
  const onDelete = async (it: ItemDTO) => {
    setItems((list) => list.filter((i) => !(i.refId === it.refId && i.refType === it.refType)));
    setSelected((s) => (s && s.refId === it.refId && s.refType === it.refType ? null : s));
    const ok = await deleteItemAction(it.refType, it.refId);
    if (ok) {
      toast.success(deleteToastLabel(it));
    } else {
      setItems((list) => [...list, it]);
      toast.error("Non eliminato, riprova");
    }
  };

  // Drawer quick-edit (title/notes): local, discreet save status — no toast
  // per keystroke/blur, just a small "Salvato ✓" / "Errore, riprova" hint.
  // Reset when a different item is selected (adjusted during render, not an effect).
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const selectedKey = selected ? `${selected.refType}:${selected.refId}` : null;
  const [statusKey, setStatusKey] = useState<string | null>(selectedKey);
  if (selectedKey !== statusKey) {
    setStatusKey(selectedKey);
    setStatus("idle");
  }

  const saveContentField = async (field: "title" | "notes", value: string) => {
    if (!selected) return;
    const { refId, refType } = selected;
    const fd = new FormData();
    fd.set("id", refId);
    fd.set(field, value);
    setStatus("saving");
    const ok = await updateContentFieldsAction(fd);
    if (ok) {
      setSelected((s) => (s ? { ...s, [field]: value, label: field === "title" ? value : s.label } : s));
      setItems((list) =>
        list.map((i) =>
          i.refId === refId && i.refType === refType
            ? { ...i, [field]: value, label: field === "title" ? value : i.label }
            : i
        )
      );
      setStatus("saved");
    } else {
      setStatus("error");
    }
  };

  const saveEventNotes = async (value: string) => {
    if (!selected) return;
    const { refId, refType } = selected;
    const fd = new FormData();
    fd.set("id", refId);
    fd.set("notes", value);
    setStatus("saving");
    const ok = await updateEventNotesAction(fd);
    if (ok) {
      setSelected((s) => (s ? { ...s, notes: value } : s));
      setItems((list) =>
        list.map((i) => (i.refId === refId && i.refType === refType ? { ...i, notes: value } : i))
      );
      setStatus("saved");
    } else {
      setStatus("error");
    }
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
        <span className="text-muted-foreground/70">· clic su un giorno per creare contenuto o evento<span className="hidden md:inline"> · trascina per spostare, × per eliminare</span></span>
      </div>

      {/* --- Mobile: vista agenda (la griglia 7-col è illeggibile su schermo stretto) --- */}
      <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card md:hidden">
        {weeks
          .flat()
          .filter((c) => c.inMonth)
          .map((cell) => {
            const dayItems = byDay.get(cell.ymd) ?? [];
            const wd = new Date(cell.ymd + "T00:00:00.000Z").getUTCDay();
            const dow = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"][wd];
            const block = blocks.find((b) => cell.ymd >= b.start && cell.ymd <= b.end);
            return (
              <div key={cell.ymd} className={cell.isToday ? "bg-primary/5" : ""}>
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <button
                    onClick={() => setInlineDay(cell.ymd)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span className="w-9 shrink-0 text-center">
                      <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">{dow}</span>
                      <span
                        className={`block text-lg leading-tight ${
                          cell.isToday ? "font-bold text-primary" : "text-ink"
                        }`}
                      >
                        {cell.day}
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      {block && (
                        <span className="block truncate text-[11px] text-muted-foreground">Blocco · {block.label}</span>
                      )}
                      {dayItems.length === 0 && !block && (
                        <span className="text-xs text-muted-foreground/50">Tocca per aggiungere</span>
                      )}
                    </span>
                  </button>
                  <button
                    onClick={() => setInlineDay(cell.ymd)}
                    aria-label="Aggiungi in questo giorno"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-paper text-ink/60 active:scale-95"
                  >
                    <Plus size={15} weight="bold" />
                  </button>
                </div>
                {dayItems.length > 0 && (
                  <div className="space-y-1.5 px-3 pb-3 pl-[3.75rem]">
                    {dayItems.map((it) => {
                      const Logo = it.channel === "YOUTUBE" ? YoutubeLogo : InstagramLogo;
                      return (
                        <button
                          key={`${it.refType}:${it.refId}`}
                          onClick={() => setSelected(it)}
                          className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium ${chipTone(it)}`}
                          title={it.label}
                        >
                          {it.channel && <Logo size={13} weight="fill" className="shrink-0" />}
                          <span className="min-w-0 flex-1 truncate">{cleanTitle(it)}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
      </div>

      <div className="hidden overflow-hidden rounded-2xl border border-border bg-card md:block">
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
                      onClick={() => {
                        const band = blocks.find((b) => b.id === seg.id);
                        if (band) setEditBlock({ id: band.id, label: band.label, start: band.start, end: band.end });
                      }}
                      className="relative cursor-pointer truncate rounded-md border border-border bg-secondary px-3 py-0.5 text-[11px] font-medium text-ink/70 hover:bg-secondary/70"
                    >
                      {seg.startsHere && (
                        <span
                          draggable
                          onClick={(e) => e.stopPropagation()}
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
                          onClick={(e) => e.stopPropagation()}
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
          onCreated={(optimistic) => {
            if (optimistic) {
              optimisticIdRef.current += 1;
              setItems((list) => [
                ...list,
                {
                  refType: "publication",
                  refId: `optimistic-${optimisticIdRef.current}`,
                  ymd: optimistic.ymd,
                  label: optimistic.title,
                  title: optimistic.title,
                  notes: null,
                  owner: "Matteo",
                  channel: optimistic.channel,
                  href: null,
                },
              ]);
            }
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

      {editBlock &&
        (() => {
          const bandNotes = blocks.find((b) => b.id === editBlock.id)?.notes ?? null;
          return (
            <Dialog onClose={closeEditBlock} title={`Blocco · ${editBlock.label}`}>
              <div className="space-y-4">
                <Field label="Note per Luca">
                  <textarea
                    key={`block-notes-${editBlock.id}`}
                    defaultValue={bandNotes ?? ""}
                    rows={3}
                    placeholder="Cosa consegnare a Luca…"
                    onBlur={async (e) => {
                      const blockId = editBlock.id;
                      const fd = new FormData();
                      fd.set("id", blockId);
                      fd.set("notes", e.target.value);
                      const ok = await updateBlockNotesAction(fd);
                      if (ok) {
                        const notes = e.target.value.trim() || null;
                        setBlocks((prev) =>
                          prev.map((b) => (b.id === blockId ? { ...b, notes } : b))
                        );
                      }
                    }}
                    className={`w-full resize-none ${inputCls}`}
                  />
                </Field>

                <div>
                  <span className="mb-1.5 block text-xs text-muted-foreground">
                    Contenuti nel periodo
                  </span>
                  {blockContents.length === 0 ? (
                    <p className="text-xs text-muted-foreground/70">Nessun contenuto in questo periodo.</p>
                  ) : (
                    <ul className="max-h-64 space-y-1 overflow-y-auto">
                      {blockContents.map((c) => (
                        <li key={c.id}>
                          <label className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-secondary/70">
                            <input
                              type="checkbox"
                              checked={checkedIds.has(c.id)}
                              onChange={() => toggleContentChecked(c.id)}
                              className="h-4 w-4 shrink-0 rounded border-border"
                            />
                            <span className="min-w-0 flex-1 truncate">{c.title}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={saveBlockContents}
                    className="rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
                  >
                    Salva
                  </button>
                  <button
                    type="button"
                    onClick={closeEditBlock}
                    className="rounded-full border border-border px-4 py-2.5 text-sm text-muted-foreground hover:bg-secondary"
                  >
                    Annulla
                  </button>
                </div>
              </div>
            </Dialog>
          );
        })()}

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
                  className="absolute inset-x-3 bottom-3 top-3 flex flex-col overflow-y-auto rounded-3xl border border-border bg-paper p-5 shadow-[0_24px_60px_rgba(26,24,19,0.22)] md:left-auto md:right-3 md:w-80"
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

                  {selected.refType === "publication" ? (
                    <input
                      key={`title-${selected.refId}`}
                      defaultValue={selected.title ?? cleanTitle(selected)}
                      placeholder="Nome"
                      onBlur={(e) => saveContentField("title", e.target.value.trim())}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
                      }}
                      className={`mt-3 font-heading text-lg ${inputCls}`}
                    />
                  ) : (
                    <h3 className="mt-3 font-heading text-xl text-ink">{cleanTitle(selected)}</h3>
                  )}

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
                    {(selected.refType === "publication" || selected.refType === "event") && (
                      <div>
                        <dt className="text-xs text-muted-foreground">Note</dt>
                        <dd className="mt-1">
                          <textarea
                            key={`notes-${selected.refId}`}
                            defaultValue={selected.notes ?? ""}
                            rows={3}
                            placeholder="Aggiungi una nota…"
                            onBlur={(e) =>
                              selected.refType === "publication"
                                ? saveContentField("notes", e.target.value)
                                : saveEventNotes(e.target.value)
                            }
                            className={`w-full resize-none ${inputCls}`}
                          />
                        </dd>
                      </div>
                    )}
                  </dl>

                  {status !== "idle" && (
                    <p
                      className={`mt-2 text-xs transition-opacity ${
                        status === "error" ? "text-coral-ink" : "text-muted-foreground"
                      }`}
                    >
                      {status === "saving" ? "Salvataggio…" : status === "saved" ? "Salvato ✓" : "Errore, riprova"}
                    </p>
                  )}

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
  onCreated: (optimistic?: { ymd: string; title: string; channel: "INSTAGRAM" | "YOUTUBE" | null }) => void;
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
      const finalTitle = shown.trim();
      fd.set("title", finalTitle);
      fd.set("channel", channel);
      if (format) fd.set("format", format);
      const { ok } = await addContentAction(fd);
      if (ok) {
        toast.success("Contenuto creato");
        onCreated({ ymd: day, title: finalTitle, channel });
      } else {
        setBusy(false);
        toast.error("Non creato, riprova");
      }
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
