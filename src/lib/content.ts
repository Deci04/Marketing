import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/workspace";
import { filtersToWhere, type ContentFilters } from "@/lib/classes";
import { coverUrl } from "@/lib/materials";
import type { Channel, ContentFormat } from "@prisma/client";

export async function listContents(
  workspaceId: string,
  filters: ContentFilters = {}
) {
  return db.content.findMany({
    where: filtersToWhere(workspaceId, filters),
    include: { block: true, classes: true },
    orderBy: [{ publishAt: "asc" }, { createdAt: "desc" }],
  });
}

export async function getContent(workspaceId: string, id: string) {
  return db.content.findFirst({
    where: scopedWhere(workspaceId, { id }),
    include: {
      block: true,
      classes: { orderBy: { name: "asc" } },
      comments: { include: { author: true }, orderBy: { createdAt: "asc" } },
      materials: { orderBy: { order: "asc" } },
    },
  });
}

export async function listBlocks(workspaceId: string) {
  return db.block.findMany({
    where: scopedWhere(workspaceId),
    orderBy: { createdAt: "desc" },
  });
}

export async function createBlock(
  workspaceId: string,
  data: {
    label: string;
    lucaDeliveryAt?: Date | null;
    matteoDeliveryAt?: Date | null;
  }
) {
  return db.block.create({
    data: {
      workspaceId,
      label: data.label,
      lucaDeliveryAt: data.lucaDeliveryAt ?? null,
      matteoDeliveryAt: data.matteoDeliveryAt ?? null,
    },
  });
}

export async function createContent(
  workspaceId: string,
  data: {
    title: string;
    channel: Channel;
    format?: ContentFormat | null;
    publishAt?: Date | null;
    blockId?: string | null;
    hook?: string | null;
    notes?: string | null;
    classIds?: string[];
  }
) {
  // Only assign classes that belong to this workspace.
  const classIds = data.classIds?.length
    ? (
        await db.contentClass.findMany({
          where: scopedWhere(workspaceId, { id: { in: data.classIds } }),
          select: { id: true },
        })
      ).map((c) => c.id)
    : [];

  return db.content.create({
    data: {
      workspaceId,
      title: data.title,
      channel: data.channel,
      format: data.format ?? null,
      publishAt: data.publishAt ?? null,
      blockId: data.blockId ?? null,
      hook: data.hook ?? null,
      notes: data.notes ?? null,
      ...(classIds.length
        ? { classes: { connect: classIds.map((id) => ({ id })) } }
        : {}),
    },
  });
}

export async function addComment(
  workspaceId: string,
  data: {
    authorId: string;
    body: string;
    contentId?: string | null;
    blockId?: string | null;
    // F4: review fields — second of the proxy video the comment is anchored to,
    // and (extension point, second half) a voice note stored on Blob.
    videoTimestamp?: number | null;
    audioUrl?: string | null;
  }
) {
  return db.comment.create({
    data: {
      workspaceId,
      authorId: data.authorId,
      body: data.body,
      contentId: data.contentId ?? null,
      blockId: data.blockId ?? null,
      videoTimestamp: data.videoTimestamp ?? null,
      audioUrl: data.audioUrl ?? null,
    },
  });
}

export async function deleteComment(workspaceId: string, id: string) {
  const c = await db.comment.findFirst({
    where: scopedWhere(workspaceId, { id }),
    select: { id: true },
  });
  if (!c) return null;
  return db.comment.delete({ where: { id } });
}

/** Engagement rate = interactions / reach. Null until reach is known. */
export function engagementRate(c: {
  reach?: number | null;
  likes?: number | null;
  commentsCount?: number | null;
  saves?: number | null;
  shares?: number | null;
}): number | null {
  if (!c.reach || c.reach <= 0) return null;
  const interactions =
    (c.likes ?? 0) + (c.commentsCount ?? 0) + (c.saves ?? 0) + (c.shares ?? 0);
  return interactions / c.reach;
}

