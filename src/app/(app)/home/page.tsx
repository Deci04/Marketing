import Link from "next/link";
import { currentContext } from "@/lib/current";
import { listContents, listRecentContent } from "@/lib/content";
import { countValueConversations } from "@/lib/kpi";
import { deriveStatus } from "@/lib/status";
import { HomeIllustration } from "@/components/home-illustration";
import {
  ArrowRight,
  Stack,
  CalendarBlank,
  ChatCircleDots,
  InstagramLogo,
  YoutubeLogo,
} from "@phosphor-icons/react/dist/ssr";

const fmtLong = (d: Date) =>
  d.toLocaleDateString("it-IT", { day: "numeric", month: "long" });

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

export default async function HomePage() {
  const ctx = await currentContext();
  if (!ctx) return null;
  const [contents, vcCount, recent] = await Promise.all([
    listContents(ctx.workspaceId),
    countValueConversations(ctx.workspaceId),
    listRecentContent(ctx.workspaceId, 5),
  ]);

  const now = Date.now();
  const upcoming = contents
    .filter((c) => c.publishAt && c.publishAt.getTime() >= now)
    .sort((a, b) => a.publishAt!.getTime() - b.publishAt!.getTime());
  const next = upcoming[0] ?? null;
  const name = (ctx.user.name ?? ctx.user.email ?? "").split(" ")[0] || "ciao";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-border bg-paper p-7">
        <div className="flex items-center justify-between gap-6">
          <div className="max-w-md">
            <p className="text-sm text-muted-foreground">Spazio di {ctx.workspace.name}</p>
            <h1 className="mt-1 font-heading text-4xl text-ink">Bentornato, {name}</h1>
            <p className="mt-3 text-[15px] text-muted-foreground">
              Ogni contenuto è un passo verso una conversazione di valore. Ecco a che punto sei.
            </p>
            <Link
              href="/calendario"
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-transform active:scale-[0.98]"
            >
              Vai al calendario <ArrowRight size={15} />
            </Link>
          </div>
          <HomeIllustration className="hidden h-44 w-auto shrink-0 md:block" />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Link
          href="/contenuti"
          className="group rounded-2xl bg-lavender p-4 transition-transform hover:-translate-y-0.5"
        >
          <div className="flex items-center justify-between text-lavender-ink">
            <span className="text-xs">In pipeline</span>
            <Stack size={18} weight="fill" />
          </div>
          <div className="mt-1 text-3xl font-semibold text-lavender-ink">{contents.length}</div>
        </Link>
        <Link
          href="/calendario"
          className="group rounded-2xl bg-butter p-4 transition-transform hover:-translate-y-0.5"
        >
          <div className="flex items-center justify-between text-butter-ink">
            <span className="text-xs">Prossima uscita</span>
            <CalendarBlank size={18} weight="fill" />
          </div>
          <div className="mt-1 text-lg font-semibold leading-tight text-butter-ink">
            {next ? fmtLong(next.publishAt!) : "—"}
          </div>
          {next && (
            <div className="mt-0.5 truncate text-xs text-butter-ink/70">{next.title}</div>
          )}
        </Link>
        <Link
          href="/kpi"
          className="group rounded-2xl bg-blush p-4 transition-transform hover:-translate-y-0.5"
        >
          <div className="flex items-center justify-between text-blush-ink">
            <span className="text-xs">Conversazioni di valore</span>
            <ChatCircleDots size={18} weight="fill" />
          </div>
          <div className="mt-1 text-3xl font-semibold text-blush-ink">{vcCount}</div>
        </Link>
      </div>

      <div>
        <h2 className="mb-3 text-lg">Novità</h2>
        {recent.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
            Nessuna novità recente.
          </div>
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {recent.map((c) => {
              const isYt = c.channel === "YOUTUBE";
              const Logo = isYt ? YoutubeLogo : InstagramLogo;
              const ink = isYt ? "text-coral-ink" : "text-blush-ink";
              const status = deriveStatus({
                publishAt: c.publishAt,
                lucaDeliveryAt: c.block?.lucaDeliveryAt ?? null,
                matteoDeliveryAt: c.block?.matteoDeliveryAt ?? null,
              });
              return (
                <Link
                  key={c.id}
                  href={`/contenuti/${c.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/40"
                >
                  <span className={`shrink-0 ${ink}`}>
                    <Logo size={18} weight="fill" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                    {c.title}
                  </span>
                  <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
                    {status}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {relTime(c.createdAt)}
                  </span>
                  <ArrowRight size={14} className="shrink-0 text-muted-foreground" />
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-lg">Prossime uscite</h2>
        {upcoming.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
            Nessuna uscita in programma. Pianifica un contenuto dal calendario.
          </div>
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {upcoming.slice(0, 5).map((c) => {
              const isYt = c.channel === "YOUTUBE";
              const Logo = isYt ? YoutubeLogo : InstagramLogo;
              const ink = isYt ? "text-coral-ink" : "text-blush-ink";
              return (
                <Link
                  key={c.id}
                  href={`/contenuti/${c.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/40"
                >
                  <span className={`shrink-0 ${ink}`}>
                    <Logo size={18} weight="fill" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                    {c.title}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {fmtLong(c.publishAt!)}
                  </span>
                  <ArrowRight size={14} className="shrink-0 text-muted-foreground" />
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
