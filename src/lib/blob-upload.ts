"use client";

import { upload } from "@vercel/blob/client";

/**
 * Carica un file su Vercel Blob **direttamente dal client** (upload client→Blob).
 *
 * Usiamo `upload()` di `@vercel/blob/client`: il browser carica direttamente su
 * Blob usando un token a tempo emesso dalla route `/api/video-upload`. Questo
 * **bypassa il limite di body delle Vercel Functions** (~4.5MB), quindi funziona
 * in produzione anche per file grandi. La route NON registra `onUploadCompleted`,
 * così non c'è la callback webhook che falliva su localhost: l'upload diretto
 * funziona sia in sviluppo sia in produzione. L'URL risultante viene poi
 * persistito via Server Action dal chiamante.
 */
export async function uploadViaServer(
  file: Blob,
  prefix: string,
  filename: string
): Promise<{ url: string }> {
  // Tipo MIME base, senza parametri codec (es. "video/webm;codecs=vp9,opus").
  const baseType = (file.type || "").split(";")[0].trim() || undefined;
  const blob = await upload(`${prefix}/${filename}`, file, {
    access: "public",
    handleUploadUrl: "/api/video-upload",
    contentType: baseType,
    // Multipart: upload affidabile per file grandi (parti con retry), fino a 5TB.
    multipart: true,
  });
  return { url: blob.url };
}
