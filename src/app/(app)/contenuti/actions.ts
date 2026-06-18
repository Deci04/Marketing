"use server";

import { revalidatePath } from "next/cache";
import { currentContext } from "@/lib/current";
import { createBlock, createContent, addComment } from "@/lib/content";
import type { Channel } from "@prisma/client";

export async function createContentAction(formData: FormData) {
  const ctx = await currentContext();
  if (!ctx) return;
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  const channel = String(formData.get("channel") ?? "INSTAGRAM") as Channel;
  const publishRaw = String(formData.get("publishAt") ?? "");
  const blockId = String(formData.get("blockId") ?? "") || null;
  const hook = String(formData.get("hook") ?? "") || null;
  await createContent(ctx.workspaceId, {
    title,
    channel,
    publishAt: publishRaw ? new Date(publishRaw) : null,
    blockId,
    hook,
  });
  revalidatePath("/contenuti");
}

export async function createBlockAction(formData: FormData) {
  const ctx = await currentContext();
  if (!ctx) return;
  const label = String(formData.get("label") ?? "").trim();
  if (!label) return;
  const luca = String(formData.get("lucaDeliveryAt") ?? "");
  const matteo = String(formData.get("matteoDeliveryAt") ?? "");
  await createBlock(ctx.workspaceId, {
    label,
    lucaDeliveryAt: luca ? new Date(luca) : null,
    matteoDeliveryAt: matteo ? new Date(matteo) : null,
  });
  revalidatePath("/contenuti");
}

export async function addCommentAction(formData: FormData) {
  const ctx = await currentContext();
  if (!ctx) return;
  const body = String(formData.get("body") ?? "").trim();
  const contentId = String(formData.get("contentId") ?? "") || null;
  if (!body || !contentId) return;
  await addComment(ctx.workspaceId, { authorId: ctx.user.id, body, contentId });
  revalidatePath(`/contenuti/${contentId}`);
}
