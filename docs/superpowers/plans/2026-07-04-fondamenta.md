# Fondamenta (schema unico + stub) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Applicare in **una sola migration Prisma additiva** tutti i modelli/campi nuovi richiesti dai filoni della serata, più gli stub condivisi, così i filoni successivi girano in parallelo senza scontrarsi sullo schema.

**Architecture:** Un'unica migration additiva (tutti i campi nuovi nullable, tutti i modelli nuovi) su Neon. Poi stub tipati (hook notifiche no-op + skeleton dei client di integrazione) per evitare conflitti d'import nell'Onda 2. Nessuna logica di feature qui: solo superficie stabile.

**Tech Stack:** Prisma 6, Neon Postgres (pooled `DATABASE_URL` + `DIRECT_URL`), Next.js 16.2.9, vitest 4, tsx.

## Global Constraints

- **NIENTE commit finché non funziona tutto** (regola utente): i passi "commit" sono **checkpoint locali** — `git add` per raggruppare, ma **niente `git commit`/push** finché il filone non è verificato. Sostituire ogni "Commit" con "Checkpoint locale (staged, commit differito)".
- **Env senza virgolette** (gotcha Neon/token). Non aggiungere env in questo piano.
- **Migration additiva e retro-compatibile**: ogni nuovo campo su tabelle esistenti è `?` (nullable); nessun campo esistente viene rinominato/rimosso.
- **`scopedWhere(workspaceId, …)`** obbligatorio in ogni query di lib (`src/lib/workspace.ts`).
- **Prisma singleton** `src/lib/db.ts` (`import { db } from "@/lib/db"`); mai `new PrismaClient()` fuori da `scripts/`.
- **Next 16 custom**: consultare `node_modules/next/dist/docs/` prima di codice App Router.
- Modello dati e nomi campo **verbatim** dallo spec §3 (`docs/superpowers/specs/2026-07-04-serata-multi-feature-design.md`).

---

### Task 1: Modifiche schema.prisma (campi esistenti + 4 modelli nuovi)

**Files:**
- Modify: `prisma/schema.prisma` (model `Content`, model `User`, model `Workspace`; aggiungere `GoogleCalendarConfig`, `GoogleCalendarLink`, `SocialAccount`, `DiaryEntry`)

**Interfaces:**
- Produces: campi `Content.externalId|publishState|publishError`, `User.telegramChatId|telegramLinkCode`; modelli `GoogleCalendarConfig`, `GoogleCalendarLink`, `SocialAccount`, `DiaryEntry` con le relazioni inverse su `Workspace`.

- [ ] **Step 1: Aggiungere i campi a `Content`**

Nella `model Content`, dopo `thumbnailUrl`/campi esistenti, aggiungere:

```prisma
  externalId    String?   // id del post sulla piattaforma (Zernio) — filone Z/W
  publishState  String?   // null|"scheduled"|"publishing"|"published"|"failed" — filone W
  publishError  String?   // messaggio ultimo errore pubblicazione — filone W
```

E in fondo al model, tra gli index esistenti:

```prisma
  @@index([externalId])
```

- [ ] **Step 2: Aggiungere i campi a `User`**

Nella `model User`, dopo `notificationsSeenAt`:

```prisma
  telegramChatId   String? @unique   // chat Telegram collegata — filoni T/N
  telegramLinkCode String?           // codice temporaneo di collegamento
```

- [ ] **Step 3: Aggiungere i 4 modelli nuovi**

In coda allo schema:

```prisma
model GoogleCalendarConfig {
  workspaceId       String    @id
  calendarId        String
  channelId         String?
  resourceId        String?
  watchExpiration   DateTime?
  syncToken         String?
  connectedByUserId String?
  createdAt         DateTime  @default(now())
  workspace         Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
}

model GoogleCalendarLink {
  id               String    @id @default(cuid())
  workspaceId      String
  refType          String
  refId            String
  googleEventId    String
  googleCalendarId String
  etag             String?
  syncStatus       String    @default("SYNCED")
  lastSyncedAt     DateTime?
  createdAt        DateTime  @default(now())
  workspace        Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  @@unique([workspaceId, refType, refId])
  @@index([googleEventId])
}

model SocialAccount {
  id              String    @id @default(cuid())
  workspaceId     String
  platform        String
  zernioAccountId String
  handle          String?
  connectedAt     DateTime  @default(now())
  workspace       Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  @@unique([workspaceId, platform])
  @@index([workspaceId])
}

model DiaryEntry {
  id               String   @id @default(cuid())
  workspaceId      String
  authorUserId     String?
  rawText          String?
  caption          String?
  telegramFileId   String?
  telegramFileType String?
  aiTitle          String?
  aiDescription    String?
  createdAt        DateTime @default(now())
  workspace        Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  @@index([workspaceId, createdAt])
}
```

