import { currentContext } from "@/lib/current";
import { getMonthItems, getMonthBlocks, monthMatrix } from "@/lib/calendar";
import { listContents } from "@/lib/content";
import { CalendarBoard } from "@/components/calendar/calendar-board";

const MONTHS = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: Promise<{ y?: string; m?: string }>;
}) {
  const ctx = await currentContext();
  if (!ctx) return null;
  const sp = await searchParams;
  const now = new Date();
  const year = sp.y ? parseInt(sp.y, 10) : now.getUTCFullYear();
  const month = sp.m != null ? parseInt(sp.m, 10) : now.getUTCMonth();

  const [items, blocks, allContents] = await Promise.all([
    getMonthItems(ctx.workspaceId, year, month),
    getMonthBlocks(ctx.workspaceId, year, month),
    listContents(ctx.workspaceId),
  ]);
  const contentTitles = allContents.map((c) => c.title);
  const matrix = monthMatrix(year, month);
  const todayKey = ymd(
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  );

  const weeks = matrix.map((week) =>
    week.map((d) => ({
      ymd: ymd(d),
      day: d.getUTCDate(),
      inMonth: d.getUTCMonth() === month,
      isToday: ymd(d) === todayKey,
    }))
  );

  const itemDtos = items.map((it) => ({
    refType: it.refType,
    refId: it.refId,
    ymd: ymd(it.date),
    label: it.label,
    owner: it.owner,
    channel: it.channel as "INSTAGRAM" | "YOUTUBE" | null,
    href: it.href,
    title: it.title,
    notes: it.notes,
  }));

  const bandDtos = blocks.map((b) => ({
    id: b.id,
    label: b.label,
    start: ymd(b.start),
    end: ymd(b.end),
    notes: b.notes ?? null,
    lucaDeliveryAt: b.lucaDeliveryAt,
    matteoDeliveryAt: b.matteoDeliveryAt,
  }));

  const prev = month === 0 ? { y: year - 1, m: 11 } : { y: year, m: month - 1 };
  const next = month === 11 ? { y: year + 1, m: 0 } : { y: year, m: month + 1 };

  // Pre-fill the responsible on quick-create with the logged-in user (2-person workspace).
  const who = `${ctx.user.name ?? ""} ${ctx.user.email ?? ""}`.toLowerCase();
  const defaultResponsible: "LUCA" | "MATTEO" | null = who.includes("matteo")
    ? "MATTEO"
    : who.includes("luca")
      ? "LUCA"
      : null;

  return (
    <div className="mx-auto max-w-5xl">
      <CalendarBoard
        monthLabel={MONTHS[month]}
        year={year}
        weeks={weeks}
        items={itemDtos}
        blocks={bandDtos}
        contents={allContents.map((c) => ({
          id: c.id,
          title: c.title,
          publishAt: c.publishAt ? ymd(c.publishAt) : null,
          blockId: c.blockId,
        }))}
        defaultResponsible={defaultResponsible}
        contentTitles={contentTitles}
        prevHref={`/calendario?y=${prev.y}&m=${prev.m}`}
        nextHref={`/calendario?y=${next.y}&m=${next.m}`}
      />
    </div>
  );
}
