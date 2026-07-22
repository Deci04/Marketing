# Filone 1 — Quick-edit dal calendario + Note — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Fresh subagent per task, two-stage review between tasks. Steps use `- [ ]`.

**Goal:** rendere nome + note di un contenuto modificabili inline dal drawer del calendario (autosave ottimistico), portare le Note su eventi e blocchi, sostituire l'hook con le Note sui contenuti, e dare ai blocchi l'auto-lista dei contenuti nel periodo con deseleziona.

**Architecture:** migrazioni additive per `notes` su Event/Block; un'azione dedicata di update **parziale** che aggiorna solo i campi passati (evita l'azzeramento di `publishAt`/`format` del vecchio `updateContentAction`); gli item del calendario trasportano `title`+`notes` così l'edit è istantaneo senza fetch; drawer e modale riscritti per l'edit inline.

**Tech Stack:** Next.js 16 (App Router modificato — consultare `node_modules/next/dist/docs/`), Prisma 6 + Neon, React 19 server actions + `useOptimistic`, Tailwind v4, Vitest (ambiente node, `tests/**/*.test.ts`).

## Global Constraints
- **Next.js modificato:** leggere `node_modules/next/dist/docs/` prima di usare API Next; heed deprecations (`AGENTS.md`).
- **DB di prod condiviso** (Neon): le migrazioni sono **additive** (`notes String?`), ma vanno eseguite solo dopo OK di Matteo (checkpoint migration). Nessun test distruttivo su dati reali.
- **Multi-tenant:** ogni query/mutazione passa da `scopedWhere(workspaceId, …)` e `currentContext()`; mai toccare dati fuori workspace.
- **Commit solo quando funziona** e verificato; `graphify update .` dopo le modifiche.
- Colonna `Content.hook` **non** rimossa (vestigiale), solo tolta dalla UI.

---

### Task 1: Schema — `notes` su Event/Block + `updateContent` accetta `notes`

**Files:**
- Modify: `prisma/schema.prisma` (model `CalendarEvent` ~L178, model `Block` ~L161)
- Modify: `src/lib/content.ts:301-319` (data type di `updateContent`)
- Migration: `prisma/migrations/**` (additiva)

**Interfaces prodotte:** `CalendarEvent.notes: string|null`, `Block.notes: string|null`; `updateContent(workspaceId,id,{ title?, notes?, hook?, publishAt?, format?, …})` accetta ora `notes`.

- [ ] Aggiungere `notes String?` a `CalendarEvent` e a `Block` in `schema.prisma`.
- [ ] In `content.ts`, aggiungere `notes?: string | null;` al type `data` di `updateContent` (il resto invariato: prisma passa `data` a `db.content.update`).
- [ ] **CHECKPOINT MIGRATION (Matteo):** eseguire `npx prisma migrate dev --name add_notes_event_block` (usa `DIRECT_URL`). Additiva. Poi `npx prisma generate`.
- [ ] Verify: `npx prisma validate` ok; `npm test` verde (baseline invariata).
- [ ] Commit: `feat(schema): notes additivo su Event/Block; updateContent accetta notes`.

---

### Task 2: Azioni server — update parziale + note evento/blocco + hook→notes

**Files:**
- Modify: `src/app/(app)/contenuti/actions.ts` (dopo `updateContentAction:525`)
- Create/Modify: azioni calendario per evento/blocco — `src/app/(app)/calendario/actions.ts` (se non esiste, crearlo; seguire il pattern `"use server"` + `currentContext()` di `contenuti/actions.ts`)
- Modify: `src/lib/content.ts` — helper `setBlockContents` e `contentsInPeriod` (vedi Task 6)
- Test: `tests/quick-update.test.ts`

