import { signIn } from "@/lib/auth";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form
        action={async (formData) => {
          "use server";
          await signIn("credentials", {
            email: formData.get("email"),
            redirectTo: "/calendario",
          });
        }}
        className="w-full max-w-sm space-y-4 rounded-xl border p-6 shadow-sm"
      >
        <h1 className="text-xl font-semibold">Accedi</h1>
        <p className="text-sm text-neutral-500">
          Entra con la tua email per gestire i contenuti.
        </p>
        <input
          name="email"
          type="email"
          placeholder="la-tua@email.it"
          required
          className="w-full rounded-md border px-3 py-2 text-sm"
        />
        <button className="w-full rounded-md bg-black px-3 py-2 text-sm font-medium text-white">
          Entra
        </button>
      </form>
    </main>
  );
}
