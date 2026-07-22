# Design — Quick-edit dal calendario, Note ovunque, e Velocità

Data: 2026-07-22 · Stato: in revisione · Autore: Matteo + Claude (orchestrator)

## Contesto e problema

Feedback di Matteo (usa il tool soprattutto da telefono, sul calendario):

1. **"Non riesco a modificare un contenuto"** — non è un bug di codice: il percorso è troppo lungo. Oggi dal calendario: click sul chip → drawer con solo Data/Responsabile → **"Apri contenuto"** → modale → **"Modifica"** → form. Vuole modificare **nome e note subito**, appena clicca sul contenuto nel calendario, senza aprire nulla. "Apri contenuto" resta solo per **visionare** dettagli/performance/materiali.
2. **Note ovunque** — un campo **Note** libero su contenuti, eventi e blocchi. Sui **contenuti** le Note vanno **al posto dell'hook** (ci scrive la struttura del video). Sui **blocchi/consegna** le Note descrivono cosa consegnare a Luca **+** il sistema **auto-popola** i contenuti che cadono nel periodo del blocco, con possibilità di **deselezionare** quelli non voluti.
3. **Velocità** — ogni cambio scheda sembra un reload; azioni (login, aggiungi/elimina, click) lente; le pagine non "restano calde". Priorità mobile.

Il lavoro è diviso in due **filoni** eseguiti con struttura **sub-agentica** (Claude = orchestrator).

## Non-goals

- Nessuna migrazione distruttiva: `Content.hook` resta come colonna vestigiale (come le colonne Telegram), semplicemente non più mostrato in UI.
- Niente redesign della dashboard KPI movibile (rinviato, altro filone).
- Nessun cambio all'auth/storage.

---

## FILONE 1 — Quick-edit dal calendario + Note

### 1.1 Modello dati (migrazioni additive, sicure)
- `CalendarEvent.notes String?` — nuovo.
- `Block.notes String?` — nuovo.
- `Content.notes` — **esiste già** (`schema.prisma:202`); nessuna modifica schema. `Content.hook` resta ma esce dalla UI.

### 1.2 Azione dedicata di update parziale (footgun risolto)
`updateContentAction` (`contenuti/actions.ts:525`) NON è riusabile per l'autosave inline: se `publishAt`/`format` non sono nel form li **azzera**. 

Nuova azione **`updateContentFieldsAction(id, patch)`** che aggiorna **solo** i campi presenti nel patch (`title?`, `notes?`), via `updateContent` (che già accetta campi opzionali e ignora gli assenti — `content.ts:301`). Invalidazione **per-tag** (vedi Filone 2), fallback `revalidatePath` finché il tag non è pronto.
Analoghe: `updateEventNotesAction(id, notes)`, `updateBlockNotesAction(id, notes)`.

### 1.3 Drawer calendario editabile (`calendar-board.tsx`, blocco `selected` L428-515)
- Gli item del calendario (`ItemDTO`, `calendar.ts`) per i **contenuti** (`refType:"publication"`) portano anche `title` e `notes` (già si queryano i contenuti in `buildCalendarItems` → costo ~zero → edit istantaneo senza fetch extra).
- Nel drawer, per un contenuto:
  - **Nome**: input editabile, `defaultValue = title`. Autosave **on blur** (e su Invio) → `updateContentFieldsAction(id,{title})`, **ottimistico** (aggiorna subito `selected.label` e la UI, niente reload).
  - **Note**: textarea editabile, `defaultValue = notes`. Autosave on blur → `updateContentFieldsAction(id,{notes})`, ottimistico.
  - Restano: **"Apri contenuto"** (solo visione), **Elimina**, la riga **Responsabile** (invariata — non è il "Luca" da togliere).
- Per un **evento** (`refType:"event"`): textarea **Note** con autosave → `updateEventNotesAction`.
- Feedback salvataggio discreto (es. "Salvato" inline che sfuma), niente toast invasivo ad ogni blur.

### 1.4 Contenuto: hook → Note nel modale
- `content-modal.tsx`: nel form di edit (L586-593) l'etichetta/field **"Hook"** diventa **"Note"** e scrive su `notes` (non più `hook`). Ovunque si mostri l'hook del contenuto (drawer "Dettagli" L530-534, ecc.) → mostrare `notes`.
- `updateContentAction` aggiornata per gestire `notes` invece di/oltre a `hook`.

### 1.5 Blocco/consegna: Note + auto-lista contenuti con deseleziona
- Editing di un blocco (oggi solo creazione via dialog "Nuovo blocco" in `calendar-board.tsx`): aggiungere pannello **Note blocco** (`updateBlockNotesAction`) e sezione **"Contenuti nel periodo"**:
  - Auto-elenco dei `Content` con `publishAt ∈ [block.startDate, block.endDate]` **non ancora** legati al blocco + quelli già legati.
  - Checkbox per **includere/escludere** (toggle `content.blockId`). Default: inclusi quelli nel periodo.
  - Azione `setBlockContentsAction(blockId, contentIds)` (idempotente, scoped al workspace).