**Interfaces prodotte:**
- `updateContentFieldsAction(fd: FormData)` — legge `id` + solo i campi presenti tra `title`,`notes`; costruisce un patch **solo** con le chiavi presenti (`fd.has(k)`), chiama `updateContent`, invalida `/contenuti` + `/contenuti/${id}` + `/calendario`.
- `updateEventNotesAction(fd)` — `id`,`notes` → `db.calendarEvent.update` scoped → revalidate `/calendario`.
- `updateBlockNotesAction(fd)` — `id`,`notes` → `db.block.update` scoped → revalidate `/calendario`.
- `updateContentAction` (esistente) — sostituire la gestione `hook` con `notes` (legge `notes` dal form, scrive `notes`); il campo `hook` non è più letto.

- [ ] **Test (logica patch parziale):** estrarre una pura `buildContentPatch(fd)` in `content.ts` che ritorna un oggetto con solo le chiavi presenti; test in `tests/quick-update.test.ts`:
  - fd con solo `title` → `{title}` (niente `notes`, niente `publishAt`).
  - fd con `notes=""` presente → `{notes: null}` (stringa vuota = azzera nota).
  - fd senza campi → `{}`.
- [ ] Run: `npx vitest run tests/quick-update.test.ts` → deve FALLIRE (funzione assente).
- [ ] Implementare `buildContentPatch` + le 4 azioni (usano `currentContext()`, scoping via `updateContent`/`db.*.update` con `scopedWhere` guard).
- [ ] Run: `npx vitest run tests/quick-update.test.ts` → PASS.
- [ ] Verify: `npm test` verde.
- [ ] Commit: `feat(actions): update parziale contenuto + note evento/blocco; hook→notes`.

---

### Task 3: Item calendario portano `title`+`notes`

**Files:**
- Modify: `src/lib/calendar.ts` (type `BoardItem` ~L100, `getMonthItems` L113-158)
- Modify: `src/components/calendar/calendar-board.tsx` (type `ItemDTO`/mapping ~L30-40)

**Interfaces prodotte:** `BoardItem` ha `title?: string` e `notes?: string | null` per `refType:"publication"`; `notes?` per `refType:"event"`. `ItemDTO` nel client rispecchia questi campi.

