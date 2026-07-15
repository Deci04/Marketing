# Archivio originali su Google Drive + lifecycle R2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Archiviare su Google Drive tutti gli originali a piena qualità (raw Diario, materiale per-contenuto, originale di publish) e mettere una lifecycle rule su R2 per non superare i 10 GB.

**Architecture:** Approccio A "storage come ponte": il byte arriva a Drive con auth server-side (OAuth app-owned come Luca). Il materiale/publish si carica client→Blob e il server streama Blob→Drive; il raw Diario si carica client→R2 e il server streama R2→Drive all'upload. R2 tiene solo il raw ~7 giorni (lifecycle nativa), poi le letture ripiegano su Drive. I proxy/anteprime restano su Blob (invariati).

**Tech Stack:** Next.js 16 (App Router, modificato — leggere `node_modules/next/dist/docs/` prima di codice Next-specifico), Prisma 6 + Neon, `googleapis` (Drive v3), `@aws-sdk/client-s3` (R2 S3-compat), Vitest.

## Global Constraints

- Prima di scrivere codice Next-specifico, leggere `node_modules/next/dist/docs/`. Questa NON è la Next che conosci (AGENTS.md).
- Migrazioni Prisma **solo additive** (nessun campo distruttivo).
- OAuth Drive è "come Luca", scope `drive.file` (l'app vede solo i file che crea). Client Drive esistente: `src/lib/google-drive.ts`.
- Upload client→Blob esistente: `uploadViaServer(file, prefix, filename)` in `src/lib/blob-upload.ts` (bypassa il body-limit ~4.5MB delle Functions). NON far passare file grandi dentro una Function come body.
- Test runner: `npx vitest run`. I test vivono in `tests/*.test.ts`, import via alias `@/…`.
- Finestra retention R2 raw: **7 giorni** (lifecycle nativa). Cutover di lettura app→Drive a **6 giorni** (overlap di sicurezza < finestra R2).
- Egress R2→server è gratuito: lo streaming R2→Drive non ha costo di rete.
- `graphify update .` dopo aver modificato il codice (CLAUDE.md del progetto).

---

## File Structure

- `prisma/schema.prisma` — +`Material.driveFileId`, +`Content.originalDriveFileId`, +`DiaryEntry.archivedAt`, +model `DriveConfig`.
- `src/lib/drive-folders.ts` — **create**: find-or-create cartelle Drive + cache id in `DriveConfig`. Pure helper `resolveRawSubfolder(kind)` testato.
- `src/lib/drive-archive.ts` — **create**: `archiveBlobUrlToDrive(...)`, `archiveR2KeyToDrive(...)`, `getDriveFileStream(fileId)`. Streaming server→Drive e Drive→server.
- `src/lib/r2-lifecycle.ts` — **create**: `buildRawLifecycleConfig(days)` (pure, testato) + `applyRawLifecycle()`.
- `scripts/r2-set-lifecycle.ts` — **create**: entry point CLI che chiama `applyRawLifecycle()`.
- `src/lib/diary-read.ts` — **create**: `shouldServeFromDrive(entry, now)` (pure, testato).
- `src/lib/google-drive.ts` — **modify**: +`moveDriveFile(fileId, addParentId, removeParentId)`.
- `src/app/(app)/contenuti/actions.ts` — **modify**: nuova `archiveMaterialOriginalAction`; archiviazione originale in `publishContentAction`.
- `src/components/material-gallery.tsx` — **modify**: `addVideo` carica anche l'originale e chiama l'archiviazione.
- `src/app/(app)/diario/actions.ts` — **modify**: `saveDiaryUploadAction` archivia R2→Drive.
- `src/app/api/diario/media/[...key]/route.ts` — **modify**: fallback lettura da Drive dopo il cutover.
- `src/lib/diary-organize.ts` (o l'action C2) — **modify**: sposta il file Drive in `raw/main`|`raw/broll`.

---

## Task 1: Migration additiva schema

**Files:**
- Modify: `prisma/schema.prisma`
- Create (generata): `prisma/migrations/*/migration.sql`

**Interfaces:**
- Produces: campi `Material.driveFileId?: string`, `Content.originalDriveFileId?: string`, `DiaryEntry.archivedAt?: DateTime`; model `DriveConfig { id, rootFolderId?, rawMainFolderId?, rawBrollFolderId?, editatiFolderId? }`.

- [ ] **Step 1: Aggiungi i campi ai modelli**

In `prisma/schema.prisma`, dentro `model Material {` aggiungi:
```prisma
  driveFileId String? // originale archiviato su Google Drive (Approccio A)
```
Dentro `model Content {` accanto a `masterLink`:
```prisma
  originalDriveFileId String? // originale di publish archiviato su Drive
```
Dentro `model DiaryEntry {` accanto a `driveFileId`:
```prisma
  archivedAt DateTime? // quando il raw è stato archiviato su Drive
```
In fondo al file, nuovo modello:
```prisma
model DriveConfig {
  id                String  @id @default("singleton")
  rootFolderId      String?
  rawMainFolderId   String?
  rawBrollFolderId  String?
  editatiFolderId   String?
  updatedAt         DateTime @updatedAt
}
```

- [ ] **Step 2: Genera la migration**

Run: `npx prisma migrate dev --name storage-drive-fields --create-only`
Expected: crea `prisma/migrations/<ts>_storage_drive_fields/migration.sql` con soli `ADD COLUMN` + `CREATE TABLE "DriveConfig"`.

- [ ] **Step 3: Applica + rigenera client**

Run: `npx prisma migrate dev && npx prisma generate`
Expected: migrazione applicata, `@prisma/client` rigenerato senza errori.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(storage): campi driveFileId/originalDriveFileId/archivedAt + DriveConfig (migration additiva)"
```

---

## Task 2: Helper cartelle Drive (find-or-create) + cache

**Files:**
- Create: `src/lib/drive-folders.ts`
- Create: `tests/drive-folders.test.ts`
- Modify: `src/lib/google-drive.ts` (esporta un `driveClient()` riutilizzabile)

**Interfaces:**
- Consumes: `google-drive.ts` client OAuth (già presente, funzione interna `driveClient()`).
- Produces:
  - `resolveRawSubfolderKey(kind: "main" | "broll"): "rawMainFolderId" | "rawBrollFolderId"` (pure)
  - `ensureDriveFolders(): Promise<{ rootFolderId: string; rawMainFolderId: string; rawBrollFolderId: string; editatiFolderId: string } | null>` (null se Drive non connesso)

- [ ] **Step 1: Esporta `driveClient` da google-drive.ts**

In `src/lib/google-drive.ts` cambia `async function driveClient()` in `export async function driveClient()` (resta invariata la logica: ritorna `google.drive({version:"v3", auth})` o `null`).

- [ ] **Step 2: Scrivi il test della parte pura**

`tests/drive-folders.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { resolveRawSubfolderKey } from "@/lib/drive-folders";

describe("resolveRawSubfolderKey", () => {
  it("mappa main → rawMainFolderId", () => {
    expect(resolveRawSubfolderKey("main")).toBe("rawMainFolderId");
  });
  it("mappa broll → rawBrollFolderId", () => {
    expect(resolveRawSubfolderKey("broll")).toBe("rawBrollFolderId");
  });
});
```

- [ ] **Step 3: Run test → deve fallire**

Run: `npx vitest run tests/drive-folders.test.ts`
Expected: FAIL ("Cannot find module '@/lib/drive-folders'").

- [ ] **Step 4: Implementa `src/lib/drive-folders.ts`**

```ts
import { db } from "@/lib/db";
import { driveClient } from "@/lib/google-drive";

export function resolveRawSubfolderKey(
  kind: "main" | "broll"
): "rawMainFolderId" | "rawBrollFolderId" {
  return kind === "main" ? "rawMainFolderId" : "rawBrollFolderId";
}

/** find-or-create di una cartella per nome sotto `parentId` (o root Drive). */
async function findOrCreateFolder(
  drive: NonNullable<Awaited<ReturnType<typeof driveClient>>>,
  name: string,
  parentId?: string
): Promise<string> {
  const q = [
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false",
    `name = '${name.replace(/'/g, "\\'")}'`,
    parentId ? `'${parentId}' in parents` : "'root' in parents",
  ].join(" and ");
  const found = await drive.files.list({ q, fields: "files(id)", pageSize: 1 });
  const hit = found.data.files?.[0]?.id;
  if (hit) return hit;
  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      ...(parentId ? { parents: [parentId] } : {}),
    },
    fields: "id",
  });
  return created.data.id as string;
}

