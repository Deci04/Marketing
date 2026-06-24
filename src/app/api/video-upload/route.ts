import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { currentContext } from "@/lib/current";

/**
 * F4 — server-side upload endpoint for the compressed review proxy and for
 * audio comments (voice notes).
 *
 * The browser compresses the video to a lightweight proxy (or records a short
 * voice note), then POSTs the file here as multipart form-data; we `put()` it to
 * Vercel Blob with the workspace token and return the public URL, which the
 * client then persists via a Server Action.
 *
 * We use server-side `put()` (not the `@vercel/blob/client` client-upload
 * handshake) because the latter needs a reachable callback URL and returns 403
 * on localhost. Proxies/voice notes are small, so the function body limit is fine.
 */
const ALLOWED = [
  "video/webm",
  "video/mp4",
  "video/quicktime",
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
];
const MAX_BYTES = 25 * 1024 * 1024; // 25MB — compressed proxy / voice note

export async function POST(request: Request): Promise<NextResponse> {
  const ctx = await currentContext();
  if (!ctx) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Form non valido" }, { status: 400 });
  }

  const file = form.get("file");
  const prefix = String(form.get("prefix") ?? "uploads").replace(/[^a-zA-Z0-9/_-]/g, "");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File mancante" }, { status: 400 });
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: `Tipo non consentito (${file.type})` }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "File troppo grande (max 25MB per il proxy)" },
      { status: 413 }
    );
  }

  try {
    const blob = await put(`${prefix}/${file.name}`, file, {
      access: "public",
      addRandomSuffix: true,
      contentType: file.type,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return NextResponse.json({ url: blob.url });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
