import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/current";
import { db } from "@/lib/db";
import {
  inviteUserAction,
  removeMemberAction,
} from "@/app/(app)/profilo/actions";
import {
  ArrowLeft,
  PaperPlaneTilt,
  Trash,
  UsersThree,
  ArrowRight,
} from "@phosphor-icons/react/dist/ssr";

export default async function SpazioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) redirect("/login");

  const workspace = await db.workspace.findUnique({
    where: { id },
    include: {
      memberships: { include: { user: true }, orderBy: { role: "asc" } },
    },
  });
  if (!workspace) redirect("/profilo");

  const isMember = workspace.memberships.some((m) => m.userId === user.id);
  if (!isMember && !user.isAdmin) redirect("/profilo");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/profilo"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-ink"
      >
        <ArrowLeft size={15} /> Profilo
      </Link>

      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-ink font-heading text-xl text-cream">
            {workspace.name.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <h1 className="text-3xl">{workspace.name}</h1>
            <p className="mt-0.5 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <UsersThree size={15} /> {workspace.memberships.length}{" "}
              {workspace.memberships.length === 1 ? "membro" : "membri"}
            </p>
          </div>
        </div>
        {isMember && (
          <Link
            href="/home"
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
          >
            Apri la dashboard <ArrowRight size={16} weight="bold" />
          </Link>
        )}
      </header>

      {/* Members */}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(26,24,19,0.04)]">
        <h2 className="mb-3 text-lg">Membri</h2>
        <ul className="space-y-2">
          {workspace.memberships.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between rounded-xl bg-secondary/50 px-3.5 py-2.5"
            >
              <span className="text-sm">
                <span className="font-medium text-ink">
                  {m.user.name ?? m.user.email}
                </span>
                {m.user.name && (
                  <span className="text-muted-foreground"> · {m.user.email}</span>
                )}
                <span
                  className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    m.role === "ADMIN"
                      ? "bg-lavender text-lavender-ink"
                      : "bg-sage text-sage-ink"
                  }`}
                >
                  {m.role === "ADMIN" ? "Admin" : "Collaboratore"}
                </span>
              </span>
              {user.isAdmin && (
                <form action={removeMemberAction}>
                  <input type="hidden" name="membershipId" value={m.id} />
                  <input type="hidden" name="workspaceId" value={workspace.id} />
                  <button
                    aria-label="Rimuovi membro"
                    className="text-muted-foreground transition-colors hover:text-coral-ink"
                  >
                    <Trash size={15} />
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* Invite members (admin only) */}
      {user.isAdmin && (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(26,24,19,0.04)]">
          <h2 className="mb-1 text-lg">Invita membri</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Entrerà con questa email al prossimo accesso (o ricaricando).
          </p>
          <form action={inviteUserAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="workspaceId" value={workspace.id} />
            <input
              name="email"
              type="email"
              required
              placeholder="email del collaboratore"
              className="min-w-[220px] flex-1 rounded-[12px] border border-border bg-secondary/70 px-3.5 py-2.5 text-sm outline-none focus:border-ink/30 focus:bg-paper"
            />
            <select
              name="role"
              defaultValue="COLLABORATOR"
              className="rounded-[12px] border border-border bg-secondary/70 px-3 py-2.5 text-sm outline-none focus:border-ink/30 focus:bg-paper"
            >
              <option value="COLLABORATOR">Collaboratore</option>
              <option value="ADMIN">Admin</option>
            </select>
            <button className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground">
              <PaperPlaneTilt size={15} weight="fill" /> Invita
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