- Entry-point di modifica blocco: click sull'etichetta blocco / banda nel calendario apre il pannello (definire in fase di plan; riuso del `Dialog` esistente).

---

## FILONE 2 — Velocità (dall'audit codice)

Cause reali (evidenze in `graphify`/audit; API Next 16 da verificare in `node_modules/next/dist/docs/` prima di scrivere):

1. **`loading.tsx` mancanti** su `diario`, `profilo`, `notifiche` → il click blocca sul render server (nessuno shell istantaneo, nessun prefetch per route dinamiche). Aggiungerli. Togliere `export const dynamic="force-dynamic"` da `diario/page.tsx:12` se non indispensabile.
2. **Nessuna cache dati**: ogni navigazione ri-querya Neon (`current.ts` membership, `content.ts:13 listContents`, `layout.tsx:29 unreadCount`), solo `React.cache` per-request. Introdurre `use cache` + `cacheTag` per-workspace/per-user sui read pesanti, con invalidazione **per-tag** nelle azioni al posto di `revalidatePath` a tappeto (55 chiamate oggi). **Verificare l'API in `node_modules/next/dist/docs/` (Cache Components).**
3. **UI ottimistica assente** (zero `useOptimistic`): ogni add/delete/toggle-stato aspetta round-trip + `router.refresh()` (rifà tutto l'albero). Introdurre `useOptimistic` su aggiungi/elimina/stato e ridurre i `router.refresh()` dove l'invalidazione per-tag già copre.
4. **Icone**: `@phosphor-icons/react` barrel importato in client (25 occorrenze) senza `optimizePackageImports` → hydration lenta su mobile (e Link non idratati → full-navigation). Aggiungere `experimental.optimizePackageImports:["@phosphor-icons/react"]` e/o usare `/dist/ssr` dove il componente è server-only.
5. **Misura**: il prefetch di Next è **off in `next dev`** → validare la velocità su **build di produzione** (`next build && next start`), non in dev.

Ordine consigliato Filone 2: (1) loading.tsx + optimizePackageImports (quick win, basso rischio) → (3) ottimistico → (2) cache per-tag (più invasivo, richiede verifica API).

---

## Decomposizione sub-agentica (orchestrazione)

Overlap tra i filoni su `actions.ts`, `content-modal.tsx`, `calendar-board.tsx` → **non** eseguirli in parallelo cieco sugli stessi file. Piano:

- **Track A (Filone 1)** e **Track B (Filone 2, task 1+4 quick-win)** sono quasi disgiunti a livello di file → possono partire in parallelo.
- I task che toccano `actions.ts`/`content-modal.tsx` (F1 §1.2/1.4 e F2 §3 ottimistico) vengono **serializzati** dall'orchestrator (un subagent alla volta su quei file), con verify tra uno e l'altro.
- Ogni task: subagent con scope stretto → l'orchestrator integra, esegue `graphify update .`, e **verifica in browser** prima del merge (regola concordata). Commit solo quando funziona.

Task list (bozza, dettaglio nel plan):
1. F1-schema: migrazioni additive `CalendarEvent.notes`, `Block.notes`.
2. F1-actions: `updateContentFieldsAction`, `updateEventNotesAction`, `updateBlockNotesAction`, `setBlockContentsAction`; hook→notes in `updateContentAction`.
3. F1-calendar-items: aggiungere `title`+`notes` agli item contenuto in `calendar.ts`.
4. F1-drawer: edit inline Nome+Note (contenuto/evento) nel drawer, ottimistico.
5. F1-modal: hook→Note nel modale contenuto.
6. F1-block: pannello Note blocco + auto-lista contenuti con deseleziona.
7. F2-quickwin: loading.tsx (diario/profilo/notifiche), togliere force-dynamic, optimizePackageImports.
8. F2-optimistic: useOptimistic su add/delete/stato; ridurre router.refresh.
9. F2-cache: use cache + cacheTag per-tag + invalidazione (dopo verifica API doc).

## Verifica
- Ogni feature verificata nell'app reale (browser) prima del merge; DB di prod condiviso → test non distruttivi (contenuti di prova propri, o revert).
- Velocità misurata su build di produzione.
- `npm test` (Vitest) verde; `graphify update .` dopo le modifiche.

## Rischi
- Cache Components / `use cache`: API della Next 16 modificata → **leggere i doc del progetto** prima di implementare.
- Autosave on blur: gestire race/salvataggi concorrenti (ultimo vince) e non azzerare campi non toccati (azione parziale dedicata).
- DB prod condiviso: attenzione a non mutare dati reali nei test.
