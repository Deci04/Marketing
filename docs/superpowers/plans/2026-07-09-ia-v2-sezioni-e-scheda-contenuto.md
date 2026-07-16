# IA v2 — Sezioni + Ridisegno scheda contenuto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ridurre la navigazione a 5 voci fondendo l'Archivio in Contenuti, e ridisegnare la scheda contenuto a scorrimento unico con un ciclo di collaborazione chiaro a 3 stati.

**Architecture:** Due assi di stato restano distinti — il *ciclo di collaborazione* (`workflow.ts`, ridotto a 3 stati) e lo *stato derivato dalle date* (`status.ts`, invariato). La fusione Archivio→Contenuti riusa `splitActiveArchived()` e il componente `ArchiveTable` esistenti. La scheda passa da modale a 3 tab a una singola colonna che scorre.

**Tech Stack:** Next.js 16 (App Router, Server Components + Server Actions), Prisma 6 + Neon, Tailwind v4, Phosphor icons, `motion`, Vitest.

## Global Constraints

- **Next.js 16**: prima di scrivere codice App Router, consultare `node_modules/next/dist/docs/` (le API differiscono dal training). Vedi `AGENTS.md`.
- **Lavoro locale**: nessun push. Commit locali solo a **test verdi** (`npm test`). Merge su `main` solo dopo browser-verify dell'utente.
- **Due sistemi di stato da non confondere**: `workflow.ts` = ciclo collaborazione (questo cambia); `status.ts` `DerivedStatus` (`Da consegnare/Consegnato/Revisionato/Pubblicato`) = timeline pubblicazione (INVARIATO, non toccare).
- **Fuori scope (spec C)**: raccolta Diario, cloud/upload, consegna materiale per-contenuto. Non implementare qui.
- **Test runner**: `npm test` (= `vitest run`). Import alias `@/` → `src/`. Test in `tests/`.
- **Verifica finale**: browser-verify dal vivo eseguita dall'utente (il browser MCP non raggiunge localhost in questa sessione).

---

## File Structure

**Modificati:**
- `src/lib/workflow.ts` — `WorkflowState` a 3 stati; `workflowState()` senza `deliveredAt`; `lucaDeadlineGroups`/`homeActions` ripuntati.
- `src/lib/content.ts` — nuovi helper puri `contentsForStato()` e `toArchiveRows()` (DRY tra le pagine).
- `src/components/content-card.tsx` — badge `wfChip` ai 3 stati; chiamata `workflowState` aggiornata.
- `src/components/content-modal.tsx` — da 3 tab a scorrimento unico; header compatto; rimozione consegna per-contenuto; gate Performance.
- `src/components/sidebar-nav.tsx` — rimozione voce Archivio da `NAV` (aggiorna anche la topbar mobile).
- `src/app/(app)/contenuti/page.tsx` — segmented control `?stato=`; render condizionale griglia vs `ArchiveTable`; link `/archivio`→`?stato=pubblicati`.
- `src/app/(app)/archivio/page.tsx` — sostituita da redirect a `/contenuti?stato=pubblicati`.

**Test toccati/creati:**
- `tests/workflow.test.ts` — riscritto per 3 stati.
- `tests/home-actions.test.ts` — aggiornato ai nuovi filtri/testi.
- `tests/content-stato.test.ts` — NUOVO, per `contentsForStato()` e `toArchiveRows()`.

---

## Task 1: Ciclo di collaborazione a 3 stati (`workflow.ts`)

**Files:**
- Modify: `src/lib/workflow.ts:1-18`
- Test: `tests/workflow.test.ts` (riscrittura completa)

**Interfaces:**
- Produces: `type WorkflowState = "Da fare" | "Da revisionare" | "Confermato"` e `workflowState(c: { confirmedAt: Date | null; hasMontato: boolean }): WorkflowState`. **Nota il cambio di firma**: `deliveredAt` non è più un parametro.

- [ ] **Step 1: Riscrivi il test** — sostituisci l'intero contenuto di `tests/workflow.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { workflowState } from "@/lib/workflow";

