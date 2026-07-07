import { redirect } from "next/navigation";
import { currentContext } from "@/lib/current";
import { DiaryChat } from "@/components/diary/diary-chat";

export const dynamic = "force-dynamic";

export default async function DiarioPage() {
  const ctx = await currentContext();
  if (!ctx) redirect("/login");
  const name = ctx.user.name ?? ctx.user.email ?? "—";
  return (
    <div className="mx-auto flex h-[calc(100vh-2rem)] max-w-3xl flex-col">
      <header className="mb-3">
        <h1 className="text-2xl">Diario di Luca</h1>
        <p className="text-sm text-muted-foreground">
          Note, foto e video da Telegram — chiedi spunti o crea contenuti dal materiale.
        </p>
      </header>
      <DiaryChat userName={name} />
    </div>
  );
}
