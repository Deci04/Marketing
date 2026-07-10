"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UploadSimple, PaperPlaneTilt, Spinner, Paperclip, X } from "@phosphor-icons/react";
import { saveDiaryUploadAction } from "@/app/(app)/diario/actions";

function mediaTypeOf(mime: string): string {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}

/**
 * C1 — pannello di raccolta: Luca aggiunge foto/video/audio (file) e/o una nota.
 * Il file va **diretto su R2** (presigned PUT), poi si crea la DiaryEntry.
 */
export function DiaryUpload() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit() {
    if (!file && !note.trim()) {
      toast.error("Aggiungi un file o una nota");
      return;
    }
    setBusy(true);
    try {
      let r2Key: string | null = null;
      let mediaType: string | null = null;
      let mediaSize: number | null = null;

      if (file) {
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
        const { uploadUrl, r2Key: key } = await res.json();
        // PUT diretto su R2 — il Content-Type deve combaciare con quello firmato.
        let put: Response;
        try {
          put = await fetch(uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": contentType },
            body: file,
          });
        } catch {
          // fetch che rigetta = tipicamente preflight CORS bloccato dal browser
          // (origine non autorizzata sul bucket): messaggio esplicito, non "Failed to fetch".
          throw new Error(
            "Upload bloccato dal browser (CORS/origine). Apri l'app da http://localhost:3000 o dall'IP autorizzato."
          );
        }
        if (!put.ok)
          throw new Error(`R2 ha rifiutato l'upload (HTTP ${put.status}).`);
        r2Key = key;
        mediaType = mediaTypeOf(contentType);
        mediaSize = file.size;
      }

      const save = await saveDiaryUploadAction({
        r2Key,
        mediaType,
        mediaSize,
        rawText: note,
      });
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
          {file ? "Cambia file" : "Foto / video / audio"}
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*,audio/*"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
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