describe("workflowState (3 stati)", () => {
  it("Da fare quando non c'è ancora il montato", () =>
    expect(workflowState({ confirmedAt: null, hasMontato: false })).toBe("Da fare"));
  it("Da revisionare quando il contenuto è caricato e non confermato", () =>
    expect(workflowState({ confirmedAt: null, hasMontato: true })).toBe("Da revisionare"));
  it("Confermato quando confirmedAt è valorizzato", () =>
    expect(workflowState({ confirmedAt: new Date(), hasMontato: true })).toBe("Confermato"));
  it("Confermato vince anche senza montato esplicito", () =>
    expect(workflowState({ confirmedAt: new Date(), hasMontato: false })).toBe("Confermato"));
});
```

- [ ] **Step 2: Esegui il test — deve fallire**

Run: `npx vitest run tests/workflow.test.ts`
Expected: FAIL (il vecchio `workflowState` accetta `deliveredAt` e restituisce "Da consegnare"/"Da confermare").

- [ ] **Step 3: Aggiorna `workflow.ts`** — sostituisci le righe 1-18:

```ts
export type WorkflowState = "Da fare" | "Da revisionare" | "Confermato";

/** Ciclo di collaborazione basato su eventi reali:
 *  Matteo crea e carica il contenuto → Luca lo revisiona/conferma. */
export function workflowState(c: {
  confirmedAt: Date | null;
  hasMontato: boolean;
}): WorkflowState {
  if (c.confirmedAt) return "Confermato";
  if (c.hasMontato) return "Da revisionare";
  return "Da fare";
}
```

- [ ] **Step 4: Rimuovi `deliveredAt` da `HomeContent`** — in `src/lib/workflow.ts` nel type `HomeContent` elimina la riga `deliveredAt: Date | null;` (il campo non è più letto da `workflowState`).

- [ ] **Step 5: Esegui il test — deve passare**

Run: `npx vitest run tests/workflow.test.ts`
Expected: PASS. (Compilazione di `home-actions.test.ts` e dei chiamanti può ancora rompersi: sistemata nei task successivi.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/workflow.ts tests/workflow.test.ts
git commit -m "feat(workflow): ciclo collaborazione a 3 stati (Da fare/Da revisionare/Confermato)"
```

---

## Task 2: Home actions ripuntate al nuovo modello (`workflow.ts`)

La Home resta guidata dalle scadenze di blocco (`block.lucaDeliveryAt`/`matteoDeliveryAt`), ma i filtri che usavano lo stato `Da consegnare`/`Da revisionare`/`Da confermare` vanno ripuntati ai 3 nuovi stati.

**Files:**
- Modify: `src/lib/workflow.ts` (`lucaDeadlineGroups` ~riga 82-96; `homeActions` ~riga 151-191)
- Test: `tests/home-actions.test.ts`

**Interfaces:**
- Consumes: `workflowState` (Task 1), `HomeContent` senza `deliveredAt`.
- Produces: `lucaDeadlineGroups` filtra i contenuti in stato **"Da fare"**; `homeActions(_, "matteo")` conta i **"Da fare"**; `homeActions(_, "luca")` = deadline di blocco + conteggio **"Da revisionare"**.

- [ ] **Step 1: Aggiorna le fixture e le attese del test** — in `tests/home-actions.test.ts`:
  - Nella helper `daConsegnare(...)` rimuovi la riga `deliveredAt: null,` (non è più nel type). Rinominala mentalmente "contenuto Da fare": ora `hasMontato: false` ⇒ stato "Da fare".
  - Cerca ogni assert sul ruolo "matteo" che si aspetta il testo `"… da revisionare"` e cambialo in `"… da montare"`.
  - Aggiungi in fondo al file questo blocco di test:

```ts
describe("homeActions — nuovo modello 3 stati", () => {
  const now = new Date("2026-07-04T09:00:00.000Z");
  const montato = (id: string, confirmed: boolean): HomeContent => ({
    id,
    title: `c-${id}`,
    format: "REEL",
    confirmedAt: confirmed ? now : null,
    hasMontato: true,
    block: null,
  });
  it("matteo vede i 'Da fare' come 'da montare'", () => {
    const daFare: HomeContent = {
      id: "x", title: "x", format: "REEL",
      confirmedAt: null, hasMontato: false, block: null,
    };
    const a = homeActions([daFare, montato("m", false)], "matteo", now);
    expect(a.some((x) => /da montare/.test(x.text))).toBe(true);
  });
  it("luca vede i 'Da revisionare' (montati non confermati)", () => {
    const a = homeActions([montato("m", false)], "luca", now);
    expect(a.some((x) => /da revisionare/.test(x.text))).toBe(true);
  });
  it("i confermati non generano azioni di revisione per luca", () => {
    const a = homeActions([montato("m", true)], "luca", now);
    expect(a.some((x) => /da revisionare/.test(x.text))).toBe(false);
  });
});
```

