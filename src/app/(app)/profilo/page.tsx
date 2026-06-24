import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/current";
import { signOut } from "@/lib/auth";
import { db } from "@/lib/db";
import { createWorkspaceAction } from "./actions";
import {
  UsersThree,
  Plus,
  ShieldStar,
  SignOut,
  ArrowRight,
} from "@phosphor-icons/react/dist/ssr";

const TILES = [
  "bg-lavender text-lavender-ink",
  "bg-butter text-butter-ink",
  "bg-blush text-blush-ink",
  "bg-sage text-sage-ink",
  "bg-coral text-coral-ink",
];

export default async function ProfiloPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

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
    </div>
  );
}
