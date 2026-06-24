"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  UploadSimple,
  Trash,
  ImageSquare,
  Plus,
  CaretLeft,
  CaretRight,
} from "@phosphor-icons/react";
import { uploadViaServer } from "@/lib/blob-upload";
import {
  compressAndUploadVideoProxy,
  VideoTooLargeError,
} from "@/lib/video-upload-client";
import { addMaterialAction, removeMaterialAction } from "@/app/(app)/contenuti/actions";

export type GalleryImage = { id: string; url: string };

/**
 * Galleria foto per la tab "Materiali": post singolo (1 foto) o carosello (N foto)
 * scorribile orizzontalmente (swipe / frecce / dots). Nello stato vuoto accetta
 * anche un video (→ modalità reel, gestita dal genitore via VideoReview).
 */
export function MaterialGallery({
  contentId,
  images,
}: {
  contentId: string;
  images: GalleryImage[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [active, setActive] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const empty = images.length === 0;
  const activeClamped = Math.min(active, Math.max(0, images.length - 1));

  function onScroll() {
    const el = scrollerRef.current;
    if (!el || el.clientWidth === 0) return;
    setActive(Math.round(el.scrollLeft / el.clientWidth));
  }

  function goTo(i: number) {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  }

  async function addImages(files: File[]) {
    setBusy(true);
    try {
      for (const file of files) {
        const blob = await uploadViaServer(
          file,
          `materials/${contentId}`,
          file.name
        );
        const fd = new FormData();
        fd.set("contentId", contentId);
        fd.set("kind", "image");
        fd.set("url", blob.url);
        await addMaterialAction(fd);
      }
      toast.success(files.length > 1 ? "Foto aggiunte" : "Foto aggiunta");
      router.refresh();
    } catch (err) {
      toast.error(`Upload fallito: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function addVideo(file: File) {
    setBusy(true);
    setProgress(0);
    try {
      const blob = await compressAndUploadVideoProxy(file, contentId, (r) =>
        setProgress(r)
      );
      const fd = new FormData();
      fd.set("contentId", contentId);
      fd.set("kind", "video");
      fd.set("url", blob.url);
      await addMaterialAction(fd);
      toast.success("Video caricato");
      router.refresh();
    } catch (err) {
      if (err instanceof VideoTooLargeError) toast.error(err.message);
      else toast.error(`Upload fallito: ${(err as Error).message}`);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  function onPick(files: FileList | null) {
    if (!files || files.length === 0 || busy) return;
    const list = Array.from(files);
    const video = list.find((f) => f.type.startsWith("video/"));
    if (empty && video) {
      addVideo(video);
      return;
    }
    const imgs = list.filter((f) => f.type.startsWith("image/"));
    if (imgs.length === 0) {
      toast.error("Seleziona delle immagini.");
      return;
    }
    addImages(imgs);
  }

  async function remove(id: string) {
    await removeMaterialAction(id, contentId);
    toast.success("Materiale rimosso");
    setActive(0);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {empty ? (
        <div className="rounded-2xl border border-dashed border-border bg-secondary/40 p-6 text-center">
          <ImageSquare size={28} className="mx-auto text-muted-foreground" />
          <p className="mt-2 text-sm font-medium text-ink">
            Aggiungi i materiali
          </p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
            Carica una o più foto (post singolo o carosello), oppure un video da
            revisionare con la timeline.
          </p>
          <label className="mt-4 inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground active:scale-[0.98]">
            <UploadSimple size={15} />
            Aggiungi foto o video
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                onPick(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Carosello scorribile */}
          <div className="relative">
            <div
              ref={scrollerRef}
              onScroll={onScroll}
              className="flex snap-x snap-mandatory overflow-x-auto rounded-2xl border border-border bg-ink/5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {images.map((m) => (
                <div
                  key={m.id}
                  className="group/slide relative w-full shrink-0 snap-center"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={m.url}
                    alt=""
                    className="mx-auto max-h-72 w-full object-contain"
                  />
                  <button
                    aria-label="Rimuovi foto"
                    onClick={() => remove(m.id)}
                    className="absolute right-2 top-2 rounded-full bg-paper/90 p-1.5 text-ink/70 shadow transition-opacity hover:text-coral-ink sm:opacity-0 sm:group-hover/slide:opacity-100"
                  >
                    <Trash size={14} />
                  </button>
                </div>
              ))}
            </div>

            {images.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Precedente"
                  onClick={() => goTo(Math.max(0, activeClamped - 1))}
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-paper/90 p-1.5 text-ink shadow hover:bg-paper disabled:opacity-30"
                  disabled={activeClamped === 0}
                >
                  <CaretLeft size={16} />
                </button>
                <button
                  type="button"
                  aria-label="Successivo"
                  onClick={() => goTo(Math.min(images.length - 1, activeClamped + 1))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-paper/90 p-1.5 text-ink shadow hover:bg-paper disabled:opacity-30"
                  disabled={activeClamped === images.length - 1}
                >
                  <CaretRight size={16} />
                </button>
              </>
            )}
          </div>

          {/* Dots + contatore */}
          {images.length > 1 && (
            <div className="flex items-center justify-center gap-1.5">
              {images.map((m, i) => (
                <button
                  key={m.id}
                  type="button"
                  aria-label={`Vai alla foto ${i + 1}`}
                  onClick={() => goTo(i)}
                  className={`h-1.5 rounded-full transition-all ${
                    i === activeClamped
                      ? "w-4 bg-ink"
                      : "w-1.5 bg-ink/25 hover:bg-ink/40"
                  }`}
                />
              ))}
              <span className="ml-2 text-[11px] tabular-nums text-muted-foreground">
                {activeClamped + 1}/{images.length}
              </span>
            </div>
          )}

          {/* Aggiungi altre foto */}
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-ink">
            <Plus size={14} />
            Aggiungi foto
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                onPick(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      )}

      {busy && (
        <div className="rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
          {progress != null
            ? `Compressione… ${Math.round(progress * 100)}%`
            : "Caricamento…"}
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-lavender-ink/60 transition-all"
              style={{ width: progress != null ? `${progress * 100}%` : "100%" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
