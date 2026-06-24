"use client";

/**
 * F4 — browser-side video compression to a lightweight review proxy.
 *
 * Approach (no extra dependencies): play the source video off-screen, draw each
 * frame onto a canvas scaled down to ~720p, capture the canvas as a MediaStream,
 * mix in the original audio track, and record the result with `MediaRecorder` at
 * a reduced bitrate. The output is a compressed WebM proxy — the heavy master
 * never leaves the user's machine.
 *
 * Why not ffmpeg.wasm: it's not a project dependency and pulls multi-MB WASM at
 * runtime; MediaRecorder is built into the browser, dependency-free, and robust
 * for the short clips this tool reviews. Trade-off: output is WebM (VP8/VP9),
 * and it relies on `HTMLCanvasElement.captureStream` + `MediaRecorder`, which
 * are widely supported in modern Chromium/Firefox. Safari support for capturing
 * canvas streams is partial — hence `isCompressionSupported()` and a documented
 * fallback (upload original with a size cap) in the UI.
 */

const TARGET_MAX_HEIGHT = 720;
const TARGET_VIDEO_BITRATE = 1_200_000; // ~1.2 Mbps — small but watchable for review

export function isCompressionSupported(): boolean {
  if (typeof window === "undefined") return false;
  const canvas = document.createElement("canvas");
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof (canvas as HTMLCanvasElement & { captureStream?: unknown })
      .captureStream === "function"
  );
}

/** Pick a MediaRecorder mimeType the browser actually supports, or null. */
function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  for (const t of candidates) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return null;
}

export type CompressProgress = (ratio: number) => void;

export type CompressResult = {
  blob: Blob;
  mimeType: string;
  /** filename suggestion with the proxy extension */
  filename: string;
};

/**
 * Compress `file` to a review proxy Blob. Resolves with the compressed Blob.
 * Throws if compression is unsupported or fails — the caller should fall back.
 */
export async function compressToProxy(
  file: File,
  onProgress?: CompressProgress
): Promise<CompressResult> {
  if (!isCompressionSupported()) {
    throw new Error("Compressione non supportata da questo browser");
  }
  const mimeType = pickMimeType();
  if (!mimeType) throw new Error("Nessun codec di registrazione disponibile");

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = url;
  // Muto l'elemento: garantisce l'autoplay (play() senza gesto utente) e nessun
  // suono a voce durante la compressione. L'audio viene comunque catturato da
  // element.captureStream() (vedi sotto), che funziona anche con muted.
  video.muted = true;
  video.playsInline = true;
  // Required to read frames from a local file without tainting the canvas.
  video.crossOrigin = "anonymous";

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Impossibile leggere il video"));
    });

    const srcW = video.videoWidth || 1280;
    const srcH = video.videoHeight || 720;
    const scale = srcH > TARGET_MAX_HEIGHT ? TARGET_MAX_HEIGHT / srcH : 1;
    const outW = Math.max(2, Math.round((srcW * scale) / 2) * 2);
    const outH = Math.max(2, Math.round((srcH * scale) / 2) * 2);

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas non disponibile");

    const canvasStream = (
      canvas as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }
    ).captureStream(30);

    // Stream della sorgente per l'audio. NB: NON usiamo WebAudio
    // (createMediaElementSource toglierebbe l'esenzione autoplay del `muted`,
    // bloccando video.play() senza gesto utente). element.captureStream cattura
    // l'audio anche con l'elemento mutato — ma la traccia compare solo DOPO
    // l'avvio della riproduzione, quindi la aggiungiamo dopo play().
    const elementWithCapture = video as HTMLVideoElement & {
      captureStream?: () => MediaStream;
      mozCaptureStream?: () => MediaStream;
    };
    const elStream =
      elementWithCapture.captureStream?.() ??
      elementWithCapture.mozCaptureStream?.();

    let rafId = 0;
    const drawLoop = () => {
      ctx.drawImage(video, 0, 0, outW, outH);
      const d = video.duration;
      if (Number.isFinite(d) && d > 0 && onProgress) {
        onProgress(Math.min(1, video.currentTime / d));
      }
      rafId = requestAnimationFrame(drawLoop);
    };

    // Avvia la riproduzione (mutata → autoplay consentito), poi attendi che la
    // traccia audio sia disponibile e aggiungila allo stream da registrare.
    await video.play();
    if (elStream) {
      for (let i = 0; i < 20 && elStream.getAudioTracks().length === 0; i++) {
        await new Promise((r) => setTimeout(r, 50));
      }
      for (const track of elStream.getAudioTracks()) canvasStream.addTrack(track);
    }

    // Il recorder viene creato DOPO aver aggiunto l'audio, così la traccia è
    // inclusa nella registrazione.
    const recorder = new MediaRecorder(canvasStream, {
      mimeType,
      videoBitsPerSecond: TARGET_VIDEO_BITRATE,
    });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    const recordingDone = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
    });

    recorder.start(250);
    drawLoop();

    await new Promise<void>((resolve) => {
      if (video.ended) return resolve();
      video.onended = () => resolve();
    });

    cancelAnimationFrame(rafId);
    recorder.stop();
    const blob = await recordingDone;
    onProgress?.(1);

    const base = file.name.replace(/\.[^.]+$/, "");
    return { blob, mimeType, filename: `${base}-proxy.webm` };
  } finally {
    URL.revokeObjectURL(url);
  }
}
