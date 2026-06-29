import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/workspace";
import type { ActivityType } from "@prisma/client";

export async function createActivity(
  workspaceId: string,
  data: { type: ActivityType; contentId?: string | null; actorId?: string | null }
) {
  return db.activity.create({
    data: {
      workspaceId,
      type: data.type,
      contentId: data.contentId ?? null,
      actorId: data.actorId ?? null,
    },
  });
}

export async function listActivity(workspaceId: string, limit = 20) {
  return db.activity.findMany({
    where: scopedWhere(workspaceId),
    include: { content: { select: { id: true, title: true, channel: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/** Unread = activities by *other* users since the viewer last opened the feed. */
export async function unreadCount(
  workspaceId: string,
  userId: string,
  seenAt: Date | null
) {
  return db.activity.count({
    where: {
      ...scopedWhere(workspaceId),
      actorId: { not: userId },
      ...(seenAt ? { createdAt: { gt: seenAt } } : {}),
    },
  });
}
