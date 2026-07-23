# Design — Blocchi dal calendario: crea (2 modi), consegne modificabili, elimina

Data: 2026-07-23 · Stato: approvato a voce da Matteo · content-tool

## Problema
Oggi i blocchi si creano solo dal bottone "Nuovo blocco" in alto; le consegne (Luca/Matteo) si impostano solo alla creazione o cliccando un giorno dentro il blocco (modo "Consegna"); e **non esiste modo di eliminare un blocco**. Matteo vuole: (1) creare un blocco cliccando nel calendario — sia con un modo "Blocco" nel pannello del giorno sia trascinando i giorni; (2) impostare/cambiare le due consegne dal dialog di modifica del blocco; (3) un tasto per eliminare i blocchi.

## Non-goals
- Nessuna migrazione (le consegne usano `Block.lucaDeliveryAt`/`matteoDeliveryAt` esistenti; delete non richiede schema).
- Non toccare il ciclo di vita contenuti/eventi.

## Stato del codice (riferimenti)
- QuickCreate (pannello del giorno) in `src/components/calendar/calendar-board.tsx` (~L860): modi `QuickMode = "content" | "event" | "delivery"`; `delivery` compare solo se il giorno è dentro un blocco. `submit()` gestisce content/event; `setDelivery(who)` per le consegne.
- Dialog "Nuovo blocco" (`showBlock`, ~L554): form → `createBlockRangeAction` (label, startDate, endDate, lucaDeliveryAt?, matteoDeliveryAt?).
- Dialog "modifica blocco" (`editBlock`, ~L592): Note + checklist contenuti + Salva/Annulla. Nessuna consegna, nessun elimina.
- `getMonthBlocks` (`src/lib/calendar.ts:323`) proietta `CalendarBlock = { id, label, start, end, notes }` → NON espone le consegne.
- `setBlockDelivery(workspaceId, blockId, who, date)` (`calendar.ts:168`) esiste; `setBlockDeliveryAction` (`calendario/actions.ts:138`) legge `blockId`,`who`,`date`. **Nessun** `deleteBlock`.
- FK verso Block: Content/CalendarEvent `onDelete: SetNull` (restano, perdono blockId); Comment `onDelete: Cascade` (i commenti del blocco vengono eliminati).

## Feature 1 — Creare un blocco dal calendario (due modi)

### 1a. Modo "Blocco" nel pannello del giorno
- Aggiungere `"block"` a `QuickMode`. Il tab "Blocco" è sempre disponibile (`tabs` diventa `["content","event","block"]`, più `"delivery"` se dentro un blocco → l'ordine: content, event, block, [delivery]).
- Campi del modo Blocco: **Etichetta** (`label`, required), **Fine** (`endDate`, date, required; `startDate` = giorno cliccato), e opzionali **Consegna Luca** / **Consegna Matteo** (date).
- Submit → `createBlockRangeAction` con `label`, `startDate=day`, `endDate`, e le consegne se presenti. Poi `onCreated()` (chiude, refresh). Nessun ottimismo necessario (il refresh ridisegna le bande).
- `remember()`/localStorage resta com'è (persiste solo content/event settings — il modo block non va persistito come default d'apertura, per non aprire sempre su Blocco).

### 1b. Trascina per selezionare i giorni
- Sulle **celle-giorno** (il div con `onClick={() => setInlineDay(cell.ymd)}`, ~L433) aggiungere handler pointer per il drag-select:
  - `onPointerDown` sulla cella: registra `dragStart = cell.ymd`, `dragEnd = cell.ymd`, `dragging = false` (non ancora). Non fare `preventDefault` qui (per non bloccare lo scroll finché non è chiaro che è un drag).
  - `onPointerEnter` su un'altra cella mentre il pulsante è premuto: `dragEnd = cell.ymd`, `dragging = true`; evidenzia le celle nel range `[min(start,end), max(start,end)]` (classe di highlight, es. `bg-lavender/30`).
  - `onPointerUp` (a livello di board o cella): se `dragging` (range su ≥2 giorni distinti) → apri il dialog "Nuovo blocco" **precompilato** con `startDate=min`, `endDate=max` (nuovo stato `blockRange` che inizializza i default del form `showBlock`); NON aprire il QuickCreate. Se NON `dragging` (stessa cella) → comportamento attuale: `setInlineDay(cell.ymd)` (QuickCreate). Reset dello stato drag.
