import { Readable } from "node:stream";
import { uploadToDrive, driveClient } from "@/lib/google-drive";
import { getObjectBytes } from "@/lib/r2";

/** Scarica un Blob pubblico e lo streama su Drive. Ritorna il driveFileId o null. */
export async function archiveBlobUrlToDrive(opts: {
  url: string;
  name: string;
  mimeType: string;
  folderId?: string;
}): Promise<string | null> {
  const res = await fetch(opts.url);
  if (!res.ok || !res.body) return null;
  // Web ReadableStream → Node Readable (googleapis vuole uno stream Node).
  const body = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]);
  return uploadToDrive({ name: opts.name, mimeType: opts.mimeType, body, folderId: opts.folderId });
}

/** Legge l'oggetto R2 e lo streama su Drive. Ritorna il driveFileId o null. */
export async function archiveR2KeyToDrive(opts: {
  r2Key: string;
  name: string;
  mimeType: string;
  folderId?: string;
}): Promise<string | null> {
  const bytes = await getObjectBytes(opts.r2Key);
  const body = Readable.from(Buffer.from(bytes));
  return uploadToDrive({ name: opts.name, mimeType: opts.mimeType, body, folderId: opts.folderId });
}

/** Stream di lettura di un file Drive (per servire il media dopo la scadenza R2). */
export async function getDriveFileStream(
  fileId: string
): Promise<NodeJS.ReadableStream | null> {
  const drive = await driveClient();
  if (!drive) return null;
  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "stream" }
  );
  return res.data as unknown as NodeJS.ReadableStream;
}