export async function updateContent(
  workspaceId: string,
  id: string,
  data: {
    title?: string;
    hook?: string | null;
    publishAt?: Date | null;
    format?: ContentFormat | null;
    // performance metrics (filled after publishing)
    views?: number | null;
    reach?: number | null;
    nonFollowerPct?: number | null;
    likes?: number | null;
    commentsCount?: number | null;
    saves?: number | null;
    shares?: number | null;
    followsGenerated?: number | null;
  }
) {
  const c = await db.content.findFirst({
    where: scopedWhere(workspaceId, { id }),
    select: { id: true },
  });
  if (!c) return null;
  return db.content.update({ where: { id }, data });
}

export async function deleteContent(workspaceId: string, id: string) {
  const c = await db.content.findFirst({
    where: scopedWhere(workspaceId, { id }),
    select: { id: true },
  });
  if (!c) return null;
  await db.comment.deleteMany({ where: { contentId: id } });
  return db.content.delete({ where: { id } });
}

export async function setContentThumbnail(
  workspaceId: string,
  contentId: string,
  url: string
) {
  const c = await db.content.findFirst({
    where: scopedWhere(workspaceId, { id: contentId }),
    select: { id: true },
  });
  if (!c) return null;
  return db.content.update({
    where: { id: contentId },
    data: { thumbnailUrl: url },
  });
}

/** Materiali unificati — elenco materiali di un contenuto (ordinati). */
export async function listMaterials(workspaceId: string, contentId: string) {
  const c = await db.content.findFirst({
    where: scopedWhere(workspaceId, { id: contentId }),
    select: { id: true },
  });
  if (!c) return [];
  return db.material.findMany({ where: { contentId }, orderBy: { order: "asc" } });
}

/** Ricalcola la copertina denormalizzata (Content.thumbnailUrl = prima foto). */
async function recomputeCover(contentId: string) {
  const materials = await db.material.findMany({
    where: { contentId },
    orderBy: { order: "asc" },
  });
  const cover = coverUrl(
    materials.map((m) => ({
      id: m.id,
      kind: m.kind as "image" | "video",
      url: m.url,
      order: m.order,
    }))
  );
  await db.content.update({ where: { id: contentId }, data: { thumbnailUrl: cover } });
}

export async function addMaterial(
  workspaceId: string,
  contentId: string,
  kind: "image" | "video",
  url: string
) {
  const c = await db.content.findFirst({
    where: scopedWhere(workspaceId, { id: contentId }),
    select: { id: true },
  });
  if (!c) return null;
  const max = await db.material.aggregate({
    where: { contentId },
    _max: { order: true },
  });
  const m = await db.material.create({
    data: { contentId, kind, url, order: (max._max.order ?? -1) + 1 },
  });
  await recomputeCover(contentId);
  return m;
}

export async function removeMaterial(workspaceId: string, materialId: string) {
  const m = await db.material.findFirst({
    where: { id: materialId, content: { workspaceId } },
    select: { id: true, contentId: true },
  });
  if (!m) return null;
  await db.material.delete({ where: { id: materialId } });
  await recomputeCover(m.contentId);
  return { contentId: m.contentId };
}

export async function reorderMaterials(
  workspaceId: string,
  contentId: string,
  orderedIds: string[]
) {
  const c = await db.content.findFirst({
    where: scopedWhere(workspaceId, { id: contentId }),
    select: { id: true },
  });
  if (!c) return;
  await db.$transaction(
    orderedIds.map((id, i) =>
      db.material.update({ where: { id }, data: { order: i } })
    )
  );
  await recomputeCover(contentId);
}

/** F4: store the URL of the compressed review proxy (lightweight, on Blob).
 * The heavy master is never uploaded — only this proxy powers the player. */
export async function setContentVideoProxy(
  workspaceId: string,
  contentId: string,
  url: string | null
) {
  const c = await db.content.findFirst({
    where: scopedWhere(workspaceId, { id: contentId }),
    select: { id: true },
  });
  if (!c) return null;
  return db.content.update({
    where: { id: contentId },
    data: { videoProxyUrl: url },
  });
}

/** F4: store/clear the external master link (Drive/iCloud) — path C. */
export async function setContentMasterLink(
  workspaceId: string,
  contentId: string,
  link: string | null
) {
  const c = await db.content.findFirst({
    where: scopedWhere(workspaceId, { id: contentId }),
    select: { id: true },
  });
  if (!c) return null;
  return db.content.update({
    where: { id: contentId },
    data: { masterLink: link },
  });
}
