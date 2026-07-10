"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  UploadSimple,
  PaperPlaneTilt,
  Spinner,
  Paperclip,
  X,
  Microphone,
  Stop,
} from "@phosphor-icons/react";
import { saveDiaryUploadAction } from "@/app/(app)/diario/actions";

function mediaTypeOf(mime: string): string {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}

function isRecordingSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  );
}
function pickAudioMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"]) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}
function mmss(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/** Carica un file su R2 (presigned PUT) e ritorna i riferimenti per la DiaryEntry. */
async function uploadToR2(file: File) {
  const contentType = file.type || "application/octet-stream";
  const res = await fetch("/api/diario/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: file.name, contentType }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error ?? "Errore nel richiedere l'URL di upload");
  }
  const { uploadUrl, r2Key } = await res.json();
  let put: Response;
  try {
    put = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: file });
  } catch {
    throw new Error("Upload bloccato dal browser (CORS/origine). Apri l'app da http://localhost:3000 o dall'IP autorizzato.");
  }
  if (!put.ok) throw new Error(`R2 ha rifiutato l'upload (HTTP ${put.status}).`);
  return { r2Key: r2Key as string, mediaType: mediaTypeOf(contentType), mediaSize: file.size };
}

/**
 * C1/C2b — composer della raccolta: nota + file (foto/video) + **vocale registrato
 * in-app** (stile WhatsApp). Il vocale viene registrato, caricato su R2 e trascritto.
 */
export function DiaryUpload() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // registratore vocale
  const [phase, setPhase] = useState<"idle" | "recording">("idle");
  const [elapsed, setElapsed] = useState(0);
  const supported = isRecordingSupported();
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const mimeRef = useRef<string>("");
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function stopTimer() {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
  }

  async function startRecording() {
    if (!supported) return toast.error("Registrazione non supportata dal browser");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return toast.error("Permesso microfono negato o microfono assente");
    }
    streamRef.current = stream;
    const mime = pickAudioMime();
    const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    mimeRef.current = rec.mimeType || mime || "audio/webm";
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = async () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      const type = mimeRef.current.split(";")[0] || "audio/webm";
      const blob = new Blob(chunksRef.current, { type });
      const ext = type.includes("ogg") ? "ogg" : type.includes("mp4") ? "m4a" : "webm";
      const voice = new File([blob], `vocale-${Date.now()}.${ext}`, { type });
      await sendVoice(voice);
    };
    recorderRef.current = rec;
    rec.start();
    setElapsed(0);
    setPhase("recording");
    stopTimer();
    tickRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
  }

  function stopRecording() {
    stopTimer();
    const r = recorderRef.current;
    if (r && r.state !== "inactive") r.stop();
    setPhase("idle");
  }

  async function sendVoice(voice: File) {
    setBusy(true);
    try {
      const up = await uploadToR2(voice);
      const save = await saveDiaryUploadAction(up);
      if (!save.ok) throw new Error(save.error ?? "Salvataggio fallito");
      toast.success("Vocale inviato");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!file && !note.trim()) return toast.error("Aggiungi un file o una nota");
    setBusy(true);
    try {
      const up = file ? await uploadToR2(file) : { r2Key: null, mediaType: null, mediaSize: null };
      const save = await saveDiaryUploadAction({ ...up, rawText: note });
      if (!save.ok) throw new Error(save.error ?? "Salvataggio fallito");
      toast.success("Aggiunto alla raccolta");
      setFile(null);
      setNote("");
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore");
    } finally {
      setBusy(false);
    }
  }

  if (phase === "recording") {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-coral/60 bg-coral/20 px-4 py-3">
        <span className="flex h-2.5 w-2.5 animate-pulse rounded-full bg-coral-ink" />
        <span className="text-sm tabular-nums text-coral-ink">Registrazione {mmss(elapsed)}</span>
        <button
          onClick={stopRecording}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-1.5 text-xs font-medium text-paper active:scale-[0.98]"
        >
          <Stop size={13} weight="fill" /> Stop e invia
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Nota per Matteo (dove sei, cosa vuoi, cosa vuoi trasmettere)…"
        rows={2}
        className="w-full resize-none rounded-[12px] border border-border bg-secondary/60 px-3.5 py-2.5 text-sm outline-none focus:border-ink/30 focus:bg-paper"
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-paper px-3.5 py-2 text-sm text-ink transition-colors hover:bg-secondary">
          <UploadSimple size={15} />
          {file ? "Cambia file" : "Foto / video"}
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>

        {supported && (
          <button
            type="button"
            onClick={startRecording}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-paper px-3.5 py-2 text-sm text-ink transition-colors hover:bg-secondary disabled:opacity-60"
          >
            <Microphone size={15} /> Vocale
          </button>
        )}

        {file && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs text-muted-foreground">
            <Paperclip size={12} />
            {file.name}
            <button
              type="button"
              onClick={() => {
                setFile(null);
                if (fileRef.current) fileRef.current.value = "";
              }}
              aria-label="Rimuovi file"
              className="hover:text-ink"
            >
              <X size={12} />
            </button>
          </span>
        )}

        <button
          onClick={submit}
          disabled={busy}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-60"
        >
          {busy ? <Spinner size={15} className="animate-spin" /> : <PaperPlaneTilt size={15} weight="fill" />}
          {busy ? "Carico…" : "Aggiungi"}
        </button>
      </div>
    </div>
  );
}
