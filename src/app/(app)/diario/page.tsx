import { redirect } from "next/navigation";
import { currentContext } from "@/lib/current";
import { searchDiaryEntries } from "@/lib/diary";
import { DiaryChat } from "@/components/diary/diary-chat";
import { DiaryUpload } from "@/components/diary/diary-upload";

export const dynamic = "force-dynamic";

function fmt(d: Date) {
  return new Date(d).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function DiarioPage() {
  const ctx = await currentContext();
  if (!ctx) redirect("/login");
  const name = ctx.user.name ?? ctx.user.email ?? "—";
  const entries = await searchDiaryEntries(ctx.workspaceId, { limit: 50 });

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-10">
      <header>
        <h1 className="text-2xl">Diario di Luca</h1>
        <p className="text-sm text-muted-foreground">
          Aggiungi foto, video, audio e note: il materiale resta qui finché Matteo
          non lo edita.
        </p>
      </header>

      <DiaryUpload />

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Raccolta {entries.length > 0 && `(${entries.length})`}
        </h2>
        {entries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
            Ancora niente. Aggiungi il primo materiale qui sopra.
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((e) => (
              <div key={e.id} className="rounded-2xl border border-border bg-card p-3.5">
                {e.mediaUrl && e.mediaType === "image" && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={e.mediaUrl}
                    alt=""
                    className="mb-2 max-h-72 w-full rounded-xl object-cover"
                  />
                )}
                {e.mediaUrl && e.mediaType === "video" && (
                  <video src={e.mediaUrl} controls className="mb-2 max-h-72 w-full rounded-xl" />
                )}
                {e.mediaUrl && e.mediaType === "audio" && (
                  <audio src={e.mediaUrl} controls className="mb-2 w-full" />
                )}
                {e.mediaUrl && e.mediaType === "file" && (
                  <a
                    href={e.mediaUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mb-1 inline-block text-sm text-blush-ink underline"
                  >
                    Apri file ↗
                  </a>
                )}
                {e.aiTitle && (
                  <div className="text-sm font-medium text-ink">{e.aiTitle}</div>
                )}
                {e.aiDescription && (
                  <p className="text-sm text-muted-foreground">{e.aiDescription}</p>
                )}
                {e.rawText && <p className="text-sm text-ink">{e.rawText}</p>}
                {e.caption && <p className="text-sm text-ink">{e.caption}</p>}
                <div className="mt-1.5 text-xs text-muted-foreground">{fmt(e.createdAt)}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <details className="group rounded-2xl border border-border bg-card">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
          💬 Chiedi spunti all'AI
        </summary>
        <div className="h-[60vh] border-t border-border p-3">
          <DiaryChat userName={name} />
        </div>
      </details>
    </div>
  );
}
