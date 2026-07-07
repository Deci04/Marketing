import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/workspace";
import { syncItemOut, deleteItemOut } from "@/lib/google-calendar";
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

// --- Interactive board: unified draggable items ---

export type BoardItemRef = "luca" | "matteo" | "publication" | "event";

export type BoardItem = {
  refType: BoardItemRef;
  refId: string;
  date: Date;
  label: string;
  owner: "Luca" | "Matteo" | null;
  channel: Channel | null;
  href: string | null;
};

/** All draggable items in a month: block delivery deadlines, content
 * publications, and custom calendar events. */
export async function getMonthItems(
  workspaceId: string,
  year: number,
  month: number
): Promise<BoardItem[]> {
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 1));
  const items: BoardItem[] = [];

  // Only blocks with a delivery deadline in this month can contribute items here
  // (the in-loop checks still guard correctness). Avoids loading the whole table.
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
      items.push({ refType: "luca", refId: b.id, date: b.lucaDeliveryAt, label: `Luca · ${b.label}`, owner: "Luca", channel: null, href: null });
    }
    if (b.matteoDeliveryAt && b.matteoDeliveryAt >= start && b.matteoDeliveryAt < end) {
      items.push({ refType: "matteo", refId: b.id, date: b.matteoDeliveryAt, label: `Matteo · ${b.label}`, owner: "Matteo", channel: null, href: null });
    }
  }

  const contents = await db.content.findMany({
    where: scopedWhere(workspaceId, { publishAt: { gte: start, lt: end } }),
  });
  for (const c of contents) {
    if (c.publishAt) {
      items.push({ refType: "publication", refId: c.id, date: c.publishAt, label: c.title, owner: "Matteo", channel: c.channel, href: `/contenuti/${c.id}` });
    }
  }

  const events = await db.calendarEvent.findMany({
    where: scopedWhere(workspaceId, { date: { gte: start, lt: end } }),
  });
  for (const e of events) {
    const owner = e.responsible === "LUCA" ? "Luca" : e.responsible === "MATTEO" ? "Matteo" : null;
    items.push({ refType: "event", refId: e.id, date: e.date, label: e.title, owner, channel: null, href: null });
  }

  return items;
}

async function scopedBlock(workspaceId: string, id: string) {
  return db.block.findFirst({ where: scopedWhere(workspaceId, { id }), select: { id: true } });
}

/** Set one of a block's delivery deadlines (Luca/Matteo) to a given day. */
export async function setBlockDelivery(
  workspaceId: string,
  blockId: string,
  who: "luca" | "matteo",
  date: Date
) {
  if (!(await scopedBlock(workspaceId, blockId))) return null;
  const updated = await db.block.update({
    where: { id: blockId },
    data: who === "luca" ? { lucaDeliveryAt: date } : { matteoDeliveryAt: date },
  });
  // G: USCITA — push della delivery date (who è già "luca"|"matteo").
  void syncItemOut(workspaceId, who, blockId).catch(() => {});
  return updated;
}

export async function moveItem(
  workspaceId: string,
  refType: BoardItemRef,
  refId: string,
  date: Date
) {
  if (refType === "luca" || refType === "matteo") {
    if (!(await scopedBlock(workspaceId, refId))) return null;
    const updated = await db.block.update({
      where: { id: refId },
      data: refType === "luca" ? { lucaDeliveryAt: date } : { matteoDeliveryAt: date },
    });
    void syncItemOut(workspaceId, refType, refId).catch(() => {}); // G: USCITA
    return updated;
  }
  if (refType === "publication") {
    const c = await db.content.findFirst({ where: scopedWhere(workspaceId, { id: refId }), select: { id: true } });
    if (!c) return null;
    const updated = await db.content.update({ where: { id: refId }, data: { publishAt: date } });
    void syncItemOut(workspaceId, refType, refId).catch(() => {}); // G: USCITA
    return updated;
  }
  const e = await db.calendarEvent.findFirst({ where: scopedWhere(workspaceId, { id: refId }), select: { id: true } });
  if (!e) return null;
  const updated = await db.calendarEvent.update({ where: { id: refId }, data: { date } });
  void syncItemOut(workspaceId, refType, refId).catch(() => {}); // G: USCITA
  return updated;
}

