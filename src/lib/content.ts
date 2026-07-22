import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/workspace";
import { filtersToWhere, type ContentFilters } from "@/lib/classes";
import { coverUrl } from "@/lib/materials";
import { effectiveStatus } from "@/lib/status";
import { syncItemOut, deleteItemOut } from "@/lib/google-calendar";
import type { Channel, ContentFormat } from "@prisma/client";

export async function listContents(
  workspaceId: string,
  filters: ContentFilters = {}
) {
  return db.content.findMany({
    where: filtersToWhere(workspaceId, filters),
    include: { block: true, classes: true, _count: { select: { materials: true } } },
    orderBy: [{ publishAt: "asc" }, { createdAt: "desc" }],
  });
}

/** Most recently created content (for the home "Novità" feed). Same item shape
 *  as listContents so cards/links work, ordered by createdAt desc. */
export async function listRecentContent(workspaceId: string, limit = 5) {
  return db.content.findMany({
    where: scopedWhere(workspaceId),
    include: { block: true, classes: true },
    orderBy: { createdAt: "desc" },
    take: limit,
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

  const created = await db.content.create({
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
  // G: USCITA — push su Google se il contenuto ha una data di pubblicazione.
  if (data.publishAt != null) {
    void syncItemOut(workspaceId, "publication", created.id).catch(() => {});
  }
  return created;
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

// --- S: ricerca + archivio (pure, side-effect-free helpers) ---

/** A content auto-archives once it has been "Pubblicato" for more than this
 *  many days. Age is measured from `publishAt` (UTC). */
export const ARCHIVE_AFTER_DAYS = 14;

/** Minimal shape the archive/search helpers need — matches what `listContents`
 *  returns (block + status + text fields). Kept structural so in-memory fixtures
 *  and Prisma rows both satisfy it. */
type ArchivableContent = {
  statusOverride?: string | null;
  publishAt?: Date | null;
  block?: {
    lucaDeliveryAt?: Date | null;
    matteoDeliveryAt?: Date | null;
  } | null;
};

/** True when a content should live in the archive: its effective status is
 *  "Pubblicato" AND it was published strictly more than ARCHIVE_AFTER_DAYS ago.
 *  A content without a publish date (age unknown) stays active. */
export function isArchived(
  content: ArchivableContent,
  now: Date = new Date()
): boolean {
  const status = effectiveStatus(
    content.statusOverride ?? null,
    {
      publishAt: content.publishAt ?? null,
      lucaDeliveryAt: content.block?.lucaDeliveryAt ?? null,
      matteoDeliveryAt: content.block?.matteoDeliveryAt ?? null,
    },
    now
  );
  if (status !== "Pubblicato") return false;
  if (!content.publishAt) return false;
  const ageMs = now.getTime() - content.publishAt.getTime();
  return ageMs > ARCHIVE_AFTER_DAYS * 24 * 60 * 60 * 1000;
}

/** Partition contents into the active list (shown in /contenuti) and the
 *  archived list (shown in /archivio), preserving input order in each. */
export function splitActiveArchived<T extends ArchivableContent>(
  contents: T[],
  now: Date = new Date()
): { active: T[]; archived: T[] } {
  const active: T[] = [];
  const archived: T[] = [];
  for (const c of contents) {
    (isArchived(c, now) ? archived : active).push(c);
  }
  return { active, archived };
}

/** Free-text search over title / hook / notes (case-insensitive). An empty or
 *  whitespace-only query matches everything. Client-side for now (spec S). */
export function matchesSearch(
  content: { title?: string | null; hook?: string | null; notes?: string | null },
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [content.title, content.hook, content.notes].some((field) =>
    (field ?? "").toLowerCase().includes(q)
  );
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

// --- Vista Contenuti unificata (Archivio fuso dentro Contenuti) ---

export type Stato = "lavorazione" | "pubblicati" | "tutti";

/** Legge ?stato= dai searchParams; default "lavorazione". */
export function parseStato(v: string | string[] | undefined): Stato {
  const s = Array.isArray(v) ? v[0] : v;
  return s === "pubblicati" || s === "tutti" ? s : "lavorazione";
}

/** Insieme di contenuti da mostrare per il filtro di stato scelto. */
export function contentsForStato<T extends ArchivableContent>(
  contents: T[],
  stato: Stato,
  now: Date = new Date()
): T[] {
  if (stato === "tutti") return contents;
  const { active, archived } = splitActiveArchived(contents, now);
  return stato === "pubblicati" ? archived : active;
}

/** Shape minima per costruire una riga della tabella archivio (da listContents). */
type RowSource = ArchivableContent & {
  id: string;
  title: string;
  channel: import("@prisma/client").Channel;
  format?: ContentFormat | null;
  classes: { id: string; name: string; color: string | null }[];
  publishAt?: Date | null;
  reach?: number | null;
  likes?: number | null;
  commentsCount?: number | null;
  saves?: number | null;
  shares?: number | null;
  views?: number | null;
};

/** Riga compatibile con <ArchiveTable rows> (vedi archive-table.tsx). */
export type ArchiveRowData = {
  id: string;
  title: string;
  channel: "INSTAGRAM" | "YOUTUBE";
  format: ContentFormat | null;
  classes: { id: string; name: string; color: string | null }[];
  status: string;
  publishAt: string | null;
  views: number | null;
  er: number | null;
};

/** Mappa i contenuti in righe archivio ordinabili (DRY tra /contenuti e la ex /archivio). */
export function toArchiveRows(contents: RowSource[]): ArchiveRowData[] {
  return contents.map((c) => {
    const er = engagementRate(c);
    return {
      id: c.id,
      title: c.title,
      channel: c.channel as "INSTAGRAM" | "YOUTUBE",
      format: c.format ?? null,
      classes: c.classes.map((cl) => ({ id: cl.id, name: cl.name, color: cl.color })),
      status: effectiveStatus(c.statusOverride ?? null, {
        publishAt: c.publishAt ?? null,
        lucaDeliveryAt: c.block?.lucaDeliveryAt ?? null,
        matteoDeliveryAt: c.block?.matteoDeliveryAt ?? null,
      }),
      publishAt: c.publishAt ? c.publishAt.toISOString() : null,
      views: c.views ?? null,
      er: er != null ? Math.round(er * 1000) / 10 : null,
    };
  });
}

/** Build a partial update patch from FormData, including only the keys that
 *  are actually present (fd.has(key)) — used by quick inline-edit actions.
 *  title: trimmed if present (an empty string stays an empty string — not
 *  cleared here). notes: trimmed if present; an empty string clears it (null). */
export function buildContentPatch(
  fd: FormData
): { title?: string; notes?: string | null } {
  const patch: { title?: string; notes?: string | null } = {};
  if (fd.has("title")) {
    patch.title = String(fd.get("title") ?? "").trim();
  }
  if (fd.has("notes")) {
    const notes = String(fd.get("notes") ?? "").trim();
    patch.notes = notes || null;
  }
  return patch;
}

export async function updateContent(
  workspaceId: string,
  id: string,
  data: {
    title?: string;
    hook?: string | null;
    notes?: string | null;
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
  const updated = await db.content.update({ where: { id }, data });
  // G: USCITA — riflette il cambio di publishAt su Google (push o rimozione link).
  if ("publishAt" in data) {
    if (data.publishAt != null) {
      void syncItemOut(workspaceId, "publication", id).catch(() => {});
    } else {
      void deleteItemOut(workspaceId, "publication", id).catch(() => {});
    }
  }
  return updated;
}

export async function deleteContent(workspaceId: string, id: string) {
  const c = await db.content.findFirst({
    where: scopedWhere(workspaceId, { id }),
    select: { id: true },
  });
  if (!c) return null;
  // G: USCITA — rimuove l'evento Google + il link prima di eliminare il contenuto.
  void deleteItemOut(workspaceId, "publication", id).catch(() => {});
  await db.comment.deleteMany({ where: { contentId: id } });
  return db.content.delete({ where: { id } });
}

// --- Collaboration lifecycle (Matteo ↔ Luca) ---

/** Luca marks the material as delivered (+ optional external Drive/iCloud link). */
export async function setDelivered(
  workspaceId: string,
  id: string,
  link?: string | null
) {
  const c = await db.content.findFirst({
    where: scopedWhere(workspaceId, { id }),
    select: { id: true },
  });
  if (!c) return null;
  return db.content.update({
    where: { id },
    data: { deliveredAt: new Date(), ...(link ? { masterLink: link } : {}) },
  });
}

/** Luca confirms the montato. */
export async function setConfirmed(workspaceId: string, id: string) {
  const c = await db.content.findFirst({
    where: scopedWhere(workspaceId, { id }),
    select: { id: true },
  });
  if (!c) return null;
  return db.content.update({ where: { id }, data: { confirmedAt: new Date() } });
}

/** True if a "montato" exists: a review proxy or at least one material. */
export async function contentHasMontato(workspaceId: string, id: string) {
  const c = await db.content.findFirst({
    where: scopedWhere(workspaceId, { id }),
    select: { videoProxyUrl: true, _count: { select: { materials: true } } },
  });
  if (!c) return false;
  return c.videoProxyUrl != null || c._count.materials > 0;
}

export async function setNotificationsSeen(userId: string) {
  return db.user.update({
    where: { id: userId },
    data: { notificationsSeenAt: new Date() },
  });
}

/** Force a content's status manually, or clear the override (null = back to auto). */
export async function setContentStatus(
  workspaceId: string,
  id: string,
  status: string | null
) {
  const c = await db.content.findFirst({
    where: scopedWhere(workspaceId, { id }),
    select: { id: true },
  });
  if (!c) return null;
  return db.content.update({ where: { id }, data: { statusOverride: status } });
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

/** Salva l'id del file originale archiviato su Drive per un Material. */
export async function setMaterialDriveFileId(
  workspaceId: string,
  materialId: string,
  driveFileId: string
) {
  const m = await db.material.findFirst({
    where: { id: materialId, content: scopedWhere(workspaceId, {}) },
    select: { id: true },
  });
  if (!m) return null;
  return db.material.update({ where: { id: materialId }, data: { driveFileId } });
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
