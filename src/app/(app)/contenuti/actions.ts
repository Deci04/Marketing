"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { put } from "@vercel/blob";
import { currentContext } from "@/lib/current";
import {
  createBlock,
  createContent,
  listContents,
  addComment,
  setContentThumbnail,
  setContentVideoProxy,
  setContentMasterLink,
  updateContent,
  deleteContent,
  deleteComment,
  addMaterial,
  removeMaterial,
  reorderMaterials,
  setDelivered,
  setConfirmed,
  contentHasMontato,
  setNotificationsSeen,
  setContentStatus,
} from "@/lib/content";
import { isDerivedStatus } from "@/lib/status";
import { createActivity } from "@/lib/activity";
import {
  createClass,
  renameClass,
  deleteClass,
  setContentClasses,
} from "@/lib/classes";
import { parseFormat } from "@/lib/format";
import { nextNumericTitle } from "@/lib/content-title";
import type { Channel } from "@prisma/client";

export async function createContentAction(formData: FormData) {
  const ctx = await currentContext();
  if (!ctx) return;
  // Title optional: when empty, auto-assign the next free numeric name (editable later).
  let title = String(formData.get("title") ?? "").trim();
  if (!title) {
    const existing = await listContents(ctx.workspaceId);
    title = nextNumericTitle(existing.map((c) => c.title));
  }
  const channel = String(formData.get("channel") ?? "INSTAGRAM") as Channel;
  const format = parseFormat(String(formData.get("format") ?? ""));
  const publishRaw = String(formData.get("publishAt") ?? "");
  const blockId = String(formData.get("blockId") ?? "") || null;
  const hook = String(formData.get("hook") ?? "") || null;
  const classIds = formData.getAll("classIds").map(String).filter(Boolean);
  const created = await createContent(ctx.workspaceId, {
    title,
    channel,
    format,
    publishAt: publishRaw ? new Date(publishRaw) : null,
    blockId,
    hook,
    classIds,
  });
  await createActivity(ctx.workspaceId, {
    type: "CREATED",
    contentId: created.id,
    actorId: ctx.user.id,
  });
  revalidatePath("/contenuti");
  revalidatePath("/home");
}

// --- Collaboration lifecycle actions ---

/** Luca: mark the material delivered (+ optional Drive/iCloud link). */
export async function markDeliveredAction(formData: FormData) {
  const ctx = await currentContext();
  if (!ctx) return;
  const contentId = String(formData.get("contentId") ?? "").trim();
  if (!contentId) return;
  const link = String(formData.get("masterLink") ?? "").trim() || null;
  await setDelivered(ctx.workspaceId, contentId, link);
  await createActivity(ctx.workspaceId, {
    type: "DELIVERED",
    contentId,
    actorId: ctx.user.id,
  });
  revalidatePath(`/contenuti/${contentId}`);
  revalidatePath("/contenuti");
  revalidatePath("/home");
}

/** Luca: confirm the montato. */
export async function confirmContentAction(formData: FormData) {
  const ctx = await currentContext();
  if (!ctx) return;
  const contentId = String(formData.get("contentId") ?? "").trim();
  if (!contentId) return;
  await setConfirmed(ctx.workspaceId, contentId);
  await createActivity(ctx.workspaceId, {
    type: "CONFIRMED",
    contentId,
    actorId: ctx.user.id,
  });
  revalidatePath(`/contenuti/${contentId}`);
  revalidatePath("/contenuti");
  revalidatePath("/home");
}

/** Force/clear a content's status manually. Empty value → back to auto. */
export async function setContentStatusAction(formData: FormData) {
  const ctx = await currentContext();
  if (!ctx) return;
  const contentId = String(formData.get("contentId") ?? "").trim();
  if (!contentId) return;
  const raw = String(formData.get("status") ?? "").trim();
  const status = raw && isDerivedStatus(raw) ? raw : null;
  await setContentStatus(ctx.workspaceId, contentId, status);
  revalidatePath("/contenuti");
  revalidatePath(`/contenuti/${contentId}`);
  revalidatePath("/archivio");
  revalidatePath("/home");
}

