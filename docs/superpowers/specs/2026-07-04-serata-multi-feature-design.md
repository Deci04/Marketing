# Serata multi-feature — Design Spec

> Data: 2026-07-04 · Progetto: content-tool (Next.js 16.2.9 · next-auth v5 · Prisma 6 · Neon · Vercel Blob · AI SDK Anthropic)
> Stato: design approvato filone per filone. Da qui → piano di implementazione.

## 1. Obiettivo della serata

Implementare un portfolio di feature sul content-tool di Luca, definendo in anticipo **ogni singolo cambiamento** (dati, file, comportamento, casi limite) ed eseguendole con un'**architettura a subagenti** (implementer + revisori avversariali + loop di correzione), massimizzando il parallelismo dove i file sono disgiunti e serializzando dove condividono superficie (schema/migration).

## 2. Scoperte chiave sul codice (grounding)

Fatti verificati su sorgente reale che vincolano gli spec:

1. **Due sistemi di stato distinti**, da non confondere:
   - `src/lib/status.ts` → `deriveStatus`/`effectiveStatus`: stato **da date** (`Da consegnare|Consegnato|Revisionato|Pubblicato`), con override manuale `Content.statusOverride`. Usato in `/contenuti`, `/archivio`, card, modale.
   - `src/lib/workflow.ts` → `workflowState`: stato **da eventi** (`Da consegnare|Da revisionare|Da confermare|Confermato`), guidato da `Content.deliveredAt`/`confirmedAt`/`hasMontato`. **È quello che usa la home.**
2. **Il calendario disegna 4 tipi di item, ma solo 1 è una riga `CalendarEvent`**: "publication" = `Content.publishAt`; consegne = `Block.lucaDeliveryAt`/`matteoDeliveryAt`; solo "event" = `CalendarEvent`. `CalendarEvent` ha solo `date` (mezzanotte UTC), **niente ora**, **niente campi esterni**. Tutte le mutazioni passano da chokepoint centralizzati in `src/lib/calendar.ts`.
3. **La dashboard KPI esiste già ed è matura** (`/kpi`, `src/components/dashboard-grid.tsx`, `src/components/kpi/kpi-boxes.tsx`, `src/components/kpi-chart.tsx`): 12 box draggabili, grafico recharts, funnel, demografiche. Legge da `getKpiData` (`src/lib/kpi.ts`). **Manca solo l'ingestione dati** — oggi tutto è inserito a mano.
4. **`MetricSnapshot` esiste ma è codice morto** (nessun read/write). Pronto da attivare per lo storico per-post.
5. **Nessun external-id su `Content`** → per agganciare i post reali serve un campo nuovo.
6. **Le notifiche hanno un unico choke-point pulito**: `createActivity()` in `src/lib/activity.ts:9`, che già riceve `type`, `contentId`, `actorId` (8 call-site). La regola destinatario è `actorId != recipient` (come `unreadCount`).
7. **`generateObject`/`streamObject` non sono mai usati**; esiste però la convenzione zod + `anthropic("claude-opus-4-8")` (in `src/lib/chat-tools.ts`, `chat-write-tools.ts`) da riusare.
8. **Il modello `Account`** (adapter Auth.js) ha già `access_token`/`refresh_token`/`expires_at`/`scope` → può ospitare i token Google **senza migration**.
9. **`/contenuti` e `/archivio` caricano TUTTI i contenuti senza `take`** (`listContents`, `src/lib/content.ts:7`) con include pesanti → problema di render/clutter reale in crescita (non di DB).
10. **Convenzioni**: server action `"use server"` per-segmento (`actions.ts`) → chiamano lib `src/lib/*.ts` (che prendono `workspaceId` e usano `scopedWhere`) → `revalidatePath`. Env letto via `process.env.X` (nessun `lib/env`), **valori SENZA virgolette** (gotcha Neon/token). Prisma singleton `src/lib/db.ts`. Next 16 custom: consultare `node_modules/next/dist/docs/` prima di scrivere codice App Router. `react-grid-layout` è v2 (API diversa).

## 3. Fondamenta condivise (una sola migration)

