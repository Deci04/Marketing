import Link from "next/link";
import { deriveStatus, type DerivedStatus } from "@/lib/status";
import { InstagramLogo, YoutubeLogo } from "@phosphor-icons/react/dist/ssr";

type CardContent = {
  id: string;
  title: string;
  channel: "INSTAGRAM" | "YOUTUBE";
  publishAt: Date | null;
  hook: string | null;
  thumbnailUrl: string | null;
  block: {
    label: string;
    lucaDeliveryAt: Date | null;
    matteoDeliveryAt: Date | null;
  } | null;
};

const STATUS_STYLE: Record<DerivedStatus, string> = {
  "Da consegnare": "bg-secondary text-muted-foreground",
  Consegnato: "bg-butter text-butter-ink",
  Revisionato: "bg-lavender text-lavender-ink",
  Pubblicato: "bg-sage text-sage-ink",
};

export function ContentCard({ content }: { content: CardContent }) {
  const status = deriveStatus({
    publishAt: content.publishAt,
    lucaDeliveryAt: content.block?.lucaDeliveryAt ?? null,
    matteoDeliveryAt: content.block?.matteoDeliveryAt ?? null,
  });
  const isYt = content.channel === "YOUTUBE";
  const Logo = isYt ? YoutubeLogo : InstagramLogo;
  const cover = isYt ? "bg-coral" : "bg-blush";
  const channelInk = isYt ? "text-coral-ink" : "text-blush-ink";

  return (
    <Link
      href={`/contenuti/${content.id}`}
      className="group block overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(26,24,19,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(26,24,19,0.09)]"
    >
      <div className={`relative h-28 overflow-hidden ${content.thumbnailUrl ? "bg-secondary" : cover}`}>
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
        <span
          className={`absolute right-2.5 top-2.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${STATUS_STYLE[status]}`}
        >
          {status}
        </span>
      </div>
      <div className="p-4">
        <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${channelInk}`}>
          <Logo size={12} weight="fill" />
          {isYt ? "YouTube" : "Instagram"}
        </span>
        <div className="mt-1.5 text-[15px] font-semibold leading-snug text-ink">
          {content.title}
        </div>
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
      </div>
    </Link>
  );
}
