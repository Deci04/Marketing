import { NextResponse } from "next/server";
import { currentContext } from "@/lib/current";
import { buildRawKey, presignPut, isConfigured } from "@/lib/r2";

/**
 * C1 — emette un presigned PUT per l'upload diretto client→R2 del materiale del
 * Diario. Il browser carica direttamente su R2 (mai attraverso le Functions, che
 * hanno il limite di body ~4.5MB); poi crea la `DiaryEntry` con `r2Key` via
 * Server Action al termine dell'upload. Il segmento centrale della key è un id
 * casuale (cartella per-upload), la `DiaryEntry` mantiene il proprio id.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const ctx = await currentContext();
  if (!ctx)
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  if (!isConfigured())
    return NextResponse.json({ error: "R2 non configurato" }, { status: 503 });

  let body: { filename?: unknown; contentType?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body non valido" }, { status: 400 });
  }
  const filename = typeof body.filename === "string" ? body.filename : "";
  const contentType =
    typeof body.contentType === "string" ? body.contentType : "";
  if (!filename || !contentType)
    return NextResponse.json(
      { error: "filename e contentType richiesti" },
      { status: 400 }
    );

  const mediaId = crypto.randomUUID();
  const r2Key = buildRawKey(ctx.workspaceId, mediaId, filename);
  const uploadUrl = await presignPut(r2Key, contentType);
  return NextResponse.json({ uploadUrl, r2Key });
}