Poiché 5 filoni toccano lo schema e le migration Prisma sono seriali, **tutte le modifiche schema si fanno in UNA migration** (onda Fondamenta), creando una base stabile prima di parallelizzare.

### 3.1 Modifiche `schema.prisma`

**`Content`** — aggiungere:
- `externalId String?` — id del post sulla piattaforma (Zernio). `@@index([externalId])`.
- `publishState String?` — `null|"scheduled"|"publishing"|"published"|"failed"` (per W).
- `publishError String?` — messaggio errore ultima pubblicazione.

**`User`** — aggiungere:
- `telegramChatId String? @unique` — chat Telegram collegata (per T e N).
- `telegramLinkCode String?` — codice temporaneo per il collegamento.

**`ActivityType`** — **nessuna aggiunta** (il diario ha un modello proprio, non usa Activity).

**Nuovi modelli:**

```prisma
model GoogleCalendarConfig {   // stato connessione + sync, per workspace
  workspaceId    String    @id
  calendarId     String                 // il calendario condiviso dedicato
  channelId      String?                // canale push (watch)
  resourceId     String?
  watchExpiration DateTime?
  syncToken      String?                // per il pull incrementale
  connectedByUserId String?             // chi ha collegato (token in Account)
  createdAt      DateTime  @default(now())
  workspace      Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
}

model GoogleCalendarLink {    // mapping item-del-board <-> evento Google
  id               String   @id @default(cuid())
  workspaceId      String
  refType          String                // "luca"|"matteo"|"publication"|"event"
  refId            String                // id di Block/Content/CalendarEvent
  googleEventId    String
  googleCalendarId String
  etag             String?
  syncStatus       String   @default("SYNCED")  // LOCAL|SYNCED|PENDING_PUSH|CONFLICT|DELETED
  lastSyncedAt     DateTime?
  createdAt        DateTime @default(now())
  workspace        Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  @@unique([workspaceId, refType, refId])
  @@index([googleEventId])
}

model SocialAccount {         // account social collegato via Zernio
  id             String   @id @default(cuid())
  workspaceId    String
  platform       String                 // "INSTAGRAM"|"TIKTOK"|"YOUTUBE"|"LINKEDIN"
  zernioAccountId String
  handle         String?
  connectedAt    DateTime @default(now())
  workspace      Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  @@unique([workspaceId, platform])
  @@index([workspaceId])
}

model DiaryEntry {            // voce del diario di Luca (intake Telegram)
  id             String   @id @default(cuid())
  workspaceId    String
  authorUserId   String?
  rawText        String?
  caption        String?
  telegramFileId String?                // riferimento permanente Telegram (NO byte su Blob)
  telegramFileType String?              // "photo"|"video"|"document"
  aiTitle        String?
  aiDescription  String?                // per le foto: descrizione via vision
  createdAt      DateTime @default(now())
  workspace      Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  @@index([workspaceId, createdAt])
}
```

Relazioni inverse su `Workspace` (`googleCalendarConfig?`, `googleLinks[]`, `socialAccounts[]`, `diaryEntries[]`).

> Nota: i **campi orario** su `CalendarEvent` (`startAt/endAt/allDay/timezone`) sono **in backlog** (decisione: tutto "tutto il giorno"). Non entrano in questa migration.
> Nota: **`Account`** (Google OAuth token) e **`MetricSnapshot`** (storico per-post) **non richiedono migration** — esistono già.

### 3.2 Stub condivisi (nell'onda Fondamenta)

- `src/lib/activity.ts`: aggiungere in `createActivity()` una chiamata a `notifyTelegram(...)` **no-op** (stub) — N la accenderà.
- Skeleton (firme + TODO) di `src/lib/google-calendar.ts`, `src/lib/zernio.ts`, `src/lib/telegram.ts` per evitare conflitti d'import nell'onda 2.

## 4. Spec per filone

Ogni filone: **comportamento utente · cambiamenti · file · casi limite · setup · dipendenze**.

### G — Google Calendar (bidirezionale, tutto)

**Comportamento.** In Impostazioni: "Connetti Google Calendar" (OAuth **una volta**, account di Matteo). Il tool crea/usa un **calendario condiviso dedicato** ("Contenuti · Luca"), che Matteo condivide con Luca via Google. Eventi, uscite programmate (`Content.publishAt`) e consegne (date sui `Block`) compaiono su quel calendario; modifiche su Google tornano nel tool e viceversa.

