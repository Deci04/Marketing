"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash, Paperclip } from "@phosphor-icons/react";
import { deleteDiaryEntryAction } from "@/app/(app)/diario/actions";

export type ConvEntry = {
  id: string;
  authorUserId: string | null;
  rawText: string | null;
  caption: string | null;
  mediaUrl: string | null;
  mediaType: string | null; // "image" | "video" | "audio" | "file" | "text"
  aiTitle: string | null;
  aiDescription: string | null;
  createdAt: string; // ISO
};

function time(iso: string) {
  return new Date(iso).toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DiaryConversation({
  entries,
  currentUserId,
  isAdmin,
}: {
  entries: ConvEntry[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<string | null>(null);

  async function del(id: string) {
    if (deleting) return;
    setDeleting(id);
    try {
      const res = await deleteDiaryEntryAction(id);
      if (!res.ok) toast.error(res.error ?? "Errore");
      else {
        toast.success("Messaggio eliminato");
        router.refresh();
      }
    } finally {
      setDeleting(null);
    }
  }

  if (entries.length === 0)
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
        Ancora niente. Manda il primo materiale qui sotto.
      </div>
    );

  return (
    <div className="space-y-2.5">
      {entries.map((e) => {
        const mine = e.authorUserId === currentUserId;
        const canDelete = mine || isAdmin;
        return (
          <div key={e.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
            <div
              className={`group relative max-w-[85%] rounded-2xl px-2.5 py-2 ${
                mine ? "bg-blush text-blush-ink" : "bg-secondary text-ink"
              }`}
            >
              {e.mediaUrl && e.mediaType === "image" && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={e.mediaUrl} alt="" className="mb-1 max-h-64 rounded-xl object-cover" />
              )}
              {e.mediaUrl && e.mediaType === "video" && (
                <video src={e.mediaUrl} controls className="mb-1 max-h-64 rounded-xl" />
              )}
              {e.mediaUrl && e.mediaType === "audio" && (
                <audio src={e.mediaUrl} controls className="mb-1 w-56" />
              )}
              {e.mediaUrl && e.mediaType === "file" && (
                <a
                  href={e.mediaUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mb-1 inline-flex items-center gap-1.5 text-sm underline"
                >
                  <Paperclip size={13} /> Apri file
                </a>
              )}
              {e.aiTitle && <div className="px-1 text-sm font-medium">{e.aiTitle}</div>}
              {e.aiDescription && <p className="px-1 text-sm opacity-80">{e.aiDescription}</p>}
              {e.rawText && <p className="whitespace-pre-wrap px-1 text-sm">{e.rawText}</p>}
              {e.caption && <p className="px-1 text-sm">{e.caption}</p>}
              <div className="mt-0.5 px-1 text-[10px] opacity-60">{time(e.createdAt)}</div>

              {canDelete && (
                <button
                  onClick={() => del(e.id)}
                  disabled={deleting === e.id}
                  aria-label="Elimina messaggio"
                  className="absolute -right-2 -top-2 rounded-full border border-border bg-paper p-1 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-coral-ink group-hover:opacity-100 disabled:opacity-50"
                >
                  <Trash size={12} />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
