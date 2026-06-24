import Link from "next/link";
import { signOut } from "@/lib/auth";
import { EnvelopeSimple, ArrowRight } from "@phosphor-icons/react/dist/ssr";

/** Shown when a user is logged in but has no workspace membership yet —
 *  they wait for an admin to invite their email, then reload. */
export function NoWorkspace({
  email,
  isAdmin,
}: {
  email: string;
  isAdmin: boolean;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-[0_1px_2px_rgba(26,24,19,0.04)]">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-butter text-butter-ink">
          <EnvelopeSimple size={22} weight="fill" />
        </div>
        <h1 className="text-2xl">Ci sei quasi</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Hai effettuato l&rsquo;accesso come{" "}
          <span className="font-medium text-ink">{email}</span>, ma non sei ancora
          stato invitato a uno spazio. Chiedi un invito — poi{" "}
          <span className="font-medium text-ink">ricarica la pagina</span>.
        </p>

        {isAdmin && (
          <Link
            href="/admin"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-transform active:scale-[0.98]"
          >
            Vai all&rsquo;area admin
            <ArrowRight size={16} weight="bold" />
          </Link>
        )}

        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
          className="mt-4"
        >
          <button className="text-xs text-muted-foreground underline hover:text-ink">
            Esci
          </button>
        </form>
      </div>
    </main>
  );
}
