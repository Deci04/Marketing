# Spec C — Diario come Raccolta: storage cloud + ingestion + restructuring AI

> Data: 2026-07-09. Terzo filone dopo A (sezioni) e B (scheda). Sottosistema grande →
> **decomposto in C1/C2/C3**; qui l'architettura complessiva + il dettaglio di **C1** (fondazione).
> Decisioni di storage già prese (ricerca 9 Jul, vedi memory [[ia-v2-and-publishing]]).

## Obiettivo

Trasformare il **Diario** da chat alimentata via Telegram a una **vera raccolta**: Luca inserisce
materiale (foto, video, note testuali, audio) **direttamente in-app**, il materiale è conservato su un
cloud gratuito (con lifecycle) **finché Matteo non lo edita/consegna**, e l'AI **ristruttura e spiega**
quel materiale per contesto — *dov'è, cosa vuole, cosa dice, cosa vuole trasmettere* — così che Matteo
prenda in mano tutto con chiarezza nel minor tempo possibile. **Non genera schede contenuto in
automatico**: è un layer di *ingestion + sintesi*, non di generazione.

## Contesto attuale (verificato nel codice)

- **Modello `DiaryEntry`** (`prisma/schema.prisma`): `rawText`, `caption`, **`telegramFileId`**,
  `telegramFileType` (`photo|video|document`), `aiTitle`, `aiDescription`. Il media **vive sui server
  Telegram** (solo un id) → è esattamente lo storage contro i TOS da abbandonare.
- **Ingestion oggi = Telegram**: `src/lib/telegram-intake.ts` (`handleTelegramUpdate`) scarica il file
  da Telegram e chiama `createDiaryEntry()` (`src/lib/diary.ts:15`). Per le foto gira
  `describePhoto()` (`src/lib/diary-vision.ts`) → Claude **vision** → `aiTitle`/`aiDescription`.
- **AI**: Vercel **AI SDK** (`ai`) + **`@ai-sdk/anthropic`**, modello `claude-opus-4-8`. La chat del
  Diario (`src/app/api/diario/route.ts`) usa `streamText` per il "chiedi spunti".
- **UI**: `src/components/diary/diary-chat.tsx` (chat). Upload file grandi già risolto altrove con
  `uploadViaServer` (client→Blob), vedi memory [[content-tool-known-fixes]].

## Architettura complessiva (decisa)

- **Hot = Cloudflare R2** — 10GB free permanenti, **egress $0**, **lifecycle rules native** su prefisso
  (`raw/` auto-scadenza), API S3-compatibile. Upload **client→R2 diretto** con presigned PUT (+ multipart
  per i video); mai attraverso le Vercel Functions (limite 4.5MB).
- **Cold = Google Drive (Shared Drive del Workspace aziendale di Luca)** — service account membro dello
  Shared Drive (niente gotcha "0 quota", costo incrementale ≈0). Transizione hot→cold gratis (egress R2 $0).
- **AI restructuring = Claude via AI SDK** (già in casa). Riuso ed estensione di `diary-vision.ts`.
- **Telegram**: **dismesso come storage/ingestion**. Il codice Telegram resta ma non è più il canale
  primario (nessuna nuova dipendenza dai suoi file). Migrare via è non negoziabile (TOS).

## Decomposizione

- **C1 — Fondazione: storage R2 + ingestion in-app** (questo spec, dettagliato sotto). Senza questo il
  resto non esiste. Deliverable indipendente e testabile.
- **C2 — Restructuring AI per contesto** (spec separato): brief strutturato `contesto / intento /
  cosa-dice / messaggio` su testo·foto·audio·video, estendendo la vision esistente.
- **C3 — Archivio freddo su Drive** (spec separato): Shared Drive + service account, lifecycle R2 su
  `raw/`, transizione hot→cold alla consegna. Preview leggere sempre hot.

---

## C1 — Fondazione: R2 + ingestion in-app (dettaglio)

### Dati (`DiaryEntry` — migration additiva)

Aggiungere, **senza rimuovere** i campi Telegram (legacy, per non rompere i dati esistenti):
```
r2Key        String?   // chiave oggetto su R2, es. "raw/{workspaceId}/{entryId}/{filename}"
mediaUrl     String?   // URL pubblico/prefirmato di lettura (o via route proxy)
mediaType    String?   // "image" | "video" | "audio" | "text"
mediaSize    Int?
archivedAt   DateTime? // valorizzato quando spostato su Drive (C3)
driveFileId  String?   // id file su Google Drive dopo l'archiviazione (C3)
```
I nuovi ingressi valorizzano `r2Key/mediaUrl/mediaType`; `telegramFileId` resta null. Nessun dato perso.

### Flusso di upload (Luca, in-app)

1. Nel Diario, Luca sceglie/registra il materiale (file picker + registratore audio già esistente
   `AudioRecorder`; per il testo, la nota va in `rawText`).