/** Mark the activity feed as seen for the current user (clears the unread count). */
export async function markNotificationsSeenAction() {
  const ctx = await currentContext();
  if (!ctx) return;
  await setNotificationsSeen(ctx.user.id);
  revalidatePath("/");
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
  await createActivity(ctx.workspaceId, {
    type: "COMMENT",
    contentId,
    actorId: ctx.user.id,
  });
  revalidatePath(`/contenuti/${contentId}`);
  revalidatePath("/contenuti");
  revalidatePath("/home");
}

/**
 * F4 (second half): save a voice-note comment. The audio blob is recorded in the
 * browser (`MediaRecorder`) and uploaded client-side to Vercel Blob; here we only
 * persist its URL as `Comment.audioUrl`, optionally anchored to the current second
 * of the review proxy (same `videoTimestamp` mechanism as text comments). `body`
 * is stored empty — the audio IS the message.
 */
export async function addAudioCommentAction(formData: FormData) {
  const ctx = await currentContext();
  if (!ctx) return;
  const contentId = String(formData.get("contentId") ?? "") || null;
  const audioUrl = String(formData.get("audioUrl") ?? "").trim();
  if (!contentId || !audioUrl) return;
  const tsRaw = String(formData.get("videoTimestamp") ?? "").trim();
  const ts = tsRaw === "" ? null : Number(tsRaw);
  const videoTimestamp = ts != null && Number.isFinite(ts) && ts >= 0 ? ts : null;
  await addComment(ctx.workspaceId, {
    authorId: ctx.user.id,
    body: "",
    contentId,
    audioUrl,
    videoTimestamp,
  });
  await createActivity(ctx.workspaceId, {
    type: "COMMENT",
    contentId,
    actorId: ctx.user.id,
  });
  revalidatePath(`/contenuti/${contentId}`);
  revalidatePath("/contenuti");
  revalidatePath("/home");
}

/** F4: persist the URL of the compressed review proxy (uploaded client-side to Blob). */
export async function setVideoProxyAction(formData: FormData) {
  const ctx = await currentContext();
  if (!ctx) return;
  const contentId = String(formData.get("contentId") ?? "");
  const url = String(formData.get("videoProxyUrl") ?? "").trim() || null;
  if (!contentId || !url) return;
  const hadMontato = await contentHasMontato(ctx.workspaceId, contentId);
  await setContentVideoProxy(ctx.workspaceId, contentId, url);
  if (!hadMontato) {
    await createActivity(ctx.workspaceId, {
      type: "REVIEW_READY",
      contentId,
      actorId: ctx.user.id,
    });
  }
  revalidatePath(`/contenuti/${contentId}`);
  revalidatePath("/contenuti");
  revalidatePath("/home");
}

/** Materiali — aggiungi un materiale (foto o video) già caricato su Blob. */
export async function addMaterialAction(formData: FormData) {
  const ctx = await currentContext();
  if (!ctx) throw new Error("Non autorizzato");
  const contentId = String(formData.get("contentId") ?? "");
  const kind = String(formData.get("kind") ?? "");
  const url = String(formData.get("url") ?? "").trim();
  if (!contentId || !url || (kind !== "image" && kind !== "video")) {
    throw new Error("Dati materiale non validi");
  }
  const hadMontato = await contentHasMontato(ctx.workspaceId, contentId);
  await addMaterial(ctx.workspaceId, contentId, kind, url);
  if (!hadMontato) {
    await createActivity(ctx.workspaceId, {
      type: "REVIEW_READY",
      contentId,
      actorId: ctx.user.id,
    });
  }
  revalidatePath(`/contenuti/${contentId}`);
  revalidatePath("/contenuti");
  revalidatePath("/home");
}

/** Materiali — rimuovi un materiale. */
export async function removeMaterialAction(materialId: string, contentId: string) {
  const ctx = await currentContext();
  if (!ctx) throw new Error("Non autorizzato");
  await removeMaterial(ctx.workspaceId, materialId);
  revalidatePath(`/contenuti/${contentId}`);
  revalidatePath("/contenuti");
}

/** Materiali — riordina (orderedIds separati da virgola). */
export async function reorderMaterialsAction(formData: FormData) {
  const ctx = await currentContext();
  if (!ctx) throw new Error("Non autorizzato");
  const contentId = String(formData.get("contentId") ?? "");
  const ids = String(formData.get("orderedIds") ?? "")
    .split(",")
    .filter(Boolean);
  if (!contentId || ids.length === 0) return;
  await reorderMaterials(ctx.workspaceId, contentId, ids);
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