/** Crea (se manca) la struttura ContentTool/{raw/main,raw/broll,editati} e la cachea. */
export async function ensureDriveFolders() {
  const drive = await driveClient();
  if (!drive) return null;

  const existing = await db.driveConfig.findUnique({ where: { id: "singleton" } });
  if (
    existing?.rootFolderId &&
    existing.rawMainFolderId &&
    existing.rawBrollFolderId &&
    existing.editatiFolderId
  ) {
    return {
      rootFolderId: existing.rootFolderId,
      rawMainFolderId: existing.rawMainFolderId,
      rawBrollFolderId: existing.rawBrollFolderId,
      editatiFolderId: existing.editatiFolderId,
    };
  }

  const rootFolderId = await findOrCreateFolder(drive, "ContentTool");
  const rawFolderId = await findOrCreateFolder(drive, "raw", rootFolderId);
  const rawMainFolderId = await findOrCreateFolder(drive, "main", rawFolderId);
  const rawBrollFolderId = await findOrCreateFolder(drive, "broll", rawFolderId);
  const editatiFolderId = await findOrCreateFolder(drive, "editati", rootFolderId);

  await db.driveConfig.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", rootFolderId, rawMainFolderId, rawBrollFolderId, editatiFolderId },
    update: { rootFolderId, rawMainFolderId, rawBrollFolderId, editatiFolderId },
  });
  return { rootFolderId, rawMainFolderId, rawBrollFolderId, editatiFolderId };
}
```

- [ ] **Step 5: Run test → deve passare**

Run: `npx vitest run tests/drive-folders.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/drive-folders.ts src/lib/google-drive.ts tests/drive-folders.test.ts
git commit -m "feat(drive): find-or-create cartelle ContentTool/raw|editati + cache DriveConfig"
```

---

## Task 3: Helper di archiviazione streaming (Blob→Drive, R2→Drive, Drive→stream)

**Files:**
- Create: `src/lib/drive-archive.ts`
- Modify: `src/lib/google-drive.ts` (+`moveDriveFile`)

**Interfaces:**
- Consumes: `uploadToDrive({ name, mimeType, body, folderId })` da `google-drive.ts`; `getObjectBytes(key)` da `r2.ts`; `ensureDriveFolders()`, `driveClient()`.
- Produces:
  - `archiveBlobUrlToDrive(opts: { url: string; name: string; mimeType: string; folderId?: string }): Promise<string | null>` → driveFileId
  - `archiveR2KeyToDrive(opts: { r2Key: string; name: string; mimeType: string; folderId?: string }): Promise<string | null>`
  - `getDriveFileStream(fileId: string): Promise<NodeJS.ReadableStream | null>`
  - `moveDriveFile(fileId: string, addParentId: string, removeParentId?: string): Promise<void>` (in google-drive.ts)

- [ ] **Step 1: Aggiungi `moveDriveFile` a google-drive.ts**

```ts
/** Sposta un file Drive tra cartelle (usato quando C2 classifica main/broll). */
export async function moveDriveFile(
  fileId: string,
  addParentId: string,
  removeParentId?: string
): Promise<void> {
  const drive = await driveClient();
  if (!drive) return;
  await drive.files.update({
    fileId,
    addParents: addParentId,
    ...(removeParentId ? { removeParents: removeParentId } : {}),
    fields: "id",
  }).catch(() => {});
}
```

- [ ] **Step 2: Implementa `src/lib/drive-archive.ts`**

```ts
import { Readable } from "node:stream";
import { uploadToDrive, driveClient } from "@/lib/google-drive";
import { getObjectBytes } from "@/lib/r2";

