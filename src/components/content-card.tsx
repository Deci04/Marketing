import Link from "next/link";
import { effectiveStatus, isDerivedStatus } from "@/lib/status";
import { workflowState } from "@/lib/workflow";
import { FORMAT_CHIP, formatLabel } from "@/lib/format";
import { classChip } from "@/lib/classes";
import { StatusBadge } from "@/components/status-badge";
import { InstagramLogo, YoutubeLogo } from "@phosphor-icons/react/dist/ssr";
import type { Channel, ContentFormat } from "@prisma/client";

type CardContent = {
  id: string;
  title: string;
  channel: Channel;
  format?: ContentFormat | null;
  publishAt: Date | null;
  hook: string | null;
  thumbnailUrl: string | null;
  statusOverride?: string | null;
  deliveredAt?: Date | null;
  confirmedAt?: Date | null;
  videoProxyUrl?: string | null;
  _count?: { materials: number };
  classes?: { id: string; name: string; color: string | null }[];
  block: {
    label: string;
    lucaDeliveryAt: Date | null;
    matteoDeliveryAt: Date | null;
  } | null;
};

export function ContentCard({ content }: { content: CardContent }) {
  const statusInput = {
    publishAt: content.publishAt,
    lucaDeliveryAt: content.block?.lucaDeliveryAt ?? null,
    matteoDeliveryAt: content.block?.matteoDeliveryAt ?? null,
  };
  const status = effectiveStatus(content.statusOverride, statusInput);
  const isOverride = isDerivedStatus(content.statusOverride ?? "");

  const isYt = content.channel === "YOUTUBE";
  const Logo = isYt ? YoutubeLogo : InstagramLogo;
  const cover = isYt ? "bg-coral" : "bg-blush";
  const channelInk = isYt ? "text-coral-ink" : "text-blush-ink";
  const fmt = formatLabel(content.format);
  const classes = content.classes ?? [];
  const wf = workflowState({
    confirmedAt: content.confirmedAt ?? null,
    hasMontato: content.videoProxyUrl != null || (content._count?.materials ?? 0) > 0,
  });
  const wfChip =
    wf === "Da fare"
      ? "bg-butter text-butter-ink"
      : wf === "Da revisionare"
        ? "bg-lavender text-lavender-ink"
        : null; // "Confermato" → nessun chip (lo stato pubblicazione lo mostra il StatusBadge)

  return (
    <div className="group relative rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(26,24,19,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(26,24,19,0.09)]">
      <div className={`relative h-28 overflow-hidden rounded-t-2xl ${content.thumbnailUrl ? "bg-secondary" : cover}`}>
        {content.thumbnailUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={content.thumbnailUrl} alt="" className="h-full w-full object-cover" />
            <div className="absolute -right-5 -top-6 h-20 w-20 rounded-full bg-white/15" />
            <div
              className={`absolute bottom-2 left-2 flex h-7 w-7 items-center justify-center rounded-lg bg-paper/90 ${channelInk}`}
            >
              <Logo size={15} weight="fill" />
            </div>
          </>
        ) : (
          <>
            <div className="absolute -right-6 -top-7 h-24 w-24 rounded-full bg-white/25" />
            <div className="absolute right-9 top-9 h-9 w-9 rounded-xl bg-white/20" />
            <Logo
              size={44}
              weight="fill"
              className={`absolute -bottom-2 left-3 ${channelInk} opacity-25`}
            />
          </>
        )}
      </div>
      <div className="p-4">
        <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${channelInk}`}>
          <Logo size={12} weight="fill" />
          {isYt ? "YouTube" : "Instagram"}
        </span>
        <div className="mt-1.5 text-[15px] font-semibold leading-snug text-ink">
          {content.title}
        </div>
        {wfChip && (
          <span className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${wfChip}`}>
            {wf}
          </span>
        )}
        {content.publishAt && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            {content.publishAt.toLocaleDateString("it-IT", {
              day: "numeric",
              month: "short",
            })}
          </p>
        )}
        {content.hook && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            &ldquo;{content.hook}&rdquo;
          </p>
        )}
        {(fmt || classes.length > 0) && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {fmt && content.format && (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${FORMAT_CHIP[content.format]}`}
              >
                {fmt}
              </span>
            )}
            {classes.map((cl) => (
              <span
                key={cl.id}
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${classChip(cl.color)}`}
              >
                {cl.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Full-card navigation overlay (below the status badge) */}
      <Link
        href={`/contenuti/${content.id}`}
        aria-label={content.title}
        className="absolute inset-0 z-10 rounded-2xl"
      />
      {/* Interactive status badge — sits above the overlay so clicks open its menu */}
      <div className="absolute right-2.5 top-2.5 z-20">
        <StatusBadge contentId={content.id} status={status} isOverride={isOverride} />
      </div>
    </div>
  );
}
