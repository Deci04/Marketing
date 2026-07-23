"use server";

import { revalidatePath, updateTag } from "next/cache";
import { currentContext } from "@/lib/current";
import {
  moveItem,
  deleteItem,
  deleteBlock,
  addEvent,
  createBlockRange,
  resizeBlock,
  setBlockDelivery,
  updateEventNotes,
  updateBlockNotes,
  type BoardItemRef,
} from "@/lib/calendar";
import { createContent, listContents, setBlockContents } from "@/lib/content";
import { contentsTag } from "@/lib/cache-tags";
import { createActivity } from "@/lib/activity";
import { parseFormat, FORMAT_LABELS } from "@/lib/format";
import { nextTitleForFormat, nextNumericTitle } from "@/lib/content-title";
import type { Channel } from "@prisma/client";

const toUtc = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

export async function moveItemAction(
  refType: BoardItemRef,
  refId: string,
  ymd: string
) {
  const ctx = await currentContext();
  if (!ctx || !refType || !refId || !ymd) return;
  await moveItem(ctx.workspaceId, refType, refId, toUtc(ymd));
  // moveItem may mutate Content.publishAt (refType "publication").
  updateTag(contentsTag(ctx.workspaceId));
  revalidatePath("/calendario");
}

/** Deletes a calendar item. Returns whether the delete actually happened —
 *  the board's optimistic removal needs a truthful result to know whether
 *  to roll back. */
export async function deleteItemAction(refType: BoardItemRef, refId: string): Promise<boolean> {
  const ctx = await currentContext();
  if (!ctx || !refType || !refId) return false;
  await deleteItem(ctx.workspaceId, refType, refId);
  // deleteItem may mutate Content.publishAt (refType "publication").
  updateTag(contentsTag(ctx.workspaceId));
  revalidatePath("/calendario");
  return true;
}

export async function resizeBlockAction(
  id: string,
  edge: "start" | "end",
  ymd: string
) {
  const ctx = await currentContext();
  if (!ctx || !id || !ymd) return;
  await resizeBlock(ctx.workspaceId, id, edge, toUtc(ymd));
  // resizeBlock auto-attaches contents in the new range (Content.blockId).
  updateTag(contentsTag(ctx.workspaceId));
  revalidatePath("/calendario");
  revalidatePath("/contenuti");
}

export async function addEventAction(formData: FormData) {
  const ctx = await currentContext();
  if (!ctx) return;
  const title = String(formData.get("title") ?? "").trim();
  const ymd = String(formData.get("date") ?? "").trim();
  const responsible = String(formData.get("responsible") ?? "").trim() || null;
  if (!title || !ymd) return;
  await addEvent(ctx.workspaceId, { date: toUtc(ymd), title, responsible });
  revalidatePath("/calendario");
}

/** Quick inline-edit: set (or clear) a calendar event's notes. Returns whether
 *  the save actually happened — the drawer's autosave UI needs a truthful
 *  result, not an optimistic "Salvato" when a silent `!ctx` bail happened. */
export async function updateEventNotesAction(formData: FormData): Promise<boolean> {
  const ctx = await currentContext();
  const id = String(formData.get("id") ?? "").trim();
  if (!ctx || !id) return false;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  await updateEventNotes(ctx.workspaceId, id, notes);
  revalidatePath("/calendario");
  return true;
}

/** Quick inline-edit: set (or clear) a block's notes. Returns whether the
 *  save actually happened, like its `updateEventNotesAction`/`setBlockContentsAction`
 *  siblings. */
export async function updateBlockNotesAction(formData: FormData): Promise<boolean> {
  const ctx = await currentContext();
  const id = String(formData.get("id") ?? "").trim();
  if (!ctx || !id) return false;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  await updateBlockNotes(ctx.workspaceId, id, notes);
  revalidatePath("/calendario");
  return true;
}

/** Quick-create a content directly from the calendar: publishAt = clicked day.
 *  Title optional → auto-named by type ("Reel 1", "Reel 2", …). Returns
 *  whether the create actually happened — the board's optimistic add needs
 *  a truthful result before showing the placeholder item. */
