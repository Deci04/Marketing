import Link from "next/link";
import { currentContext } from "@/lib/current";
import { listActivity } from "@/lib/activity";
import { db } from "@/lib/db";
import type { ActivityType } from "@prisma/client";
import { SeenMarker } from "./seen-marker";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";

const VERB: Record<ActivityType, string> = {
  DELIVERED: "ha consegnato il materiale",
  REVIEW_READY: "ha caricato il montato — da confermare",
  CONFIRMED: "ha confermato",
  COMMENT: "ha commentato",
  CREATED: "ha creato il contenuto",
};

const relTime = (d: Date) => {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "ora";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min fa`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h fa`;
  const days = Math.floor(h / 24);
  return days === 1 ? "ieri" : `${days} g fa`;
};

export default async function NotifichePage() {
  const ctx = await currentContext();
  if (!ctx) return null;

  const [activities, members] = await Promise.all([
    listActivity(ctx.workspaceId, 50),
    db.membership.findMany({
      where: { workspaceId: ctx.workspaceId },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
  ]);
  const nameById = new Map(
    members.map((m) => [
      m.user.id,
      m.user.name ?? m.user.email?.split("@")[0] ?? "Qualcuno",
    ])
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <SeenMarker />
      <header>
        <h1 className="text-3xl">Notifiche</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cosa è successo nello spazio di {ctx.workspace.name}.
        </p>
      </header>

      {activities.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center text-sm text-muted-foreground">
          Ancora nessuna attività.
        </div>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {activities.map((a) => {
            const actor = a.actorId ? nameById.get(a.actorId) ?? "Qualcuno" : "Qualcuno";
            const row = (
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1 text-sm text-ink">
                  <span className="font-medium">{actor}</span> {VERB[a.type]}
                  {a.content && (
                    <span className="text-muted-foreground"> · {a.content.title}</span>
                  )}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {relTime(a.createdAt)}
                </span>
                {a.content && (
                  <ArrowRight size={14} className="shrink-0 text-muted-foreground" />
                )}
              </div>
            );
            return a.content ? (
              <Link
                key={a.id}
                href={`/contenuti/${a.content.id}`}
                className="block transition-colors hover:bg-secondary/40"
              >
                {row}
              </Link>
            ) : (
              <div key={a.id}>{row}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
