import Link from "next/link";
import { notFound } from "next/navigation";
import { currentContext } from "@/lib/current";
import { getContent } from "@/lib/content";
import { listClasses } from "@/lib/classes";
import { FORMAT_CHIP, formatLabel } from "@/lib/format";
import { classChip } from "@/lib/classes";
import { deriveStatus, type DerivedStatus } from "@/lib/status";
import { addCommentAction, setThumbnailAction } from "../actions";
import { ContentClassForm } from "./class-form";
import { AudioRecorder } from "@/components/audio-recorder";
import { AudioComment } from "@/components/audio-comment";
import {
  ArrowLeft,
  InstagramLogo,
  YoutubeLogo,
  PaperPlaneTilt,
  UploadSimple,
} from "@phosphor-icons/react/dist/ssr";

const STATUS_STYLE: Record<DerivedStatus, string> = {
  "Da consegnare": "bg-secondary text-muted-foreground",
  Consegnato: "bg-butter text-butter-ink",
  Revisionato: "bg-lavender text-lavender-ink",
  Pubblicato: "bg-sage text-sage-ink",
};

export default async function ContentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await currentContext();
  if (!ctx) return null;
  const [content, allClasses] = await Promise.all([
    getContent(ctx.workspaceId, id),
    listClasses(ctx.workspaceId),
  ]);
  if (!content) notFound();
  const fmt = formatLabel(content.format);

  const status = deriveStatus({
    publishAt: content.publishAt,
    lucaDeliveryAt: content.block?.lucaDeliveryAt ?? null,
    matteoDeliveryAt: content.block?.matteoDeliveryAt ?? null,
  });
  const isYt = content.channel === "YOUTUBE";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/contenuti"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-ink"
      >
        <ArrowLeft size={15} />
        Contenuti
      </Link>

      <div className="rounded-3xl border border-border bg-card p-6 shadow-[0_1px_2px_rgba(26,24,19,0.04)]">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${
              isYt ? "bg-coral text-coral-ink" : "bg-blush text-blush-ink"
            }`}
          >
            {isYt ? (
              <YoutubeLogo size={13} weight="fill" />
            ) : (
              <InstagramLogo size={13} weight="fill" />
            )}
            {isYt ? "YouTube" : "Instagram"}
          </span>
          {content.block && (
            <span className="rounded-full bg-secondary px-2.5 py-1 text-xs text-muted-foreground">
              {content.block.label}
            </span>
          )}
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[status]}`}
          >
            {status}
          </span>
          {fmt && content.format && (
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${FORMAT_CHIP[content.format]}`}
            >
              {fmt}
            </span>
          )}
          {content.classes.map((cl) => (
            <span
              key={cl.id}
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${classChip(cl.color)}`}
            >
              {cl.name}
            </span>
          ))}
        </div>
        <h1 className="text-2xl">{content.title}</h1>
        {content.publishAt && (
          <p className="mt-1 text-sm text-muted-foreground">
            Pubblicazione:{" "}
            {content.publishAt.toLocaleDateString("it-IT", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        )}
        {content.hook && (
          <p className="mt-4 rounded-2xl bg-secondary/60 p-4 text-sm">
            <span className="text-muted-foreground">Hook:</span> &ldquo;
            {content.hook}&rdquo;
          </p>
        )}
        {allClasses.length > 0 && (
          <div className="mt-5 border-t border-border pt-4">
            <ContentClassForm
              contentId={content.id}
              allClasses={allClasses}
              selected={content.classes.map((c) => c.id)}
            />
          </div>
        )}
      </div>

      <div className="rounded-3xl border border-border bg-card p-6 shadow-[0_1px_2px_rgba(26,24,19,0.04)]">
        <h2 className="text-lg">Materiali &amp; anteprima</h2>
        {content.thumbnailUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={content.thumbnailUrl}
            alt=""
            className="mt-4 max-h-56 w-full rounded-2xl border border-border object-cover"
          />
        )}
        <form action={setThumbnailAction} className="mt-4 space-y-3">
          <input type="hidden" name="contentId" value={content.id} />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <UploadSimple size={16} />
            <input
              type="file"
              name="file"
              accept="image/*"
              className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-full file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-paper"
            />
          </div>
          <div className="flex gap-2">
            <input
              name="thumbnailUrl"
              placeholder="…o incolla un URL immagine"
              className="flex-1 rounded-[12px] border border-border bg-secondary/70 px-3.5 py-2.5 text-sm outline-none transition focus:border-ink/30 focus:bg-paper"
            />
            <button className="rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-transform active:scale-[0.98]">
              Salva
            </button>
          </div>
        </form>
        {content.materialsUrl && (
          <a
            href={content.materialsUrl}
            className="mt-3 inline-block text-sm text-blush-ink underline"
          >
            Apri link materiali ↗
          </a>
        )}
      </div>

      <div className="rounded-3xl border border-border bg-card p-6 shadow-[0_1px_2px_rgba(26,24,19,0.04)]">
        <h2 className="text-lg">Commenti</h2>
        <div className="mt-4 space-y-3">
          {content.comments.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Ancora nessun commento.
            </p>
          )}
          {content.comments.map((cm) => {
            const who = cm.author.name ?? cm.author.email;
            return (
              <div key={cm.id} className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-lavender text-xs font-medium text-lavender-ink">
                  {who.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 rounded-2xl rounded-tl-sm bg-secondary/60 px-3.5 py-2">
                  <div className="text-xs font-medium text-muted-foreground">
                    {who}
                  </div>
                  {cm.body && <div className="text-sm">{cm.body}</div>}
                  {cm.audioUrl && <AudioComment src={cm.audioUrl} />}
                </div>
              </div>
            );
          })}
        </div>
        <form action={addCommentAction} className="mt-5 flex gap-2">
          <input type="hidden" name="contentId" value={content.id} />
          <input
            name="body"
            required
            placeholder="Scrivi un commento…"
            className="flex-1 rounded-full border border-border bg-secondary/70 px-4 py-2.5 text-sm outline-none transition focus:border-ink/30 focus:bg-paper"
          />
          <button
            aria-label="Invia commento"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform active:scale-95"
          >
            <PaperPlaneTilt size={16} weight="fill" />
          </button>
        </form>
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            …oppure invia un vocale:
          </span>
          <AudioRecorder contentId={content.id} />
        </div>
      </div>
    </div>
  );
}