- [ ] **Step 2: Esegui il test — deve fallire**

Run: `npx vitest run tests/home-actions.test.ts`
Expected: FAIL (filtri ancora sui vecchi stati).

- [ ] **Step 3: Ripunta `lucaDeadlineGroups`** — in `src/lib/workflow.ts`, dentro `lucaDeadlineGroups`, cambia la riga di filtro:

```ts
// PRIMA: if (workflowState(c) !== "Da consegnare") continue;
if (workflowState(c) !== "Da fare") continue;
```

- [ ] **Step 4: Ripunta `homeActions`** — sostituisci il corpo della funzione `homeActions` (ramo matteo + coda luca) con:

```ts
  if (role === "matteo") {
    const toDo = contents.filter((c) => workflowState(c) === "Da fare");
    if (!toDo.length) return [];
    return [
      {
        key: "todo",
        emoji: "🎬",
        text: `${toDo.length} ${toDo.length === 1 ? "contenuto" : "contenuti"} da montare`,
        urgency: 50,
        contentIds: toDo.map((c) => c.id),
      },
    ];
  }

  // Luca
  const actions: HomeAction[] = lucaDeadlineGroups(contents, now).map((g) => ({
    key: `deadline-${g.daysUntil}`,
    emoji: "⏳",
    text: deadlineText(g),
    urgency: g.daysUntil,
    contentIds: g.contentIds,
  }));

  const toReview = contents.filter((c) => workflowState(c) === "Da revisionare");
  if (toReview.length) {
    actions.push({
      key: "review",
      emoji: "✅",
      text: `${toReview.length} montat${toReview.length === 1 ? "o" : "i"} da revisionare`,
      urgency: 100,
      contentIds: toReview.map((c) => c.id),
    });
  }

  return actions.sort((a, b) => a.urgency - b.urgency);
```

- [ ] **Step 5: Esegui i test — devono passare**

Run: `npx vitest run tests/home-actions.test.ts tests/workflow.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/workflow.ts tests/home-actions.test.ts
git commit -m "feat(home): azioni Da fare/revisionare ancorate alle scadenze di blocco"
```

---

## Task 3: Badge della card ai 3 stati (`content-card.tsx`)

**Files:**
- Modify: `src/components/content-card.tsx:48-58`

**Interfaces:**
- Consumes: `workflowState` con la nuova firma (Task 1).

- [ ] **Step 1: Aggiorna la chiamata `workflowState` e la mappa `wfChip`** — sostituisci il blocco (righe ~48-58):

```tsx
  const wf = workflowState({
    confirmedAt: content.confirmedAt ?? null,
    hasMontato: content.videoProxyUrl != null || (content._count?.materials ?? 0) > 0,
  });
  const wfChip =
    wf === "Da fare"
      ? "bg-butter text-butter-ink"
      : wf === "Da revisionare"
        ? "bg-lavender text-lavender-ink"
        : null; // "Confermato" → nessun chip (lo stato pubblicazione lo mostra il StatusBadge)
```

- [ ] **Step 2: Verifica compilazione tipi**

Run: `npx tsc --noEmit`
Expected: nessun errore su `content-card.tsx` (il campo `deliveredAt` di `CardContent` resta nel type ma non è più passato — ok).

- [ ] **Step 3: Commit**

```bash
git add src/components/content-card.tsx
git commit -m "feat(card): badge ciclo a 3 stati (Da fare/Da revisionare)"
```

---

## Task 4: Scheda contenuto a scorrimento unico (`content-modal.tsx`)

Trasforma il modale da 3 tab (rail sinistro + pillole mobile) a **una singola colonna che scorre**: header compatto stato+azioni → Materiali → Performance (solo se pubblicato). Rimuove la consegna materiale per-contenuto.

**Files:**
- Modify: `src/components/content-modal.tsx` (rimozione TABS/tab; blocco `422-827` ristrutturato; import `markDeliveredAction` rimosso)

