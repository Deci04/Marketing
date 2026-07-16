import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { listContents } from "@/lib/content";
import { contentStage, daysUntil } from "@/lib/workflow";
import { isPushConfigured, sendPushToUser } from "@/lib/web-push";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Finestra (giorni-calendario UTC) entro cui una scadenza di blocco genera un
 *  promemoria: oggi, domani o dopodomani. */
const REMINDER_WINDOW_DAYS = new Set([0, 1, 2]);

const ITALIAN_SHORT_DATE = new Intl.DateTimeFormat("it-IT", {
  day: "numeric",
  month: "short",
});

/** yyyy-mm-dd (UTC) di oggi, per de-duplicare un solo promemoria al giorno per blocco. */
function todayUTC(now: Date): string {
  return now.toISOString().slice(0, 10);
}

type BlockDue = { blockId: string; label: string; deadline: Date; count: number };

/** Raggruppa i contenuti ancora "DaConsegnare" per blocco, tenendo solo i blocchi
 *  la cui scadenza (`block.lucaDeliveryAt`) cade oggi/domani/dopodomani. */
function blocksDueSoon(
  contents: Array<{
    deliveredAt: Date | null;
    confirmedAt: Date | null;
    videoProxyUrl: string | null;
    _count: { materials: number };
    block: { id: string; label: string; lucaDeliveryAt: Date | null } | null;
  }>,
  now: Date
): BlockDue[] {
  const buckets = new Map<string, BlockDue>();
  for (const c of contents) {
    const hasMontato = c.videoProxyUrl != null || c._count.materials > 0;
    const stage = contentStage({
      deliveredAt: c.deliveredAt,
      confirmedAt: c.confirmedAt,
      hasMontato,
    });
    if (stage !== "DaConsegnare") continue;
    const block = c.block;
    const deadline = block?.lucaDeliveryAt;
    if (!block || !deadline) continue;
    if (!REMINDER_WINDOW_DAYS.has(daysUntil(deadline, now))) continue;
    const existing = buckets.get(block.id);
    if (existing) existing.count += 1;
    else buckets.set(block.id, { blockId: block.id, label: block.label, deadline, count: 1 });
  }
  return [...buckets.values()];
}

/**
 * Filone PWA-B: cron giornaliero (Vercel Cron, vedi vercel.json) che avvisa i
 * collaboratori via push dei blocchi in scadenza imminente (0/1/2 giorni) che
 * hanno ancora contenuti "DaConsegnare". De-duplicato via PushDispatch: un solo
 * promemoria per blocco al giorno, anche se il cron gira più volte.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  if (!isPushConfigured()) {
    return NextResponse.json({ skipped: "push not configured" });
  }

  const now = new Date();
  const today = todayUTC(now);
  let sent = 0;

  try {
    const workspaces = await db.workspace.findMany({ select: { id: true } });

    for (const workspace of workspaces) {
      try {
        const contents = await listContents(workspace.id);
        const due = blocksDueSoon(contents, now);
        if (due.length === 0) continue;

        for (const block of due) {
          try {
            const dedupeKey = `block-due:${block.blockId}:${today}`;
            try {
              await db.pushDispatch.create({ data: { dedupeKey } });
            } catch (err) {
              const code = (err as { code?: string })?.code;
              if (code === "P2002") continue; // già inviato oggi per questo blocco
              throw err;
            }

            const collaborators = await db.membership.findMany({
              where: { workspaceId: workspace.id, role: "COLLABORATOR" },
              select: { userId: true },
            });
            if (collaborators.length === 0) continue;

            const dateIt = ITALIAN_SHORT_DATE.format(block.deadline);
            await Promise.all(
              collaborators.map((m) =>
                sendPushToUser(m.userId, {
                  title: "Promemoria consegna",
                  body: `Blocco «${block.label}»: ${block.count} da consegnare entro ${dateIt}`,
                  url: "/home",
                }).catch(() => {})
              )
            );
            sent += 1;
          } catch (err) {
            console.error("[cron/block-reminders] block error", block.blockId, err);
          }
        }
      } catch (err) {
        console.error("[cron/block-reminders] workspace error", workspace.id, err);
      }
    }
  } catch (err) {
    console.error("[cron/block-reminders] fatal", err);
  }

  return NextResponse.json({ ok: true, sent });
}
