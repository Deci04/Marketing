import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/workspace";
import type { DiaryEntry } from "@prisma/client";

export type DiaryEntryInput = {
  authorUserId?: string | null;
  rawText?: string | null;
  caption?: string | null;
  aiTitle?: string | null;
  aiDescription?: string | null;
  // C1 — media su Cloudflare R2 (nuovo canale di ingestion in-app).
  r2Key?: string | null;
  mediaUrl?: string | null;
  mediaType?: string | null; // "image" | "video" | "audio" | "text"
  mediaSize?: number | null;
  // C3 — archiviazione del raw su Google Drive (storage-originali-drive-lifecycle).
  driveFileId?: string | null;
  archivedAt?: Date | null;
};

export async function createDiaryEntry(
  workspaceId: string,
  data: DiaryEntryInput
): Promise<DiaryEntry> {
  return db.diaryEntry.create({
    data: {
      workspaceId,
      authorUserId: data.authorUserId ?? null,
      rawText: data.rawText ?? null,
      caption: data.caption ?? null,
      aiTitle: data.aiTitle ?? null,
      aiDescription: data.aiDescription ?? null,
      r2Key: data.r2Key ?? null,
      mediaUrl: data.mediaUrl ?? null,
      mediaType: data.mediaType ?? null,
      mediaSize: data.mediaSize ?? null,
      driveFileId: data.driveFileId ?? null,
      archivedAt: data.archivedAt ?? null,
    },
  });
}

export async function searchDiaryEntries(
  workspaceId: string,
  opts?: { query?: string; limit?: number }
): Promise<DiaryEntry[]> {
  const q = opts?.query?.trim();
  const where = scopedWhere(
    workspaceId,
    q
      ? {
          OR: [
            { rawText: { contains: q, mode: "insensitive" as const } },
            { caption: { contains: q, mode: "insensitive" as const } },
            { aiTitle: { contains: q, mode: "insensitive" as const } },
            { aiDescription: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : undefined
  );
  return db.diaryEntry.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: opts?.limit ?? 20,
  });
}
