"use server";

import { revalidatePath } from "next/cache";
import { currentContext } from "@/lib/current";
import {
  moveItem,
  deleteItem,
  addEvent,
  createBlockRange,
  type BoardItemRef,
} from "@/lib/calendar";

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
