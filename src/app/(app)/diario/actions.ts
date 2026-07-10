"use server";

import { revalidatePath } from "next/cache";
import { currentContext } from "@/lib/current";
import { createDiaryEntry, searchDiaryEntries } from "@/lib/diary";
import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/workspace";
import { deleteObject, isConfigured } from "@/lib/r2";
import {
  organizeDiary,
  type OrganizeEntry,
  type OrganizeResult,
} from "@/lib/diary-organize";

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

/**
 * C2 — "Riorganizza informazioni": raggruppa il materiale della raccolta in
 * schede-contenuto (principale vs contesto/B-roll) con brief. Effimero: si
 * ricalcola al click. Usa l'AI (costo) → azione admin-triggered.
 */
export async function organizeDiaryAction(): Promise<{
  ok: boolean;
  schede?: OrganizeResult["schede"];
  error?: string;
}> {
  const ctx = await currentContext();
  if (!ctx) return { ok: false, error: "Non autorizzato" };

  const rows = await searchDiaryEntries(ctx.workspaceId, { limit: 200 });
  const entries: OrganizeEntry[] = rows.map((e) => ({
    id: e.id,
    mediaType: e.mediaType,
    rawText: e.rawText,
    caption: e.caption,
    aiTitle: e.aiTitle,
    aiDescription: e.aiDescription,
  }));

  try {
    const { schede } = await organizeDiary(entries);
    return { ok: true, schede };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Errore AI" };
  }
}
