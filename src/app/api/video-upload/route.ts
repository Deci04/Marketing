import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { currentContext } from "@/lib/current";

/**
 * F4 — client-upload token endpoint for the compressed review proxy.
 *
 * The browser compresses the video to a lightweight proxy, then uploads it
 * directly to Vercel Blob using `upload()` from `@vercel/blob/client`, which
 * calls this route to mint a short-lived, scoped client token. Going through
 * the client keeps the (potentially multi-MB) proxy off the Server Action body
 * limit and off our function memory.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        // Only authenticated workspace members may upload.
        const ctx = await currentContext();
        if (!ctx) throw new Error("Non autorizzato");
        return {
          allowedContentTypes: ["video/webm", "video/mp4", "video/quicktime"],
          // Proxy is compressed client-side; cap generously to avoid abuse.
          maximumSizeInBytes: 200 * 1024 * 1024,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ workspaceId: ctx.workspaceId }),
        };
      },
      // Persistence of videoProxyUrl happens via a Server Action after the
      // client receives the blob URL, so no onUploadCompleted needed here.
      onUploadCompleted: async () => {},
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}