- [ ] **Step 4: Aggiungere le relazioni inverse a `Workspace`**

Nella `model Workspace`, insieme alle altre relazioni:

```prisma
  googleCalendarConfig GoogleCalendarConfig?
  googleLinks          GoogleCalendarLink[]
  socialAccounts       SocialAccount[]
  diaryEntries         DiaryEntry[]
```

- [ ] **Step 5: Validare lo schema**

Run: `npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 6: Checkpoint locale (staged, commit differito)**

```bash
git add prisma/schema.prisma
# NIENTE git commit — regola: si committa solo a serata funzionante
```

---

### Task 2: Creare e applicare la migration + rigenerare il client

**Files:**
- Create: `prisma/migrations/<timestamp>_fondamenta_serata/migration.sql` (generato)

**Interfaces:**
- Consumes: schema del Task 1.
- Produces: tabelle/colonne nuove nel DB; `@prisma/client` rigenerato con i nuovi tipi.

- [ ] **Step 1: Creare la migration (senza applicarla in prod per errore)**

Run: `npx prisma migrate dev --name fondamenta_serata --create-only`
Expected: crea la cartella `prisma/migrations/<ts>_fondamenta_serata/` con `migration.sql`.

- [ ] **Step 2: Ispezionare il `migration.sql`**

Verificare a occhio che sia **solo** `ALTER TABLE ... ADD COLUMN` (nullable) e `CREATE TABLE` per i 4 modelli — **nessun** `DROP`/`ALTER ... DROP`.
Expected: nessuna operazione distruttiva.

- [ ] **Step 3: Applicare la migration**

Run: `npx prisma migrate dev`
Expected: `Your database is now in sync with your schema.` + client rigenerato.

- [ ] **Step 4: Rigenerare esplicitamente il client (evita staleness dev)**

Run: `npx prisma generate`
Expected: `Generated Prisma Client`.

- [ ] **Step 5: Checkpoint locale (staged, commit differito)**

```bash
git add prisma/migrations
```

---

### Task 3: Smoke test dei nuovi modelli/campi

**Files:**
- Create: `tests/fondamenta.test.ts`

**Interfaces:**
- Consumes: client Prisma rigenerato (Task 2).
- Produces: garanzia che i nuovi modelli/campi siano creabili/leggibili.

- [ ] **Step 1: Scrivere il test che fallisce**

```ts
import { describe, it, expect, afterAll } from "vitest";
import { db } from "@/lib/db";

describe("fondamenta schema", () => {
  const ws = { id: `ws_test_${Date.now()}`, name: "test" };

  it("crea un DiaryEntry e legge i nuovi campi Content", async () => {
    await db.workspace.create({ data: ws });

    const entry = await db.diaryEntry.create({
      data: { workspaceId: ws.id, rawText: "ciao", telegramFileId: "abc", telegramFileType: "photo" },
    });
    expect(entry.id).toBeTruthy();

    const content = await db.content.create({
      data: { workspaceId: ws.id, title: "t", externalId: "post_1", publishState: "scheduled" },
    });
    expect(content.externalId).toBe("post_1");
    expect(content.publishState).toBe("scheduled");
  });

  afterAll(async () => {
    await db.workspace.delete({ where: { id: ws.id } }).catch(() => {});
  });
});
```

- [ ] **Step 2: Eseguire il test — deve fallire prima della migration o passare dopo**

Run: `npx vitest run tests/fondamenta.test.ts`
Expected (dopo Task 2): PASS. Se i tipi `diaryEntry`/`externalId` non esistono → il client non è rigenerato (torna al Task 2 Step 4).

- [ ] **Step 3: Checkpoint locale (staged, commit differito)**

```bash
git add tests/fondamenta.test.ts
```

---

### Task 4: Stub condivisi (hook notifiche no-op + skeleton client)

**Files:**
- Modify: `src/lib/activity.ts` (aggiungere chiamata no-op in `createActivity`)
- Create: `src/lib/telegram.ts`, `src/lib/google-calendar.ts`, `src/lib/zernio.ts` (skeleton tipati)

**Interfaces:**
- Produces: `notifyTelegramForActivity(activity)` (no-op, accesa da N); firme `telegram.sendMessage`, `telegram.getFile`; skeleton `googleCalendar`/`zernio` con TODO.

- [ ] **Step 1: Aggiungere l'hook no-op in `createActivity`**

In `src/lib/activity.ts`, dentro `createActivity(...)`, **dopo** la `db.activity.create` e prima del `return`:

```ts
  // Hook notifiche esterne — accesa dal filone N. No-op finché non implementata.
  await notifyTelegramForActivity(activity).catch(() => {});
