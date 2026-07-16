import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, currentContext } from "@/lib/current";
import { signOut } from "@/lib/auth";
import { db } from "@/lib/db";
import { isConfigured as googleConfigured } from "@/lib/google-calendar";
import { isDriveConnected } from "@/lib/google-drive";
import { isConfigured as zernioConfigured } from "@/lib/zernio";
import {
  createWorkspaceAction,
  disconnectSocialAccountAction,
  disconnectGoogleCalendarAction,
  disconnectGoogleDriveAction,
} from "./actions";
import { PushToggle } from "@/components/push/push-toggle";
import {
  UsersThree,
  Plus,
  ShieldStar,
  SignOut,
  ArrowRight,
  CalendarCheck,
  HardDrives,
  CheckCircle,
  PlugsConnected,
  InstagramLogo,
  TiktokLogo,
  YoutubeLogo,
  LinkedinLogo,
} from "@phosphor-icons/react/dist/ssr";

const SOCIAL_PLATFORMS = [
  { key: "INSTAGRAM", label: "Instagram", Icon: InstagramLogo },
  { key: "TIKTOK", label: "TikTok", Icon: TiktokLogo },
  { key: "YOUTUBE", label: "YouTube", Icon: YoutubeLogo },
  { key: "LINKEDIN", label: "LinkedIn", Icon: LinkedinLogo },
] as const;

const ZERNIO_BANNER: Record<string, { text: string; ok: boolean }> = {
  ok: { text: "Account social collegato.", ok: true },
  error: { text: "Collegamento social non riuscito. Riprova.", ok: false },
  nonconfig: { text: "Zernio non è configurato.", ok: false },
};
const GOOGLE_BANNER: Record<string, { text: string; ok: boolean }> = {
  connected: { text: "Google Calendar collegato.", ok: true },
  error: { text: "Collegamento Google non riuscito. Riprova.", ok: false },
};
const DRIVE_BANNER: Record<string, { text: string; ok: boolean }> = {
  connected: { text: "Google Drive collegato (archivio originali).", ok: true },
  error: { text: "Collegamento Google Drive non riuscito. Riprova.", ok: false },
};

const TILES = [
  "bg-lavender text-lavender-ink",
  "bg-butter text-butter-ink",
  "bg-blush text-blush-ink",
  "bg-sage text-sage-ink",
  "bg-coral text-coral-ink",
];