**Interfaces:**
- Consumes: `workflowState` nuova firma; `content.status === "Pubblicato"` per il gate Performance; sotto-componenti esistenti `VideoReview`, `MaterialGallery`, `PublishPanel`, `PerfField`, `StatusBadge`, `AudioRecorder`, `AudioComment`.

- [ ] **Step 1: Rimuovi tab e stato consegna** — in `content-modal.tsx`:
  - Elimina `const TABS = [...]` e `type Tab = ...` (righe ~91-92).
  - Rimuovi `const [tab, setTab] = useState<Tab>("Panoramica");` (riga 342).
  - Rimuovi `const [delivered, setDelivered] = useState(...)` (riga 346) e ogni uso di `delivered`/`setDelivered`.
  - Rimuovi l'import di `markDeliveredAction` e la sua unica form ("Materiale consegnato", righe ~500-526) insieme al blocco `deliveredAt`/masterLink di consegna.
  - Aggiungi in testa al componente, dopo il calcolo di `confirmed`:

```tsx
  const [detailsOpen, setDetailsOpen] = useState(false);
  const wf = workflowState({
    confirmedAt: confirmed ? new Date() : null,
    hasMontato: content.hasMontato,
  });
  const isPublished = content.status === "Pubblicato";
  const WF_TONE: Record<string, string> = {
    "Da fare": "bg-butter text-butter-ink",
    "Da revisionare": "bg-lavender text-lavender-ink",
    Confermato: "bg-sage text-sage-ink",
  };
```

  (Assicurati che `workflowState` sia importato da `@/lib/workflow` e `useState` da react — già presenti.)

- [ ] **Step 2: Sostituisci il corpo a tab con la colonna a scorrimento** — rimpiazza tutto il blocco `<div className="flex min-h-0 flex-1"> … </div>` (righe ~422-827) con:

