import Link from "next/link";
import { deriveStatus } from "@/lib/status";

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

const STATUS_STYLE: Record<string, string> = {
  "Da consegnare": "bg-neutral-100 text-neutral-600",
  Consegnato: "bg-amber-100 text-amber-700",
  Revisionato: "bg-violet-100 text-violet-700",
  Pubblicato: "bg-emerald-100 text-emerald-700",
};

export function ContentCard({ content }: { content: CardContent }) {
  const status = deriveStatus({
    publishAt: content.publishAt,
    lucaDeliveryAt: content.block?.lucaDeliveryAt ?? null,
    matteoDeliveryAt: content.block?.matteoDeliveryAt ?? null,
  });
  const channelBadge =
    content.channel === "YOUTUBE"
      ? "bg-red-100 text-red-700"
      : "bg-pink-100 text-pink-700";
  return (
    <Link
      href={`/contenuti/${content.id}`}
      className="block rounded-xl border p-4 transition-shadow hover:shadow-sm"
    >
      <div className="mb-2 flex flex-wrap gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${channelBadge}`}
        >
          {content.channel === "YOUTUBE" ? "YouTube" : "Instagram"}
        </span>
        {content.block && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
            {content.block.label}
          </span>
        )}
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[status]}`}
        >
          {status}
        </span>
      </div>
      <h3 className="font-medium">{content.title}</h3>
      {content.publishAt && (
        <p className="mt-1 text-sm text-neutral-500">
          Pubblicazione: {content.publishAt.toLocaleDateString("it-IT")}
        </p>
      )}
      {content.hook && (
        <p className="mt-2 text-sm text-neutral-600">&ldquo;{content.hook}&rdquo;</p>
      )}
    </Link>
  );
}
