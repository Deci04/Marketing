# Diario C1 — Storage R2 + upload in-app — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development o superpowers:executing-plans.

**Goal:** sostituire lo storage Telegram del Diario con Cloudflare R2 + upload in-app (Luca carica foto/video/audio/note direttamente), creando `DiaryEntry` con riferimenti R2.

**Architecture:** client→R2 diretto con presigned PUT (multipart per i video), un modulo `r2.ts` che incapsula l'S3 client, una route che emette i presigned URL, `DiaryEntry` esteso con i campi R2, e UI di upload nel Diario. Media serviti via route proxy (bucket privato).

**Tech Stack:** Next.js 16, Prisma+Neon, `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (R2 è S3-compatibile), Vitest.

## Global Constraints
- **Next.js 16**: consultare `node_modules/next/dist/docs/` prima di scrivere App Router.
- **Locale**, commit a verde, merge/push solo su verifica. Migration additive (nullable) sul Neon condiviso.
- **R2 non supporta POST form-based (501)** → sempre presigned **PUT**/multipart.
- **Dipendenza esterna (BLOCCANTE per il live)**: bucket R2 + credenziali dell'account Cloudflare di Luca
  (vedi "Setup richiesto"). Il codice si costruisce e si unit-testa senza; l'upload live e il merge
  richiedono le credenziali.

## Setup richiesto (azione di Matteo/Luca — gate del live)
1. Account Cloudflare (free) → **R2** → crea bucket **`content-tool-diario`** (privato).
2. **R2 API Token** (Object Read & Write sul bucket) → ottieni **Access Key ID** + **Secret Access Key**.
3. Copia l'**Account ID** (dalla dashboard R2 / endpoint `https://<accountid>.r2.cloudflarestorage.com`).
4. **CORS** sul bucket: consenti `PUT`/`GET` dagli origin `http://localhost:3000`, `http://localhost:3001`,
   `http://<IP-LAN>:3000`, `https://marketing-ashy-one.vercel.app`.
5. Metti in `.env` (+ Vercel): `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
   `R2_BUCKET=content-tool-diario`.

---

## Task 1: modulo `r2.ts` (S3 client + presign + key building)
**Files:** Create `src/lib/r2.ts`; Test `tests/r2.test.ts`.
**Interfaces — Produces:**
- `buildRawKey(workspaceId, entryId, filename): string` → `raw/{workspaceId}/{entryId}/{safeName}`
- `isConfigured(): boolean`
- `presignPut(key, contentType, expiresSec?): Promise<string>`
- `presignGet(key, expiresSec?): Promise<string>`
- `deleteObject(key): Promise<void>`
- `client(): S3Client` (lazy, endpoint `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, region `auto`)

- [ ] **Step 1 — test** `tests/r2.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildRawKey } from "@/lib/r2";

describe("buildRawKey", () => {
  it("costruisce la chiave sotto raw/ con nome sanificato", () =>
    expect(buildRawKey("ws1", "e1", "Mio Video (1).mp4")).toBe("raw/ws1/e1/Mio_Video__1_.mp4"));
  it("evita traversal e caratteri strani", () =>
    expect(buildRawKey("ws1", "e1", "../a/b?.png")).toBe("raw/ws1/e1/___a_b_.png"));
});
```
- [ ] **Step 2** — run: `npx vitest run tests/r2.test.ts` → FAIL (module non esiste).
- [ ] **Step 3** — install: `npm i @aws-sdk/client-s3 @aws-sdk/s3-request-presigner`.
- [ ] **Step 4** — implementa `src/lib/r2.ts`:
```ts
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const acc = () => process.env.R2_ACCOUNT_ID ?? "";
const bucket = () => process.env.R2_BUCKET ?? "";
export function isConfigured(): boolean {
  return !!(acc() && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && bucket());
}
export function buildRawKey(workspaceId: string, entryId: string, filename: string): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `raw/${workspaceId}/${entryId}/${safe}`;
}
let _c: S3Client | null = null;
export function client(): S3Client {
  if (_c) return _c;
  _c = new S3Client({
    region: "auto",
    endpoint: `https://${acc()}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
    },
  });
  return _c;
}
export function presignPut(key: string, contentType: string, expiresSec = 600) {
  return getSignedUrl(client(), new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }), { expiresIn: expiresSec });
}
export function presignGet(key: string, expiresSec = 3600) {
  return getSignedUrl(client(), new GetObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn: expiresSec });
}
export async function deleteObject(key: string) {
  await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}