**Responsabile ↔ Google.** Convenzione deterministica: tool→Google scrive tag nel titolo (`[Luca]`/`[Matteo]`) + colore per persona + `extendedProperties.private.responsible`. Google→tool legge il tag; senza tag = evento **non assegnato**. (Inferenza AI del responsabile = backlog, non prioritario.)

**Conflitti.** Vince l'ultima modifica (etag/timestamp). Sync **idempotente** (dedup su `googleEventId`) per minimizzare bug.

**Orari.** Tutto "tutto il giorno". Orario sugli eventi = backlog.

**Cambiamenti/file.**
- `src/lib/google-calendar.ts` (nuovo): client Google (auth da `Account` provider `"google-calendar"`, refresh automatico su `expires_at`), push/patch/delete, pull incrementale via `syncToken`, gestione watch-channel.
- Route nuove: `src/app/api/integrations/google/authorize/route.ts`, `.../callback/route.ts` (OAuth offline, `access_type=offline&prompt=consent`), `.../webhook/route.ts` (push notification Google → riconciliazione).
- Uscita: agganciare i chokepoint di `src/lib/calendar.ts` (`addEvent`, `moveItem`, `deleteItem`, `setBlockDelivery`, `createBlockRange`, `resizeBlock`) e di `src/lib/content.ts` (`createContent`, `updateContent`, `deleteContent`) → push/patch/delete su Google + upsert `GoogleCalendarLink`.
- Entrata: il webhook mappa `googleEventId` → `GoogleCalendarLink` → aggiorna `Content.publishAt` / data del `Block` / `CalendarEvent`; crea `CalendarEvent` non assegnato se l'evento nasce su Google.
- Dipendenza npm: `googleapis` (o wrapper fetch).
- UI: pulsante "Connetti Google Calendar" in `profilo`.

**Casi limite.** date-only → evento all-day; delete bidirezionale via mapping; item creato su Google senza tag → CalendarEvent non assegnato; conflitto → last-write-wins.

**Setup (Onda 0).** Google Cloud project → OAuth client (id/secret, redirect URI), scope `calendar`; creazione calendario condiviso (o al primo collegamento). Env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (no virgolette).

### Z — Zernio (KPI reali: account + per-post)

**Comportamento.** In Impostazioni: "Connetti account social" (OAuth lato Zernio). La dashboard KPI esistente **si popola** con dati reali. Aggiornamento **on-demand**: pulsante "Aggiorna dati" (solo admin) su `/kpi` → pull da Zernio → upsert. **Niente cron.**

**Cambiamenti/file.**
- `src/lib/zernio.ts` (nuovo): client Zernio (`ZERNIO_API_KEY`), fetch analytics account + per-post + demografiche.
- Server action `refreshKpiAction` (admin) in `src/app/(app)/kpi/actions.ts` → chiama `zernio.ts`, upsert:
  - account/giorno → `Measurement` (`metric` ∈ {`followers`,`engagement_rate`,`non_follower_pct`}, `series:"Luca"`, `channel`).
  - demografiche → `AudienceSegment` (`dimension` ∈ {`age`,`gender`,`geo`,`followerType`,`activity`,`returning`}).
  - per-post → scalari su `Content` (views/reach/likes/commentsCount/saves/shares/followsGenerated/nonFollowerPct) matchando via `Content.externalId`; **append** su `MetricSnapshot` (storico).
- UI: pulsante "Aggiorna dati" su `/kpi` (admin) + "Connetti account social" in `profilo`.
- `SocialAccount` popolato al collegamento.

**Aggancio post→Content = opzione A** (via W): l'`externalId` si ottiene **al momento della pubblicazione** da Zernio. Finché W non è pronto, i KPI **account/demografiche** funzionano; i **per-post** si accendono man mano che i contenuti vengono pubblicati da W.

**Casi limite.** `externalId` mancante → si ingeriscono solo metriche account; refresh manuale → nessuno spreco a consumo.

**Setup (Onda 0).** Creare account Zernio, ottenere `ZERNIO_API_KEY` (no virgolette), connettere i social dentro Zernio.

