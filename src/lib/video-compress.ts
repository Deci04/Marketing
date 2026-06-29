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

/**
 * Safari / iOS WebKit: `canvas.captureStream` + `MediaRecorder` + WebAudio
 * playback is unreliable (the off-screen video's playback gets gated on a
 * suspended AudioContext and never advances → the compression hangs). On these
 * browsers we skip compression and upload the original (capped). Pure for tests.
 */
export function isSafariLike(ua: string): boolean {
  if (/iPhone|iPad|iPod|CriOS|FxiOS/i.test(ua)) return true; // all iOS browsers are WebKit
  return /Safari/i.test(ua) && !/Chrome|Chromium|Edg|Android/i.test(ua);
}

export function isCompressionSupported(): boolean {
  if (typeof window === "undefined") return false;
  if (isSafariLike(navigator.userAgent)) return false;
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
    // Safari non registra WebM: ricade su MP4 (H.264/AAC).
    'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
    "video/mp4",
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
  // L'elemento NON è mutato: in un browser reale un <video muted> cattura una
  // traccia audio SILENZIOSA. Per non far sentire nulla durante la compressione
  // instradiamo l'audio via WebAudio verso uno stream di cattura, senza collegarlo
  // alle casse (ctx.destination). play() è autorizzato dal gesto utente (click sul file).
  video.playsInline = true;
  // Required to read frames from a local file without tainting the canvas.
  video.crossOrigin = "anonymous";

  let audioCtx: AudioContext | null = null;
  let rafId = 0;
  let recorder: MediaRecorder | null = null;

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

    // Audio: lo catturiamo dall'elemento (non mutato) via WebAudio.
    // createMediaElementSource intercetta l'audio decodificato e lo manda a un
    // MediaStreamDestination (registrato dal recorder) ma NON a ctx.destination,
    // così non si sente durante la compressione. La traccia è disponibile subito,
    // quindi possiamo aggiungerla prima di creare il recorder.
    try {
      const AudioCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (AudioCtor) {
        audioCtx = new AudioCtor();
        const source = audioCtx.createMediaElementSource(video);
        const dest = audioCtx.createMediaStreamDestination();
        source.connect(dest);
        for (const track of dest.stream.getAudioTracks()) {
          canvasStream.addTrack(track);
        }
      }
    } catch {
      // WebAudio non disponibile: muto l'elemento per non riprodurre l'audio a
      // voce durante la compressione (il proxy sarà muto, ma il video procede).
      video.muted = true;
    }

    const drawLoop = () => {
      ctx.drawImage(video, 0, 0, outW, outH);
      const d = video.duration;
      if (Number.isFinite(d) && d > 0 && onProgress) {
        onProgress(Math.min(1, video.currentTime / d));
      }
      rafId = requestAnimationFrame(drawLoop);
    };

    const rec = new MediaRecorder(canvasStream, {
      mimeType,
      videoBitsPerSecond: TARGET_VIDEO_BITRATE,
    });
    recorder = rec; // hoisted ref so `finally` can stop it on the stall path
    const chunks: BlobPart[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    const recordingDone = new Promise<Blob>((resolve) => {
      rec.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
    });

    rec.start(250);
    drawLoop();
    if (audioCtx && audioCtx.state === "suspended") await audioCtx.resume();
    await video.play();

    // Watchdog: if playback never advances (e.g. Safari gates the off-screen
    // video on a suspended AudioContext), give up so the caller can fall back
    // to a direct upload instead of hanging at 0% forever.
    const STALL_MS = 10_000;
    await new Promise<void>((resolve, reject) => {
      let last = -1;
      let lastAdvance = Date.now();
      const timer = window.setInterval(() => {
        if (video.ended) {
          window.clearInterval(timer);
          resolve();
        } else if (video.currentTime > last) {
          last = video.currentTime;
          lastAdvance = Date.now();
        } else if (Date.now() - lastAdvance > STALL_MS) {
          window.clearInterval(timer);
          reject(new Error("Compressione bloccata: la riproduzione non avanza"));
        }
      }, 500);
      if (video.ended) {
        window.clearInterval(timer);
        resolve();
      } else {
        video.onended = () => {
          window.clearInterval(timer);
          resolve();
        };
      }
    });

    cancelAnimationFrame(rafId);
    if (rec.state !== "inactive") rec.stop();
    rafId = 0;
    const blob = await recordingDone;
    onProgress?.(1);

    const ext = mimeType.startsWith("video/mp4") ? "mp4" : "webm";
    const base = file.name.replace(/\.[^.]+$/, "");
    return { blob, mimeType, filename: `${base}-proxy.${ext}` };
  } finally {
    // Stop everything (also on the stall/reject path) to avoid leaks.
    cancelAnimationFrame(rafId);
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {}
    }
    URL.revokeObjectURL(url);
    if (audioCtx) audioCtx.close().catch(() => {});
  }
}
