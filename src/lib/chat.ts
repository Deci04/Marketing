import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/workspace";

/**
 * Shared, workspace-level chat (F3).
 *
 * There is one shared ChatThread per workspace: both Matteo and Luca see the
 * same thread with every message (theirs, each other's, and the assistant's).
 * Messages carry an `authorId` for attribution (null = the assistant).
 */

/** Get the workspace's single shared thread, creating it on first use. */
export async function getOrCreateWorkspaceThread(workspaceId: string) {
  const existing = await db.chatThread.findFirst({
    where: scopedWhere(workspaceId),
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing;
  return db.chatThread.create({
    data: { workspaceId, title: "Chat del workspace" },
  });
}

export type ChatMessageView = {
  id: string;
  role: string; // "user" | "assistant"
  content: string;
  createdAt: string; // ISO
  author: { id: string; name: string } | null; // null = assistant
};

/** Load the full shared history for the workspace thread, oldest first. */
export async function loadThreadMessages(
  workspaceId: string,
  threadId: string
): Promise<ChatMessageView[]> {
  const rows = await db.chatMessage.findMany({
    where: scopedWhere(workspaceId, { threadId }),
    orderBy: { createdAt: "asc" },
    include: { author: { select: { id: true, name: true, email: true } } },
  });
  return rows.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    createdAt: m.createdAt.toISOString(),
    author: m.author
      ? { id: m.author.id, name: m.author.name ?? m.author.email }
      : null,
  }));
}

/** Persist a user message (attributed to the author). */
export async function saveUserMessage(
  workspaceId: string,
  threadId: string,
  authorId: string,
  content: string
) {
  return db.chatMessage.create({
    data: {
      workspaceId,
      threadId,
      authorId,
      role: "user",
      content,
    },
  });
}

/** Persist an assistant message (authorId stays null). */
export async function saveAssistantMessage(
  workspaceId: string,
  threadId: string,
  content: string,
  toolPayload?: unknown
) {
  return db.chatMessage.create({
    data: {
      workspaceId,
      threadId,
      authorId: null,
      role: "assistant",
      content,
      ...(toolPayload !== undefined
        ? { toolPayload: toolPayload as object }
        : {}),
    },
  });
}
