import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { currentContext } from "@/lib/current";
import { presignGet, isConfigured } from "@/lib/r2";
import { db } from "@/lib/db";
import { shouldServeFromDrive } from "@/lib/diary-read";
import { getDriveFileStream } from "@/lib/drive-archive";

// Streaming di file grandi da Drive dopo il cutover R2.
export const maxDuration = 300;

/**
 * C1 — proxy di lettura per i media del Diario su R2 (bucket privato).
 * Redirige a un presigned GET a tempo. Scoping: la key deve appartenere al
 * workspace dell'utente autenticato (nessun accesso cross-workspace).
 * C3 — dopo il cutover di 6 giorni (< lifecycle R2 di 7g), l'originale viene
 * servito in streaming da Google Drive invece che da R2.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> }
): Promise<NextResponse> {
  const ctx = await currentContext();
  if (!ctx)
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  if (!isConfigured())
    return NextResponse.json({ error: "R2 non configurato" }, { status: 503 });

  const { key: parts } = await params;
  const key = parts.map(decodeURIComponent).join("/");
  if (!key.startsWith(`raw/${ctx.workspaceId}/`))
    return NextResponse.json({ error: "Vietato" }, { status: 403 });

  const entry = await db.diaryEntry.findFirst({
    where: { r2Key: key, workspaceId: ctx.workspaceId },
    select: { driveFileId: true, createdAt: true, mediaType: true },
  });
  if (entry && shouldServeFromDrive(entry, new Date()) && entry.driveFileId) {
    const nodeStream = await getDriveFileStream(entry.driveFileId);
    if (nodeStream) {
      // Un body di Response/NextResponse deve essere un Web ReadableStream:
      // convertiamo lo stream Node restituito da googleapis con Readable.toWeb.
      const webStream = Readable.toWeb(
        nodeStream as Readable
      ) as unknown as ReadableStream;
      return new NextResponse(webStream, {
        headers: {
          "Content-Type":
            entry.mediaType === "video" ? "video/mp4" : "application/octet-stream",
        },
      });
    }
  }

  const url = await presignGet(key, 3600);
  return NextResponse.redirect(url);
}
