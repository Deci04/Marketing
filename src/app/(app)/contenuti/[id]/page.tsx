import Link from "next/link";
import { notFound } from "next/navigation";
import { currentContext } from "@/lib/current";
import { getContent } from "@/lib/content";
import { deriveStatus } from "@/lib/status";
import { addCommentAction } from "../actions";

export default async function ContentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await currentContext();
  if (!ctx) return null;
  const content = await getContent(ctx.workspaceId, id);
  if (!content) notFound();

  const status = deriveStatus({
    publishAt: content.publishAt,
    lucaDeliveryAt: content.block?.lucaDeliveryAt ?? null,
    matteoDeliveryAt: content.block?.matteoDeliveryAt ?? null,
  });

  return (
    <div className="max-w-2xl space-y-6">
      <Link
        href="/contenuti"
        className="text-sm text-neutral-500 hover:text-black"
      >
        ← Contenuti
      </Link>

      <div>
        <div className="mb-2 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-pink-100 px-2 py-0.5 font-semibold text-pink-700">
            {content.channel === "YOUTUBE" ? "YouTube" : "Instagram"}
          </span>
          {content.block && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
              {content.block.label}
            </span>
          )}
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">
            {status}
          </span>
        </div>
        <h1 className="text-2xl font-semibold">{content.title}</h1>
        {content.publishAt && (
          <p className="mt-1 text-sm text-neutral-500">
            Pubblicazione: {content.publishAt.toLocaleDateString("it-IT")}
          </p>
        )}
        {content.hook && (
          <p className="mt-3 rounded-md bg-neutral-50 p-3 text-sm">
            Hook: &ldquo;{content.hook}&rdquo;
          </p>
        )}
      </div>

      <div>
        <h2 className="mb-3 font-medium">💬 Commenti</h2>
        <div className="space-y-3">
          {content.comments.length === 0 && (
            <p className="text-sm text-neutral-500">Ancora nessun commento.</p>
          )}
          {content.comments.map((cm) => (
            <div key={cm.id} className="rounded-lg border p-3">
              <div className="text-xs font-semibold text-neutral-500">
                {cm.author.name ?? cm.author.email}
              </div>
              <div className="text-sm">{cm.body}</div>
            </div>
          ))}
        </div>
        <form action={addCommentAction} className="mt-4 flex gap-2">
          <input type="hidden" name="contentId" value={content.id} />
          <input
            name="body"
            required
            placeholder="Scrivi un commento…"
            className="flex-1 rounded-md border px-3 py-2 text-sm"
          />
          <button className="rounded-md bg-black px-3 py-2 text-sm font-medium text-white">
            Invia
          </button>
        </form>
      </div>
    </div>
  );
}
