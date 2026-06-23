"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { toast } from "sonner";
import { Microphone, Stop, Trash, Spinner } from "@phosphor-icons/react";
import { addAudioCommentAction } from "@/app/(app)/contenuti/actions";
import { audioExtForMime, formatTimestamp } from "@/lib/video-review";

/** True if the browser can record audio via MediaRecorder + getUserMedia. */
function isRecordingSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  );
}

/** Pick an audio mimeType the browser supports for MediaRecorder, or null. */
function pickAudioMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  for (const t of candidates) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  // Some browsers (older Safari) accept the default; let the recorder decide.
  return "";
}

// `useSyncExternalStore` with a server snapshot of `false` avoids both a
// hydration mismatch and a setState-in-effect: the server renders the
// "unsupported" state, then the client resolves real support after mount.
const noopSubscribe = () => () => {};

type Phase = "idle" | "recording" | "preview" | "uploading";

/**
 * F4 (second half) — record a voice-note comment in the browser.
 *
 * `getTimestamp` lets the Video tab anchor the note to the current second of the
 * review proxy; in the plain Commenti tab it's omitted and the note is generic.
 * The recorded blob is uploaded client-side to Vercel Blob (reusing the
 * `/api/video-upload` token route) and saved as `Comment.audioUrl`.
 */
export function AudioRecorder({
  contentId,
  getTimestamp,
}: {
  contentId: string;
  getTimestamp?: () => number | null;
}) {
  const router = useRouter();
  const supported = useSyncExternalStore(
    noopSubscribe,
    isRecordingSupported,
    () => false
  );
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const mimeRef = useRef<string>("");
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up the mic stream, timer and object URL on unmount.
  useEffect(() => {
    return () => {
      stopTimer();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopTimer() {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }

  async function startRecording() {
    if (!isRecordingSupported()) {
      toast.error("Il tuo browser non supporta la registrazione audio.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const name = (err as DOMException)?.name;
      if (name === "NotAllowedError" || name === "SecurityError") {
        toast.error(
          "Permesso microfono negato. Abilitalo nelle impostazioni del browser."
        );
      } else if (name === "NotFoundError") {
        toast.error("Nessun microfono trovato.");
      } else {
        toast.error(`Impossibile accedere al microfono: ${(err as Error).message}`);
      }
      return;
    }

    streamRef.current = stream;
    const mime = pickAudioMime();
    if (mime == null) {
      toast.error("Nessun formato audio supportato per la registrazione.");
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    let recorder: MediaRecorder;
    try {
      recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
    } catch {
      recorder = new MediaRecorder(stream);
    }
    mimeRef.current = recorder.mimeType || mime || "audio/webm";
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const type = mimeRef.current.split(";")[0] || "audio/webm";
      const blob = new Blob(chunksRef.current, { type });
      blobRef.current = blob;
      const url = URL.createObjectURL(blob);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setPhase("preview");
    };

    recorderRef.current = recorder;
    recorder.start();
    setElapsed(0);
    setPhase("recording");
    stopTimer();
    tickRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
  }

  function stopRecording() {
    stopTimer();
    const r = recorderRef.current;
    if (r && r.state !== "inactive") r.stop();
  }

  function discard() {
    blobRef.current = null;
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setElapsed(0);
    setPhase("idle");
  }

  async function send() {
    const blob = blobRef.current;
    if (!blob) return;
    setPhase("uploading");
    try {
      const ext = audioExtForMime(mimeRef.current);
      const type = mimeRef.current.split(";")[0] || "audio/webm";
      const file = new File([blob], `voice-${Date.now()}.${ext}`, { type });
      const result = await upload(
        `audio-comments/${contentId}/voice-${Date.now()}.${ext}`,
        file,
        {
          access: "public",
          handleUploadUrl: "/api/video-upload",
          contentType: type,
        }
      );

      const ts = getTimestamp?.();
      const fd = new FormData();
      fd.set("contentId", contentId);
      fd.set("audioUrl", result.url);
      if (ts != null && Number.isFinite(ts) && ts >= 0) {
        fd.set("videoTimestamp", String(Math.floor(ts)));
      }
      await addAudioCommentAction(fd);

      toast.success(
        ts != null && ts >= 0
          ? `Vocale inviato a ${formatTimestamp(ts)}`
          : "Vocale inviato"
      );
      discard();
      router.refresh();
    } catch (err) {
      toast.error(`Invio vocale fallito: ${(err as Error).message}`);
      setPhase("preview");
    }
  }

  if (!supported) {
    return (
      <p className="text-xs text-muted-foreground">
        La registrazione vocale non è supportata da questo browser.
      </p>
    );
  }

  if (phase === "idle") {
    return (
      <button
        type="button"
        onClick={startRecording}
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-paper px-3.5 py-2 text-sm text-ink transition-colors hover:bg-secondary"
      >
        <Microphone size={15} /> Registra vocale
      </button>
    );
  }

  if (phase === "recording") {
    return (
      <div className="flex items-center gap-3 rounded-full border border-coral/60 bg-coral/20 px-3.5 py-2">
        <span className="flex h-2.5 w-2.5 animate-pulse rounded-full bg-coral-ink" />
        <span className="text-sm tabular-nums text-coral-ink">
          {formatTimestamp(elapsed)}
        </span>
        <button
          type="button"
          onClick={stopRecording}
          className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-paper active:scale-[0.98]"
        >
          <Stop size={13} weight="fill" /> Stop
        </button>
      </div>
    );
  }

  // preview / uploading
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-2.5">
      {previewUrl && (
        <audio src={previewUrl} controls className="h-9 max-w-full" />
      )}
      <button
        type="button"
        disabled={phase === "uploading"}
        onClick={send}
        className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground active:scale-[0.98] disabled:opacity-60"
      >
        {phase === "uploading" ? (
          <>
            <Spinner size={14} className="animate-spin" /> Invio…
          </>
        ) : (
          <>
            <Microphone size={14} weight="fill" /> Invia vocale
          </>
        )}
      </button>
      <button
        type="button"
        disabled={phase === "uploading"}
        onClick={discard}
        aria-label="Scarta vocale"
        className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-2 text-sm text-muted-foreground hover:text-coral-ink disabled:opacity-60"
      >
        <Trash size={14} />
      </button>
    </div>
  );
}
