import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/workspace";
import type { ContentFormat } from "@prisma/client";
import { parseClassColor } from "@/lib/class-format";

// Helper colore/chip (client-safe) definiti in class-format.ts; re-esportati qui per i
// consumer server. I CLIENT component devono importare da "@/lib/class-format" per non
// trascinare db/PrismaClient nel bundle browser.
export { CLASS_COLORS, classChip, parseClassColor, type ClassColor } from "@/lib/class-format";

export async function listClasses(workspaceId: string) {
  return db.contentClass.findMany({
    where: scopedWhere(workspaceId),
    orderBy: { name: "asc" },
  });
}

export async function createClass(
  workspaceId: string,
  data: { name: string; color?: string | null }
) {
  return db.contentClass.create({
    data: {
      workspaceId,
      name: data.name,
      color: parseClassColor(data.color),
    },
  });
}

export async function renameClass(
  workspaceId: string,
  id: string,
  data: { name?: string; color?: string | null }
) {
  const existing = await db.contentClass.findFirst({
    where: scopedWhere(workspaceId, { id }),
    select: { id: true },
  });
  if (!existing) return null;
  return db.contentClass.update({
    where: { id },
    data: {
      ...(data.name ? { name: data.name } : {}),
      ...(data.color !== undefined ? { color: parseClassColor(data.color) } : {}),
    },
  });
}

export async function deleteClass(workspaceId: string, id: string) {
  const existing = await db.contentClass.findFirst({
    where: scopedWhere(workspaceId, { id }),
    select: { id: true },
  });
  if (!existing) return null;
  // The implicit m2m join rows are removed automatically when the class is deleted.
  return db.contentClass.delete({ where: { id } });
}

/** Set the full set of classes assigned to a content (workspace-scoped). */
export async function setContentClasses(
  workspaceId: string,
  contentId: string,
  classIds: string[]
) {
  const content = await db.content.findFirst({
    where: scopedWhere(workspaceId, { id: contentId }),
    select: { id: true },
  });
  if (!content) return null;

  // Only keep ids that actually belong to this workspace.
  const valid = classIds.length
    ? await db.contentClass.findMany({
        where: scopedWhere(workspaceId, { id: { in: classIds } }),
        select: { id: true },
      })
    : [];

  return db.content.update({
    where: { id: contentId },
    data: { classes: { set: valid.map((c) => ({ id: c.id })) } },
  });
}

// --- Pure helpers (filtering) — kept side-effect free for testing ---

type FilterableContent = {
  format: ContentFormat | null;
  classes: { id: string }[];
};

export type ContentFilters = {
  formats?: ContentFormat[];
  classIds?: string[];
};

/** True when the content satisfies every active filter (AND across axes,
 *  OR within an axis). Empty axes are ignored. */
export function matchesFilters(
  content: FilterableContent,
  filters: ContentFilters
): boolean {
  if (filters.formats && filters.formats.length > 0) {
    if (!content.format || !filters.formats.includes(content.format)) {
      return false;
    }
  }
  if (filters.classIds && filters.classIds.length > 0) {
    const has = new Set(content.classes.map((c) => c.id));
    if (!filters.classIds.some((id) => has.has(id))) {
      return false;
    }
  }
  return true;
}

/** Build a Prisma `where` clause from the active filters (workspace-scoped). */
export function filtersToWhere(
  workspaceId: string,
  filters: ContentFilters
): Record<string, unknown> {
  const where = scopedWhere(workspaceId) as Record<string, unknown>;
  if (filters.formats && filters.formats.length > 0) {
    where.format = { in: filters.formats };
  }
  if (filters.classIds && filters.classIds.length > 0) {
    where.classes = { some: { id: { in: filters.classIds } } };
  }
  return where;
}
