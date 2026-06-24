import Link from "next/link";
import { redirect } from "next/navigation";
import { currentContext, currentUser } from "@/lib/current";
import { signOut } from "@/lib/auth";
import { SidebarNav } from "@/components/sidebar-nav";
import { ChatPanel } from "@/components/chat/chat-panel";
import { NoWorkspace } from "@/components/no-workspace";
import { SignOut } from "@phosphor-icons/react/dist/ssr";

export default async function AppLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal?: React.ReactNode;
}) {
  const user = await currentUser();
  // No valid session (e.g. stale/undecryptable cookie) → back to login.
  if (!user) redirect("/login");
  const ctx = await currentContext();
  // Logged in but not invited to any workspace yet → empty "ask for invite" state.
  if (!ctx) return <NoWorkspace email={user.email} isAdmin={user.isAdmin} />;
  const name = ctx.user.name ?? ctx.user.email ?? "—";
  const initials = name.slice(0, 1).toUpperCase();
  const wsInitial = (ctx?.workspace.name ?? "L").slice(0, 1);

  return (
    <div className="flex min-h-screen gap-2 p-3">
      <div className="relative w-16 shrink-0">
        <aside className="absolute left-0 top-0 z-30 flex h-[calc(100vh-1.5rem)] flex-col gap-2">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-2xl bg-ink font-heading text-lg text-paper shadow-md"
            title={ctx?.workspace.name ?? ""}
          >
            {wsInitial}
          </div>

          <SidebarNav />

          <div className="mt-auto flex flex-col gap-2">
            <Link
              href="/profilo"
              title={`${name} — profilo e spazi`}
              className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-paper text-sm text-ink transition-colors hover:bg-secondary hover:text-ink"
            >
              {initials}
            </Link>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <button
                aria-label="Esci"
                className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-paper text-ink/55 transition-colors hover:bg-secondary hover:text-ink"
              >
                <SignOut size={18} />
              </button>
            </form>
          </div>
        </aside>
      </div>

      <main className="min-w-0 flex-1 py-2 pl-1">{children}</main>
      {modal}
      <ChatPanel userName={name} />
    </div>
  );
}
