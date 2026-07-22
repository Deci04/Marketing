"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { put, del } from "@vercel/blob";
import { currentContext } from "@/lib/current";
import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/workspace";
import { publish, isConfigured } from "@/lib/zernio";
import {
  createBlock,
  createContent,
  listContents,
  addComment,
  setContentThumbnail,
  setContentVideoProxy,
  setContentMasterLink,
  updateContent,
  buildContentPatch,
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
  setMaterialDriveFileId,
} from "@/lib/content";
import { archiveBlobUrlToDrive } from "@/lib/drive-archive";
import { ensureDriveFolders } from "@/lib/drive-folders";
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
  const notes = String(formData.get("notes") ?? "") || null;
  const classIds = formData.getAll("classIds").map(String).filter(Boolean);
  const created = await createContent(ctx.workspaceId, {
    title,
    channel,
    format,
    publishAt: publishRaw ? new Date(publishRaw) : null,
    blockId,
    notes,
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

/** Luca: mark an entire block delivered in one tap — every content in the
 *  block still "da consegnare" (deliveredAt == null) gets delivered. Powers
 *  the "Ho consegnato" CTA on the per-block home notification. */
export async function markBlockDeliveredAction(formData: FormData) {
  const ctx = await currentContext();
  if (!ctx) return;
  const blockId = String(formData.get("blockId") ?? "").trim();
  if (!blockId) return;
  // Solo i content del blocco davvero "da consegnare" (stage DaConsegnare):
  // non ancora consegnati, non confermati e non montati — così "Ho consegnato"
  // non tocca un montato già in revisione (niente attività/push spurie).
  const rows = await db.content.findMany({
    where: scopedWhere(ctx.workspaceId, {
      blockId,
      deliveredAt: null,
      confirmedAt: null,
      videoProxyUrl: null,
      materials: { none: {} },
    }),
    select: { id: true },
  });
  for (const r of rows) {
    await setDelivered(ctx.workspaceId, r.id);
    await createActivity(ctx.workspaceId, { type: "DELIVERED", contentId: r.id, actorId: ctx.user.id });
  }
  revalidatePath("/home");
  revalidatePath("/contenuti");
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

/**
 * Filone W — Pubblicazione via Zernio (solo admin).
 *
 * Da un contenuto CONFERMATO: risolve l'ORIGINALE a piena qualità (mai il proxy),
 * pubblica via Zernio e, al successo, salva `externalId` + `publishState="published"`.
 *
 * Sorgente originale (in ordine): un originale caricato su Blob al momento del
 * publish (`originalUrl`), altrimenti `Content.masterLink` (Drive/iCloud). Il
 * `videoProxyUrl` NON viene MAI usato: non è nemmeno letto per il mediaUrl.
 *
 * Ciclo di vita file: al successo, se avevamo caricato l'originale su Blob lo
 * cancelliamo (resta solo il proxy). Su errore → `publishState="failed"` +
 * `publishError`, e l'originale resta per il retry (nessuna cancellazione).
 */
export async function publishContentAction(
  formData: FormData
): Promise<{ ok: boolean; error?: string; externalId?: string }> {
  const ctx = await currentContext();
  if (!ctx) return { ok: false, error: "Non autorizzato" };
  // Solo admin può pubblicare.
  if (!ctx.user.isAdmin)
    return { ok: false, error: "Solo l'admin può pubblicare" };

  const contentId = String(formData.get("contentId") ?? "").trim();
  if (!contentId) return { ok: false, error: "Contenuto mancante" };

  const platforms = formData.getAll("platforms").map(String).filter(Boolean);
  if (platforms.length === 0)
    return { ok: false, error: "Seleziona almeno una piattaforma" };

  // Originale caricato su Blob al momento del publish (client→Blob), opzionale.
  const uploadedOriginalUrl =
    String(formData.get("originalUrl") ?? "").trim() || null;
  const scheduledRaw = String(formData.get("scheduledAt") ?? "").trim();
  const scheduledAt = scheduledRaw ? new Date(scheduledRaw) : undefined;

  const content = await db.content.findFirst({
    where: scopedWhere(ctx.workspaceId, { id: contentId }),
    select: {
      id: true,
      title: true,
      hook: true,
      masterLink: true,
      confirmedAt: true,
      // NB: videoProxyUrl NON entra nella risoluzione del mediaUrl.
    },
  });
  if (!content) return { ok: false, error: "Contenuto non trovato" };
  // Si pubblica solo un contenuto confermato.
  if (!content.confirmedAt)
    return { ok: false, error: "Il contenuto non è confermato" };

  // Risoluzione ORIGINALE a piena qualità — mai il proxy.
  const mediaUrl = uploadedOriginalUrl ?? content.masterLink ?? null;

  // Guardrail: senza originale non si pubblica (originale conservato per retry).
  if (!mediaUrl) {
    await db.content.update({
      where: { id: content.id },
      data: {
        publishState: "failed",
        publishError: "Manca l'originale a piena qualità",
      },
    });
    revalidatePath(`/contenuti/${content.id}`);
    revalidatePath("/contenuti");
    return {
      ok: false,
      error:
        "Manca l'originale a piena qualità: carica l'originale o aggiungi il link al master.",
    };
  }

  if (!isConfigured())
    return { ok: false, error: "Zernio non configurato" };

  // Claim atomico: passa a publishing/scheduled SOLO da uno stato ripubblicabile
  // (mai-pubblicato = null, oppure failed/scheduled). Blocca la ri-pubblicazione di
  // un post già "published" (che sovrascriverebbe externalId perdendo l'aggancio KPI
  // del post originale) e il doppio-submit concorrente (nessun unique su externalId).
  // NB: `in: [null, ...]` in SQL non matcha NULL → serve la forma OR esplicita.
  const claimed = await db.content.updateMany({
    where: scopedWhere(ctx.workspaceId, {
      id: content.id,
      OR: [
        { publishState: null },
        { publishState: { in: ["failed", "scheduled"] } },
      ],
    }),
    data: {
      publishState: scheduledAt ? "scheduled" : "publishing",
      publishError: null,
    },
  });
  if (claimed.count === 0)
    return { ok: false, error: "Contenuto già pubblicato o in pubblicazione" };

  const result = await publish({
    workspaceId: ctx.workspaceId,
    contentId: content.id,
    platforms,
    mediaUrl,
    caption: content.hook ?? content.title,
    scheduledAt,
  });

  if ("error" in result) {
    // Su errore: failed + messaggio, originale conservato (nessun del).
    await db.content.update({
      where: { id: content.id },
      data: { publishState: "failed", publishError: result.error },
    });
    revalidatePath(`/contenuti/${content.id}`);
    revalidatePath("/contenuti");
    return { ok: false, error: result.error };
  }

  // Successo: salva externalId + stato; aggancio KPI per-post automatico (Z).
  await db.content.update({
    where: { id: content.id },
    data: {
      externalId: result.externalId,
      publishState: scheduledAt ? "scheduled" : "published",
      publishError: null,
      // Workflow: una pubblicazione immediata sposta il contenuto a "Pubblicato"
      // (override esplicito e reversibile). I programmati seguono `publishAt`.
      ...(scheduledAt ? {} : { statusOverride: "Pubblicato" }),
    },
  });

  // Archivia su Drive l'originale caricato al momento del publish, se presente,
  // indipendentemente da scheduledAt (anche i programmati vanno archiviati:
  // il Blob per quelli non viene cancellato subito, ma l'archivio è comunque utile).
  // Best-effort: il post è già pubblicato, un fallimento qui non deve bloccare nulla.
  let archivedOriginal = false;
  if (uploadedOriginalUrl) {
    try {
      const folders = await ensureDriveFolders();
      const driveFileId = await archiveBlobUrlToDrive({
        url: uploadedOriginalUrl,
        name: `${content.title || content.id}-original`,
        mimeType: "video/mp4",
        folderId: folders?.editatiFolderId, // originale pubblicato → editati
      });
      if (driveFileId) {
        await db.content.update({
          where: { id: content.id },
          data: { originalDriveFileId: driveFileId },
        });
        archivedOriginal = true;
      }
    } catch {
      // best-effort: il publish ha già avuto successo, non blocchiamo su un errore di archiviazione
    }
  }

  // Se avevamo caricato l'originale su Blob, il post è già pubblicato (non
  // programmato) E l'archiviazione su Drive è andata a buon fine, lo cancelliamo:
  // resta solo il proxy. Per i programmati NON si cancella (Zernio potrebbe
  // attingervi al momento dell'uscita). Se Drive non ha archiviato, l'originale
  // resta su Blob (nessuna copia altrove → non lo perdiamo).
  if (uploadedOriginalUrl && !scheduledAt && archivedOriginal) {
    await del(uploadedOriginalUrl).catch(() => {});
  }

  revalidatePath(`/contenuti/${content.id}`);
  revalidatePath("/contenuti");
  revalidatePath("/archivio");
  revalidatePath("/home");
  return { ok: true, externalId: result.externalId };
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
export async function addMaterialAction(
  formData: FormData
): Promise<{ materialId: string }> {
  const ctx = await currentContext();
  if (!ctx) throw new Error("Non autorizzato");
  const contentId = String(formData.get("contentId") ?? "");
  const kind = String(formData.get("kind") ?? "");
  const url = String(formData.get("url") ?? "").trim();
  if (!contentId || !url || (kind !== "image" && kind !== "video")) {
    throw new Error("Dati materiale non validi");
  }
  const hadMontato = await contentHasMontato(ctx.workspaceId, contentId);
  const created = await addMaterial(ctx.workspaceId, contentId, kind, url);
  if (!created) throw new Error("Contenuto non trovato");
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
  return { materialId: created.id };
}

/** Archivia su Drive l'originale (già caricato su Blob) di un Material video, poi
 *  cancella l'originale da Blob (resta il proxy). Best-effort: su errore lascia il Blob. */
export async function archiveMaterialOriginalAction(formData: FormData) {
  const ctx = await currentContext();
  if (!ctx) throw new Error("Non autorizzato");
  const materialId = String(formData.get("materialId") ?? "").trim();
  const originalUrl = String(formData.get("originalUrl") ?? "").trim();
  const filename = String(formData.get("filename") ?? "original").trim();
  const mimeType = String(formData.get("mimeType") ?? "video/mp4").trim();
  if (!materialId || !originalUrl) return;

  try {
    const folders = await ensureDriveFolders();
    const driveFileId = await archiveBlobUrlToDrive({
      url: originalUrl,
      name: filename,
      mimeType,
      folderId: folders?.rawMainFolderId, // materiale montato → raw/main per default
    });
    if (!driveFileId) return; // Drive non connesso o fallito: non cancellare da Blob
    const saved = await setMaterialDriveFileId(ctx.workspaceId, materialId, driveFileId);
    if (!saved) return; // material sparito: non cancellare l'originale (nessun riferimento al file Drive)
    await del(originalUrl).catch(() => {}); // `del` già importato in questo file
  } catch {
    // best-effort: su errore lascia l'originale su Blob per un retry futuro
  }
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
  const notes = String(formData.get("notes") ?? "").trim();
  const publishRaw = String(formData.get("publishAt") ?? "").trim();
  const format = parseFormat(String(formData.get("format") ?? ""));
  await updateContent(ctx.workspaceId, id, {
    ...(title ? { title } : {}),
    notes: notes || null,
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

/** Quick inline-edit: partial patch (title and/or notes) built from whichever
 *  fields are present in the FormData — used by the calendar's quick-edit UI.
 *  Returns whether the save actually happened — the drawer's autosave UI needs
 *  a truthful result, not an optimistic "Salvato" when a silent `!ctx` bail
 *  happened. */
export async function updateContentFieldsAction(formData: FormData): Promise<boolean> {
  const ctx = await currentContext();
  const id = String(formData.get("id") ?? "");
  if (!ctx || !id) return false;
  const patch = buildContentPatch(formData);
  if (Object.keys(patch).length) {
    await updateContent(ctx.workspaceId, id, patch);
  }
  revalidatePath("/contenuti");
  revalidatePath(`/contenuti/${id}`);
  revalidatePath("/calendario");
  return true;
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
