"use client";

import { uploadViaServer } from "@/lib/blob-upload";
import { compressToProxy, isCompressionSupported } from "@/lib/video-compress";

/** Se il browser non sa comprimere, carica l'originale con un tetto. */
const FALLBACK_MAX_BYTES = 50 * 1024 * 1024;

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
  let toUpload: Blob;
  let filename: string;
  let contentType: string;

  if (isCompressionSupported()) {
    const res = await compressToProxy(file, (r) => onProgress?.(r));
    toUpload = res.blob;
    filename = res.filename;
    contentType = res.mimeType;
  } else {
    if (file.size > FALLBACK_MAX_BYTES) {
      throw new VideoTooLargeError(
        "Compressione non supportata dal browser e file troppo grande (max 50MB). Carica una clip più leggera."
      );
    }
    toUpload = file;
    filename = file.name;
    contentType = file.type || "video/mp4";
  }

  onProgress?.(null); // fase di upload
  const proxyFile = new File([toUpload], filename, { type: contentType });
  return uploadViaServer(proxyFile, `video-proxies/${contentId}`, filename);
}
