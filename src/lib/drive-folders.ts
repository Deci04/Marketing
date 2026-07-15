import { db } from "@/lib/db";
import { driveClient } from "@/lib/google-drive";

export function resolveRawSubfolderKey(
  kind: "main" | "broll"
): "rawMainFolderId" | "rawBrollFolderId" {
  return kind === "main" ? "rawMainFolderId" : "rawBrollFolderId";
}

/** find-or-create di una cartella per nome sotto `parentId` (o root Drive). */
async function findOrCreateFolder(
  drive: NonNullable<Awaited<ReturnType<typeof driveClient>>>,
  name: string,
  parentId?: string
): Promise<string> {
  const q = [
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false",
    `name = '${name.replace(/'/g, "\\'")}'`,
    parentId ? `'${parentId}' in parents` : "'root' in parents",
  ].join(" and ");
  const found = await drive.files.list({ q, fields: "files(id)", pageSize: 1 });
  const hit = found.data.files?.[0]?.id;
  if (hit) return hit;
  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      ...(parentId ? { parents: [parentId] } : {}),
    },
    fields: "id",
  });
  return created.data.id as string;
}

/** Crea (se manca) la struttura ContentTool/{raw/main,raw/broll,editati} e la cachea. */
export async function ensureDriveFolders() {
  const drive = await driveClient();
  if (!drive) return null;

  const existing = await db.driveConfig.findUnique({ where: { id: "singleton" } });
  if (
    existing?.rootFolderId &&
    existing.rawMainFolderId &&
    existing.rawBrollFolderId &&
    existing.editatiFolderId
  ) {
    return {
      rootFolderId: existing.rootFolderId,
      rawMainFolderId: existing.rawMainFolderId,
      rawBrollFolderId: existing.rawBrollFolderId,
      editatiFolderId: existing.editatiFolderId,
    };
  }

  const rootFolderId = await findOrCreateFolder(drive, "ContentTool");
  const rawFolderId = await findOrCreateFolder(drive, "raw", rootFolderId);
  const rawMainFolderId = await findOrCreateFolder(drive, "main", rawFolderId);
  const rawBrollFolderId = await findOrCreateFolder(drive, "broll", rawFolderId);
  const editatiFolderId = await findOrCreateFolder(drive, "editati", rootFolderId);

  await db.driveConfig.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", rootFolderId, rawMainFolderId, rawBrollFolderId, editatiFolderId },
    update: { rootFolderId, rawMainFolderId, rawBrollFolderId, editatiFolderId },
  });
  return { rootFolderId, rawMainFolderId, rawBrollFolderId, editatiFolderId };
}
