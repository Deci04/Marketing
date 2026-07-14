"use client";

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

/**
 * F4 — compressione video lato browser a un proxy leggero, via **ffmpeg.wasm**
 * (core **single-thread** → NON serve SharedArrayBuffer né header COOP/COEP, che
 * romperebbero altre risorse). Funziona su **tutti** i browser con WebAssembly,
 * **incluso Safari/iOS** (a differenza del vecchio approccio MediaRecorder, che
 * su WebKit si impiantava). Il master pesante resta sulla macchina dell'utente:
 * qui si genera solo il proxy; l'originale va archiviato altrove (Drive).
 */

const TARGET_MAX_HEIGHT = 720;
// Core single-thread da CDN (nel progetto non c'è CSP che lo blocchi). Versione pinnata.
const CORE_BASE = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd";

/** UA WebKit/Safari — mantenuto per i test; NON gate più la compressione. */
export function isSafariLike(ua: string): boolean {
  if (/iPhone|iPad|iPod|CriOS|FxiOS/i.test(ua)) return true; // iOS = WebKit
  return /Safari/i.test(ua) && !/Chrome|Chromium|Edg|Android/i.test(ua);
}

/** Con ffmpeg.wasm basta WebAssembly → supportata ovunque, Safari incluso. */
export function isCompressionSupported(): boolean {
  return typeof window !== "undefined" && typeof WebAssembly !== "undefined";
}

export type CompressProgress = (ratio: number) => void;
export type CompressResult = { blob: Blob; mimeType: string; filename: string };

// Istanza + caricamento cache-ati (il core WASM si scarica una sola volta).
let _ffmpeg: FFmpeg | null = null;
let _loaded: Promise<boolean> | null = null;
let _onProgress: CompressProgress | null = null;

async function getFfmpeg(): Promise<FFmpeg> {
  if (!_ffmpeg) {
    _ffmpeg = new FFmpeg();
    // Un solo listener, instradato al callback corrente (evita di impilarli).
    _ffmpeg.on("progress", ({ progress }: { progress: number }) => {
      _onProgress?.(Math.max(0, Math.min(1, progress)));
    });
  }
  const ff = _ffmpeg;
  if (!_loaded) {
    _loaded = ff.load({
      coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
    });
  }
  await _loaded;
  return ff;
}

/**
 * Comprime `file` in un proxy MP4 (H.264/AAC) ~720p, preset ultrafast per tempi
 * ragionevoli anche single-thread. `onProgress(ratio 0..1)`. Lancia in caso di
 * errore: il chiamante fa fallback (upload dell'originale capato).
 */
export async function compressToProxy(
  file: File,
  onProgress?: CompressProgress
): Promise<CompressResult> {
  if (!isCompressionSupported())
    throw new Error("Compressione non supportata da questo browser");

  const ff = await getFfmpeg();
  _onProgress = onProgress ?? null;

  const inExt =
    (file.name.split(".").pop() || "mp4")
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase() || "mp4";
  const inName = `input.${inExt}`;
  const outName = "output.mp4";

  try {
    await ff.writeFile(inName, await fetchFile(file));
    await ff.exec([
      "-i", inName,
      "-vf", `scale=-2:${TARGET_MAX_HEIGHT}`,
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-crf", "30",
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",
      outName,
    ]);
    const data = await ff.readFile(outName);
    const blob = new Blob([data as unknown as BlobPart], { type: "video/mp4" });
    const base = file.name.replace(/\.[^.]+$/, "") || "video";
    return { blob, mimeType: "video/mp4", filename: `${base}-proxy.mp4` };
  } finally {
    _onProgress = null;
    ff.deleteFile(inName).catch(() => {});
    ff.deleteFile(outName).catch(() => {});
  }
}
