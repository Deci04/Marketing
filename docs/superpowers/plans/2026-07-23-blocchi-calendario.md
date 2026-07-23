# Blocchi dal calendario — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Fresh subagent per task, review tra i task. Steps `- [ ]`.

**Goal:** creare blocchi dal calendario (modo "Blocco" nel pannello del giorno + trascina-per-selezionare), rendere le consegne modificabili dal dialog del blocco, e aggiungere un tasto elimina blocco.

**Architecture:** backend prima (deleteBlock, azzeramento consegna, DTO consegne, invalidazione cache), poi il dialog di modifica blocco (consegne + elimina), poi la creazione (modo Blocco + drag-select). Riuso `createBlockRangeAction`/`setBlockDeliveryAction` esistenti.

**Tech Stack:** Next.js 16 MODIFICATO (`node_modules/next/dist/docs/`), Prisma+Neon, React 19, Tailwind v4, Vitest (`tests/**/*.test.ts`, node env).

## Global Constraints
- **Next modificato**: consulta `node_modules/next/dist/docs/` per API `next/*`.
- **Multi-tenant**: ogni mutazione scoped (`scopedWhere`/`currentContext`). Mai fuori workspace.
- **Cache**: le mutazioni che cambiano lo stato/associazione dei contenuti chiamano `updateTag(contentsTag(ctx.workspaceId))` (import da `@/lib/cache-tags`) — vedi come già fatto nelle azioni esistenti.
- Nessuna migrazione. Commit atomico per task, firma `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Verifica ogni task: `npx tsc --noEmit`, `npx vitest run` (no regressioni), `npm run lint` sui file toccati. La UI la verifica l'orchestrator in browser.

---

### Task 1 — Backend: deleteBlock, azzeramento consegna, DTO consegne

**Files:**
- `src/lib/calendar.ts`: `deleteBlock`, estendere `setBlockDelivery` (data null), estendere `CalendarBlock` + `getMonthBlocks` con le consegne.
- `src/app/(app)/calendario/actions.ts`: `deleteBlockAction`, aggiornare `setBlockDeliveryAction` per data vuota.
- `src/app/(app)/calendario/page.tsx`: propagare le consegne nel DTO `blocks` passato a `<CalendarBoard>`.
- Test: `tests/block-delivery.test.ts` (se serve una funzione pura per il parsing data-vuota; altrimenti verifica via tsc/render).

**Interfaces prodotte:**
```ts
// calendar.ts
export async function deleteBlock(workspaceId: string, id: string): Promise<{ id: string } | null>;
//   scoped: verifica proprietà via scopedBlock/scopedWhere; poi db.block.delete. Ritorna null se fuori workspace.
export async function setBlockDelivery(workspaceId: string, blockId: string, who: "luca" | "matteo", date: Date | null): Promise<...>;
//   date === null → azzera la colonna (lucaDeliveryAt/matteoDeliveryAt = null).
// CalendarBlock ora include: lucaDeliveryAt: string | null; matteoDeliveryAt: string | null; (formato ymd)
// getMonthBlocks proietta anche lucaDeliveryAt/matteoDeliveryAt (b.lucaDeliveryAt ? ymd(b.lucaDeliveryAt) : null).