**Dipendenze.** Per-post dipende da **W**.

### W — Pubblicazione via Zernio (ULTIMO, QA rinforzato)

**Comportamento.** Da un contenuto **confermato**, pulsante "Pubblica" → scelta piattaforma/e (+ eventuale programmazione) → pubblicazione diretta via Zernio. Al successo salva `externalId` → aggancio KPI per-post automatico.

**Qualità (non negoziabile).**
- Si pubblica **sempre l'originale a piena qualità, mai il proxy**. Il publish path ignora `videoProxyUrl` per costruzione.
- Ciclo di vita file: originale disponibile **fino alla pubblicazione** (upload su Blob al publish, oppure preso da `Content.masterLink` esistente) → passato a Zernio come URL pubblico → **al successo**: salva `externalId`, imposta `publishState="published"`, **cancella l'originale da Blob** (resta il proxy). Su errore: `publishState="failed"`, `publishError`, originale conservato per retry.
- **Guardrail anti-degrado**: validazione specifiche (risoluzione/formato/aspect ratio/peso vs requisiti piattaforma) + schermata di conferma "pubblico l'originale a piena qualità"; verifica che Zernio non ri-comprima al ribasso.

**Cambiamenti/file.** `publish()` in `src/lib/zernio.ts`; `publishContentAction` in `kpi`/`contenuti/actions.ts`; UI nel `src/components/content-modal.tsx`; usa `Content.publishState`/`externalId`/`publishError`.

**Sequencing.** Ultimo tra i filoni di sostanza; review extra + **browser-verify con un post di prova reale** prima di dichiararlo fatto.

### T — Diario di Luca (chat di lavoro in-app)

**Comportamento.**
1. **Intake (Telegram → tool).** Luca scrive al bot testo/foto/video. Ogni messaggio → `DiaryEntry`. Per le **foto**: fetch una volta, **vision** (Claude) → `aiDescription`, byte scartati. **Nessun byte su Blob**: si salva solo `telegramFileId`.
2. **Chat di lavoro (pagina `/diario`).** Nuova pagina in sidebar = chat AI (riusa `ChatThread`/`ChatMessage`, `chat-panel`) con accesso a tutte le `DiaryEntry` + stato workspace. Matteo discute, l'AI propone spunti/contenuti e, **su conferma**, crea eventi/contenuti via write-tools esistenti (`needsApproval`). Storia salvata.

**Storage.** Media su server Telegram (solo `file_id` + descrizione). Byte reali scaricati **solo** se un elemento diventa Content, e in quel caso passano dalla pipeline compressione/proxy esistente. Coerente con la disciplina "solo proxy".

**Cambiamenti/file.**
- Route `src/app/api/telegram/webhook/route.ts` (nuovo): verifica `X-Telegram-Bot-Api-Secret-Token` (**no `currentContext`**), mappa `chat.id` → `User.telegramChatId` → workspace; salva `DiaryEntry`; per foto → vision.
- `src/lib/telegram.ts` (nuovo): `sendMessage`, `getFile`, verifica update.
- Vision: `generateObject`/`generateText` con `anthropic("claude-opus-4-8")` (schema zod).
- Chat: nuovo read-tool `searchDiary` in `src/lib/chat-tools.ts`; creazione contenuti/eventi via `chat-write-tools.ts` esistenti.
- Pagina `src/app/(app)/diario/page.tsx` + voce sidebar (`src/app/(app)/layout.tsx`).
- Collegamento chat↔utente: in Impostazioni pulsante "Collega Telegram" → mostra codice → Luca lo manda al bot (`/start <codice>`) → `telegramChatId` legato.

**Casi limite.** Chat non mappata → ignorata; ambiguità → la chat propone (non crea in automatico); video → conservato via `file_id`, AI si basa su caption.

**Setup (Onda 0).** Bot via @BotFather → `TELEGRAM_BOT_TOKEN` + `TELEGRAM_WEBHOOK_SECRET` (no virgolette); registrare il webhook.

**Dipendenze.** `User.telegramChatId`, `DiaryEntry` (Fondamenta).

### N — Notifiche Telegram in uscita