```

E in fondo al file:

```ts
// Stub: il filone N sostituisce il corpo con l'invio Telegram reale.
export async function notifyTelegramForActivity(_activity: { type: string; contentId: string | null; actorId: string | null; workspaceId: string }): Promise<void> {
  return;
}
```

(Adeguare il tipo dell'argomento al valore reale ritornato da `db.activity.create`.)

- [ ] **Step 2: Creare `src/lib/telegram.ts` (skeleton tipato)**

```ts
const API = "https://api.telegram.org";
const token = () => process.env.TELEGRAM_BOT_TOKEN ?? "";

export async function sendMessage(chatId: string, text: string): Promise<void> {
  if (!token()) return; // degrada in silenzio se non configurato
  await fetch(`${API}/bot${token()}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
}

// TODO(T): getFile → file_path per la vision, verifica update.
export async function getFile(_fileId: string): Promise<{ filePath: string } | null> {
  return null;
}
```

- [ ] **Step 3: Creare skeleton `src/lib/google-calendar.ts` e `src/lib/zernio.ts`**

`src/lib/google-calendar.ts`:

```ts
// TODO(G): client Google Calendar. Auth da Account provider "google-calendar".
export async function pushEvent(): Promise<void> { throw new Error("not implemented"); }
export async function pullChanges(): Promise<void> { throw new Error("not implemented"); }
```

`src/lib/zernio.ts`:

```ts
const key = () => process.env.ZERNIO_API_KEY ?? "";
// TODO(Z): fetch analytics account/per-post/demografiche. TODO(W): publish().
export function isConfigured(): boolean { return !!key(); }
```

- [ ] **Step 4: Verificare che il progetto compili**

Run: `npx tsc --noEmit`
Expected: nessun errore di tipo introdotto dagli stub.

- [ ] **Step 5: Verificare che l'app parta**

Run: `npm run dev` (poi Ctrl-C) — oppure browser-verify della home.
Expected: nessun crash all'avvio; `createActivity` continua a funzionare (l'hook no-op non rompe nulla).

- [ ] **Step 6: Checkpoint locale (staged, commit differito)**

```bash
git add src/lib/activity.ts src/lib/telegram.ts src/lib/google-calendar.ts src/lib/zernio.ts
```

---

## Self-Review

- **Spec coverage (§3 Fondamenta):** ✅ Content (externalId/publishState/publishError), User (telegramChatId/telegramLinkCode), GoogleCalendarConfig, GoogleCalendarLink, SocialAccount, DiaryEntry, hook no-op in createActivity, skeleton client. `MetricSnapshot`/`Account` non toccati (esistono già) — corretto. Campi orario CalendarEvent esclusi (backlog) — corretto.
- **Placeholder scan:** i "TODO(G/Z/W)" negli stub sono **intenzionali** (i filoni li sostituiscono), non placeholder di piano — ogni step ha codice reale.
- **Type consistency:** `notifyTelegramForActivity` (Task 4) è l'unica interfaccia esportata verso N; `telegram.sendMessage(chatId,text)` coerente con l'uso previsto in N. `externalId`/`publishState` coerenti tra Task 1 e il test del Task 3.
```