```tsx
          <div className="min-w-0 flex-1 overflow-y-auto">
            <div className="space-y-6 p-6">
              {/* 1 — Header compatto: stato + azione del momento + metadati essenziali */}
              <div className="rounded-2xl border border-border bg-secondary/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium ${WF_TONE[wf]}`}>
                    {wf}
                  </span>
                  {wf === "Da revisionare" && (
                    <form
                      action={async (fd) => {
                        setConfirmed(true);
                        await confirmContentAction(fd);
                        toast.success("Contenuto confermato");
                        router.refresh();
                      }}
                    >
                      <input type="hidden" name="contentId" value={content.id} />
                      <button className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-transform active:scale-[0.98]">
                        Conferma contenuto
                      </button>
                    </form>
                  )}
                  {wf === "Confermato" && (
                    <span className="text-sm font-medium text-sage-ink">✓ Confermato</span>
                  )}
                </div>

                {/* metadati essenziali inline */}
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
                  <span className="text-muted-foreground">
                    Pubblicazione: <span className="text-ink">{fmtDate(content.publishAt)}</span>
                  </span>
                  {content.format && (
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${FORMAT_CHIP[content.format]}`}
                    >
                      {FORMAT_LABELS[content.format]}
                    </span>
                  )}
                  {content.classes.map((cl) => (
                    <span
                      key={cl.id}
                      className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${classChip(cl.color)}`}
                    >
                      {cl.name}
                    </span>
                  ))}
                </div>

                {/* azioni secondarie + dettagli collassabili */}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setEditing(true)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-paper px-3 py-1.5 text-xs text-ink transition-colors hover:bg-secondary"
                  >
                    <PencilSimple size={14} /> Modifica
                  </button>
                  <form action={deleteContentAction}>
                    <input type="hidden" name="id" value={content.id} />
                    <button className="inline-flex items-center gap-1.5 rounded-full border border-coral/60 bg-coral/30 px-3 py-1.5 text-xs text-coral-ink transition-colors hover:bg-coral/50">
                      <Trash size={14} /> Elimina
                    </button>
                  </form>
                  <button
                    onClick={() => setDetailsOpen((v) => !v)}
                    className="ml-auto text-xs text-muted-foreground hover:text-ink"
                  >
                    {detailsOpen ? "Nascondi dettagli" : "Dettagli"}
                  </button>
                </div>

                {detailsOpen && (
                  <div className="mt-3 grid grid-cols-1 gap-3 border-t border-border pt-3 sm:grid-cols-2">
                    {content.hook && (
                      <div className="sm:col-span-2">
                        <div className="text-xs text-muted-foreground">Hook</div>
                        <p className="mt-0.5 text-[15px] text-ink">&ldquo;{content.hook}&rdquo;</p>
                      </div>
                    )}
                    <div>
                      <div className="text-xs text-muted-foreground">Blocco</div>
                      <p className="mt-0.5 text-sm text-ink">{content.block?.label ?? "—"}</p>
                    </div>
                    {content.block?.lucaDeliveryAt && (
                      <div>
                        <div className="text-xs text-muted-foreground">Consegna Luca</div>
                        <p className="mt-0.5 text-sm text-ink">{fmtDate(content.block.lucaDeliveryAt)}</p>
                      </div>
                    )}
                    {content.block?.matteoDeliveryAt && (
                      <div>
                        <div className="text-xs text-muted-foreground">Consegna Matteo</div>
                        <p className="mt-0.5 text-sm text-ink">{fmtDate(content.block.matteoDeliveryAt)}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Pubblicazione: solo quando confermato e admin */}
                {confirmed && (content.isAdmin ?? false) && (
                  <div className="mt-3 border-t border-border pt-3">
                    <PublishPanel
                      contentId={content.id}
                      channel={content.channel}
                      masterLink={content.masterLink}
                      initialState={content.publishState ?? null}
                      initialExternalId={content.externalId ?? null}
                    />
                  </div>
                )}
              </div>

              {/* Modalità modifica (riusa la form esistente) */}
              {editing && (
                <EDIT_FORM_PLACEHOLDER />
              )}

              {/* 2 — Materiali (il corpo) */}
              {!editing && (
                <section className="space-y-6">
                  <h3 className="text-sm font-medium text-muted-foreground">Materiali</h3>
                  <MATERIALI_BLOCK_PLACEHOLDER />
                </section>
              )}

              {/* 3 — Performance: solo dopo la pubblicazione */}
              {!editing && isPublished && (
                <section className="space-y-4 border-t border-border pt-5">
                  <h3 className="text-sm font-medium text-muted-foreground">Performance</h3>
                  <PERFORMANCE_BLOCK_PLACEHOLDER />
                </section>
              )}
            </div>
          </div>
```

- [ ] **Step 3: Innesta i blocchi esistenti al posto dei placeholder** (sposta il JSX già scritto, non riscriverlo):
  - `EDIT_FORM_PLACEHOLDER` → la form di modifica oggi dentro `tab === "Panoramica" && editing` (il ramo `else` con `updateContentAction`, righe ~614-682). Spostala qui tale e quale.
  - `MATERIALI_BLOCK_PLACEHOLDER` → i due blocchi `tab === "Materiali" && …` esistenti (VideoReview per `materialsMode === "video"` + la galleria/link/commenti per l'altro caso, righe ~734-825). Rimuovi solo la condizione `tab === "Materiali" &&`, tieni le condizioni su `materialsMode`.
  - `PERFORMANCE_BLOCK_PLACEHOLDER` → il contenuto del vecchio `tab === "Performance"` (il box ER + la form `updatePerformanceAction`, righe ~688-731), senza il wrapper di tab.
  - Verifica che gli import necessari (`FORMAT_CHIP`, `FORMAT_LABELS`, `classChip`, `PencilSimple`, `Trash`, `fmtDate`) siano già importati nel file; se `classChip` non lo è, importalo da `@/lib/class-format` (client-safe).

- [ ] **Step 4: Rimuovi il rail e le pillole** — conferma che il vecchio `<nav className="hidden w-44 …">` e il blocco `mobile tab pills` siano stati eliminati con la sostituzione dello Step 2 (non devono restare riferimenti a `TABS`/`tab`).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: nessun errore in `content-modal.tsx`. Risolvi eventuali riferimenti residui a `tab`, `delivered`, `markDeliveredAction`.

- [ ] **Step 6: Commit**

```bash
git add src/components/content-modal.tsx
git commit -m "feat(scheda): scroll unico — header compatto, Materiali al centro, Performance post-pubblicazione"
```

---

## Task 5: Nav a 5 voci — rimuovi Archivio (`sidebar-nav.tsx`)

**Files:**
- Modify: `src/components/sidebar-nav.tsx:15-20`

**Interfaces:**
- Produces: `NAV` senza la voce `/archivio` (consumato anche da `mobile-topbar.tsx`).

- [ ] **Step 1: Rimuovi la voce Archivio dall'array `NAV`** — elimina la riga:

```tsx
  { href: "/archivio", label: "Archivio", Icon: Archive },
```

  e rimuovi l'import ora inutilizzato `Archive` dal blocco `@phosphor-icons/react`.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: nessun errore (nessun import `Archive` orfano).

- [ ] **Step 3: Commit**

```bash
git add src/components/sidebar-nav.tsx
git commit -m "feat(nav): rimossa voce Archivio (5 voci) — desktop e mobile"
```

---

## Task 6: Helper puri per la vista Contenuti (`content.ts`)

Helper testabili per selezionare l'insieme in base a `?stato=` e per mappare i contenuti in righe archivio (DRY tra contenuti e la vecchia archivio).

**Files:**
- Modify: `src/lib/content.ts` (aggiunte in coda)
- Test: `tests/content-stato.test.ts` (NUOVO)

**Interfaces:**
- Consumes: `splitActiveArchived()` (già presente), `effectiveStatus()`, `engagementRate()`.
- Produces:
  - `type Stato = "lavorazione" | "pubblicati" | "tutti"`
  - `parseStato(v: string | string[] | undefined): Stato` (default `"lavorazione"`)
  - `contentsForStato<T extends ArchivableContent>(contents: T[], stato: Stato, now: Date): T[]`
  - `toArchiveRows(contents: ...): ArchiveRow[]` che ritorna righe compatibili con `ArchiveTable`.

- [ ] **Step 1: Scrivi il test** — crea `tests/content-stato.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseStato, contentsForStato } from "@/lib/content";

// Un contenuto "pubblicato da >14gg" (archiviato) vs uno attivo, minimale.
const base = {
  statusOverride: null as string | null,
  block: null,
  views: null, reach: null, likes: null, commentsCount: null,
  saves: null, shares: null, nonFollowerPct: null, followsGenerated: null,
};
const now = new Date("2026-07-09T00:00:00.000Z");
const archived = { ...base, id: "a", title: "a", channel: "INSTAGRAM", format: null, classes: [],
  publishAt: new Date("2026-06-01T00:00:00.000Z") }; // pubblicato da >14gg
const active = { ...base, id: "b", title: "b", channel: "INSTAGRAM", format: null, classes: [],
  publishAt: new Date("2026-07-20T00:00:00.000Z") }; // futuro → attivo

describe("parseStato", () => {
  it("default lavorazione", () => expect(parseStato(undefined)).toBe("lavorazione"));
  it("valore valido passa", () => expect(parseStato("pubblicati")).toBe("pubblicati"));
  it("valore ignoto → lavorazione", () => expect(parseStato("xxx")).toBe("lavorazione"));
});

describe("contentsForStato", () => {
  const all = [archived, active] as never[];
  it("lavorazione = solo attivi", () =>
    expect(contentsForStato(all, "lavorazione", now).map((c: any) => c.id)).toEqual(["b"]));
  it("pubblicati = solo archiviati", () =>
    expect(contentsForStato(all, "pubblicati", now).map((c: any) => c.id)).toEqual(["a"]));
  it("tutti = tutto", () =>
    expect(contentsForStato(all, "tutti", now).map((c: any) => c.id).sort()).toEqual(["a", "b"]));
});
```

- [ ] **Step 2: Esegui il test — deve fallire**

Run: `npx vitest run tests/content-stato.test.ts`
Expected: FAIL (`parseStato`/`contentsForStato` non esistono).

- [ ] **Step 3: Implementa gli helper** — in coda a `src/lib/content.ts` (importa `ArchiveRow` come type dal componente, oppure ridefinisci la shape inline per evitare import client→server; preferisci la shape inline):

```ts
export type Stato = "lavorazione" | "pubblicati" | "tutti";

export function parseStato(v: string | string[] | undefined): Stato {
  const s = Array.isArray(v) ? v[0] : v;
  return s === "pubblicati" || s === "tutti" ? s : "lavorazione";
}

export function contentsForStato<T extends ArchivableContent>(
  contents: T[],
  stato: Stato,
  now: Date
): T[] {
  if (stato === "tutti") return contents;
  const { active, archived } = splitActiveArchived(contents, now);
  return stato === "pubblicati" ? archived : active;
}
```

  Per `toArchiveRows`, estrai in una funzione la mappatura oggi inline nella pagina archivio (title/channel/format/classes/status/publishAt/views/er via `engagementRate` + `effectiveStatus`). Firma:

```ts
export type ArchiveRowLike = {
  id: string; title: string; channel: "INSTAGRAM" | "YOUTUBE";
  format: import("@prisma/client").ContentFormat | null;
  classes: { id: string; name: string; color: string | null }[];
  status: string; publishAt: string | null; views: number | null; er: number | null;
};
export function toArchiveRows(contents: /* stessa shape usata da archivio/page */ any[]): ArchiveRowLike[] {
  return contents.map((c) => {
    const er = engagementRate(c);
    return {
      id: c.id, title: c.title, channel: c.channel,
      format: c.format ?? null,
      classes: c.classes.map((cl: any) => ({ id: cl.id, name: cl.name, color: cl.color })),
      status: effectiveStatus(c.statusOverride, {
        publishAt: c.publishAt,
        lucaDeliveryAt: c.block?.lucaDeliveryAt ?? null,
        matteoDeliveryAt: c.block?.matteoDeliveryAt ?? null,
      }),
      publishAt: c.publishAt ? c.publishAt.toISOString() : null,
      views: c.views ?? null,
      er: er != null ? Math.round(er * 1000) / 10 : null,
    };
  });
}
```

  (Sostituisci `any` con i type reali già usati in `content.ts` se disponibili; la shape ritornata deve combaciare con `ArchiveRow` di `archive-table.tsx`.)

- [ ] **Step 4: Esegui il test — deve passare**

Run: `npx vitest run tests/content-stato.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/content.ts tests/content-stato.test.ts
git commit -m "feat(content): helper parseStato/contentsForStato/toArchiveRows (DRY vista Contenuti)"
```

---

## Task 7: Contenuti unificato — segmented control + ArchiveTable (`contenuti/page.tsx`)

**Files:**
- Modify: `src/app/(app)/contenuti/page.tsx`

**Interfaces:**
- Consumes: `parseStato`, `contentsForStato`, `toArchiveRows` (Task 6); `ArchiveTable` da `@/components/archive-table`.

- [ ] **Step 1: Leggi lo stato dai searchParams** — dopo `const sp = await searchParams;` aggiungi:

```tsx
  const stato = parseStato(sp.stato);
```

  e aggiungi agli import di `@/lib/content`: `parseStato, contentsForStato, toArchiveRows`. Importa `ArchiveTable`: `import { ArchiveTable } from "@/components/archive-table";`.

- [ ] **Step 2: Aggiungi il segmented control** — subito sotto l'`<header>` della pagina, inserisci links server-rendered che preservano gli altri query param (usa un helper locale):

```tsx
  const segHref = (s: string) => {
    const p = new URLSearchParams();
    if (s !== "lavorazione") p.set("stato", s);
    for (const f of toArray(sp.format)) p.append("format", f);
    for (const c of toArray(sp.class)) p.append("class", c);
    const qs = p.toString();
    return qs ? `/contenuti?${qs}` : "/contenuti";
  };
  const SEG: { key: string; label: string }[] = [
    { key: "lavorazione", label: "In lavorazione" },
    { key: "pubblicati", label: "Pubblicati" },
    { key: "tutti", label: "Tutti" },
  ];
```

  e il markup (dopo l'header):

```tsx
      <div className="inline-flex rounded-full border border-border bg-secondary/50 p-1 text-sm">
        {SEG.map((s) => (
          <Link
            key={s.key}
            href={segHref(s.key)}
            className={`rounded-full px-3.5 py-1.5 transition-colors ${
              stato === s.key ? "bg-ink text-paper" : "text-muted-foreground hover:text-ink"
            }`}
          >
            {s.label}
          </Link>
        ))}
      </div>
```

- [ ] **Step 3: Render condizionale della vista** — sostituisci la `<section>` finale dei "Contenuti attivi" con: se `stato === "lavorazione"` mostra la griglia esistente (raggruppata per mese, invariata); altrimenti mostra la tabella:

```tsx
      {stato === "lavorazione" ? (
        <section className="space-y-3">
          {/* … invariato: ContentSearch, ContentFilters, gruppi + ContentCard … */}
        </section>
      ) : (
        <section className="space-y-3">
          <ArchiveTable rows={toArchiveRows(contentsForStato(contents, stato, now))} />
        </section>
      )}
```

  (Mantieni il calcolo di `active`/`archived`/`published`/`pipeline` per le Stat in alto; `contents` è già l'elenco completo caricato da `listContents`.)

- [ ] **Step 4: Ripunta i link `/archivio`** — nella pagina, sostituisci i due `href="/archivio"` (la Stat "In archivio" e il link "Archivio (n)") con `href="/contenuti?stato=pubblicati"`.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/contenuti/page.tsx"
git commit -m "feat(contenuti): segmented In lavorazione/Pubblicati/Tutti con archivio ordinabile"
```

---

## Task 8: `/archivio` → redirect (`archivio/page.tsx`)

**Files:**
- Modify: `src/app/(app)/archivio/page.tsx` (sostituzione completa)

- [ ] **Step 1: Sostituisci il file con un redirect** — tutto il contenuto diventa:

```tsx
import { redirect } from "next/navigation";

export default function ArchivioRedirect() {
  redirect("/contenuti?stato=pubblicati");
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: nessun errore (eventuali import non più usati rimossi con la sostituzione).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/archivio/page.tsx"
git commit -m "feat(archivio): redirect a /contenuti?stato=pubblicati"
```

---

## Task 9: Suite completa + verifica

- [ ] **Step 1: Esegui tutta la suite**

Run: `npm test`
Expected: PASS (in particolare `workflow`, `home-actions`, `content-stato`, `archive`, `status`).

- [ ] **Step 2: Typecheck globale + build**

Run: `npx tsc --noEmit && npm run build`
Expected: nessun errore. Se Turbopack cachea client Prisma vecchio, `rm -rf .next` e ripeti (vedi memory `content-tool-known-fixes`).

- [ ] **Step 3: Browser-verify dal vivo (utente)** — checkpoint con notifica audio. Da controllare:
  - Nav a **5 voci** (Home, Calendario, Contenuti, KPI, Diario), sia desktop che topbar mobile; `/archivio` reindirizza a Contenuti→Pubblicati.
  - Contenuti: segmented **In lavorazione** (card) / **Pubblicati** (tabella **ordinabile** cliccando le colonne) / **Tutti**.
  - Scheda contenuto: **scorrimento unico**, header compatto con badge dei **3 stati** e l'azione giusta (Da revisionare → "Conferma"; Confermato → PublishPanel), **Materiali** al centro, **Performance nascosta** finché non "Pubblicato". "Dettagli" collassabile funzionante. Nessuna traccia di "Materiale consegnato".
  - Home: "Da fare adesso" invariata a livello di frasi (consegne di blocco).

- [ ] **Step 4: Aggiorna il grafo** — `graphify update .` (AST-only, no costo API) per tenere il knowledge graph allineato.

- [ ] **Step 5: Commit finale (se restano modifiche non committate)**

```bash
git add -A
git commit -m "chore(ia-v2): allineamento test/grafo dopo redesign sezioni+scheda"
```

---

## Self-Review (svolto)

- **Copertura spec**: A (nav −Archivio T5; Contenuti unificato T6-T7; redirect T8) · B (3 stati T1; Home T2; card T3; scheda scroll T4) · impatti collaterali (Home T2, badge T3, test T1/T2/T6). ✅
- **Placeholder**: gli unici marker (`EDIT_FORM_PLACEHOLDER`/`MATERIALI_BLOCK_PLACEHOLDER`/`PERFORMANCE_BLOCK_PLACEHOLDER`) hanno istruzioni esplicite di spostamento del JSX esistente con range di righe (Task 4, Step 3) — non sono TODO aperti. ✅
- **Consistenza tipi**: `workflowState({confirmedAt, hasMontato})` usato identico in T1/T3/T4; `WorkflowState` a 3 valori usato in card e modal; `Stato`/`parseStato`/`contentsForStato`/`toArchiveRows` coerenti tra T6 e T7; righe `ArchiveTable` = `ArchiveRow`. ✅