2. Client chiede a una **route** `POST /api/diario/upload-url` un **presigned PUT** R2 (AWS SDK v3
   `getSignedUrl`, scadenza breve) per `raw/{workspaceId}/{entryId}/{safeName}`. La route autentica
   (sessione) e autorizza il workspace.
3. Il browser fa **PUT diretto** a R2 (per i video: **multipart**, parti 5–64MB, retry per parte).
   R2 **non supporta POST form-based** → usare PUT/multipart, mai `<form>` upload. Configurare **CORS**
   sul bucket per l'origine app.
4. A upload finito il client chiama `createDiaryEntry(...)` (esteso) con `r2Key/mediaUrl/mediaType/size`.
5. (C2) l'AI restructuring parte in background sull'entry appena creata.

### Componenti/route (C1)

- **`src/lib/r2.ts`** (nuovo): client S3 R2 (`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`),
  `presignPut(key, contentType)`, `publicUrl(key)`/`presignGet(key)`, `deleteObject(key)`. Env:
  `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE` (o proxy).
- **`src/app/api/diario/upload-url/route.ts`** (nuovo): autentica → ritorna presigned PUT + `r2Key`.
- **`src/lib/diary.ts`**: estendere `createDiaryEntry` per accettare i nuovi campi R2 (retro-compatibile).
- **`src/components/diary/diary-chat.tsx`** (o nuovo `diary-upload.tsx`): UI di upload (file+audio+testo)
  con progress e multipart per i video; a fine upload crea l'entry e la mostra nella raccolta.
- **Lettura media**: `mediaUrl` via `R2_PUBLIC_BASE` (bucket pubblico dietro dominio) **oppure** una route
  proxy `GET /api/diario/media/[key]` che fa `presignGet`. *Default: route proxy* (bucket privato, più sicuro).

### Env / setup (C1)

Bucket R2 `diario` (privato), CORS per l'origine app, chiavi API con permesso sul bucket. Env sopra su
`.env` + Vercel. Nessuna lifecycle qui (è C3). Nessun costo entro 10GB.

### Fuori scope di C1 (→ C2/C3)

Restructuring AI (oltre alla vision foto già esistente), archivio Drive, lifecycle di scadenza,
transcript audio, raggruppamento in "raccolte" per idea di contenuto.

---

## Decisioni prese con default (per la tua review — come in A/B)

- **D1 — Input**: l'upload in-app **sostituisce** Telegram come canale del materiale; il codice Telegram
  resta ma deprecato (non rimosso). *Default: sì.*
- **D2 — Storage privato + route proxy** per servire i media (bucket R2 privato). *Default: sì* (più
  sicuro del bucket pubblico; costo nullo).
- **D3 — Audio (transcript) — DECISO (9 Jul):** si prova **(a)** trascrizione via provider (es. Whisper
  tramite `experimental_transcribe` dell'AI SDK) **solo se a costo nullo/trascurabile**; se comporta un
  costo API reale, **fallback a (b)** trascrizione **on-device** nel browser di Luca (Web Speech API).
  Roba di **C2**, non tocca C1. In C2 valutare provider Whisper con free tier (es. Groq) prima di OpenAI (a pagamento).
- **D4 — Struttura del brief (C2)**: quattro facce esplicite — **Contesto** (dov'è), **Intento** (cosa
  vuole), **Cosa dice** (nota/transcript), **Messaggio** (cosa vuole trasmettere) — salvate come campi
  strutturati su `DiaryEntry` (estendendo `aiTitle`/`aiDescription`). *Default: sì.*
- **D5 — Raggruppamento**: MVP = stream piatto di `DiaryEntry` (nessun raggruppamento per idea di
  contenuto); il link a un `Content` si aggiunge dopo. *Default: sì (semplice).*
- **D6 — Modello AI**: il restructuring riusa `@ai-sdk/anthropic`. Vision resta `claude-opus-4-8`; per il
  testo/sintesi ad alto volume valutare **`claude-sonnet-5`** (equilibrio costo/qualità) o
  **`claude-haiku-4-5-20251001`** (economico). *Default: Sonnet 5 per la sintesi, Opus 4.8 per la vision.*

## Rischi / note

- **Migrazione via da Telegram**: unico punto non negoziabile (TOS). Gli entry Telegram esistenti restano
  leggibili finché Telegram li serve; i nuovi passano da R2.
- **R2 501 su POST form**: usare presigned **PUT**/multipart, mai `<form>` upload.
- **Costo**: entro 10GB tutto gratis; lo spostamento hot→cold (C3) è gratis (egress R2 $0).
- **Setup Google Drive (C3)**: richiede lo Shared Drive del Workspace di Luca + service account membro —
  da predisporre prima di C3.

## Testing / verifica

- **C1 unit**: presign/key-building puri (`r2.ts`), estensione `createDiaryEntry` (retro-compat), parsing
  della route upload-url. **Browser-verify dal vivo** (Matteo): Luca carica foto/video/audio/nota nel
  Diario → compare nella raccolta, il media si apre, nessun passaggio da Telegram.
- Regola progetto: locale, commit a verde, merge/push solo su verifica.