export async function deleteItem(
  workspaceId: string,
  refType: BoardItemRef,
  refId: string
) {
  if (refType === "luca" || refType === "matteo") {
    if (!(await scopedBlock(workspaceId, refId))) return null;
    const updated = await db.block.update({
      where: { id: refId },
      data: refType === "luca" ? { lucaDeliveryAt: null } : { matteoDeliveryAt: null },
    });
    // G: la data è azzerata → l'item sparisce dal board → rimuovi da Google.
    void deleteItemOut(workspaceId, refType, refId).catch(() => {});
    return updated;
  }
  if (refType === "publication") {
    const c = await db.content.findFirst({ where: scopedWhere(workspaceId, { id: refId }), select: { id: true } });
    if (!c) return null;
    const updated = await db.content.update({ where: { id: refId }, data: { publishAt: null } });
    void deleteItemOut(workspaceId, refType, refId).catch(() => {}); // G: USCITA
    return updated;
  }
  const e = await db.calendarEvent.findFirst({ where: scopedWhere(workspaceId, { id: refId }), select: { id: true } });
  if (!e) return null;
  // G: vero delete dell'evento → rimuovi da Google prima di eliminare la riga.
  void deleteItemOut(workspaceId, "event", refId).catch(() => {});
  return db.calendarEvent.delete({ where: { id: refId } });
}

export async function addEvent(
  workspaceId: string,
  data: { date: Date; title: string; responsible?: string | null }
) {
  const created = await db.calendarEvent.create({
    data: { workspaceId, date: data.date, title: data.title, responsible: data.responsible || null },
  });
  // G: USCITA — push del nuovo evento su Google.
  void syncItemOut(workspaceId, "event", created.id).catch(() => {});
  return created;
}

export async function createBlockRange(
  workspaceId: string,
  data: {
    label: string;
    startDate: Date;
    endDate: Date;
    lucaDeliveryAt?: Date | null;
    matteoDeliveryAt?: Date | null;
  }
) {
  const block = await db.block.create({
    data: {
      workspaceId,
      label: data.label,
      startDate: data.startDate,
      endDate: data.endDate,
      lucaDeliveryAt: data.lucaDeliveryAt ?? data.startDate,
      matteoDeliveryAt: data.matteoDeliveryAt ?? data.endDate,
    },
  });
  // auto-include contents whose publication falls in the range and aren't already in a block
  await db.content.updateMany({
    where: scopedWhere(workspaceId, {
      blockId: null,
      publishAt: { gte: data.startDate, lte: data.endDate },
    }),
    data: { blockId: block.id },
  });
  // G: USCITA — il nuovo block ha entrambe le delivery date di default → push di entrambe.
  void syncItemOut(workspaceId, "luca", block.id).catch(() => {});
  void syncItemOut(workspaceId, "matteo", block.id).catch(() => {});
  return block;
}

export type CalendarBlock = {
  id: string;
  label: string;
  start: Date;
  end: Date;
};

/** Blocks overlapping the month, with their span (earliest → latest of their
 * deadlines + content publications). Used to draw the multi-day band. */
export async function getMonthBlocks(
  workspaceId: string,
  year: number,
  month: number
): Promise<CalendarBlock[]> {
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 1));

  const blocks = await db.block.findMany({
    where: scopedWhere(workspaceId),
    include: { contents: { select: { publishAt: true } } },
  });

  const result: CalendarBlock[] = [];
  for (const b of blocks) {
    // Prefer the explicit range; fall back to the span of deadlines + publications.
    let s: Date | null = b.startDate;
    let e: Date | null = b.endDate;
    if (!s || !e) {
      const dates = [
        b.lucaDeliveryAt,
        b.matteoDeliveryAt,
        ...b.contents.map((c) => c.publishAt),
      ].filter((d): d is Date => d != null);
      if (dates.length > 0) {
        s = s ?? new Date(Math.min(...dates.map((d) => d.getTime())));
        e = e ?? new Date(Math.max(...dates.map((d) => d.getTime())));
      }
    }
    if (!s || !e) continue;
    if (e >= start && s < end) {
      result.push({ id: b.id, label: b.label, start: s, end: e });
    }
  }
  return result;
}

/** Resize a block by moving one edge of its range; re-includes contents that
 * now fall inside the (normalized) range and aren't already in a block. */
export async function resizeBlock(
  workspaceId: string,
  id: string,
  edge: "start" | "end",
  date: Date
) {
  const b = await db.block.findFirst({
    where: scopedWhere(workspaceId, { id }),
    select: { id: true, startDate: true, endDate: true },
  });
  if (!b) return null;
  let startDate = edge === "start" ? date : b.startDate;
  let endDate = edge === "end" ? date : b.endDate;
  if (startDate && endDate && startDate > endDate) {
    [startDate, endDate] = [endDate, startDate];
  }
  await db.block.update({ where: { id }, data: { startDate, endDate } });
  // G: NESSUNA push — il resize muove startDate/endDate del block, non le delivery
  // date (lucaDeliveryAt/matteoDeliveryAt), che sono gli unici item del board
  // mappati su Google. Sincronizzare qui produrrebbe sync spurie.
  if (startDate && endDate) {
    await db.content.updateMany({
      where: scopedWhere(workspaceId, {
        blockId: null,
        publishAt: { gte: startDate, lte: endDate },
      }),
      data: { blockId: id },
    });
  }
  return true;
}
