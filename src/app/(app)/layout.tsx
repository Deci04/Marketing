import { currentContext } from "@/lib/current";
import { signOut } from "@/lib/auth";
import { SidebarNav } from "@/components/sidebar-nav";
import { SignOut } from "@phosphor-icons/react/dist/ssr";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await currentContext();
  const name = ctx?.user.name ?? ctx?.user.email ?? "—";
  const initials = name.slice(0, 1).toUpperCase();
  const wsInitial = (ctx?.workspace.name ?? "L").slice(0, 1);

  return (
    <div className="flex min-h-screen gap-3 p-3">
      <div className="relative w-16 shrink-0">
        <aside className="group absolute left-0 top-0 z-30 flex h-[calc(100vh-1.5rem)] w-16 flex-col gap-6 overflow-hidden rounded-3xl bg-sidebar p-3 text-sidebar-foreground transition-[width] duration-200 hover:w-56 hover:shadow-2xl">
          <div className="flex items-center gap-2.5 px-1">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cream font-heading text-lg text-ink">
              {wsInitial}
            </div>
            <span className="whitespace-nowrap text-base font-medium opacity-0 transition-opacity duration-150 group-hover:opacity-100">
              {ctx?.workspace.name ?? "—"}
            </span>
          </div>

          <SidebarNav />

          <div className="mt-auto flex items-center gap-2.5 border-t border-sidebar-border pt-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs">
              {initials}
            </div>
            <span className="min-w-0 flex-1 truncate text-xs text-sidebar-foreground/70 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
              {name}
            </span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
              className="opacity-0 transition-opacity duration-150 group-hover:opacity-100"
            >
              <button
                aria-label="Esci"
                className="text-sidebar-foreground/60 transition-colors hover:text-sidebar-foreground"
              >
                <SignOut size={18} />
              </button>
            </form>
          </div>
        </aside>
      </div>

      <main className="min-w-0 flex-1 py-2">{children}</main>
    </div>
  );
}