export async function addContentAction(formData: FormData): Promise<{ ok: boolean }> {
  const ctx = await currentContext();
  if (!ctx) return { ok: false };
  const ymd = String(formData.get("date") ?? "").trim();
  if (!ymd) return { ok: false };
  const channel = (String(formData.get("channel") ?? "INSTAGRAM") as Channel);
  const format = parseFormat(String(formData.get("format") ?? ""));
  let title = String(formData.get("title") ?? "").trim();
  if (!title) {
    const existing = await listContents(ctx.workspaceId);
    const titles = existing.map((c) => c.title);
    title = format ? nextTitleForFormat(titles, FORMAT_LABELS[format]) : nextNumericTitle(titles);
  }
  const created = await createContent(ctx.workspaceId, {
    title,
    channel,
    format,
    publishAt: toUtc(ymd),
  });
  await createActivity(ctx.workspaceId, {
    type: "CREATED",
    contentId: created.id,
    actorId: ctx.user.id,
  });
  updateTag(contentsTag(ctx.workspaceId));
  revalidatePath("/calendario");
  revalidatePath("/contenuti");
  revalidatePath("/home");
  return { ok: true };
}

/** Set (or clear) a block's Luca/Matteo delivery deadline (quick action).
 *  An empty date azzera la consegna. Returns whether the save actually
 *  happened — the caller needs a truthful result, not an optimistic
 *  "Consegna aggiornata" when a silent `!ctx`/bad-params bail happened. */
export async function setBlockDeliveryAction(formData: FormData): Promise<boolean> {
  const ctx = await currentContext();
  if (!ctx) return false;
  const blockId = String(formData.get("blockId") ?? "").trim();
  const who = String(formData.get("who") ?? "").trim();
  const ymd = String(formData.get("date") ?? "").trim();
  if (!blockId || (who !== "luca" && who !== "matteo")) return false;
  await setBlockDelivery(ctx.workspaceId, blockId, who, ymd ? toUtc(ymd) : null);
  // Delivery date changes the derived status of every content in the block.
  updateTag(contentsTag(ctx.workspaceId));
  revalidatePath("/calendario");
  return true;
}

/** Delete a block outright. */
export async function deleteBlockAction(formData: FormData): Promise<boolean> {
  const ctx = await currentContext();
  if (!ctx) return false;
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return false;
  const deleted = await deleteBlock(ctx.workspaceId, id);
  updateTag(contentsTag(ctx.workspaceId));
  revalidatePath("/calendario");
  revalidatePath("/contenuti");
  return deleted != null;
}

/** Re-associate a block's contents from the block-edit dialog's checklist.
 *  Returns whether the save actually happened — the dialog needs a truthful
 *  result, not an optimistic "Salvato" when a silent `!ctx`/missing-id bail happened. */
export async function setBlockContentsAction(formData: FormData): Promise<boolean> {
  const ctx = await currentContext();
  const blockId = String(formData.get("blockId") ?? "");
  if (!ctx || !blockId) return false;
  const contentIds = formData.getAll("contentIds").map(String).filter(Boolean);
  await setBlockContents(ctx.workspaceId, blockId, contentIds);
  updateTag(contentsTag(ctx.workspaceId));
  revalidatePath("/calendario");
  revalidatePath("/contenuti");
  return true;
}

/** Create a block over a date range (quick-create + "Nuovo blocco" dialog).
 *  Returns whether the create actually happened — callers need a truthful
 *  result, not an optimistic "Blocco creato" when a silent `!ctx`/missing-field
 *  bail happened. */
export async function createBlockRangeAction(formData: FormData): Promise<boolean> {
  const ctx = await currentContext();
  if (!ctx) return false;
  const label = String(formData.get("label") ?? "").trim();
  const start = String(formData.get("startDate") ?? "").trim();
  const end = String(formData.get("endDate") ?? "").trim();
  if (!label || !start || !end) return false;
  const luca = String(formData.get("lucaDeliveryAt") ?? "").trim();
  const matteo = String(formData.get("matteoDeliveryAt") ?? "").trim();
  await createBlockRange(ctx.workspaceId, {
    label,
    startDate: toUtc(start),
    endDate: toUtc(end),
    lucaDeliveryAt: luca ? toUtc(luca) : null,
    matteoDeliveryAt: matteo ? toUtc(matteo) : null,
  });
  // createBlockRange auto-attaches contents whose publishAt falls in the range.
  updateTag(contentsTag(ctx.workspaceId));
  revalidatePath("/calendario");
  revalidatePath("/contenuti");
  return true;
}
