import Link from "next/link";
import { currentContext } from "@/lib/current";
import {
  getMonthEvents,
  getMonthBlocks,
  monthMatrix,
  type CalendarEvent,
} from "@/lib/calendar";
import { CaretLeft, CaretRight } from "@phosphor-icons/react/dist/ssr";
import {
  EventDrawerProvider,
  EventChip,
  type DrawerEvent,
} from "@/components/calendar/event-drawer";

const MONTHS = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];
const DOW = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

const dayKey = (d: Date) =>
  `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;

const toDrawer = (e: CalendarEvent): DrawerEvent => ({
  date: e.date.toISOString(),
  kind: e.kind,
  label: e.label,
  owner: e.owner,
  channel: e.channel,
  href: e.href,
});

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

  const [events, blocks] = await Promise.all([
    getMonthEvents(ctx.workspaceId, year, month),
    getMonthBlocks(ctx.workspaceId, year, month),
  ]);
  const weeks = monthMatrix(year, month);

  const byDay = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const k = dayKey(e.date);
    const arr = byDay.get(k);
    if (arr) arr.push(e);
    else byDay.set(k, [e]);
  }

  const prev = month === 0 ? { y: year - 1, m: 11 } : { y: year, m: month - 1 };
  const next = month === 11 ? { y: year + 1, m: 0 } : { y: year, m: month + 1 };
  const todayKey = dayKey(
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  );
  const navBtn =
    "flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card transition-colors hover:bg-secondary";

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl">
          {MONTHS[month]} <span className="text-muted-foreground">{year}</span>
        </h1>
        <div className="flex items-center gap-2">
          <Link href={`/calendario?y=${prev.y}&m=${prev.m}`} className={navBtn} aria-label="Mese precedente">
            <CaretLeft size={16} />
          </Link>
          <Link href="/calendario" className="rounded-full border border-border bg-card px-4 py-2 text-sm transition-colors hover:bg-secondary">
            Oggi
          </Link>
          <Link href={`/calendario?y=${next.y}&m=${next.m}`} className={navBtn} aria-label="Mese successivo">
            <CaretRight size={16} />
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blush" /> Consegna Luca</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-lavender" /> Consegna Matteo</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-sage" /> Pubblicazione</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-3.5 rounded border border-border bg-secondary" /> Blocco</span>
      </div>

      <EventDrawerProvider>
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="grid grid-cols-7 border-b border-border">
            {DOW.map((d) => (
              <div key={d} className="px-2 py-2 text-center text-xs text-muted-foreground">
                {d}
              </div>
            ))}
          </div>

          {weeks.map((week, wi) => {
            const ws = week[0].getTime();
            const we = week[6].getTime();
            const segs = blocks
              .filter((b) => b.end.getTime() >= ws && b.start.getTime() <= we)
              .map((b) => {
                const s = b.start.getTime() < ws ? week[0] : b.start;
                const e = b.end.getTime() > we ? week[6] : b.end;
                const startCol = week.findIndex((d) => dayKey(d) === dayKey(s));
                const endCol = week.findIndex((d) => dayKey(d) === dayKey(e));
                return {
                  id: b.id,
                  label: b.label,
                  startCol: startCol < 0 ? 0 : startCol,
                  endCol: endCol < 0 ? 6 : endCol,
                  startsHere: b.start.getTime() >= ws,
                };
              });

            return (
              <div key={wi} className="border-b border-border last:border-b-0">
                {segs.length > 0 && (
                  <div className="grid grid-cols-7 gap-1 px-1 pt-1">
                    {segs.map((seg) => (
                      <div
                        key={seg.id}
                        style={{ gridColumn: `${seg.startCol + 1} / ${seg.endCol + 2}` }}
                        className="truncate rounded-md border border-border bg-secondary px-2 py-0.5 text-[11px] font-medium text-ink/70"
                      >
                        {seg.startsHere ? `Blocco · ${seg.label}` : `↪ ${seg.label}`}
                      </div>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-7">
                  {week.map((day, di) => {
                    const inMonth = day.getUTCMonth() === month;
                    const isToday = dayKey(day) === todayKey;
                    const dayEvents = byDay.get(dayKey(day)) ?? [];
                    const lastCol = di === 6;
                    return (
                      <div
                        key={day.toISOString()}
                        className={`min-h-24 p-1.5 ${lastCol ? "" : "border-r"} border-border ${inMonth ? "" : "bg-cream/50"}`}
                      >
                        <div
                          className={`mb-1 inline-flex h-5 min-w-5 items-center justify-center px-1 text-xs ${
                            isToday
                              ? "rounded-full bg-primary font-medium text-primary-foreground"
                              : inMonth
                                ? "text-ink"
                                : "text-muted-foreground"
                          }`}
                        >
                          {day.getUTCDate()}
                        </div>
                        <div className="space-y-1">
                          {dayEvents.map((e, i) => (
                            <EventChip key={i} e={toDrawer(e)} />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </EventDrawerProvider>
    </div>
  );
}
