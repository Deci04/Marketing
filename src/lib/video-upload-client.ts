"use client";

import { uploadViaServer } from "@/lib/blob-upload";
import { compressToProxy, isCompressionSupported } from "@/lib/video-compress";

/** Se il browser non sa comprimere (es. Safari), carica l'originale con un tetto.
 *  L'upload è client→Blob multipart, quindi regge file grandi in modo affidabile. */
const FALLBACK_MAX_MB = 1024; // 1 GB
const FALLBACK_MAX_BYTES = FALLBACK_MAX_MB * 1024 * 1024;

export class VideoTooLargeError extends Error {}

/**
 * Comprime un video a proxy leggero (o fa fallback all'originale capato) e lo
 * carica su Blob via server. Ritorna l'URL del proxy. Condiviso da VideoReview
 * (modalità reel) e MaterialGallery (stato vuoto).
 *
 * `onProgress(ratio)` durante la compressione; `onProgress(null)` in fase di upload.
 */
export async function compressAndUploadVideoProxy(
  file: File,
  contentId: string,
  onProgress?: (ratio: number | null) => void
): Promise<{ url: string }> {
  // Default: upload the original. Try compression; if it's unsupported, errors,
  // or stalls (e.g. Safari/WebKit), fall back to the original (capped) so the
  // upload never hangs.
  let toUpload: Blob = file;
  let filename = file.name;
  let contentType = file.type || "video/mp4";
  let compressed = false;

  if (isCompressionSupported()) {
    try {
      const res = await compressToProxy(file, (r) => onProgress?.(r));
      toUpload = res.blob;
      filename = res.filename;
      contentType = res.mimeType;
      compressed = true;
    } catch {
      // fall back to the original below
    }
  }

  if (!compressed && file.size > FALLBACK_MAX_BYTES) {
    throw new VideoTooLargeError(
      `Compressione non disponibile e file troppo grande (max ${FALLBACK_MAX_MB >= 1024 ? `${FALLBACK_MAX_MB / 1024}GB` : `${FALLBACK_MAX_MB}MB`}). Carica una clip più leggera o usa il link al master esterno.`
    );
  }

  onProgress?.(null); // fase di upload
  const proxyFile = new File([toUpload], filename, { type: contentType });
  return uploadViaServer(proxyFile, `video-proxies/${contentId}`, filename);
}