- Il click esistente (`onClick`) resta per il caso no-drag; per evitare doppioni, se `dragging` è avvenuto, l'`onClick` non deve aprire il QuickCreate (guardia con un ref `didDragRef`).
- **Mobile/scroll**: applicare `style={{ touchAction: 'pan-y' }}` sulle celle così lo scroll verticale resta possibile; il drag-select orizzontale/tra celle attiva la selezione. Se su mobile risulta fragile, il modo 1a resta la via principale (verifica live decide).
- I chip contenuto e gli handle di resize dentro le celle mantengono `e.stopPropagation()` sui loro pointer/drag, così non innescano il drag-select.

## Feature 2 — Consegne modificabili dal dialog del blocco
- Estendere `CalendarBlock` (in `calendar.ts`) e la proiezione di `getMonthBlocks` con `lucaDeliveryAt: string | null` e `matteoDeliveryAt: string | null` (come `ymd` o ISO date-only). Propagare al DTO `BandBlock` (page.tsx → CalendarBoard).
- Nel dialog `editBlock`, sezione **Consegne**: due `<input type="date">` (Luca, Matteo) precompilati. Su change/blur:
  - se valorizzato → `setBlockDeliveryAction(blockId, who, date)`;
  - se svuotato → serve poter azzerare: **estendere** `setBlockDelivery`/`setBlockDeliveryAction` ad accettare `date` vuota → `null` (oggi `toUtc(ymd)` presume una data). Azione: se `date` vuota, setta la colonna a `null`.
  - Aggiornare lo stato locale `blocks` (ottimistico) con la nuova consegna, e `updateTag(contentsTag)` lato azione (le consegne cambiano lo stato derivato dei contenuti → invalida la cache; `setBlockDeliveryAction` già lo fa? verificare e aggiungere se manca).
- Feedback discreto (toast breve o "Salvato").

## Feature 3 — Elimina blocco
- Lib `deleteBlock(workspaceId, id)` in `src/lib/calendar.ts` (o content.ts vicino a setBlockContents): verifica che il blocco sia del workspace (`scopedBlock`/`scopedWhere`), poi `db.block.delete`. I contenuti/eventi si staccano via `onDelete: SetNull`; i commenti del blocco cascano.
- Azione `deleteBlockAction(formData)` in `calendario/actions.ts`: `Promise<boolean>`; `if(!ctx) return false`; legge `id`; `await deleteBlock`; `revalidatePath("/calendario")` + `revalidatePath("/contenuti")` + `updateTag(contentsTag(ctx.workspaceId))` (i contenuti staccati cambiano stato derivato); ritorna `true`.
- UI: nel dialog `editBlock`, tasto **"Elimina blocco"** (stile coral, come l'elimina contenuto). **Conferma inline**: primo tap → il tasto diventa "Sei sicuro? [Elimina] [Annulla]"; conferma → `deleteBlockAction`, su ok chiudi il dialog, rimuovi la banda dallo stato locale `blocks` (ottimistico) e `toast.success("Blocco eliminato")`; su errore `toast.error`.

## Verifica (browser reale, prod-safe)
- Modo Blocco: crea un blocco di prova cliccando un giorno → verifica banda + consegne; poi elimina per pulire.
- Drag-select: trascina su un range → dialog precompilato → crea → verifica → elimina.
- Consegne: dal dialog modifica, imposta e svuota una consegna → verifica persistenza.
- Elimina: verifica conferma inline + che i contenuti del periodo restino (solo staccati).
- `npm test` verde; `graphify update .` dopo.

## Rischi
- Drag-select su mobile vs scroll (la parte più delicata): mitigato con `touch-action` + fallback sul modo 1a; decide la verifica live.
- Azzeramento consegna: assicurarsi che l'azione gestisca la data vuota senza crash.
- Coerenza stato `blocks` locale dopo delete/consegne + invalidazione cache.