**Comportamento.** Su eventi rilevanti, la persona giusta riceve un push su Telegram (oltre alla campanella in-app).

**Cambiamenti/file.** Accende lo stub in `createActivity()` (`src/lib/activity.ts:9`): dopo la scrittura Activity, invia via `telegram.sendMessage` al destinatario con `telegramChatId`, **mai** a `actorId`. Testo breve + link. Se il destinatario non ha Telegram collegato → no-op.

**Mappa evento→destinatario.**
| Evento | Push a | Push? |
|---|---|---|
| DELIVERED (Luca consegna) | Matteo | ✅ |
| REVIEW_READY (montato caricato) | Luca | ✅ |
| CONFIRMED (Luca conferma) | Matteo | ✅ |
| COMMENT (testo/audio) | l'altra persona | ✅ |
| CREATED | — | ❌ (solo campanella) |

Istantaneo, non digest. La mappa si affina con l'uso.

**Dipendenze.** T (client Telegram + `telegramChatId`).

### H — Home "azioni da fare" per-ruolo

**Comportamento.** Home personalizzata per **ruolo**, tono **imperativo**, ordinata per urgenza, **nient'altro** (rumore zero).
- **Luca** → **deadline aggregate**: "⏳ Hai 4 giorni per consegnare i prossimi 4 Reel" (raggruppo per scadenza `Block.lucaDeliveryAt`, conto i `Content` ancora "Da consegnare") + "✅ 2 montati da confermare". Tap sull'aggregato → lista dei singoli.
- **Matteo** → "🎬 4 materiali da revisionare".

**Cambiamenti/file.** `src/app/(app)/home/page.tsx` (righe 34-43 + render 108-145): sostituire la lista uniforme con logica **ruolo → azione**. Ruolo da `currentContext().role`/`isAdmin`. Mappa: `Da revisionare`→Matteo ("Revisiona/monta"); `Da confermare`→Luca ("Conferma il montato"); `Da consegnare con scadenza entro la settimana (≤7 giorni)`→Luca (aggregato deadline). Estendere eventualmente `src/lib/workflow.ts`.

**Casi limite.** "Da consegnare" mostrato solo con scadenza vicina (≤7 giorni) per non intasare; aggregazione per blocco/scadenza.

### S — Ricerca + archivio (alleggerimento)

**Comportamento.**
- `/contenuti` mostra **solo gli attivi** (nel flusso: da consegnare/revisionare/confermare + uscite programmate) — lista snella e azionabile.
- `/archivio` mostra i **pubblicati**, **paginato/lazy**.
- **Auto-archivio**: un contenuto va in archivio quando è **Pubblicato da >14 giorni**.
- **Ricerca**: barra testo (titolo/hook/note) + filtri (stato, canale, formato, classe) sugli **attivi**; toggle "cerca anche nell'archivio". Filtro **client-side** per ora (fino a qualche centinaio); server-side se cresce.