```
- [ ] **Step 5** — run test → PASS. **Step 6** — commit.

## Task 2: `DiaryEntry` esteso (migration additiva) + `createDiaryEntry`
**Files:** Modify `prisma/schema.prisma` (model DiaryEntry); `src/lib/diary.ts`; Test `tests/diary.test.ts`.
- [ ] **Step 1** — schema: aggiungi a `DiaryEntry` `r2Key String?`, `mediaUrl String?`, `mediaType String?`, `mediaSize Int?`, `archivedAt DateTime?`, `driveFileId String?`.
- [ ] **Step 2** — migration: **kill dev server**, poi `npx prisma migrate dev --name diary_r2_fields` (Neon condiviso, additiva), `rm -rf .next`, riavvia `npm run dev`.
- [ ] **Step 3** — estendi `DiaryEntryInput` + `createDiaryEntry` con i nuovi campi (default null, retro-compat).
- [ ] **Step 4** — test in `tests/diary.test.ts`: crea entry con `r2Key/mediaUrl/mediaType` e verifica siano persistiti; l'entry Telegram legacy resta valida.
- [ ] **Step 5** — `npx vitest run tests/diary.test.ts` → PASS. Commit.

## Task 3: route presigned upload + creazione entry
**Files:** Create `src/app/api/diario/upload-url/route.ts`; Test `tests/diary-upload-url.test.ts`.
- [ ] **Step 1** — test (mock `@/lib/r2` + `@/lib/current`): POST con `{filename, contentType}` autenticato → `{ uploadUrl, r2Key, entryId }`; senza sessione → 401.
- [ ] **Step 2** — run → FAIL.
- [ ] **Step 3** — implementa: autentica via `currentContext()`, genera `entryId` (cuid), `key = buildRawKey(ws, entryId, filename)`, `uploadUrl = await presignPut(key, contentType)`, ritorna JSON. (L'entry si crea al completamento upload, Task 4.)
- [ ] **Step 4** — run → PASS. Commit.

## Task 4: UI di upload nel Diario
**Files:** Modify `src/components/diary/diary-chat.tsx` (o nuovo `src/components/diary/diary-upload.tsx`).
- [ ] **Step 1** — UI: file picker (image/video/audio) + nota testo + `AudioRecorder`; per ogni file: `fetch('/api/diario/upload-url')` → PUT diretto a R2 (multipart per video >20MB) con progress → a fine upload `createDiaryEntry` (server action) con `r2Key/mediaUrl/mediaType/size`.
- [ ] **Step 2** — media reso via route proxy `GET /api/diario/media/[...key]` (`presignGet`) o `R2_PUBLIC_BASE`.
- [ ] **Step 3** — **Browser-verify dal vivo (Matteo)**: Luca carica foto/video/audio/nota → compaiono nella raccolta, il media si apre, nessun Telegram. (Richiede il Setup R2.)
- [ ] **Step 4** — commit dopo verifica.

## Task 5: suite + build + grafo
- [ ] `npm test` (verde) · `npx tsc --noEmit` · `npm run build` · `graphify update .`.

## Self-Review
- Copertura: storage (T1) · dati (T2) · emissione URL (T3) · upload UI (T4). ✅
- Il live (T3 wiring reale, T4) è gated sul Setup R2; T1/T2 sono verificabili senza credenziali.
