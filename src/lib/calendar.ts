import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/workspace";
import type { Channel } from "@prisma/client";

/** A Monday-start 6×7 grid of dates covering the given month (month: 0-11).
 * Uses UTC so each cell is exactly one calendar day regardless of timezone. */
export function monthMatrix(year: number, month: number): Date[][] {
  const first = new Date(Date.UTC(year, month, 1));
  const mondayOffset = (first.getUTCDay() + 6) % 7; // 0 = Monday
  const cur = new Date(first);
  cur.setUTCDate(first.getUTCDate() - mondayOffset);

  const weeks: Date[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(new Date(cur));
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

export type CalendarEvent = {
  date: Date;
  kind: "luca_delivery" | "matteo_delivery" | "publication";
  label: string;
  owner: "Luca" | "Matteo";
  channel?: Channel;
  href: string;
};

/** Events for a month: block delivery deadlines (Luca/Matteo) + content publications. */
export async function getMonthEvents(
  workspaceId: string,
  year: number,
  month: number
): Promise<CalendarEvent[]> {
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 1));
  const events: CalendarEvent[] = [];

  const blocks = await db.block.findMany({
    where: scopedWhere(workspaceId, {
      OR: [
        { lucaDeliveryAt: { gte: start, lt: end } },
        { matteoDeliveryAt: { gte: start, lt: end } },
      ],
    }),
  });
  for (const b of blocks) {
    if (b.lucaDeliveryAt && b.lucaDeliveryAt >= start && b.lucaDeliveryAt < end) {
      events.push({
        date: b.lucaDeliveryAt,
        kind: "luca_delivery",
        label: `Consegna materiali — ${b.label}`,
        owner: "Luca",
        href: "/contenuti",
      });
    }
    if (
      b.matteoDeliveryAt &&
      b.matteoDeliveryAt >= start &&
      b.matteoDeliveryAt < end
    ) {
      events.push({
        date: b.matteoDeliveryAt,
        kind: "matteo_delivery",
        label: `Consegna revisione — ${b.label}`,
        owner: "Matteo",
        href: "/contenuti",
      });
    }
  }

  const contents = await db.content.findMany({
    where: scopedWhere(workspaceId, { publishAt: { gte: start, lt: end } }),
  });
  for (const c of contents) {
    if (c.publishAt) {
      events.push({
        date: c.publishAt,
        kind: "publication",
        label: `Pubblicazione — ${c.title}`,
        owner: "Matteo",
        channel: c.channel,
        href: `/contenuti/${c.id}`,
      });
    }
  }

  return events;
}
