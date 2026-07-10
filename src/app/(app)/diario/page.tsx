import { redirect } from "next/navigation";
import { currentContext } from "@/lib/current";
import { searchDiaryEntries } from "@/lib/diary";
import { DiaryChat } from "@/components/diary/diary-chat";
import { DiaryUpload } from "@/components/diary/diary-upload";
import {
  DiaryConversation,
  type ConvEntry,
} from "@/components/diary/diary-conversation";

export const dynamic = "force-dynamic";

export default async function DiarioPage() {
  const ctx = await currentContext();
  if (!ctx) redirect("/login");
  const name = ctx.user.name ?? ctx.user.email ?? "—";

  // La raccolta è una conversazione: dal più vecchio (in alto) al più recente (in basso).
  const rows = await searchDiaryEntries(ctx.workspaceId, { limit: 100 });
  const entries: ConvEntry[] = rows
    .slice()
    .reverse()
    .map((e) => ({
      id: e.id,
      authorUserId: e.authorUserId,
      rawText: e.rawText,
      caption: e.caption,
      mediaUrl: e.mediaUrl,
      mediaType: e.mediaType,
      aiTitle: e.aiTitle,
      aiDescription: e.aiDescription,
      createdAt: e.createdAt.toISOString(),
    }));

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-10">
      <header>
        <h1 className="text-2xl">Diario di Luca</h1>
        <p className="text-sm text-muted-foreground">
          Manda foto, video, audio e note come in una chat: il materiale resta qui
          finché Matteo non lo edita.
        </p>
      </header>

      <DiaryConversation
        entries={entries}
        currentUserId={ctx.user.id}
        isAdmin={ctx.user.isAdmin ?? false}
      />

      <DiaryUpload />

      <details className="group rounded-2xl border border-border bg-card">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
          💬 Chiedi spunti all&apos;AI
        </summary>
        <div className="h-[60vh] border-t border-border p-3">
          <DiaryChat userName={name} />
        </div>
      </details>
    </div>
  );
}
