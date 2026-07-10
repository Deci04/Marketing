"use server";

import { revalidatePath } from "next/cache";
import { currentContext } from "@/lib/current";
import { createDiaryEntry } from "@/lib/diary";
import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/workspace";
import { deleteObject, isConfigured } from "@/lib/r2";

/**
 * C1 — crea una DiaryEntry dopo che il client ha caricato il file su R2
 * (o per una nota di solo testo). `r2Key` arriva dalla route upload-url;
 * `mediaUrl` è il proxy di lettura workspace-scoped.
 */
export async function saveDiaryUploadAction(input: {
  r2Key?: string | null;
  mediaType?: string | null; // "image" | "video" | "audio" | "text"
  mediaSize?: number | null;
  rawText?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const ctx = await currentContext();
  if (!ctx) return { ok: false, error: "Non autorizzato" };

  const hasText = !!input.rawText?.trim();
  if (!input.r2Key && !hasText)
    return { ok: false, error: "Niente da salvare" };

  const mediaUrl = input.r2Key ? `/api/diario/media/${input.r2Key}` : null;
  await createDiaryEntry(ctx.workspaceId, {
    authorUserId: ctx.user.id,
    rawText: input.rawText?.trim() || null,
    r2Key: input.r2Key ?? null,
    mediaUrl,
    mediaType: input.mediaType ?? (hasText ? "text" : null),
    mediaSize: input.mediaSize ?? null,
  });

  revalidatePath("/diario");
  return { ok: true };
}

/**
 * Elimina un messaggio della raccolta: cancella l'oggetto R2 associato (se c'è)
 * e la DiaryEntry. Consentito solo all'autore del messaggio o a un admin.
 */
export async function deleteDiaryEntryAction(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await currentContext();
  if (!ctx) return { ok: false, error: "Non autorizzato" };

  const entry = await db.diaryEntry.findFirst({
    where: scopedWhere(ctx.workspaceId, { id }),
  });
  if (!entry) return { ok: false, error: "Messaggio non trovato" };
  if (entry.authorUserId !== ctx.user.id && !ctx.user.isAdmin)
    return { ok: false, error: "Non puoi eliminare questo messaggio" };

  if (entry.r2Key && isConfigured())
    await deleteObject(entry.r2Key).catch(() => {});
  await db.diaryEntry.delete({ where: { id: entry.id } });

  revalidatePath("/diario");
  return { ok: true };
}
