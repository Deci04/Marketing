"use server";

import { revalidatePath } from "next/cache";
import { currentContext } from "@/lib/current";
import { createDiaryEntry, searchDiaryEntries } from "@/lib/diary";
import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/workspace";
import { deleteObject, isConfigured, getObjectBytes } from "@/lib/r2";
import { transcribeAudio, hasGroqKey } from "@/lib/diary-transcribe";
import {
  organizeDiary,
  type OrganizeEntry,
  type OrganizeResult,
} from "@/lib/diary-organize";
import { archiveR2KeyToDrive } from "@/lib/drive-archive";
import { ensureDriveFolders } from "@/lib/drive-folders";

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

  // Audio → transcript (C2b, Groq Whisper). Best-effort: se manca la chiave o
  // fallisce, l'audio si salva comunque senza transcript.
  let aiDescription: string | null = null;
  if (
    input.r2Key &&
    input.mediaType === "audio" &&
    isConfigured() &&
    hasGroqKey()
  ) {
    try {
      aiDescription = await transcribeAudio(await getObjectBytes(input.r2Key));
    } catch {
      // ignora: transcript best-effort
    }
  }

  const mediaUrl = input.r2Key ? `/api/diario/media/${input.r2Key}` : null;
  const entry = await createDiaryEntry(ctx.workspaceId, {
    authorUserId: ctx.user.id,
    rawText: input.rawText?.trim() || null,
    r2Key: input.r2Key ?? null,
    mediaUrl,
    mediaType: input.mediaType ?? (hasText ? "text" : null),
    mediaSize: input.mediaSize ?? null,
    aiDescription,
  });

  // Archivia subito il raw su Drive (R2→Drive), così esiste prima che la lifecycle
  // possa cancellarlo da R2. Best-effort: se Drive è off o fallisce, resta solo su R2.
  if (input.r2Key) {
    try {
      const folders = await ensureDriveFolders();
      const name = input.r2Key.split("/").pop() || "raw";
      const driveFileId = await archiveR2KeyToDrive({
        r2Key: input.r2Key,
        name,
        mimeType:
          input.mediaType === "video" ? "video/mp4"
          : input.mediaType === "audio" ? "audio/mpeg"
          : input.mediaType === "image" ? "image/jpeg"
          : "application/octet-stream",
        folderId: folders?.rawMainFolderId, // pre-C2: default main; C2 sposterà in broll se serve
      });
      if (driveFileId) {
        await db.diaryEntry.update({
          where: { id: entry.id },
          data: { driveFileId, archivedAt: new Date() },
        });
      }
    } catch {
      // best-effort: l'archiviazione non blocca il salvataggio del messaggio
    }
  }

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
