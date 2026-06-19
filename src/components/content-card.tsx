import Link from "next/link";
import { deriveStatus, type DerivedStatus } from "@/lib/status";
import { InstagramLogo, YoutubeLogo } from "@phosphor-icons/react/dist/ssr";

type CardContent = {
  id: string;
  title: string;
  channel: "INSTAGRAM" | "YOUTUBE";
  publishAt: Date | null;
  hook: string | null;
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

  return (
    <Link
      href={`/contenuti/${content.id}`}
      className="group block rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(26,24,19,0.04)] transition-all hover:-translate-y-0.5 hover:border-ink/20 hover:shadow-[0_4px_14px_rgba(26,24,19,0.07)]"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
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
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[status]}`}
        >
          {status}
        </span>
      </div>
      <p className="text-[15px] font-medium leading-snug text-ink">
        {content.title}
      </p>
      {content.publishAt && (
        <p className="mt-2 text-xs text-muted-foreground">
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
    </Link>
  );
}