export default async function ProfiloPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const ctx = await currentContext();
  const [googleCfg, socialAccounts, driveConnected] = ctx
    ? await Promise.all([
        db.googleCalendarConfig.findUnique({
          where: { workspaceId: ctx.workspaceId },
        }),
        db.socialAccount.findMany({
          where: { workspaceId: ctx.workspaceId },
        }),
        isDriveConnected(),
      ])
    : [null, [], false];
  const socialByPlatform = new Map(
    socialAccounts.map((a) => [a.platform, a])
  );
  const zernioBanner =
    typeof sp.zernio === "string" ? ZERNIO_BANNER[sp.zernio] : undefined;
  const googleBanner =
    typeof sp.google === "string" ? GOOGLE_BANNER[sp.google] : undefined;
  const driveBanner =
    typeof sp.drive === "string" ? DRIVE_BANNER[sp.drive] : undefined;

  const spaces = user.isAdmin
    ? await db.workspace.findMany({
        orderBy: { createdAt: "asc" },
        include: { _count: { select: { memberships: true } } },
      })
    : (
        await db.membership.findMany({
          where: { userId: user.id },
          include: {
            workspace: {
              include: { _count: { select: { memberships: true } } },
            },
          },
          orderBy: { workspace: { createdAt: "asc" } },
        })
      ).map((m) => m.workspace);

  const name = user.name ?? user.email;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Profile header */}
      <header className="flex items-center gap-4">
        <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-ink font-heading text-2xl text-cream">
          {name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl">{name}</h1>
            {user.isAdmin && (
              <span className="inline-flex items-center gap-1 rounded-full bg-lavender px-2.5 py-1 text-[11px] font-medium text-lavender-ink">
                <ShieldStar size={13} weight="fill" /> Super-admin
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{user.email}</p>
        </div>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
          className="ml-auto"
        >
          <button className="inline-flex items-center gap-1.5 rounded-full border border-border bg-paper px-4 py-2.5 text-sm text-ink/70 transition-colors hover:bg-secondary hover:text-ink">
            <SignOut size={16} /> Esci
          </button>
        </form>
      </header>

      {/* I tuoi spazi */}
      <section className="space-y-4">
        <div className="flex items-end justify-between">
          <h2 className="text-xl">I tuoi spazi</h2>
          <span className="text-sm text-muted-foreground">
            {spaces.length} {spaces.length === 1 ? "spazio" : "spazi"}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {spaces.map((ws, i) => (
            <Link
              key={ws.id}
              href={`/profilo/spazi/${ws.id}`}
              className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(26,24,19,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(26,24,19,0.09)]"
            >
              <span
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl font-heading text-xl ${TILES[i % TILES.length]}`}
              >
                {ws.name.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-semibold text-ink">
                  {ws.name}
                </div>
                <div className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <UsersThree size={14} />
                  {ws._count.memberships}{" "}
                  {ws._count.memberships === 1 ? "membro" : "membri"}
                </div>
              </div>
              <ArrowRight
                size={18}
                className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          ))}
          {spaces.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nessuno spazio ancora.
            </p>
          )}
        </div>

        {/* Create space (admin) */}
        {user.isAdmin && (
          <form
            action={createWorkspaceAction}
            className="flex items-center gap-2 rounded-2xl border border-dashed border-border bg-secondary/30 p-3"
          >
            <input
              name="name"
              required
              placeholder="Crea un nuovo spazio (es. un altro cliente)"
              className="flex-1 rounded-[12px] border border-border bg-paper px-3.5 py-2.5 text-sm outline-none focus:border-ink/30"
            />
            <button className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground">
              <Plus size={16} weight="bold" /> Crea
            </button>
          </form>
        )}
      </section>

      {/* Integrazioni */}
      {ctx && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <PlugsConnected size={20} className="text-muted-foreground" />
            <h2 className="text-xl">Integrazioni</h2>
          </div>

          {(zernioBanner || googleBanner || driveBanner) && (
            <div className="space-y-2">
              {[zernioBanner, googleBanner, driveBanner]
                .filter((b): b is { text: string; ok: boolean } => !!b)
                .map((b, i) => (
                  <p
                    key={i}
                    className={`rounded-xl border px-3.5 py-2.5 text-sm ${
                      b.ok
                        ? "border-sage/50 bg-sage/20 text-sage-ink"
                        : "border-coral/50 bg-coral/20 text-coral-ink"
                    }`}
                  >
                    {b.text}
                  </p>
                ))}
            </div>
          )}

          {/* Google Calendar */}
          <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <CalendarCheck size={20} className="text-lavender-ink" />
              <h3 className="text-lg">Google Calendar</h3>
              {googleCfg && (
                <span className="inline-flex items-center gap-1 rounded-full bg-sage px-2.5 py-1 text-[11px] font-medium text-sage-ink">
                  <CheckCircle size={13} weight="fill" /> Collegato
                </span>
              )}
            </div>
            {!googleConfigured() ? (
              <p className="text-sm text-muted-foreground">
                Google Calendar non è configurato.
              </p>
            ) : googleCfg ? (
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  Gli eventi si sincronizzano con il calendario dedicato dello
                  spazio.
                </p>
                <form action={disconnectGoogleCalendarAction}>
                  <button
                    type="submit"
                    className="shrink-0 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-ink"
                  >
                    Disconnetti
                  </button>
                </form>
              </div>
            ) : (
              <a
                href="/api/integrations/google/authorize"
                className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
              >
                <CalendarCheck size={16} /> Connetti Google Calendar
              </a>
            )}
          </div>

          {/* Google Drive (archivio originali) */}
          <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <HardDrives size={20} className="text-butter-ink" />
              <h3 className="text-lg">Google Drive</h3>
              {driveConnected && (
                <span className="inline-flex items-center gap-1 rounded-full bg-sage px-2.5 py-1 text-[11px] font-medium text-sage-ink">
                  <CheckCircle size={13} weight="fill" /> Collegato
                </span>
              )}
            </div>
            {!googleConfigured() ? (
              <p className="text-sm text-muted-foreground">
                Google non è configurato.
              </p>
            ) : driveConnected ? (
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  Gli originali dei video vengono archiviati su Drive.
                </p>
                <form action={disconnectGoogleDriveAction}>
                  <button
                    type="submit"
                    className="shrink-0 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-ink"
                  >
                    Disconnetti
                  </button>
                </form>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Collega l&apos;account Google (personale, con lo spazio) dove
                  archiviare gli originali a piena qualità.
                </p>
                <a
                  href="/api/integrations/google-drive/authorize"
                  className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
                >
                  <HardDrives size={16} /> Connetti Google Drive
                </a>
              </>
            )}
          </div>

          {/* Account social (Zernio) */}
          <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <PlugsConnected size={20} className="text-lavender-ink" />
              <h3 className="text-lg">Account social</h3>
            </div>
            {!zernioConfigured() && (
              <p className="text-sm text-muted-foreground">
                Zernio non è configurato: il collegamento non è disponibile.
              </p>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              {SOCIAL_PLATFORMS.map(({ key, label, Icon }) => {
                const acc = socialByPlatform.get(key);
                return (
                  <div
                    key={key}
                    className="flex items-center gap-3 rounded-xl border border-border bg-paper p-3"
                  >
                    <Icon size={20} className="shrink-0 text-ink/70" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-ink">{label}</div>
                      {acc && (
                        <div className="truncate text-xs text-muted-foreground">
                          {acc.handle ?? "collegato"}
                        </div>
                      )}
                    </div>
                    {acc ? (
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-sage px-2.5 py-1 text-[11px] font-medium text-sage-ink">
                          <CheckCircle size={13} weight="fill" /> Collegato
                        </span>
                        <form action={disconnectSocialAccountAction}>
                          <input type="hidden" name="zernioAccountId" value={acc.zernioAccountId} />
                          <button
                            type="submit"
                            className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-ink"
                          >
                            Disconnetti
                          </button>
                        </form>
                      </div>
                    ) : (
                      <a
                        href={`/api/integrations/zernio/connect/${key}`}
                        className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-ink/80 transition-colors hover:bg-secondary"
                      >
                        Collega
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Notifiche push */}
          <PushToggle />
        </section>
      )}
    </div>
  );
}