- [ ] In `getMonthItems`, per i content: `title: c.title, notes: c.notes`; per gli eventi: `notes: e.notes`. (Le query già selezionano l'intero record → nessun costo extra.)
- [ ] Propagare i campi nel DTO passato al client in `calendar-board.tsx`.
- [ ] Verify: `npm test` verde; type-check (`npx tsc --noEmit`) ok.
- [ ] Commit: `feat(calendar): item con title+notes per edit inline`.

---

### Task 4: Drawer calendario — edit inline nome+note (ottimistico)

**Files:**
- Modify: `src/components/calendar/calendar-board.tsx` (blocco `selected` L428-515)

**Interfaces consumate:** `updateContentFieldsAction`, `updateEventNotesAction` (Task 2); `ItemDTO.title/notes` (Task 3).

- [ ] Nel drawer, per `refType:"publication"`: sostituire il titolo statico con un `<input>` **Nome** (`defaultValue=title`) e aggiungere una `<textarea>` **Note** (`defaultValue=notes`). Autosave **on blur** e su Invio (per il nome): costruire FormData e chiamare l'azione. Aggiornamento **ottimistico** dello stato `selected` (e della label del chip nel mese) prima della risposta; nessun `router.refresh()` bloccante — l'azione invalida via `revalidatePath`.
- [ ] Per `refType:"event"`: `<textarea>` **Note** con autosave → `updateEventNotesAction`.
- [ ] Feedback discreto: indicatore "Salvato" inline che sfuma (no toast ad ogni blur). Gestire "ultimo salvataggio vince" (nessun lock necessario, campi indipendenti).
- [ ] Mantenere **"Apri contenuto"** (solo visione) ed **Elimina**; lasciare la riga **Responsabile** invariata.
- [ ] Verify (browser bloccato → manuale prod-safe): descrivere in PR i passi; type-check ok; nessun errore console nel dev log al render `/calendario`.
- [ ] Commit: `feat(calendar): edit inline nome+note dal drawer, ottimistico`.

---

### Task 5: Modale contenuto — hook → Note

**Files:**
- Modify: `src/components/content-modal.tsx` (form edit L586-593; dettagli hook L530-534)

**Interfaces consumate:** `updateContentAction` aggiornato (Task 2).

- [ ] Nel form di edit: il field "Hook" (`name="hook"`) diventa **"Note"** (`name="notes"`, `defaultValue=content.notes`). Rimuovere l'uso di `hook`.
- [ ] Dove si mostra l'hook (dettagli L530-534) → mostrare `content.notes` con label "Note".
- [ ] Aggiornare il type `ModalContent` e il mapping in `@modal/(.)contenuti/[id]/page.tsx` e `contenuti/[id]/page.tsx` per passare `notes` (già presente su `c`).
- [ ] Verify: type-check ok; `npm test` verde.
- [ ] Commit: `feat(modal): Note al posto di Hook sul contenuto`.

---

### Task 6: Blocco — Note + auto-lista contenuti con deseleziona

**Files:**
- Modify: `src/lib/content.ts` — `contentsInPeriod(workspaceId, start, end)` e `setBlockContents(workspaceId, blockId, contentIds)`
- Modify: `src/app/(app)/calendario/actions.ts` — `setBlockContentsAction(fd)` + `updateBlockNotesAction` (Task 2)
- Modify: `src/components/calendar/calendar-board.tsx` — pannello edit blocco (riuso `Dialog`)
- Test: `tests/block-contents.test.ts`

**Interfaces prodotte:** `contentsInPeriod` → `{id,title,blockId}[]` con `publishAt ∈ [start,end]`; `setBlockContents` imposta `blockId` sui contenuti scelti e lo azzera su quelli deselezionati che erano nel blocco.

- [ ] **Test:** `contentsInPeriod` ritorna i contenuti nel range; `setBlockContents` (logica di diff inclusi/esclusi) — testare la funzione di diff pura `blockContentsDiff(current, selected)` → `{toAttach, toDetach}`.
- [ ] Run: `npx vitest run tests/block-contents.test.ts` → FALLISce.
- [ ] Implementare helper + azione + UI: aprendo un blocco, pannello **Note blocco** (autosave) + sezione **"Contenuti nel periodo"** con checkbox (default inclusi quelli nel range + già legati); Salva → `setBlockContentsAction`.
- [ ] Definire entry-point: click sull'etichetta/banda del blocco nel calendario apre il pannello (riuso `Dialog`).
- [ ] Run test → PASS; `npm test` verde.
- [ ] Verify (manuale prod-safe): creare un blocco di prova, verificare auto-lista e deseleziona, poi ripulire.
- [ ] Commit: `feat(block): note blocco + auto-lista contenuti con deseleziona`.

---

## Orchestrazione (overlap sui file)
`calendar-board.tsx` è toccato da Task 3/4/6 e `actions.ts`/`content-modal.tsx` da 2/5 → **serializzare** questi. Ordine consigliato: 1 → 2 → 3 → 4 → 5 → 6. Task 1 (schema, senza la migration) e Task 5 sono relativamente isolati e possono anticipare, ma la migration (Task 1) è un checkpoint. Ogni task: fresh subagent, diff review dell'orchestrator, poi commit.

## Self-review (coverage vs spec)
- Quick-edit nome+note dal drawer → Task 3+4. ✓
- Note al posto dell'hook sul contenuto → Task 5 (+2 per l'azione). ✓
- Note su eventi → Task 2+4. ✓
- Note su blocchi + auto-lista con deseleziona → Task 6. ✓
- Footgun update parziale → Task 2 (`buildContentPatch`). ✓
- Migrazioni additive → Task 1. ✓
