import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { currentContext } from "@/lib/current";

/**
 * F4 — token endpoint per gli upload client→Blob diretti (proxy video, foto,
 * note vocali).
 *
 * Il browser carica direttamente su Vercel Blob con `upload()` di
 * `@vercel/blob/client`, che chiama questa route per ottenere un token a tempo,
 * con scope sul workspace autenticato. L'upload diretto **bypassa il limite di
 * body delle Vercel Functions** (~4.5MB), quindi funziona in produzione anche
 * per file grandi.
 *
 * NB: NON impostiamo `onUploadCompleted`. La persistenza dell'URL avviene via
 * Server Action dopo che il client riceve l'URL del blob; omettere la callback
 * evita il webhook che Vercel Blob non riesce a raggiungere su localhost (era la
 * causa del 403 in sviluppo).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        // Solo membri autenticati del workspace possono caricare.
        const ctx = await currentContext();
        if (!ctx) throw new Error("Non autorizzato");
        return {
          allowedContentTypes: ["video/*", "image/*", "audio/*"],
          maximumSizeInBytes: 500 * 1024 * 1024, // 500MB
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ workspaceId: ctx.workspaceId }),
        };
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
