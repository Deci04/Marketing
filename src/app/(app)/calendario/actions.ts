"use server";

import { revalidatePath } from "next/cache";
import { currentContext } from "@/lib/current";
import {
  moveItem,
  deleteItem,
  addEvent,
  createBlockRange,
  resizeBlock,
  setBlockDelivery,
  type BoardItemRef,
} from "@/lib/calendar";
import { createContent, listContents } from "@/lib/content";
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
  revalidatePath("/calendario");
}

export async function deleteItemAction(refType: BoardItemRef, refId: string) {
  const ctx = await currentContext();
  if (!ctx || !refType || !refId) return;
  await deleteItem(ctx.workspaceId, refType, refId);
  revalidatePath("/calendario");
}

export async function resizeBlockAction(
  id: string,
  edge: "start" | "end",
  ymd: string
) {
  const ctx = await currentContext();
  if (!ctx || !id || !ymd) return;
  await resizeBlock(ctx.workspaceId, id, edge, toUtc(ymd));
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

/** Quick-create a content directly from the calendar: publishAt = clicked day.
 *  Title optional → auto-named by type ("Reel 1", "Reel 2", …). */
export async function addContentAction(formData: FormData) {
  const ctx = await currentContext();
  if (!ctx) return;
  const ymd = String(formData.get("date") ?? "").trim();
  if (!ymd) return;
  const channel = (String(formData.get("channel") ?? "INSTAGRAM") as Channel);
  const format = parseFormat(String(formData.get("format") ?? ""));
  let title = String(formData.get("title") ?? "").trim();
  if (!title) {
    const existing = await listContents(ctx.workspaceId);
    const titles = existing.map((c) => c.title);
    title = format ? nextTitleForFormat(titles, FORMAT_LABELS[format]) : nextNumericTitle(titles);
  }
  await createContent(ctx.workspaceId, {
    title,
    channel,
    format,
    publishAt: toUtc(ymd),
  });
  revalidatePath("/calendario");
  revalidatePath("/contenuti");
}

/** Set a block's Luca/Matteo delivery deadline to a given day (quick action). */
export async function setBlockDeliveryAction(formData: FormData) {
  const ctx = await currentContext();
  if (!ctx) return;
  const blockId = String(formData.get("blockId") ?? "").trim();
  const who = String(formData.get("who") ?? "").trim();
  const ymd = String(formData.get("date") ?? "").trim();
  if (!blockId || !ymd || (who !== "luca" && who !== "matteo")) return;
  await setBlockDelivery(ctx.workspaceId, blockId, who, toUtc(ymd));
  revalidatePath("/calendario");
}

export async function createBlockRangeAction(formData: FormData) {
  const ctx = await currentContext();
  if (!ctx) return;
  const label = String(formData.get("label") ?? "").trim();
  const start = String(formData.get("startDate") ?? "").trim();
  const end = String(formData.get("endDate") ?? "").trim();
  if (!label || !start || !end) return;
  const luca = String(formData.get("lucaDeliveryAt") ?? "").trim();
  const matteo = String(formData.get("matteoDeliveryAt") ?? "").trim();
  await createBlockRange(ctx.workspaceId, {
    label,
    startDate: toUtc(start),
    endDate: toUtc(end),
    lucaDeliveryAt: luca ? toUtc(luca) : null,
    matteoDeliveryAt: matteo ? toUtc(matteo) : null,
  });
  revalidatePath("/calendario");
  revalidatePath("/contenuti");
}