**Cambiamenti/file.** `src/lib/content.ts` (`listContents`: split attivi/archivio via stato+data, aggiungere paginazione all'archivio); `src/app/(app)/contenuti/page.tsx` (barra+filtri, solo attivi); `src/app/(app)/archivio/page.tsx` (paginazione); `src/components/archive-table.tsx`. Regola archivio in `src/lib/status.ts`/`workflow.ts`.

**Casi limite.** Confine attivo↔archivio derivato (Pubblicato + >14gg); nessuno schema nuovo.

### A — Analytics viz

Quasi vuoto: la dashboard esiste. Con Z che porta i dati, si accende da sola. A = **verificare il render con dati reali** + eventuali box nuovi **solo se** richiesti. **Nessuna viz specifica richiesta** → A si fonde in Z (verifica) e P (rifiniture).

### M — Mobile (ottimizzazione completa, per ultimo)

**Comportamento.** Oggi il mobile è **inutilizzabile** → ottimizzazione responsive **completa** su tutte le pagine: home, calendario (drag-and-drop touch), contenuti, content-modal, dashboard KPI (`react-grid-layout` su mobile), archivio (tabella), diario, profilo, login.

**Cambiamenti/file.** Cross-cutting su componenti/pagine; nessuno schema. Per ultimo, dopo i merge feature, per non rifare lavoro.

**Casi limite.** Drag-and-drop calendario e grid KPI su touch = i punti più delicati.

### P — Revisione conclusiva (caccia bug + debug)

**Comportamento.** A valle di tutti i merge: **pass di review avversariale** che cerca bug su tutta l'app, li riproduce e li debugga con metodo (systematic-debugging). Non una lista a priori: si scopre e si sistema. Usa i subagenti-revisori dell'architettura.

## 5. Architettura a subagenti (aggiornata)

### Onde

```
ONDA 0 — SETUP (tu + io, interattivo)                      ⟵ CHECKPOINT
  Google OAuth (client id/secret, calendario condiviso) · Zernio account+key+connect
  · Bot @BotFather (token + webhook + secret) · env su Vercel (SENZA virgolette)

ONDA 1 — FONDAMENTA (1 agente, SERIALE)                    ⟵ CHECKPOINT (merge main)
  Una sola migration (§3) + stub condivisi → schema stabile

ONDA 2 — FEATURE (worktree PARALLELI, file disgiunti)
  G Google Calendar · Z Zernio ingestion · T Diario/webhook · H Home · S Ricerca+archivio

ONDA 3 — INTEGRAZIONE
  N Notifiche (accende hook createActivity) · W Pubblicazione (ULTIMO, QA) · A verifica viz

ONDA 4 — CROSS-CUTTING (per ultimi)
  M Mobile (completo) · P Caccia bug + debug
```

### Pipeline per filone

```
Planner → Implementer (worktree, TDD dove sensato) → Reviewer ×N (avversariale) → fix loop → Browser-verify → Merge
```

- **Planner**: spec-di-filone → task-list precisa.
- **Implementer**: worktree isolato; TDD su logica pura (classificatore/vision, mapping metriche Zernio, home per-ruolo, sync idempotente).
- **Reviewer avversariale** (1–3, in base al rischio): *prova a rompere*; controlla aderenza allo spec + correttezza + gotcha (env no-virgolette, Next 16 custom → leggere `node_modules/next/dist/docs/`, react-grid-layout v2, date UTC-midnight, `scopedWhere` obbligatorio, webhook senza `currentContext`).
- **Fix loop**: correzione → re-review finché pulito.
- **Browser-verify**: G/Z/W/T verificati nell'app reale prima del merge (regola: browser-verify prima di main). W → post di prova reale.

### Checkpoint (dove mi fermo)
1. Dopo **Onda 0** (chiavi/OAuth funzionanti).
2. Dopo merge **Fondamenta** (schema stabile).
3. Prima del merge di **G, Z, W, T** (browser-verify insieme). W = post di prova.
H/S/M/P scorrono in autonomia con review.

### Orchestrazione
Ibrida: io orchestro nel loop principale, dispaccio gli Agent; parallelismo reale solo nell'Onda 2 (file disgiunti); Onda 0 e browser-verify restano interattivi (non automatizzabili).

## 6. Onda 0 — checklist setup (interattivo)

- [ ] **Google**: progetto Cloud, OAuth client (redirect `/api/integrations/google/callback`), scope Calendar; env `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`.
- [ ] **Zernio**: account, `ZERNIO_API_KEY`, connessione social.
- [ ] **Telegram**: bot @BotFather → `TELEGRAM_BOT_TOKEN`; scelto `TELEGRAM_WEBHOOK_SECRET`; webhook registrato sul dominio prod.
- [ ] Tutte le env su Vercel **senza virgolette** (gotcha Neon/token). Prod: `marketing-ashy-one.vercel.app`, DB Neon condiviso.

## 7. Rischi & note

- **G** è il più complesso (push channel + conflitti + 4 refType). Sync idempotente obbligatorio.
- **W** critico sulla qualità: originale-fino-al-publish, mai proxy, validazione specifiche.
- **Z per-post** parziale finché W non pubblica (opzione A). Account/demografiche subito.
- **Costi**: Zernio a consumo → refresh on-demand; vision Telegram → solo foto, una volta.
- **Storage**: mai byte media da Telegram su Blob; originali W cancellati post-publish.
- **Next 16 custom** + **react-grid-layout v2**: leggere i doc locali prima di scrivere.
```
