# Spec — Ottimizzazione UI/UX (velocità + creazione veloce + novità)

**Data:** 2026-06-29
**Filone:** `filone/ux-speed`
**Origine:** audit UX (live + codice) su richiesta di Matteo. Obiettivo: ridurre l'attrito d'uso quotidiano per Matteo (creazione rapida) e Luca (scoperta rapida), e togliere la lentezza percepita nella navigazione.

## Priorità (ordine di Matteo)
1. Calendario quick-create + creazione contenuto veloce
2. Velocità (loading/skeleton, auth singola, query filtrate)
3. Novità/notifiche in home
4. Polish minori + verifica/fix bug card

Dopo il merge: nuova ricerca di altri bug/migliorie.

---

## 1. Calendario quick-create

**Problema (verificato live):** creare un evento richiede 4–5 interazioni; l'unico avvio è un "+" minuscolo, grigio, visibile solo in hover sulla cella. Il responsabile non è precompilato.
File: `src/components/calendar/calendar-board.tsx` (dialog evento ~296-324, "+" hover ~246-252), action `src/app/(app)/calendario/actions.ts:addEventAction`, lib `src/lib/calendar.ts:addEvent`.

**Design:**
- **Clic su cella vuota → input inline** dentro la cella (non modale). Si scrive il titolo e **Invio** salva; **Esc** annulla; blur senza testo annulla.
- **Data** implicita dalla cella cliccata (nessun campo data).
- **Responsabile** precompilato = utente loggato (Matteo→`MATTEO`, Luca→`LUCA`); resta cambiabile dopo dal box evento. Mapping utente→responsible da `ctx.user` (per ora workspace a 2 persone: confronto su email/nome; fallback `null`).
- Il "+" hover resta come affordance secondaria ma il clic su cella vuota è il percorso primario. La legenda aggiunge "clic su un giorno per aggiungere".
- Da ~5 interazioni a ~2 (clic cella + scrivi + Invio).

**Tecnico:** la cella diventa client-interactive; al submit chiama `addEventAction` (titolo, data, responsible). `revalidatePath("/calendario")`. Nessun cambio schema.

## 2. Creazione contenuto veloce

**Problema:** il form "Nuovo contenuto" ha titolo `required` e tipologia senza default (`format` defaultValue `""`). File: `src/app/(app)/contenuti/page.tsx:104-139`, action `createContentAction`.

**Design (regole di Matteo):**
- **Tipologia = Reel di default** (`format` defaultValue `REEL`).
- **Titolo opzionale**: se lasciato vuoto, l'action assegna un **nome progressivo** — il più piccolo intero ≥1 non già usato come titolo numerico nel workspace (es. "1", poi "2"…). Modificabile dopo.
- Restano com'è: canale default Instagram, blocco/hook/classi opzionali, data opzionale.
- Obiettivo: creare un contenuto premendo solo "Crea contenuto", poi rifinire.

**Tecnico:** in `createContentAction` (`src/app/(app)/contenuti/actions.ts`), se `title` vuoto → calcola il prossimo numero (query titoli esistenti numerici nel workspace) e usalo. Validazione: niente più errore su titolo vuoto. Test unit per il generatore di nome progressivo.

## 3. Velocità

**Cause (da diagnosi codice):**
- **Nessun `loading.tsx`** in tutta l'app → ogni navigazione blocca su schermo fermo finché il server non ha finito tutte le query.
- **Doppia `auth()`** nel layout: `currentUser()` + `currentContext()` decifrano il JWT e interrogano il DB due volte per ogni navigazione (`src/app/(app)/layout.tsx:17-20`, `src/lib/current.ts`).
- **Over-fetch:** calendario scarica tutti i blocchi e filtra in JS (`src/lib/calendar.ts:getMonthItems/getMonthBlocks`); home interroga i contenuti due volte (`listContents` + dentro `getKpiOverview`); KPI molte query senza filtro data.
- Bundle pesanti (recharts/react-grid-layout/motion) caricati anche dove non servono.

**Design:**
- **`loading.tsx` con skeleton** per `/home`, `/calendario`, `/contenuti`, `/archivio`, `/kpi`. Lo skeleton riusa i contenitori già esistenti (card/stat/grid) per evitare layout shift.
- **Auth una volta sola:** rendere `currentContext()` la fonte unica (deriva user + workspace da un solo `auth()`), `currentUser()` riusa il risultato. Cache per-request (es. `React.cache`) così chiamate multiple nello stesso render non ricolpiscono il DB.
- **Query filtrate per data** nel calendario (where con range mese invece di filtro JS); **dedup** del fetch contenuti in home.
- **Lazy-load** dei componenti pesanti (`dynamic()` per chart/grid) dove sotto la piega.

**Vincolo:** è Next.js 16 modificato — leggere `node_modules/next/dist/docs/` prima di scrivere (vedi AGENTS.md). Niente regressioni: build pulita + test verdi + smoke.

## 4. Novità/notifiche in home

**Problema (verificato live + codice):** la home mostra stat + "Prossime uscite", ma un contenuto nuovo **senza data di pubblicazione non compare**; nessun concetto di "novità". Per Luca → ~4 clic per vedere un contenuto nuovo. File: `src/app/(app)/home/page.tsx`.

**Design:**
- Nuova sezione **"Novità"** in home: ultimi N (≈5) contenuti **per `createdAt` desc** + attività commenti recente, ciascuno con **link diretto a `/contenuti/{id}`** (apre il dettaglio). Da ~4 clic a 1.
- Mostra thumbnail/canale, titolo, stato, tempo relativo ("2 ore fa").
- Dati già disponibili: `Content.createdAt`, `Comment.createdAt`. Nuova query `listRecentContent(workspaceId, limit)` in `src/lib/content.ts` (nessun vincolo `publishAt`).
- (Opz., se serve per "aggiornato di recente") aggiungere `updatedAt` a `Content` — solo se a basso costo; altrimenti si usa `createdAt` + ultimo commento.

## 5. Polish minori + bug card

- **Bug card → dettaglio:** in audit, cliccando la card su `/contenuti` l'URL non cambiava e il modale non si apriva (la pagina dettaglio via URL diretto funziona). Da **riprodurre e correggere** (probabile intercepting route `@modal/(.)contenuti/[id]`). Verifica manuale richiesta a Matteo + ripro in dev.
- **Sidebar a pallini hover-expand:** clic impreciso → ingrandire l'area cliccabile / valutare label sempre visibile.
- **Nome utente:** la home saluta con l'email grezza; mostrare il nome (o derivare un display dal locale-part) e prevedere un nome nel seed.
- **Affordance link sulle stat card** (cursore/hover) così è chiaro che sono cliccabili.
- **Lazy-load bundle** (vedi §3).

---

## Out of scope (per dopo)
- Seconda ricerca bug/migliorie (post-merge, su richiesta esplicita di Matteo).
- F5/F6 integrazioni social (bloccate su setup account).
- Google Calendar sync.

## Verifica / Definition of Done
- `npm run build` pulito, `npm test` verde (incl. nuovi test: nome progressivo contenuto; eventuali helper data calendario).
- **Audit gate: verifica nel browser** dei flussi nuovi (crea evento inline, crea contenuto con default Reel + auto-nome, novità→dettaglio, navigazione più reattiva) **prima del merge su main** ([[matteo-browser-verify-before-merge]]).
- Smoke 0 errori console.

## Piano d'implementazione
Da dettagliare con la skill writing-plans (task ordinati come le priorità sopra).