/** Scarica un Blob pubblico e lo streama su Drive. Ritorna il driveFileId o null. */
export async function archiveBlobUrlToDrive(opts: {
  url: string;
  name: string;
  mimeType: string;
  folderId?: string;
}): Promise<string | null> {
  const res = await fetch(opts.url);
  if (!res.ok || !res.body) return null;
  // Web ReadableStream → Node Readable (googleapis vuole uno stream Node).
  const body = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]);
  return uploadToDrive({ name: opts.name, mimeType: opts.mimeType, body, folderId: opts.folderId });
}

/** Legge l'oggetto R2 e lo streama su Drive. Ritorna il driveFileId o null. */
export async function archiveR2KeyToDrive(opts: {
  r2Key: string;
  name: string;
  mimeType: string;
  folderId?: string;
}): Promise<string | null> {
  const bytes = await getObjectBytes(opts.r2Key);
  const body = Readable.from(Buffer.from(bytes));
  return uploadToDrive({ name: opts.name, mimeType: opts.mimeType, body, folderId: opts.folderId });
}

/** Stream di lettura di un file Drive (per servire il media dopo la scadenza R2). */
export async function getDriveFileStream(
  fileId: string
): Promise<NodeJS.ReadableStream | null> {
  const drive = await driveClient();
  if (!drive) return null;
  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "stream" }
  );
  return res.data as unknown as NodeJS.ReadableStream;
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: nessun errore su `drive-archive.ts`/`google-drive.ts`.
(Nota: `Readable.fromWeb` richiede lib DOM types per `ReadableStream`; se `tsc` protesta, castare come mostrato.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/drive-archive.ts src/lib/google-drive.ts
git commit -m "feat(drive): helper archiviazione streaming Blob→Drive, R2→Drive + moveDriveFile"
```

---

## Task 4: Materiale per-contenuto — archivia l'originale su Drive

**Files:**
- Modify: `src/app/(app)/contenuti/actions.ts` (+`archiveMaterialOriginalAction`)
- Modify: `src/components/material-gallery.tsx` (`addVideo`)
- Modify: `src/lib/content.ts` (+`setMaterialDriveFileId`)

**Interfaces:**
- Consumes: `archiveBlobUrlToDrive`, `ensureDriveFolders`, `uploadViaServer`, `deleteBlob` (Blob delete), `addMaterialAction`.
- Produces: `archiveMaterialOriginalAction(formData)` che archivia l'originale già su Blob e salva `Material.driveFileId`, poi cancella l'originale da Blob.

- [ ] **Step 1: Aggiungi `setMaterialDriveFileId` in content.ts**

```ts
/** Salva l'id del file originale archiviato su Drive per un Material. */
export async function setMaterialDriveFileId(
  workspaceId: string,
  materialId: string,
  driveFileId: string
) {
  const m = await db.material.findFirst({
    where: { id: materialId, content: scopedWhere(workspaceId, {}) },
    select: { id: true },
  });
  if (!m) return null;
  return db.material.update({ where: { id: materialId }, data: { driveFileId } });
}
```
(Se il filtro relazione non compila, sostituire con lookup del content poi update del material.)

- [ ] **Step 2: Aggiungi l'action di archiviazione in contenuti/actions.ts**

Import in testa: `import { archiveBlobUrlToDrive } from "@/lib/drive-archive"; import { ensureDriveFolders } from "@/lib/drive-folders"; import { setMaterialDriveFileId } from "@/lib/content";` — NB: `del` da `@vercel/blob` è **già importato** in questo file (riga 5), non ri-importarlo.
```ts
/** Archivia su Drive l'originale (già caricato su Blob) di un Material video, poi
 *  cancella l'originale da Blob (resta il proxy). Best-effort: su errore lascia il Blob. */
export async function archiveMaterialOriginalAction(formData: FormData) {
  const ctx = await currentContext();
  if (!ctx) throw new Error("Non autorizzato");
  const materialId = String(formData.get("materialId") ?? "").trim();
  const originalUrl = String(formData.get("originalUrl") ?? "").trim();
  const filename = String(formData.get("filename") ?? "original").trim();
  const mimeType = String(formData.get("mimeType") ?? "video/mp4").trim();
  if (!materialId || !originalUrl) return;

  const folders = await ensureDriveFolders();
  const driveFileId = await archiveBlobUrlToDrive({
    url: originalUrl,
    name: filename,
    mimeType,
    folderId: folders?.rawMainFolderId, // materiale montato → raw/main per default
  });
  if (!driveFileId) return; // Drive non connesso o fallito: non cancellare da Blob
  await setMaterialDriveFileId(ctx.workspaceId, materialId, driveFileId);
  await del(originalUrl).catch(() => {}); // `del` già importato in questo file
}
```

- [ ] **Step 3: `addMaterialAction` ritorna il materialId**

Modifica `addMaterial(...)` (in content.ts) e `addMaterialAction` perché restituiscano l'`id` del Material creato: cambia la firma di `addMaterialAction` da `Promise<void>` a `Promise<{ materialId: string }>` e ritorna `{ materialId: created.id }`.

- [ ] **Step 4: Wire `addVideo` in material-gallery.tsx**

Dopo il proxy, carica anche l'originale su Blob e chiama l'archiviazione:
```ts
async function addVideo(file: File) {
  setBusy(true);
  setProgress(0);
  try {
    const blob = await compressAndUploadVideoProxy(file, contentId, (r) => setProgress(r));
    const fd = new FormData();
    fd.set("contentId", contentId);
    fd.set("kind", "video");
    fd.set("url", blob.url);
    const { materialId } = await addMaterialAction(fd);

    // Archivia l'ORIGINALE su Drive (client→Blob → server streama Blob→Drive → cancella Blob).
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const original = await uploadViaServer(file, `originals/materials/${contentId}`, safe);
    const afd = new FormData();
    afd.set("materialId", materialId);
    afd.set("originalUrl", original.url);
    afd.set("filename", file.name);
    afd.set("mimeType", file.type || "video/mp4");
    await archiveMaterialOriginalAction(afd); // best-effort: non blocca la UI se Drive è off
    toast.success("Video caricato");
    router.refresh();
  } catch (err) {
    if (err instanceof VideoTooLargeError) toast.error(err.message);
    else toast.error(`Upload fallito: ${(err as Error).message}`);
  } finally {
    setBusy(false);
    setProgress(null);
  }
}
```
Aggiorna gli import del componente: `uploadViaServer` da `@/lib/blob-upload`, `archiveMaterialOriginalAction` da `../app/(app)/contenuti/actions` (stesso path già usato per `addMaterialAction`).

- [ ] **Step 5: Verifica build + typecheck**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run`
Expected: nessun errore; test verdi.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/contenuti/actions.ts src/components/material-gallery.tsx src/lib/content.ts
git commit -m "feat(materiale): archivia l'originale del video su Drive dopo il proxy (Approccio A)"
```

---

## Task 5: Originale di publish — archivia su Drive prima di cancellare da Blob

**Files:**
- Modify: `src/app/(app)/contenuti/actions.ts` (`publishContentAction`)

**Interfaces:**
- Consumes: `archiveBlobUrlToDrive`, `ensureDriveFolders`.
- Produces: `Content.originalDriveFileId` valorizzato quando al publish è stato caricato un originale su Blob.

- [ ] **Step 1: Individua il punto di cancellazione del Blob originale**

In `publishContentAction` c'è (riga ~245) il blocco esistente:
```ts
if (uploadedOriginalUrl && !scheduledAt) {
  await del(uploadedOriginalUrl).catch(() => {});
}
```
Inserisci l'archiviazione **prima** di questo blocco, ma archivia ogni volta che c'è un originale caricato e il publish è riuscito (anche se `scheduledAt`, dove il Blob NON viene cancellato subito):
```ts
if (uploadedOriginalUrl) {
  const folders = await ensureDriveFolders();
  const driveFileId = await archiveBlobUrlToDrive({
    url: uploadedOriginalUrl,
    name: `${content.title || content.id}-original`,
    mimeType: "video/mp4",
    folderId: folders?.editatiFolderId, // originale pubblicato → editati
  });
  if (driveFileId) {
    await db.content.update({
      where: { id: content.id },
      data: { originalDriveFileId: driveFileId },
    });
  }
}
```
Il blocco `del` esistente (gated su `!scheduledAt`) resta **dopo** e invariato. Se l'archiviazione fallisce (`driveFileId` null), NON bloccare il publish: il post è già pubblicato (accettiamo la perdita dell'archivio in questo caso raro, il publish ha priorità). Import da aggiungere: `archiveBlobUrlToDrive`, `ensureDriveFolders` (`del` già importato).

- [ ] **Step 2: Typecheck + test**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run`
Expected: verdi.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/contenuti/actions.ts
git commit -m "feat(publish): archivia su Drive l'originale di pubblicazione prima di liberare Blob"
```

---

## Task 6: Raw Diario — archivia R2→Drive all'upload

**Files:**
- Modify: `src/app/(app)/diario/actions.ts` (`saveDiaryUploadAction`)
- Modify: `src/lib/diary.ts` (`DiaryEntryInput` +`driveFileId`,`archivedAt`)

**Interfaces:**
- Consumes: `archiveR2KeyToDrive`, `ensureDriveFolders`.
- Produces: `DiaryEntry.driveFileId` + `archivedAt` valorizzati subito dopo la creazione, per gli entry con `r2Key`.

- [ ] **Step 1: Estendi `DiaryEntryInput` e la create**

In `src/lib/diary.ts` aggiungi a `DiaryEntryInput`: `driveFileId?: string | null; archivedAt?: Date | null;` e nella `db.diaryEntry.create({ data: { … } })` aggiungi `driveFileId: data.driveFileId ?? null, archivedAt: data.archivedAt ?? null,`.

- [ ] **Step 2: Archivia dopo la create in `saveDiaryUploadAction`**

Import: `import { archiveR2KeyToDrive } from "@/lib/drive-archive"; import { ensureDriveFolders } from "@/lib/drive-folders";`
Cambia il flusso: cattura l'entry creata e, se ha `r2Key`, archivia e aggiorna:
```ts
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
```

- [ ] **Step 3: Typecheck + test**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run`
Expected: verdi.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/diario/actions.ts src/lib/diary.ts
git commit -m "feat(diario): archivia il raw R2→Drive all'upload (driveFileId + archivedAt)"
```

---

## Task 7: Lettura Diario con fallback su Drive dopo il cutover

**Files:**
- Create: `src/lib/diary-read.ts`
- Create: `tests/diary-read.test.ts`
- Modify: `src/app/api/diario/media/[...key]/route.ts`

**Interfaces:**
- Consumes: `getDriveFileStream`, `db.diaryEntry`.
- Produces: `shouldServeFromDrive(entry, now): boolean` (pure) e la route che serve da Drive quando true.

- [ ] **Step 1: Scrivi il test della decisione pura**

`tests/diary-read.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { shouldServeFromDrive } from "@/lib/diary-read";

const now = new Date("2026-07-15T12:00:00Z");

describe("shouldServeFromDrive", () => {
  it("false se non archiviato (nessun driveFileId)", () => {
    expect(shouldServeFromDrive({ driveFileId: null, createdAt: new Date("2026-01-01") }, now)).toBe(false);
  });
  it("false entro il cutover di 6 giorni (R2 ancora caldo)", () => {
    const created = new Date("2026-07-10T12:00:00Z"); // 5 giorni fa
    expect(shouldServeFromDrive({ driveFileId: "abc", createdAt: created }, now)).toBe(false);
  });
  it("true oltre 6 giorni e archiviato", () => {
    const created = new Date("2026-07-08T11:00:00Z"); // >6 giorni fa
    expect(shouldServeFromDrive({ driveFileId: "abc", createdAt: created }, now)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test → FAIL**

Run: `npx vitest run tests/diary-read.test.ts`
Expected: FAIL ("Cannot find module '@/lib/diary-read'").

- [ ] **Step 3: Implementa `src/lib/diary-read.ts`**

```ts
/** Giorni oltre i quali si serve da Drive (< finestra lifecycle R2 di 7g, per overlap). */
export const RAW_DRIVE_CUTOVER_DAYS = 6;

export function shouldServeFromDrive(
  entry: { driveFileId: string | null; createdAt: Date },
  now: Date
): boolean {
  if (!entry.driveFileId) return false;
  const ageMs = now.getTime() - entry.createdAt.getTime();
  return ageMs > RAW_DRIVE_CUTOVER_DAYS * 86_400_000;
}
```

- [ ] **Step 4: Run test → PASS**

Run: `npx vitest run tests/diary-read.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire la route media**

In `src/app/api/diario/media/[...key]/route.ts`, dopo lo scoping della key e prima del `presignGet`, cerca l'entry per `r2Key` e valuta il fallback:
```ts
import { db } from "@/lib/db";
import { shouldServeFromDrive } from "@/lib/diary-read";
import { getDriveFileStream } from "@/lib/drive-archive";
// … dentro GET, dopo il check startsWith:
const entry = await db.diaryEntry.findFirst({
  where: { r2Key: key, workspaceId: ctx.workspaceId },
  select: { driveFileId: true, createdAt: true, mediaType: true },
});
if (entry && shouldServeFromDrive(entry, new Date()) && entry.driveFileId) {
  const stream = await getDriveFileStream(entry.driveFileId);
  if (stream) {
    return new NextResponse(stream as unknown as ReadableStream, {
      headers: { "Content-Type": entry.mediaType === "video" ? "video/mp4" : "application/octet-stream" },
    });
  }
}
// … altrimenti presignGet + redirect come oggi
```
Aggiungi `export const maxDuration = 300;` in testa alla route (streaming da Drive).

- [ ] **Step 6: Typecheck + test**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run`
Expected: verdi.

- [ ] **Step 7: Commit**

```bash
git add src/lib/diary-read.ts tests/diary-read.test.ts src/app/api/diario/media
git commit -m "feat(diario): lettura media con fallback Drive dopo il cutover di 6 giorni"
```

---

## Task 8: C2 Riorganizza — sposta il file Drive in raw/main | raw/broll

**Files:**
- Modify: l'action che applica la classificazione C2 (in `src/app/(app)/diario/actions.ts`, la funzione che salva l'esito di `organizeDiary` — es. `organizeDiaryAction`).

**Interfaces:**
- Consumes: `moveDriveFile`, `ensureDriveFolders`, `resolveRawSubfolderKey`.
- Produces: per ogni entry riclassificata con `driveFileId`, il file Drive è spostato nella cartella corretta.

- [ ] **Step 1: Individua dove C2 assegna main/broll agli entry**

Cerca nell'action C2 il punto in cui a una `DiaryEntry` viene assegnata la categoria (main vs B-roll). Se il campo non esiste ancora sul modello, la classificazione vive nel risultato `OrganizeResult`: usa quello nel loop di applicazione.

- [ ] **Step 2: Sposta il file Drive quando la categoria è nota**

Nel loop che applica la classificazione, per ogni entry con `driveFileId`:
```ts
import { moveDriveFile } from "@/lib/google-drive";
import { ensureDriveFolders, resolveRawSubfolderKey } from "@/lib/drive-folders";
// …
const folders = await ensureDriveFolders();
if (folders && entry.driveFileId) {
  const targetKey = resolveRawSubfolderKey(category === "broll" ? "broll" : "main");
  const target = folders[targetKey];
  // Rimuovi dalla cartella opposta se necessario; addParents idempotente.
  await moveDriveFile(entry.driveFileId, target, folders.rawMainFolderId === target ? folders.rawBrollFolderId : folders.rawMainFolderId);
}
```
(`category` è la classificazione C2 dell'entry nel loco corrente; adattare al nome reale della variabile.)

- [ ] **Step 3: Typecheck + test**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run`
Expected: verdi.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/diario/actions.ts
git commit -m "feat(diario/C2): sposta il raw archiviato in raw/main|raw/broll su Drive dopo la classificazione"
```

---

## Task 9: Lifecycle rule R2 (script idempotente)

**Files:**
- Create: `src/lib/r2-lifecycle.ts`
- Create: `tests/r2-lifecycle.test.ts`
- Create: `scripts/r2-set-lifecycle.ts`

**Interfaces:**
- Consumes: `client()` e `bucket()` da `r2.ts` (esporre `bucket` se non già pubblico).
- Produces: `buildRawLifecycleConfig(days: number)` (pure) e `applyRawLifecycle(days?: number)`.

- [ ] **Step 1: Esporta `bucket` da r2.ts**

In `src/lib/r2.ts` cambia `const bucket = …` in `export const bucket = …` (o aggiungi `export { bucket };`).

- [ ] **Step 2: Scrivi il test della config pura**

`tests/r2-lifecycle.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildRawLifecycleConfig } from "@/lib/r2-lifecycle";

describe("buildRawLifecycleConfig", () => {
  it("expira il prefisso raw/ dopo N giorni", () => {
    const cfg = buildRawLifecycleConfig(7);
    const rule = cfg.Rules[0];
    expect(rule.Status).toBe("Enabled");
    expect(rule.Filter?.Prefix).toBe("raw/");
    expect(rule.Expiration?.Days).toBe(7);
  });
});
```

- [ ] **Step 3: Run test → FAIL**

Run: `npx vitest run tests/r2-lifecycle.test.ts`
Expected: FAIL ("Cannot find module '@/lib/r2-lifecycle'").

- [ ] **Step 4: Implementa `src/lib/r2-lifecycle.ts`**

```ts
import { PutBucketLifecycleConfigurationCommand } from "@aws-sdk/client-s3";
import { client, bucket } from "@/lib/r2";

/** Config lifecycle: cancella gli oggetti sotto `raw/` dopo `days` giorni. */
export function buildRawLifecycleConfig(days: number) {
  return {
    Rules: [
      {
        ID: "expire-raw",
        Status: "Enabled" as const,
        Filter: { Prefix: "raw/" },
        Expiration: { Days: days },
      },
    ],
  };
}

/** Applica la lifecycle rule al bucket R2 (idempotente). */
export async function applyRawLifecycle(days = 7): Promise<void> {
  await client().send(
    new PutBucketLifecycleConfigurationCommand({
      Bucket: bucket(),
      LifecycleConfiguration: buildRawLifecycleConfig(days),
    })
  );
}
```

- [ ] **Step 5: Run test → PASS**

Run: `npx vitest run tests/r2-lifecycle.test.ts`
Expected: PASS.

- [ ] **Step 6: Crea lo script CLI**

`scripts/r2-set-lifecycle.ts`:
```ts
import { applyRawLifecycle } from "@/lib/r2-lifecycle";

const days = Number(process.argv[2] ?? "7");
applyRawLifecycle(days)
  .then(() => {
    console.log(`Lifecycle R2 applicata: raw/ expira dopo ${days} giorni.`);
    process.exit(0);
  })
  .catch((e) => {
    console.error("Errore applicando la lifecycle R2:", e);
    process.exit(1);
  });
```
Aggiungi a `package.json` scripts: `"r2:lifecycle": "tsx scripts/r2-set-lifecycle.ts"` (verifica che `tsx` sia disponibile; se no usa lo stesso runner del già presente `scripts/backfill-materials.ts`).

- [ ] **Step 7: Commit**

```bash
git add src/lib/r2-lifecycle.ts tests/r2-lifecycle.test.ts scripts/r2-set-lifecycle.ts src/lib/r2.ts package.json
git commit -m "feat(r2): lifecycle rule expiration raw/ 7gg + script idempotente"
```

---

## Task 10: Applica la lifecycle in prod + verifica end-to-end

**Files:** nessuna modifica di codice — esecuzione + verifica.

- [ ] **Step 1: Applica la lifecycle sul bucket R2**

Run: `npm run r2:lifecycle 7` (con le env R2 caricate).
Expected: "Lifecycle R2 applicata: raw/ expira dopo 7 giorni."

- [ ] **Step 2: Verifica la regola sul bucket**

Interroga `GetBucketLifecycleConfigurationCommand` (o dashboard Cloudflare) e conferma `expire-raw` / `raw/` / 7 giorni.

- [ ] **Step 3: Aggiorna il grafo graphify**

Run: `graphify update .`

- [ ] **Step 4: Verifica in browser (pre-merge, come da preferenza Matteo)**

Avvia l'app (skill `run`/Chrome MCP) e verifica:
- Materiale: carica un video → compare l'anteprima (proxy) e il `Material` ha `driveFileId`; l'originale non resta su Blob (`originals/materials/...`).
- Diario: carica un raw → visibile in chat + `DiaryEntry.driveFileId`/`archivedAt` valorizzati.
- Compressione Safari: già Safari-safe per design; confermare che l'anteprima si genera e si vede.

- [ ] **Step 5: Segnala il checkpoint a Matteo**

`afplay /System/Library/Sounds/Glass.aiff` e riepiloga l'esito prima del merge in main.

---

## Self-Review (esito)

- **Spec coverage:** ruoli storage (Task 4/5/6 + lifecycle Task 9), Approccio A (Task 3/4/5/6), no-cron (assente per design), cartelle Drive (Task 2), raw main/broll via C2 (Task 8), read-fallback (Task 7), schema additivo (Task 1), maxDuration (Task 7; aggiungere anche alle action pesanti se serverless — le server action ereditano il runtime della route chiamante). ✔
- **Placeholder scan:** nessun TBD/TODO; ogni step ha codice o comando concreto. ✔
- **Type consistency:** `driveFileId` usato coerente; `archiveBlobUrlToDrive`/`archiveR2KeyToDrive`/`getDriveFileStream`/`moveDriveFile`/`ensureDriveFolders`/`resolveRawSubfolderKey`/`shouldServeFromDrive`/`buildRawLifecycleConfig`/`applyRawLifecycle` definiti in Task 2/3/7/9 e consumati con le stesse firme. ✔
- **Nota di verifica manuale:** i punti I/O verso Drive/R2 non hanno unit test (dipendenze esterne); sono coperti dalla verifica browser end-to-end (Task 10). Le parti pure (cartelle, cutover lettura, config lifecycle) hanno test Vitest.
