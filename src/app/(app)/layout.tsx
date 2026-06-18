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

  return (
    <div className="flex min-h-screen gap-0 p-3">
      <aside className="sticky top-3 flex h-[calc(100vh-1.5rem)] w-60 shrink-0 flex-col gap-7 rounded-3xl bg-sidebar p-5 text-sidebar-foreground">
        <div className="flex items-center gap-2.5 px-1">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cream font-heading text-lg text-ink">
            {(ctx?.workspace.name ?? "L").slice(0, 1)}
          </div>
          <span className="text-base font-medium">
            {ctx?.workspace.name ?? "—"}
          </span>
        </div>

        <SidebarNav />

        <div className="mt-auto flex items-center justify-between border-t border-sidebar-border pt-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs">
              {initials}
            </div>
            <span className="truncate text-xs text-sidebar-foreground/70">
              {name}
            </span>
          </div>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button
              aria-label="Esci"
              className="shrink-0 text-sidebar-foreground/60 transition-colors hover:text-sidebar-foreground"
            >
              <SignOut size={18} />
            </button>
          </form>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-6 py-5">{children}</main>
    </div>
  );
}
