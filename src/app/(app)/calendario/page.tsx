import Link from "next/link";
import { currentContext } from "@/lib/current";
import { getMonthEvents, monthMatrix, type CalendarEvent } from "@/lib/calendar";

const MONTHS = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];
const DOW = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

const dayKey = (d: Date) =>
  `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;

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

  const [events, weeks] = [
    await getMonthEvents(ctx.workspaceId, year, month),
    monthMatrix(year, month),
  ];

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {MONTHS[month]} {year}
        </h1>
        <div className="flex gap-2">
          <Link
            href={`/calendario?y=${prev.y}&m=${prev.m}`}
            className="rounded-md border px-3 py-1 text-sm hover:bg-neutral-100"
          >
            ←
          </Link>
          <Link
            href="/calendario"
            className="rounded-md border px-3 py-1 text-sm hover:bg-neutral-100"
          >
            Oggi
          </Link>
          <Link
            href={`/calendario?y=${next.y}&m=${next.m}`}
            className="rounded-md border px-3 py-1 text-sm hover:bg-neutral-100"
          >
            →
          </Link>
        </div>
      </div>

      <div className="flex gap-4 text-xs text-neutral-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-amber-500" /> Luca
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-violet-500" /> Matteo
        </span>
        <span className="flex items-center gap-1">● Pubblicazione</span>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-neutral-200">
        {DOW.map((d) => (
          <div
            key={d}
            className="bg-neutral-50 px-2 py-1 text-center text-xs font-medium text-neutral-500"
          >
            {d}
          </div>
        ))}
        {weeks.flat().map((day) => {
          const inMonth = day.getUTCMonth() === month;
          const isToday = dayKey(day) === todayKey;
          const dayEvents = byDay.get(dayKey(day)) ?? [];
          return (
            <div
              key={day.toISOString()}
              className={`min-h-24 p-1 ${inMonth ? "bg-white" : "bg-neutral-50 text-neutral-400"}`}
            >
              <div
                className={`px-1 text-xs ${isToday ? "font-bold text-blue-600" : ""}`}
              >
                {day.getUTCDate()}
              </div>
              <div className="mt-1 space-y-1">
                {dayEvents.map((e, i) => {
                  const color =
                    e.owner === "Luca"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-violet-100 text-violet-800";
                  return (
                    <Link
                      key={i}
                      href={e.href}
                      title={e.label}
                      className={`block truncate rounded px-1 py-0.5 text-[11px] ${color}`}
                    >
                      {e.kind === "publication" ? "● " : ""}
                      {e.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-neutral-500">
        Scadenze dei blocchi (Luca/Matteo) e pubblicazioni dei contenuti, al
        giorno giusto. Clicca un evento per aprire il contenuto.
      </p>
    </div>
  );
}
