import { signIn } from "@/lib/auth";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-8">
        <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-2xl bg-ink font-heading text-xl text-cream">
          L
        </div>
        <h1 className="text-2xl">Bentornato</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Entra con la tua email per gestire i contenuti.
        </p>
        <form
          action={async (formData) => {
            "use server";
            await signIn("credentials", {
              email: formData.get("email"),
              redirectTo: "/calendario",
            });
          }}
          className="mt-6 space-y-3"
        >
          <input
            name="email"
            type="email"
            required
            placeholder="la-tua@email.it"
            className="w-full rounded-xl border border-border bg-paper px-3.5 py-2.5 text-sm outline-none focus:border-ink/40"
          />
          <button className="flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-transform active:scale-[0.98]">
            Entra
            <ArrowRight size={16} weight="bold" />
          </button>
        </form>
      </div>
    </main>
  );
}
