import Link from "next/link";
import { currentContext } from "@/lib/current";
import { getMonthEvents, monthMatrix, type CalendarEvent } from "@/lib/calendar";
import { CaretLeft, CaretRight } from "@phosphor-icons/react/dist/ssr";

const MONTHS = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];
const DOW = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

const dayKey = (d: Date) =>
  `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;

const KIND_STYLE: Record<CalendarEvent["kind"], string> = {
  luca_delivery: "bg-blush text-blush-ink",
  matteo_delivery: "bg-lavender text-lavender-ink",
  publication: "bg-sage text-sage-ink",
};

function Legend({ tone, label }: { tone: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${tone}`} />
      {label}
    </span>
  );
}

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

  const events = await getMonthEvents(ctx.workspaceId, year, month);
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
          <Link
            href="/calendario"
            className="rounded-full border border-border bg-card px-4 py-2 text-sm transition-colors hover:bg-secondary"
          >
            Oggi
          </Link>
          <Link href={`/calendario?y=${next.y}&m=${next.m}`} className={navBtn} aria-label="Mese successivo">
            <CaretRight size={16} />
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <Legend tone="bg-blush" label="Consegna Luca" />
        <Legend tone="bg-lavender" label="Consegna Matteo" />
        <Legend tone="bg-sage" label="Pubblicazione" />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="grid grid-cols-7 border-b border-border">
          {DOW.map((d) => (
            <div key={d} className="px-2 py-2 text-center text-xs text-muted-foreground">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {weeks.flat().map((day, idx) => {
            const inMonth = day.getUTCMonth() === month;
            const isToday = dayKey(day) === todayKey;
            const dayEvents = byDay.get(dayKey(day)) ?? [];
            const lastCol = idx % 7 === 6;
            const lastRow = idx >= 35;
            return (
              <div
                key={day.toISOString()}
                className={`min-h-24 border-border p-1.5 ${lastCol ? "" : "border-r"} ${lastRow ? "" : "border-b"} ${inMonth ? "" : "bg-cream/50"}`}
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
                    <Link
                      key={i}
                      href={e.href}
                      title={e.label}
                      className={`block truncate rounded-md px-1.5 py-0.5 text-[11px] ${KIND_STYLE[e.kind]}`}
                    >
                      {e.label}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
