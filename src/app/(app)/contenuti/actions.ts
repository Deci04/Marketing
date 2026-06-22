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
  setContentVideoProxy,
  setContentMasterLink,
  updateContent,
  deleteContent,
  deleteComment,
} from "@/lib/content";
import {
  createClass,
  renameClass,
  deleteClass,
  setContentClasses,
} from "@/lib/classes";
import { parseFormat } from "@/lib/format";
import type { Channel } from "@prisma/client";

export async function createContentAction(formData: FormData) {
  const ctx = await currentContext();
  if (!ctx) return;
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  const channel = String(formData.get("channel") ?? "INSTAGRAM") as Channel;
  const format = parseFormat(String(formData.get("format") ?? ""));
  const publishRaw = String(formData.get("publishAt") ?? "");
  const blockId = String(formData.get("blockId") ?? "") || null;
  const hook = String(formData.get("hook") ?? "") || null;
  const classIds = formData.getAll("classIds").map(String).filter(Boolean);
  await createContent(ctx.workspaceId, {
    title,
    channel,
    format,
    publishAt: publishRaw ? new Date(publishRaw) : null,
    blockId,
    hook,
    classIds,
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
  // F4: optionally anchor the comment to the current second of the review proxy.
  const tsRaw = String(formData.get("videoTimestamp") ?? "").trim();
  const ts = tsRaw === "" ? null : Number(tsRaw);
  const videoTimestamp = ts != null && Number.isFinite(ts) && ts >= 0 ? ts : null;
  await addComment(ctx.workspaceId, {
    authorId: ctx.user.id,
    body,
    contentId,
    videoTimestamp,
  });
  revalidatePath(`/contenuti/${contentId}`);
  revalidatePath("/contenuti");
}

/** F4: persist the URL of the compressed review proxy (uploaded client-side to Blob). */
export async function setVideoProxyAction(formData: FormData) {
  const ctx = await currentContext();
  if (!ctx) return;
  const contentId = String(formData.get("contentId") ?? "");
  const url = String(formData.get("videoProxyUrl") ?? "").trim() || null;
  if (!contentId || !url) return;
  await setContentVideoProxy(ctx.workspaceId, contentId, url);
  revalidatePath(`/contenuti/${contentId}`);
  revalidatePath("/contenuti");
}

/** F4: save/clear the external master link (Drive/iCloud) — path C. Empty clears it. */
export async function setMasterLinkAction(formData: FormData) {
  const ctx = await currentContext();
  if (!ctx) return;
  const contentId = String(formData.get("contentId") ?? "");
  if (!contentId) return;
  const link = String(formData.get("masterLink") ?? "").trim() || null;
  await setContentMasterLink(ctx.workspaceId, contentId, link);
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
  const format = parseFormat(String(formData.get("format") ?? ""));
  await updateContent(ctx.workspaceId, id, {
    ...(title ? { title } : {}),
    hook: hook || null,
    publishAt: publishRaw ? new Date(publishRaw) : null,
    format,
  });
  // Update class assignments only when the field is present in the form.
  if (formData.has("classIds")) {
    const classIds = formData.getAll("classIds").map(String).filter(Boolean);
    await setContentClasses(ctx.workspaceId, id, classIds);
  }
  revalidatePath("/contenuti");
  revalidatePath(`/contenuti/${id}`);
}

// --- Content class CRUD + assignment ---

export async function createClassAction(formData: FormData) {
  const ctx = await currentContext();
  if (!ctx) return;
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const color = String(formData.get("color") ?? "") || null;
  await createClass(ctx.workspaceId, { name, color });
  revalidatePath("/contenuti");
}

export async function renameClassAction(formData: FormData) {
  const ctx = await currentContext();
  if (!ctx) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const name = String(formData.get("name") ?? "").trim();
  const color = formData.has("color")
    ? String(formData.get("color") ?? "") || null
    : undefined;
  await renameClass(ctx.workspaceId, id, {
    ...(name ? { name } : {}),
    ...(color !== undefined ? { color } : {}),
  });
  revalidatePath("/contenuti");
}

export async function deleteClassAction(formData: FormData) {
  const ctx = await currentContext();
  if (!ctx) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await deleteClass(ctx.workspaceId, id);
  revalidatePath("/contenuti");
}

export async function setContentClassesAction(formData: FormData) {
  const ctx = await currentContext();
  if (!ctx) return;
  const contentId = String(formData.get("contentId") ?? "");
  if (!contentId) return;
  const classIds = formData.getAll("classIds").map(String).filter(Boolean);
  await setContentClasses(ctx.workspaceId, contentId, classIds);
  revalidatePath("/contenuti");
  revalidatePath(`/contenuti/${contentId}`);
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