// calendario/actions.ts
export async function deleteBlockAction(formData: FormData): Promise<boolean>;
//   if(!ctx) return false; id = fd.get("id"); if(!id) return false; await deleteBlock(ctx.workspaceId, id);
//   revalidatePath("/calendario"); revalidatePath("/contenuti"); updateTag(contentsTag(ctx.workspaceId)); return true;
// setBlockDeliveryAction: se fd.get("date") è vuota/assente → passare null a setBlockDelivery (azzera).
//   Mantiene l'updateTag già presente.
```

- [ ] Implementa `deleteBlock` (scoped) e `deleteBlockAction`.
- [ ] Estendi `setBlockDelivery` per `date: Date | null` e `setBlockDeliveryAction` per data vuota→null (senza crash su `toUtc("")`).
- [ ] Estendi `CalendarBlock` + `getMonthBlocks` con `lucaDeliveryAt`/`matteoDeliveryAt` (ymd); aggiorna `page.tsx` per passarle nel DTO `blocks` (aggiungi i campi al mapping `bandDtos`).
- [ ] Se estrai una funzione pura (es. `parseOptionalYmd`), testala; altrimenti niente test nuovi obbligatori.
- [ ] Verify: `npx tsc --noEmit`, `npx vitest run`, `npm run lint`.
- [ ] Commit: `feat(block): deleteBlock + azzeramento consegna + consegne nel DTO blocco`.

---

### Task 2 — Dialog modifica blocco: consegne + elimina

**Files:** `src/components/calendar/calendar-board.tsx` (dialog `editBlock`, ~L592-663; type `BandBlock` ~L42; stato locale `blocks`).

**Consuma:** `setBlockDeliveryAction`, `deleteBlockAction` (Task 1); `BandBlock.lucaDeliveryAt/matteoDeliveryAt` (Task 1).

- [ ] Aggiungi a `BandBlock` i campi `lucaDeliveryAt?: string | null; matteoDeliveryAt?: string | null;` e ricevili dal DTO.
- [ ] Nel dialog `editBlock`, sezione **Consegne**: due `<input type="date">` (Luca, Matteo), `defaultValue` = consegna corrente del blocco (da `blocks.find(b=>b.id===editBlock.id)`). `onChange`/`onBlur` → costruisci FormData (`blockId`, `who`, `date`=valore o vuoto) → `setBlockDeliveryAction`; su ok aggiorna `blocks` locale (ottimistico) con la nuova data (o null). Feedback discreto.
- [ ] Tasto **"Elimina blocco"** (stile coral). Conferma inline: stato `confirmDelete` (bool); primo tap → mostra "Sei sicuro? [Elimina] [Annulla]"; conferma → `deleteBlockAction` (FormData `id`); su ok: `setEditBlock(null)`, rimuovi la banda da `blocks` locale, `toast.success("Blocco eliminato")`; su errore `toast.error("Non eliminato, riprova")`.
- [ ] Verify: `npx tsc --noEmit`, `npx vitest run`, `npm run lint`. (UI: orchestrator live.)
- [ ] Commit: `feat(block): consegne modificabili + elimina blocco dal dialog`.

---

### Task 3 — Creazione blocco dal calendario (modo "Blocco" + drag-select)

**Files:** `src/components/calendar/calendar-board.tsx` (QuickCreate ~L860; celle-giorno ~L433; dialog `showBlock` ~L554; type `QuickMode`).

**Consuma:** `createBlockRangeAction` (esistente).

- [ ] **Modo "Blocco" nel QuickCreate**: aggiungi `"block"` a `QuickMode`; `tabs` = `["content","event","block"]` (+`"delivery"` se `blockId`). Nel modo block, mostra campi: Etichetta (required), Fine (date, required), Consegna Luca/Matteo (opz.). `submit()`: se `mode==="block"` → FormData `label`,`startDate=day`,`endDate`, consegne se presenti → `await createBlockRangeAction(fd)` → `toast.success("Blocco creato")` → `onCreated()`. NON persistere `block` come modo di default in localStorage (`remember()` continua a salvare solo content/event).
- [ ] **Drag-select sulle celle**: stato `dragStart`/`dragEnd`/`dragging` + `didDragRef`. Sulla cella-giorno: `onPointerDown` (registra start), `onPointerEnter` con bottone premuto (aggiorna end, `dragging=true`), `onPointerUp` (se `dragging` e range ≥2 giorni → apri `showBlock` precompilato con start/end via nuovo stato `blockRange={start,end}`; altrimenti click normale → `setInlineDay`). Evidenzia le celle nel range (es. `bg-lavender/30 ring-1`). Guardia `didDragRef` così l'`onClick` esistente non apre anche il QuickCreate dopo un drag. `style={{ touchAction: 'pan-y' }}` sulle celle. Chip/handle interni: `e.stopPropagation()` sui loro pointer per non innescare il drag-select.
- [ ] Il dialog `showBlock`: se aperto da `blockRange`, precompila `startDate`/`endDate` (defaultValue). Resetta `blockRange` alla chiusura.
- [ ] Verify: `npx tsc --noEmit`, `npx vitest run`, `npm run lint`. (UI + drag: orchestrator live, con attenzione a mobile.)
- [ ] Commit: `feat(block): crea blocco dal calendario (modo Blocco + drag-select)`.

---

## Orchestrazione
Task 2 e 3 toccano entrambi `calendar-board.tsx` → **serializzare** (1 → 2 → 3), verifica live tra 2 e 3. Task 1 è backend, indipendente.

## Self-review (coverage)
- Crea da calendario, 2 modi → Task 3. ✓ (modo Blocco + drag-select)
- Consegne modificabili → Task 1 (DTO+azione) + Task 2 (UI). ✓
- Elimina blocco → Task 1 (deleteBlock/Action) + Task 2 (UI conferma). ✓
