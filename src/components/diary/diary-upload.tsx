"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  UploadSimple,
  PaperPlaneTilt,
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

/** PUT su R2 con progresso reale (fetch non espone l'upload progress → XHR). */
function putWithProgress(
  url: string,
  file: File,
  contentType: string,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`R2 ha rifiutato l'upload (HTTP ${xhr.status}).`));
    xhr.onerror = () =>
      reject(
        new Error(
          "Upload bloccato dal browser (CORS/origine). Apri l'app da http://localhost:3000 o dall'IP autorizzato."
        )
      );
    xhr.send(file);
  });
}

/** Carica un file su R2 (presigned PUT) e ritorna i riferimenti per la DiaryEntry. */
async function uploadToR2(file: File, onProgress?: (pct: number) => void) {
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
  await putWithProgress(uploadUrl, file, contentType, onProgress ?? (() => {}));
  return { r2Key: r2Key as string, mediaType: mediaTypeOf(contentType), mediaSize: file.size };
}

/** Anello di progresso stile WhatsApp (SVG). */
function Ring({ pct }: { pct: number }) {
  const r = 9;
  const c = 2 * Math.PI * r;
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" className="shrink-0">
      <circle cx="11" cy="11" r={r} fill="none" stroke="currentColor" strokeWidth="2" opacity="0.25" />
      <circle
        cx="11"
        cy="11"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.max(0, Math.min(100, pct)) / 100)}
        transform="rotate(-90 11 11)"
      />
    </svg>
  );
}

/**
 * C1/C2b — composer della raccolta: nota + file (foto/video) + **vocale registrato
 * in-app** (stile WhatsApp). Il vocale viene registrato, caricato su R2 e trascritto.
 */
export function DiaryUpload() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState<{ i: number; total: number; pct: number } | null>(null);
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
      const up = await uploadToR2(voice, (pct) => setProg({ i: 1, total: 1, pct }));
      const save = await saveDiaryUploadAction(up);
      if (!save.ok) throw new Error(save.error ?? "Salvataggio fallito");
      toast.success("Vocale inviato");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore");
    } finally {
      setBusy(false);
      setProg(null);
    }
  }

  async function submit() {
    if (files.length === 0 && !note.trim())
      return toast.error("Aggiungi un file o una nota");
    setBusy(true);
    try {
      // La nota (se c'è) diventa il primo messaggio; poi un messaggio per ogni file.
      if (note.trim()) {
        const save = await saveDiaryUploadAction({ rawText: note });
        if (!save.ok) throw new Error(save.error ?? "Salvataggio fallito");
      }
      for (let i = 0; i < files.length; i++) {
        const up = await uploadToR2(files[i], (pct) =>
          setProg({ i: i + 1, total: files.length, pct })
        );
        const save = await saveDiaryUploadAction(up);
        if (!save.ok) throw new Error(save.error ?? "Salvataggio fallito");
      }
      toast.success(
        files.length > 1 ? `${files.length} file aggiunti` : "Aggiunto alla raccolta"
      );
      setFiles([]);
      setNote("");
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore");
    } finally {
      setBusy(false);
      setProg(null);
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
          {files.length ? "Aggiungi altri" : "Foto / video"}
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? []);
              if (picked.length) setFiles((prev) => [...prev, ...picked]);
              e.target.value = "";
            }}
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

        {files.map((f, idx) => (
          <span
            key={idx}
            className="inline-flex max-w-[12rem] items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs text-muted-foreground"
          >
            <Paperclip size={12} className="shrink-0" />
            <span className="truncate">{f.name}</span>
            <button
              type="button"
              onClick={() => setFiles((prev) => prev.filter((_, i) => i !== idx))}
              aria-label="Rimuovi file"
              className="shrink-0 hover:text-ink"
            >
              <X size={12} />
            </button>
          </span>
        ))}

        <button
          onClick={submit}
          disabled={busy}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-60"
        >
          {busy ? <Ring pct={prog?.pct ?? 0} /> : <PaperPlaneTilt size={15} weight="fill" />}
          {busy ? (prog ? `${prog.i}/${prog.total} · ${prog.pct}%` : "Carico…") : "Aggiungi"}
        </button>
      </div>

      {files.length > 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {files.length} pronti · tocca “Aggiungi altri” per accodarne altri, poi “Aggiungi”.
        </p>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          Puoi aggiungerne più d’uno: selezionane tanti insieme, oppure uno alla volta con “Aggiungi altri”.
        </p>
      )}
    </div>
  );
}
