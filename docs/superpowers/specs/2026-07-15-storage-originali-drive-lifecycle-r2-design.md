# Spec — Archivio originali su Google Drive + lifecycle R2

> Data: 2026-07-15. Supera e aggiorna `2026-07-10-diario-c3-lifecycle-drive-design.md`.
> Policy confermata da Matteo in sessione. Drive è già connesso via OAuth (commit `feat(drive/B)`).

## Contesto e stato attuale (verificato nel codice)

- **Drive**: connessione OAuth "come Luca" (`drive.file`, Google One 5TB) già implementata
  (`src/lib/google-drive.ts`: `saveDriveTokens`, `isDriveConnected`, `uploadToDrive`, `deleteDriveFile`;
  authorize/callback in `src/app/api/integrations/google-drive/`). **`uploadToDrive` è definita ma NON
  ancora chiamata** da nessun flusso: manca la wiring dell'archiviazione.
- **Proxy/anteprime video**: compressi lato browser via ffmpeg.wasm single-thread (Safari-safe) e caricati
  su **Vercel Blob** (`video-proxies/`, `src/lib/video-upload-client.ts`). Restano su Blob.
- **Originale di publish**: al publish il file va su **Blob** (`originals/{contentId}`, `content-modal.tsx`),
  serve a Zernio come `mediaUrl`, poi viene **cancellato** dopo il publish riuscito (`publishContentAction`).
- **Raw Diario/Raccolta**: upload client→**R2** con presigned PUT (`raw/{ws}/{entryId}/{file}`,
  `src/lib/r2.ts` + `api/diario/upload-url`). Letto via route proxy `api/diario/media/[...key]`.
- **R2 lifecycle**: **assente** nel codice. Nessuna regola di scadenza/tetto → R2 cresce senza limite.

## Vincolo

R2 free tier = **10 GB**. Neon tiene solo metadati (righe piccole), non i media. Il tetto da proteggere è R2.

## Modello di storage target

- **Google Drive** (OAuth come Luca, `drive.file`, 5TB) = archivio permanente di **tutti gli originali a
  piena qualità**: (a) girato del Diario, (b) materiale/girato per-contenuto, (c) originale di publish.
- **Vercel Blob** = proxy/anteprime compressi (invariato) + host transitorio dell'originale di publish
  verso Zernio (invariato).
- **Cloudflare R2** = **solo** copia calda del raw Diario, ~7 giorni per il display immediato in chat, poi
  cancellata dalla lifecycle rule (rete di sicurezza). Dopo la scadenza le letture ripiegano su Drive.

Conseguenza: con proxy su Blob e originali diretti su Drive, R2 contiene solo ≤7 giorni di raw Diario →
non si avvicina mai a 10 GB. **Il cron di soglia della vecchia spec C3 non serve più: eliminato.**

## Meccanismo di archiviazione (Approccio A — Blob/R2 come ponte)

Il token Drive vive sul server (OAuth app-owned): il byte deve arrivare a Drive con auth server-side.
Nessun upload client→Drive diretto. Streaming via `uploadToDrive({ body: Readable })`.

### A1 — Materiale per-contenuto + originale di publish (sorgente = Blob)
1. Client carica l'originale su Blob (flusso `uploadViaServer` esistente — bypassa il body-limit Functions).
2. Server action streama Blob→Drive: `fetch(blobUrl).body` → `uploadToDrive(...)`; salva il `driveFileId`
   sul record (`Material.driveFileId` o `Content.originalDriveFileId`).
3. A upload Drive riuscito, **cancella l'originale da Blob** (il proxy resta su Blob). Su errore: NON
   cancellare, lasciare per retry, registrare l'errore.

### A2 — Raw Diario (sorgente = R2)
1. Client carica su R2 (flusso presigned PUT esistente) per il display immediato in chat.
2. Subito dopo la creazione della `DiaryEntry`, server streama R2→Drive nella cartella `raw/` generica:
   `getObjectBytes(r2Key)` (o stream GET) → `uploadToDrive(...)`; salva `DiaryEntry.driveFileId` +
   `archivedAt`. Egress R2→server è gratuito.
3. La copia R2 **non** viene cancellata subito: scade a 7 giorni via lifecycle nativa (hot reads nel
   frattempo). La lettura serve R2 finché `r2Key` esiste, poi ripiega su Drive (`driveFileId`).
4. **C2 (Riorganizza)**: quando arriva la classificazione main/broll, il file Drive già archiviato viene
   **spostato** nella cartella `raw/main` o `raw/broll` (files.update addParents/removeParents).

Nota sicurezza dato: l'archiviazione R2→Drive avviene **all'upload** (non a scadenza), quindi il raw è
sempre su Drive prima che la lifecycle possa cancellarlo da R2. Nessuna perdita anche se C2 non parte.

## Lifecycle rule R2

Script idempotente (`scripts/r2-set-lifecycle.ts`) che applica via client S3
(`PutBucketLifecycleConfiguration`) una regola: **expiration sul prefisso `raw/` dopo 7 giorni**.
Ri-eseguibile senza effetti collaterali. Documentato anche il fallback manuale da dashboard Cloudflare.

## Cartelle Drive

Helper find-or-create (scope `drive.file` → l'app vede solo ciò che crea): cartella radice `ContentTool/`
con sottocartelle `raw/main`, `raw/broll`, `editati`. Gli id cartella salvati in una config persistente
(nuova riga di config o `GoogleCalendarConfig`-like per Drive) per non ri-cercarle a ogni upload.

## Schema (migration additiva, nessun campo distruttivo)

- `Material.driveFileId String?`
- `Content.originalDriveFileId String?`
- `DiaryEntry.archivedAt DateTime?` (`driveFileId` già presente)
- Config cartelle Drive: id delle cartelle radice/raw-main/raw-broll/editati.

## Runtime

Le route/action che streamano verso Drive: `export const maxDuration = 300` + runtime Node (default),
così i file grandi (fino a 1GB) non si troncano. Upload Drive resumable via googleapis.

## Gestione errori

- Archiviazione Drive fallita → record resta senza `driveFileId`, originale NON cancellato dalla sorgente,
  errore loggato; retry idempotente (ricrea solo se manca `driveFileId`).
- Publish invariato: continua a usare Blob come mediaUrl per Zernio; l'archiviazione Drive dell'originale
  di publish è un passo aggiuntivo, non blocca la pubblicazione.

## Verifica (prima del merge)

- Browser (Chrome via MCP): upload di un video nel materiale → compare l'anteprima (proxy) + il record ha
  `driveFileId` e l'originale sparisce da Blob.
- Diario: upload raw → visibile in chat + `DiaryEntry.driveFileId`/`archivedAt` valorizzati.
- Lifecycle: verificare la regola applicata sul bucket (GetBucketLifecycleConfiguration).
- Safari: la compressione è già verificata Safari-safe per design (ffmpeg.wasm single-thread); confermare
  che l'anteprima si genera e si vede.

## Fuori scope

Compressione/anteprime (già fatte), pubblicazione/Zernio, KPI, e i "contenuti editati vecchi→Drive per
liberare R2" (non serve: R2 resta piccolo per costruzione).
