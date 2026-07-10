import { GetObjectCommand } from "@aws-sdk/client-s3";
import { createRequire } from "node:module";
import type { Archiver } from "archiver";
import { Readable } from "node:stream";
import { currentContext } from "@/lib/current";

// archiver è CommonJS (`export =`): createRequire evita i problemi di default-import.
const archiver = createRequire(import.meta.url)("archiver") as (
  format: string,
  options?: object
) => Archiver;
import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/workspace";
import { client, isConfigured } from "@/lib/r2";

/**
 * C2 — scarica in un unico .zip le risorse media di una scheda-contenuto.
 * Body: { entryIds: string[] }. Streama gli oggetti da R2 dentro l'archivio
 * (nessun caricamento in memoria del file intero). Workspace-scoped.
 */
export async function POST(request: Request): Promise<Response> {
  const ctx = await currentContext();
  if (!ctx) return new Response("Non autorizzato", { status: 401 });
  if (!isConfigured()) return new Response("R2 non configurato", { status: 503 });

  let body: { entryIds?: unknown };
  try {
    body = await request.json();
  } catch {
    return new Response("Body non valido", { status: 400 });
  }
  const ids = Array.isArray(body.entryIds)
    ? body.entryIds.filter((x): x is string => typeof x === "string")
    : [];
  if (ids.length === 0) return new Response("Nessun file richiesto", { status: 400 });

  const entries = await db.diaryEntry.findMany({
    where: scopedWhere(ctx.workspaceId, { id: { in: ids } }),
  });
  const withMedia = entries.filter((e) => e.r2Key);
  if (withMedia.length === 0) return new Response("Nessun media", { status: 404 });

  const bucket = process.env.R2_BUCKET ?? "";
  const archive = archiver("zip", { zlib: { level: 5 } });

  (async () => {
    try {
      let i = 0;
      for (const e of withMedia) {
        const obj = await client().send(
          new GetObjectCommand({ Bucket: bucket, Key: e.r2Key! })
        );
        // prefisso numerico per evitare collisioni di nomi identici
        const base = e.r2Key!.split("/").pop() ?? `${e.id}`;
        archive.append(obj.Body as Readable, { name: `${String(++i).padStart(2, "0")}-${base}` });
      }
      await archive.finalize();
    } catch {
      archive.abort();
    }
  })();

  return new Response(Readable.toWeb(archive) as unknown as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="raccolta.zip"',
    },
  });
}
