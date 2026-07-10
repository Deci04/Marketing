import { NextResponse } from "next/server";
import { currentContext } from "@/lib/current";
import { presignGet, isConfigured } from "@/lib/r2";

/**
 * C1 — proxy di lettura per i media del Diario su R2 (bucket privato).
 * Redirige a un presigned GET a tempo. Scoping: la key deve appartenere al
 * workspace dell'utente autenticato (nessun accesso cross-workspace).
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

  const url = await presignGet(key, 3600);
  return NextResponse.redirect(url);
}
