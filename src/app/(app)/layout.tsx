import Link from "next/link";
import { currentContext } from "@/lib/current";
import { signOut } from "@/lib/auth";

const NAV = [
  { href: "/calendario", label: "🗓️ Calendario" },
  { href: "/archivio", label: "🗂️ Archivio" },
  { href: "/kpi", label: "📊 KPI" },
];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await currentContext();
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r p-4">
        <div className="mb-6 text-sm font-semibold">
          {ctx?.workspace.name ?? "—"}
        </div>
        <nav className="space-y-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="block rounded-md px-3 py-2 text-sm hover:bg-neutral-100"
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="flex-1">
        <header className="flex items-center justify-between border-b px-6 py-3">
          <span className="text-sm text-neutral-500">
            {ctx?.user.name ?? ctx?.user.email}
          </span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button className="text-sm text-neutral-500 hover:text-black">
              Esci
            </button>
          </form>
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
