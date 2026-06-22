"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { toast } from "sonner";
import {
  FilmSlate,
  UploadSimple,
  PaperPlaneTilt,
  Trash,
  LinkSimple,
  ChatCircleDots,
} from "@phosphor-icons/react";
import {
  addCommentAction,
  setVideoProxyAction,
  setMasterLinkAction,
  deleteCommentAction,
} from "@/app/(app)/contenuti/actions";
import {
  compressToProxy,
  isCompressionSupported,
} from "@/lib/video-compress";
import {
  formatTimestamp,
  markerPercent,
  timelineComments,
} from "@/lib/video-review";

export type ReviewComment = {
  id: string;
  body: string;
  author: string;
  createdAt: string;
  videoTimestamp: number | null;
};

// If the browser can't compress, fall back to uploading the original with a cap.
const FALLBACK_MAX_BYTES = 50 * 1024 * 1024;

export function VideoReview({
  contentId,
  videoProxyUrl,
  masterLink,
  comments,
}: {
  contentId: string;
  videoProxyUrl: string | null;
  masterLink: string | null;
  comments: ReviewComment[];
}) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [body, setBody] = useState("");

  const anchored = timelineComments(comments);

  function seekTo(t: number) {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = t;
    v.play().catch(() => {});
  }

  async function handleFile(file: File) {
    if (busy) return;
    setBusy(true);
    setProgress(0);
    try {
      let toUpload: Blob;
      let filename: string;
      let contentType: string;

      if (isCompressionSupported()) {
        toast.info("Compressione del proxy in corso…");
        const res = await compressToProxy(file, (r) => setProgress(r));
        toUpload = res.blob;
        filename = res.filename;
        contentType = res.mimeType;
      } else {
        // Documented fallback: no client compression → upload original, capped.
        if (file.size > FALLBACK_MAX_BYTES) {
          toast.error(
            "Compressione non supportata dal browser e file troppo grande (max 50MB). Carica una clip più leggera."
          );
          return;
        }
        toast.warning(
          "Compressione non supportata: carico il file originale (sotto i 50MB)."
        );
        toUpload = file;
        filename = file.name;
        contentType = file.type || "video/mp4";
      }

      setProgress(null); // upload phase
      const proxyFile = new File([toUpload], filename, { type: contentType });
      const blob = await upload(`video-proxies/${contentId}/${filename}`, proxyFile, {
        access: "public",
        handleUploadUrl: "/api/video-upload",
        contentType,
      });

      const fd = new FormData();
      fd.set("contentId", contentId);
      fd.set("videoProxyUrl", blob.url);
      await setVideoProxyAction(fd);
      toast.success("Proxy caricato");
      router.refresh();
    } catch (err) {
      toast.error(`Upload fallito: ${(err as Error).message}`);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div className="space-y-5">
      {videoProxyUrl ? (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-2xl border border-border bg-ink/5">
            <video
              ref={videoRef}
              src={videoProxyUrl}
              controls
              className="w-full bg-black"
              onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
              onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime || 0)}
            />
          </div>

          {/* Stylized timeline with comment markers */}
          <div className="px-1">
            <div className="relative h-9">
              <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-secondary" />
              {/* played portion */}
              <div
                className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-lavender-ink/60"
                style={{ width: `${markerPercent(current, duration)}%` }}
              />
              {/* playhead */}
              <div
                className="absolute top-1/2 z-10 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-paper bg-ink shadow"
                style={{ left: `${markerPercent(current, duration)}%` }}
              />
              {/* comment markers */}
              {anchored.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  title={`${formatTimestamp(c.videoTimestamp)} — ${c.author}`}
                  onClick={() => seekTo(c.videoTimestamp ?? 0)}
                  style={{ left: `${markerPercent(c.videoTimestamp, duration)}%` }}
                  className="absolute top-1/2 z-20 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-blush text-blush-ink shadow-sm ring-1 ring-blush-ink/20 transition-transform hover:scale-110"
                >
                  <ChatCircleDots size={11} weight="fill" />
                </button>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[11px] tabular-nums text-muted-foreground">
              <span>{formatTimestamp(current)}</span>
              <span>{formatTimestamp(duration)}</span>
            </div>
          </div>

          {/* Replace proxy */}
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-ink">
            <UploadSimple size={14} />
            Sostituisci il proxy
            <input
              type="file"
              accept="video/*"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-secondary/40 p-6 text-center">
          <FilmSlate size={28} className="mx-auto text-muted-foreground" />
          <p className="mt-2 text-sm font-medium text-ink">
            Carica il video da revisionare
          </p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
            Viene compresso nel browser in un proxy leggero (~720p) prima
            dell&rsquo;upload. Il master pesante resta sul tuo dispositivo.
          </p>
          <label className="mt-4 inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground active:scale-[0.98]">
            <UploadSimple size={15} />
            Scegli un video
            <input
              type="file"
              accept="video/*"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
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
            : "Caricamento su Blob…"}
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-lavender-ink/60 transition-all"
              style={{ width: progress != null ? `${progress * 100}%` : "100%" }}
            />
          </div>
        </div>
      )}

      {/* Master link (path C) */}
      <form
        action={async (fd) => {
          await setMasterLinkAction(fd);
          toast.success("Link al master salvato");
          router.refresh();
        }}
        className="space-y-1.5"
      >
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <LinkSimple size={13} /> Link al master esterno (Drive/iCloud) — opzionale
        </label>
        <input type="hidden" name="contentId" value={contentId} />
        <div className="flex gap-2">
          <input
            name="masterLink"
            type="url"
            defaultValue={masterLink ?? ""}
            placeholder="https://drive.google.com/…"
            className="flex-1 rounded-[12px] border border-border bg-secondary/70 px-3.5 py-2.5 text-sm outline-none focus:border-ink/30 focus:bg-paper"
          />
          <button className="rounded-full border border-border bg-paper px-4 py-2.5 text-sm text-ink hover:bg-secondary">
            Salva
          </button>
        </div>
        {masterLink && (
          <a
            href={masterLink}
            target="_blank"
            rel="noreferrer"
            className="inline-block text-xs text-blush-ink underline"
          >
            Apri il master ↗
          </a>
        )}
      </form>

      {/* Anchored comments */}
      <div className="space-y-3 border-t border-border pt-4">
        <div className="text-xs font-medium text-muted-foreground">
          Commenti ancorati al video
        </div>
        {comments.length === 0 && (
          <p className="text-sm text-muted-foreground">Ancora nessun commento.</p>
        )}
        {comments.map((c) => (
          <div
            key={c.id}
            className="group/cm rounded-2xl border border-border bg-card p-3.5"
          >
            <div className="flex items-baseline justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-ink">{c.author}</span>
                {c.videoTimestamp != null && (
                  <button
                    type="button"
                    onClick={() => seekTo(c.videoTimestamp ?? 0)}
                    className="rounded-full bg-blush px-2 py-0.5 text-[11px] font-medium tabular-nums text-blush-ink hover:bg-blush/80"
                  >
                    {formatTimestamp(c.videoTimestamp)}
                  </button>
                )}
              </div>
              <button
                aria-label="Elimina commento"
                onClick={async () => {
                  await deleteCommentAction(c.id, contentId);
                  toast.success("Commento eliminato");
                  router.refresh();
                }}
                className="text-muted-foreground opacity-0 transition-opacity hover:text-coral-ink group-hover/cm:opacity-100"
              >
                <Trash size={13} />
              </button>
            </div>
            <p className="mt-1 text-sm text-ink/90">{c.body}</p>
          </div>
        ))}

        {/* New comment anchored to the current second */}
        <form
          action={async (fd) => {
            if (!body.trim()) return;
            await addCommentAction(fd);
            setBody("");
            toast.success(
              videoProxyUrl
                ? `Commento aggiunto a ${formatTimestamp(current)}`
                : "Commento aggiunto"
            );
            router.refresh();
          }}
          className="flex gap-2"
        >
          <input type="hidden" name="contentId" value={contentId} />
          <input
            type="hidden"
            name="videoTimestamp"
            value={videoProxyUrl ? Math.floor(current) : ""}
          />
          <input
            name="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={
              videoProxyUrl
                ? `Commenta a ${formatTimestamp(current)}…`
                : "Scrivi un commento…"
            }
            className="flex-1 rounded-[12px] border border-border bg-secondary/70 px-3.5 py-2.5 text-sm outline-none focus:border-ink/30 focus:bg-paper"
          />
          <button
            aria-label="Invia"
            className="flex items-center justify-center rounded-full bg-primary px-4 text-primary-foreground active:scale-[0.98]"
          >
            <PaperPlaneTilt size={16} weight="fill" />
          </button>
        </form>
      </div>
    </div>
  );
}
