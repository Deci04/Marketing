import Link from "next/link";
import { redirect } from "next/navigation";
import { currentContext, currentUser } from "@/lib/current";
import { signOut } from "@/lib/auth";
import { unreadCount } from "@/lib/activity";
import { SidebarNav } from "@/components/sidebar-nav";
import { NotificationBell } from "@/components/notification-bell";
import { ChatPanel } from "@/components/chat/chat-panel";
import { MobileTopBar } from "@/components/mobile-topbar";
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
  const unread = await unreadCount(
    ctx.workspaceId,
    ctx.user.id,
    ctx.user.notificationsSeenAt ?? null
  );

  const signOutAction = async () => {
    "use server";
    await signOut({ redirectTo: "/login" });
  };

  return (
    <div className="flex min-h-screen flex-col md:flex-row md:gap-2 md:p-3">
      <MobileTopBar
        workspaceInitial={wsInitial}
        userName={name}
        unread={unread}
        logoutSlot={
          <form action={signOutAction}>
            <button className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-base text-ink/70 transition-colors hover:bg-secondary">
              <SignOut size={20} className="shrink-0" />
              Esci
            </button>
          </form>
        }
      />
      <div className="relative hidden w-16 shrink-0 md:block">
        <aside className="sticky top-3 z-30 flex h-[calc(100vh-1.5rem)] flex-col gap-2">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-2xl bg-ink font-heading text-lg text-paper shadow-md"
            title={ctx?.workspace.name ?? ""}
          >
            {wsInitial}
          </div>

          <SidebarNav />

          <div className="mt-auto flex flex-col gap-2">
            <NotificationBell count={unread} />
            <Link
              href="/profilo"
              title={`${name} — profilo e spazi`}
              className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-paper text-sm text-ink transition-colors hover:bg-secondary hover:text-ink"
            >
              {initials}
            </Link>
            <form action={signOutAction}>
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

      <main className="min-w-0 flex-1 px-3 pb-4 pt-3 md:px-0 md:py-2 md:pl-1">{children}</main>
      {modal}
      <ChatPanel userName={name} />
    </div>
  );
}
