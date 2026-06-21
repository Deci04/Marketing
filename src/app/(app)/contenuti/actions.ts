"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { put } from "@vercel/blob";
import { currentContext } from "@/lib/current";
import {
  createBlock,
  createContent,
  addComment,
  setContentThumbnail,
  updateContent,
  deleteContent,
  deleteComment,
} from "@/lib/content";
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
  revalidatePath("/contenuti");
}

export async function updateContentAction(formData: FormData) {
  const ctx = await currentContext();
  if (!ctx) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const title = String(formData.get("title") ?? "").trim();
  const hook = String(formData.get("hook") ?? "").trim();
  const publishRaw = String(formData.get("publishAt") ?? "").trim();
  await updateContent(ctx.workspaceId, id, {
    ...(title ? { title } : {}),
    hook: hook || null,
    publishAt: publishRaw ? new Date(publishRaw) : null,
  });
  revalidatePath("/contenuti");
  revalidatePath(`/contenuti/${id}`);
}

export async function deleteContentAction(formData: FormData) {
  const ctx = await currentContext();
  if (!ctx) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await deleteContent(ctx.workspaceId, id);
  revalidatePath("/contenuti");
  redirect("/contenuti");
}

export async function deleteCommentAction(id: string, contentId: string) {
  const ctx = await currentContext();
  if (!ctx || !id) return;
  await deleteComment(ctx.workspaceId, id);
  revalidatePath(`/contenuti/${contentId}`);
  revalidatePath("/contenuti");
}

export async function setThumbnailAction(formData: FormData) {
  const ctx = await currentContext();
  if (!ctx) return;
  const contentId = String(formData.get("contentId") ?? "");
  if (!contentId) return;

  let finalUrl = String(formData.get("thumbnailUrl") ?? "").trim() || null;
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    const blob = await put(`thumbnails/${contentId}-${file.name}`, file, {
      access: "public",
      addRandomSuffix: true,
    });
    finalUrl = blob.url;
  }
  if (!finalUrl) return;

  await setContentThumbnail(ctx.workspaceId, contentId, finalUrl);
  revalidatePath(`/contenuti/${contentId}`);
  revalidatePath("/contenuti");
}
