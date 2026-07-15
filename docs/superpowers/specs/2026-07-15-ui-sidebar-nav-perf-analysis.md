# Sidebar sticky + navigazione fluida — analisi di design (solo analisi, no implementazione)

Data: 2026-07-15
Stack confermato: Next.js 16.2.9 (App Router, build MODIFICATA — vedi `AGENTS.md` + `node_modules/next/dist/docs/`), React 19.2.4, Prisma 6.19.3 + Neon Postgres (auto-suspend), Tailwind CSS v4, Auth.js v5.

---

## 0. Sintesi per chi ha fretta

1. **Sidebar**: il bug è reale e confermato dal codice — `DESIGN.md:45` dichiara l'intento originale ("sticky a tutta altezza") ma l'implementazione in `layout.tsx:55-56` usa `position: absolute` dentro un contenitore che scorre col documento, quindi la sidebar scrolla via non appena il contenuto supera 100vh. Fix raccomandato: `position: sticky` sull'`<aside>` (non `fixed`), 1 riga di classe Tailwind, zero impatti mobile (il rail è già `hidden md:block`).
2. **Navigazione fluida**: il progetto **non ha `cacheComponents` attivo** (`next.config.ts` non lo imposta) e usa ovunque `revalidatePath` (~100+ chiamate in 5 file `actions.ts`) sul modello di cache "precedente" (Next 15-style). Le pagine Calendario/Contenuti sono interamente dinamiche (leggono `currentContext()` → `auth()` → cookie → niente prerender) con `loading.tsx` presente (buono: streaming + partial prefetch). Il collo di bottiglia sulla "seconda visita" è che **non c'è nessuna cache lato client oltre il default Next (`staleTimes` non configurato → dynamic routes = 0s TTL)**: ogni navigazione richiede un round-trip al server, e il primo hit dopo inattività sconta il cold-start di Neon (già mitigato con retry in `src/lib/db.ts:14-27`, ma il retry aggiunge latenza, non la elimina).
3. Raccomandazione finale: **non** migrare a `cacheComponents: true` in questo giro (troppo grande: richiede riscrivere ~100 call-site `revalidatePath`→`updateTag`/`revalidateTag`, validare ogni pagina con `unstable_instant`, gestire `Activity`/stato preservato). Invece: alzare `staleTimes.dynamic` per Calendario/Contenuti + tenere `loading.tsx` (già presente) + valutare `use cache` mirato solo sulle query "quasi statiche" (liste classi, ecc.) come passo incrementale a basso rischio, dietro flag.

---

## 1. Stato attuale — analisi con citazioni esatte

### 1.1 Layout e sidebar

**File**: `src/app/(app)/layout.tsx`

```
41  <div className="flex min-h-screen flex-col md:flex-row md:gap-2 md:p-3">
42    <MobileTopBar ... />
55    <div className="relative hidden w-16 shrink-0 md:block">
56      <aside className="absolute left-0 top-0 z-30 flex h-[calc(100vh-1.5rem)] flex-col gap-2">
...
64        <SidebarNav />
...
84      </aside>
85    </div>
87    <main className="min-w-0 flex-1 px-3 pb-4 pt-3 md:px-0 md:py-2 md:pl-1">{children}</main>
88    {modal}
89    <ChatPanel userName={name} />
90  </div>
```

**Perché non è fissata (root cause):**

- Il contenitore radice (riga 41) è un `<div>` di **flusso normale** dentro `<body>` (root layout: `src/app/layout.tsx:38`, `<body className="min-h-full flex flex-col">` — nessun `overflow` o `height` fissato). Non esiste alcun contenitore con scroll isolato: **è la finestra/documento a scrollare**, non un div interno.
- Il rail sidebar è avvolto in `<div className="relative hidden w-16 shrink-0 md:block">` (riga 55): questo div è un **flex item** del contenitore riga 41, quindi fa parte del flusso normale e **scorre con la pagina** quando l'utente scrolla.
- L'`<aside>` (riga 56) è `position: absolute; top: 0; left: 0` **relativo al wrapper `w-16`** (che è `position: relative`), non relativo al viewport. Poiché il flex item di default si stira (`align-items: stretch`) all'altezza del fratello più alto (`<main>`, che può essere molto più alto di 100vh su `/contenuti` con molte card), il wrapper `w-16` è alto quanto tutta la pagina — ma l'`<aside>` è ancorato a `top: 0` **di quel wrapper**, cioè all'inizio della pagina. Quando l'utente scrolla il documento verso il basso, l'intero blocco (wrapper + aside) trasla verso l'alto insieme al resto del contenuto e la sidebar esce dal viewport.
- Conferma indipendente: `DESIGN.md:45` — *"Look scuro arrotondato (`bg-ink`, `rounded-3xl`), **sticky a tutta altezza**."* — l'intento di design era "sticky", ma l'implementazione usa `absolute`, non `sticky` né `fixed`. È una regressione/bug, non una scelta consapevole.

**Componenti coinvolti:**
- `src/components/sidebar-nav.tsx` — `"use client"`, usa `usePathname()` per l'item attivo, esporta `NAV` (5 voci: Home, Calendario, Contenuti, KPI, Diario). Nessun problema di posizionamento qui — il componente è puramente contenuto, il posizionamento è tutto nel layout.
- `src/components/mobile-topbar.tsx:29` — barra mobile già `sticky top-0 z-30` (corretta, non toccare). Il rail desktop è `hidden` sotto `md`, quindi mobile **non è impattato** da nessuna delle proposte sotto.
- `src/components/chat/chat-panel.tsx:169,177,185` — pulsante chat `fixed bottom-5 right-5 z-40`, overlay `fixed inset-0 z-40`, pannello espanso `fixed right-0 top-0 z-50`. Nessuna sovrapposizione geometrica con la sidebar (angoli opposti), ma va mantenuto lo z-index relativo: sidebar a `z-30`, chat sempre sopra (`z-40`/`z-50`) — qualunque fix non deve alzare lo z-index della sidebar oltre 40.

### 1.2 Data-fetching Calendario e Contenuti

Entrambe le pagine sono **Server Component `async` interamente dinamiche** (nessun prerender, nessuna cache oltre React `cache()` per-request):

**`src/app/(app)/calendario/page.tsx`**
```
19  export default async function CalendarioPage({ searchParams }: {...}) {
20    const ctx = await currentContext();      // auth() → cookies() → DB membership lookup
...
27    const [items, blocks, allContents] = await Promise.all([
28      getMonthItems(ctx.workspaceId, year, month),   // src/lib/calendar.ts
29      getMonthBlocks(ctx.workspaceId, year, month),
30      listContents(ctx.workspaceId),                 // src/lib/content.ts
31    ]);
```
Buona pratica già presente: le 3 query sono in `Promise.all` (niente waterfall). `searchParams` (y/m) rende la route dinamica per costruzione — ogni mese diverso è una request diversa.

**`src/app/(app)/contenuti/page.tsx`**
```
75  export default async function ContenutiPage({ searchParams }: {...}) {
76    const ctx = await currentContext();
...
90    const [contents, blocks, classes] = await Promise.all([
91      listContents(ctx.workspaceId, { formats, classIds }),
92      listBlocks(ctx.workspaceId),
93      listClasses(ctx.workspaceId),
94    ]);
```
`ContentSearch` (riga ~232, `src/app/(app)/contenuti/content-search.tsx`) e `ContentFilters` (`src/components/content-filters.tsx`) sono client component che usano `useSearchParams()`/`usePathname()` — **correttamente avvolti in `<Suspense fallback={null}>`** nella pagina (righe ~232-241), rispettando il requisito Next del skill `suspense-boundaries` (altrimenti CSR bailout).

**`currentContext()` / `currentUser()`** (`src/lib/current.ts:9-20`):
```
9   const getSession = cache(async () => auth());
14  const getMembership = cache(async (userId: string) => db.membership.findFirst({...}));
```
Usa `React.cache()` per **deduplicare entro un singolo render** (layout + page chiamano `currentContext()` più volte → 1 sola query DB), ma **questa memoizzazione non sopravvive tra richieste/navigazioni**: ogni nuova navigazione rifà `auth()` + query membership da zero.

**`loading.tsx`** (già presenti per entrambe le route + `/archivio`):
- `src/app/(app)/calendario/loading.tsx`, `src/app/(app)/contenuti/loading.tsx` — skeleton via `src/components/skeleton.tsx`.
- Effetto secondo la doc Next (`node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md:126-148`): Next avvolge automaticamente `page.tsx` in un `<Suspense>`, e per route dinamiche **con `loading.tsx`** il `<Link>` fa "partial prefetch" (layout + fallback fino al loading boundary), mostrato subito al click, mentre il contenuto vero arriva in streaming.

**Cosa manca — root cause della "seconda volta non è già caricata":**
- `next.config.ts` (letto per intero, righe 1-19) **non imposta `staleTimes`**. Per route dinamiche il default è `staleTimes.dynamic = 0` (doc: `node_modules/next/dist/docs/01-app/02-guides/prefetching.md:24-30` — *"Dynamic page: Client Cache TTL: Off, unless enabled"*). Risultato: anche se l'utente ha già visitato `/calendario` nello stesso mese, tornarci rifà **sempre** il round-trip completo al server (query Prisma + eventuale cold-start Neon), perché il router-cache lato client per quella route scade immediatamente.
- `cacheComponents` **non è attivo**: la codebase è sul "modello precedente" (`node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md`), confermato da:
  ```
  grep "use cache|cacheComponents" src/  → 0 risultati
  grep "revalidatePath" src/app/(app)/contenuti/actions.ts → 47 occorrenze
  grep "revalidatePath" src/app/(app)/calendario/actions.ts → 11 occorrenze
  ```
  `revalidatePath` invalida la **cache lato server** (Full Route Cache / Router Cache del server), non crea nessuna cache client persistente aggiuntiva — è ortogonale al problema "seconda visita lenta lato client".
- **Neon auto-suspend** (`src/lib/db.ts:9-27`): commento esplicito nel codice — *"Neon serverless va in auto-suspend quando è idle: la prima query dopo il risveglio fallisce con P1001... Backoff 300/600/900ms: Neon si risveglia in ~1s."* Il retry-wrapper **maschera l'errore ma non elimina la latenza**: nella peggiore ipotesi la prima query dopo pausa Neon costa ~1s+ prima ancora di eseguire, indipendentemente da qualunque ottimizzazione lato Next. Questo è un vincolo strutturale che nessuna strategia di prefetch/router-cache elimina del tutto (attutisce solo la *frequenza* con cui lo si sconta).

### 1.3 Versione Next modificata — vincoli da rispettare

`node_modules/next/dist/docs/01-app/` contiene documentazione Next 16 con feature **non standard rispetto al training del modello**, verificate a mano (non assunte):
- `cacheComponents: true` in `next.config.ts` è **l'unico modo** per abilitare `use cache`, `cacheLife`, `cacheTag`, e implica PPR come default (niente più `experimental.ppr`).
- Con `cacheComponents` attivo, Next usa **React `<Activity>`** per non-smontare le route in navigazione client (fino a 3 route recenti restano "hidden" in DOM, stato preservato) — feature rilevante per "seconda volta istantanea" ma con effetti collaterali su form/dialog/timer che vanno gestiti esplicitamente (`preserving-ui-state.md`).
- Esiste un export **`unstable_instant`** per validare a build-time/dev-time che una route sia effettivamente "instant" alla navigazione client (non solo al page-load) — utile come test di non-regressione se si va in questa direzione.
- `use cache` di default è **in-memory per istanza serverless** — in ambienti serverless (Vercel) può non persistere tra invocazioni fredde; per cache condivisa durevole serve `'use cache: remote'` (`use-cache-remote.md`). Rilevante perché il progetto è su Vercel (vedi `vercel.json`, `.vercel/`).

---

## 2. Sidebar — tre approcci

### Approccio A — `position: sticky` sull'`<aside>` (minimo intervento)

Cambiare riga 56 da:
```tsx
<aside className="absolute left-0 top-0 z-30 flex h-[calc(100vh-1.5rem)] flex-col gap-2">
```
a:
```tsx
<aside className="sticky top-3 z-30 flex h-[calc(100vh-1.5rem)] flex-col gap-2">
```
(`top-3` = 0.75rem, coerente con `md:p-3` del contenitore padre così l'offset visivo resta 12px anche durante lo scroll).

- Il wrapper `div.relative.hidden.w-16.shrink-0.md:block` (riga 55) può restare invariato (o perdere `relative`, che non serve più a `sticky`) — grazie ad `align-items: stretch` di default sul flex-row padre, il wrapper si stira quanto `<main>`, dando all'`<aside>` sticky abbastanza "corsia" per rimanere agganciato per tutta la lunghezza della pagina.
- Nessun contenitore-scroll dedicato richiesto: `sticky` funziona rispetto al primo antenato con overflow ≠ visible, che qui è il viewport (nessun overflow impostato più in alto nell'albero).

### Approccio B — `position: fixed` sull'`<aside>`

```tsx
<aside className="fixed left-3 top-3 z-30 flex h-[calc(100vh-1.5rem)] flex-col gap-2">
```
Il wrapper riga 55 resta come "spacer" puramente per riservare `w-16` di larghezza nel flex-row (già il suo unico scopo oggi, dato che l'`<aside>` è già estratto dal flusso con `absolute`).

### Approccio C — CSS Grid con colonna fissa a livello di layout

Riscrivere il contenitore riga 41 da `flex` a `grid grid-cols-[4rem_1fr] md:gap-2 md:p-3`, con la colonna sidebar (`<div className="sticky top-3 h-[calc(100vh-1.5rem)]">`) e la colonna main nella seconda traccia. Più esplicito nel dichiarare "2 colonne, una fissa" ma tocca la struttura del layout (non solo l'`<aside>`), incluso il posizionamento di `MobileTopBar` (che oggi vive fuori/prima del grid concettualmente, essendo `md:hidden`).

### Confutazione round 1

- **A (sticky)**: e se in futuro qualcuno aggiunge un header sopra il contenitore riga 41 (fuori da `<body>` diretto)? Sticky "rompe" silenziosamente se un antenato intermedio ottiene `overflow: hidden/auto` per un motivo non collegato alla sidebar (es. un futuro `overflow-x-auto` su un wrapper responsive) — il debug è meno ovvio di un `fixed` che "funziona sempre". Inoltre: su schermi molto stretti in `md` (limite 768px, tablet in portrait), se il contenuto di `<main>` fosse più basso di `100vh` (pagina corta, es. `/profilo`), il wrapper stirato sarebbe comunque alto quanto main — nessun problema pratico, ma va verificato che nessuna pagina abbia `<main>` con `height` esplicita minore del contenuto reale (non risulta dal codice ispezionato).
- **B (fixed)**: rimuove l'`<aside>` completamente dal flusso, quindi il wrapper `w-16` **deve** restare esplicito come spacer — se qualcuno in futuro rimuove per errore il wrapper "perché sembra inutile" (è vuoto/senza contenuto visibile), il main si allarga sotto la sidebar fissa e i primi 4rem di contenuto finiscono coperti. Rischio di regressione silenziosa più alto di A, perché lo spacer non ha un collegamento visivo ovvio con l'aside (sono due elementi separati nel DOM, uno vuoto).
- **C (grid)**: cambia la superficie di modifica (il contenitore intero, non solo l'aside) per un beneficio marginale rispetto a A — grid non risolve nulla che sticky non risolva già qui, dato che non c'è bisogno di ridimensionare dinamicamente le colonne. Aggiunge rischio di regressione visiva su `/profilo`, `/kpi`, ecc. che oggi si affidano al comportamento flex (es. `main` con `min-w-0 flex-1` — grid richiederebbe l'equivalente `min-w-0` sulla traccia, facile da dimenticare).

### Migliorie

- **A migliorato**: aggiungere esplicitamente `self-start` non serve (stretch va bene, è voluto), ma vale la pena annotare con un commento nel codice **perché** è sticky-and-not-fixed (nessun rischio di "sembra ridondante, lo tolgo" in futuro) — pattern già usato nel resto della codebase (vedi commenti in `layout.tsx:42-44`, `db.ts:9-13`, `next.config.ts:2-6`).
- **B migliorato**: se si sceglie fixed, aggiungere un commento esplicito sul wrapper riga 55 (`{/* spacer: riserva 4rem nel flex-row, l'aside è fixed e non fa più parte del flusso */}`) per prevenire la rimozione accidentale.
- **C scartato** per questo giro: non porta benefici sopra A per il costo/rischio, tenerlo in tasca solo se in futuro serve un secondo pannello fisso (es. una colonna destra) dove grid diventerebbe naturale.

### Confutazione round 2 (solo su A vs B, il grid è già escluso)

- Contro **A**: `sticky` con `align-items: stretch` implicito funziona *solo* perché nessun elemento tra `<aside>` e il suo antenato scrollabile ha `overflow` non-`visible`. Questo è vero **oggi**, ma è un invariante implicito, non imposto dal type system o da un test. Se non testato in browser, il rischio di "sembra funzionare in dev, si rompe in prod dopo un refactor" è concreto.
- Contro **B**: `fixed` con `left-3` hard-coded assume che il contenitore padre (riga 41) parta sempre a `left: 0` del viewport — vero oggi (nessun margin/padding esterno sul `<body>`), ma se in futuro si aggiunge un banner/announcement bar sopra (`position: sticky` in cima al body, es. per notifiche broadcast), l'aside `fixed` a `top-3` resterebbe ancorato al viewport e finirebbe *sotto* il banner invece di scorrere via con esso — mentre `sticky` erediterebbe naturalmente la nuova posizione di partenza.

### Decisione (vedi §4 per il design finale)

**Approccio A (`sticky`)** vince: cambio di una riga, coerente con l'intento originale già scritto in `DESIGN.md:45`, nessun impatto sullo spacer/wrapper (nessun elemento "trappola" da non rimuovere per errore), e più resiliente a futuri cambi di layout (header/banner) rispetto a `fixed`. Il rischio "overflow su un antenato intermedio" è mitigato con una verifica browser mirata (vedi §4.3) prima del merge — non richiede una modifica architetturale preventiva (grid) che nessun requisito attuale giustifica.

---

## 3. Navigazione fluida (Calendario ↔ Contenuti) — tre approcci

### Approccio 1 — Alzare `staleTimes` (router cache client, nessuna riscrittura di data-fetching)

Configurare in `next.config.ts`:
```ts
const nextConfig: NextConfig = {
  experimental: {
    staleTimes: { dynamic: 60 }, // 60s invece di 0 per le route dinamiche
  },
  // ... resto invariato
};
```
Effetto: dopo la prima visita a `/calendario?y=2026&m=6`, tornarci entro 60s riusa il payload RSC già in cache lato client **senza** round-trip al server (vero "instant" sulla seconda visita, nella finestra di tempo). Nessuna modifica alle pagine, alle query Prisma, o al modello di revalidation con `revalidatePath` esistente — perché `revalidatePath` invalida comunque la entry quando l'utente esegue una mutazione (Next invalida il router cache lato client alla ricezione della risposta della server action).

### Approccio 2 — `cacheComponents: true` + `use cache` mirato + `unstable_instant`

Attivare `cacheComponents` in `next.config.ts`, poi:
- Isolare le parti "quasi statiche" di Calendario/Contenuti (es. `listClasses(workspaceId)` in `src/lib/classes.ts`, che cambia raramente) dietro `'use cache'` + `cacheTag('classes:' + workspaceId)`.
- Avvolgere le parti realmente dinamiche/per-request (query `Content`/`Block`/`Item` filtrate da `searchParams`) in `<Suspense>` locali, lasciandole non cached.
- Sostituire (dove tocca le tag interessate) `revalidatePath` con `updateTag`/`revalidateTag` nelle server action rilevanti.
- Aggiungere `export const unstable_instant = { prefetch: 'static' }` a `calendario/page.tsx` e `contenuti/page.tsx` per validare a build/dev time che la navigazione tra le due sia davvero instant (Next segnala in dev/build se un componente blocca).

### Approccio 3 — Cache client esplicita (SWR/React Query-style) sopra i dati, layout persistente via parallel routes

Introdurre un client-side data layer (es. un piccolo store in-memory o `swr`/`@tanstack/react-query`) che tiene in cache lato client i risultati di `listContents`/`getMonthItems` esposti via Route Handler (`route.ts`) invece che via Server Component diretto, con invalidazione manuale (`mutate()`) dopo ogni server action. In alternativa/combinazione, usare **parallel routes** (`@calendario`/`@contenuti` slot in un layout condiviso, sul modello di `@modal` già esistente in `src/app/(app)/@modal/`) per tenere entrambe le viste "montate" e mostrare/nascondere invece di navigare.

### Confutazione round 1

- **1 (staleTimes)**: dati stantii — se Luca modifica un contenuto su un altro device/tab e torna su `/contenuti` entro i 60s configurati, potrebbe vedere dati vecchi *se* la cache non viene invalidata correttamente. Verifica necessaria: `staleTimes` governa il **client router cache**, che **viene invalidato automaticamente quando una server action con `revalidatePath`/`revalidateTag` risponde nella stessa sessione** (il router riceve l'informazione di invalidazione nella risposta della action e aggiorna la cache locale) — ma **non** protegge da mutazioni fatte da un altro *tab/dispositivo* nella stessa finestra di 60s (es. Matteo modifica da telefono mentre Luca ha `/contenuti` aperto su desktop): quella cache stantia non viene invalidata da un evento esterno. Per un tool a 2 persone che lavorano in parallelo (vedi memoria "Collab & notifiche feature" — flusso consegnato→da confermare→confermato), questo è un rischio concreto, non teorico.
- **2 (cacheComponents)**: costo di migrazione enorme e sproporzionato rispetto al problema. `use cache` di default è **in-memory per istanza** (`use-cache.md`) — su Vercel (funzioni serverless, istanze effimere/multiple) l'effetto pratico su una cache "condivisa" tra utenti è inaffidabile senza passare a `'use cache: remote'`, che introduce un ulteriore livello di storage da provisionare. Inoltre **tutte** le ~100 `revalidatePath` in 5 file `actions.ts` andrebbero riviste una per una per capire quali cache tag toccano — rischio concreto di introdurre invalidazioni mancanti (dati stantii silenziosi) durante la migrazione. `Activity`/stato preservato tra route introduce un'intera classe di bug nuovi (dropdown che restano aperti, form con dati vecchi — vedi `preserving-ui-state.md:27-142`) che vanno gestiti esplicitamente componente per componente (es. `ContentFilters`, `ContentSearch`, i vari `<details>` in `contenuti/page.tsx` righe 174/206) — lavoro non preventivabile in questa sola analisi.
- **3 (client cache/parallel routes)**: duplica la logica di data-fetching (Server Component *e* Route Handler per gli stessi dati), aumenta la superficie di bug (due percorsi che possono divergere), e i parallel routes per Calendario/Contenuti sarebbero un cambio strutturale enorme (oggi sono route indipendenti con URL propri — trasformarle in slot dello stesso layout rompe deep-linking, `searchParams` per route, e la history del browser così com'è). Sproporzionato.

### Migliorie

- **1 migliorato**: usare `staleTimes.dynamic` più basso (es. 20-30s, non 60s) per ridurre la finestra di dati stantii multi-tab, **combinato con** un piccolo miglioramento indipendente da 0-costo architetturale: verificare che tutte le server action che toccano `/calendario` e `/contenuti` chiamino `revalidatePath` su **entrambe** le route quando i dati sono condivisi (già vero in gran parte: `calendario/actions.ts:49,90` chiama `revalidatePath("/contenuti")` quando serve, `contenuti/actions.ts:71-72` chiama `revalidatePath("/home")`; va solo audit-ato che la copertura sia completa, non riscritta).
- **2 migliorato**: **non** fare il flip completo di `cacheComponents`, ma isolare un sottoinsieme a basso rischio come **spike separato** (fuori scope da questa analisi): cache-are solo `listClasses` (cambia raramente, non è nel percorso critico di lettura/scrittura frequente) dietro `'use cache'` con `cacheTag`, lasciando tutto il resto invariato. Questo richiede comunque `cacheComponents: true` globale (è un flag di progetto, non per-file) — quindi anche la versione "ridotta" ha un costo di attivazione non banale (va verificato che l'intera app superi la validazione PPR, non solo Calendario/Contenuti). Da valutare come iniziativa a parte, non come parte di "sidebar + nav fluida".
- **3 scartato**: nessuna miglioria lo rende proporzionato al problema dato lo scope ("due sezioni, seconda visita instant").

### Confutazione round 2 (solo su Approccio 1 migliorato)

- Anche con `staleTimes` basso e audit delle `revalidatePath`, resta vero che **la primissima visita di sessione** (o dopo 60s di inattività su quella route) sconta comunque il cold-start Neon (§1.2) — questo è esplicitamente accettato dal titolare ("è accettabile che la prima volta sia più lenta"), quindi non è una lacuna del design, è coerente col requisito.
- Rischio residuo: `staleTimes` è **globale al progetto** (non per-route in questa versione doc-confermata — non risulta un override per-route diverso da `export const dynamic`/dal file `route-segment-config` che tocchi specificamente il TTL del router cache client). Alzarlo per tutta l'app significa che **anche** route più sensibili alla freschezza (es. `/notifiche`, `/kpi` se mostra numeri in tempo reale) ereditano lo stesso TTL. Va verificato che nessuna route esistente dipenda da freshness sub-30s.

### Miglioria finale

Applicare `staleTimes.dynamic` **solo** dove serve realmente, tenendolo conservativo (20-30s) a livello globale ma **verificando esplicitamente** (checklist, non codice) che `/notifiche` e `/kpi` tollerino quella finestra — dato che sono viste di lettura, non transazionali, il rischio è basso ma va confermato leggendo `src/app/(app)/kpi/page.tsx` e `src/app/(app)/notifiche/page.tsx` prima di attivare (non fatto in questa analisi — segnato come todo nel piano finale).

---

## 4. Design finale raccomandato

### 4.1 Sidebar — sticky (Approccio A)

**File da toccare**: `src/app/(app)/layout.tsx` (unico file).

**Modifica esatta** (riga 56):
```diff
- <aside className="absolute left-0 top-0 z-30 flex h-[calc(100vh-1.5rem)] flex-col gap-2">
+ <aside className="sticky top-3 z-30 flex h-[calc(100vh-1.5rem)] flex-col gap-2">
```
Opzionale (pulizia, non necessaria a far funzionare sticky): il wrapper riga 55 (`<div className="relative hidden w-16 shrink-0 md:block">`) può perdere `relative` (non più necessario per l'ancoraggio, che ora è sticky-relativo-al-viewport), ma **lasciarlo non rompe nulla** — meno rischio, si può anche non toccarlo.

**Commento da aggiungere** (nello stile già usato nel file, vedi righe 20-25/42-44):
```tsx
{/* sticky, non absolute: il body scrolla come documento (nessun contenitore con
    overflow dedicato), quindi la sidebar deve restare ancorata al viewport durante
    lo scroll — absolute la faceva scorrere via col contenuto (bug, vedi
    docs/superpowers/specs/2026-07-15-ui-sidebar-nav-perf-analysis.md). */}
<aside className="sticky top-3 z-30 flex h-[calc(100vh-1.5rem)] flex-col gap-2">
```

**Verifica pre-merge (browser, non solo lettura codice)**:
1. Aprire `/contenuti` con abbastanza card da superare 100vh (già plausibile con dati reali del workspace).
2. Scrollare fino in fondo: la sidebar deve restare visibile e ancorata a 12px dal top per tutta la durata dello scroll.
3. Controllare `/profilo` (pagina probabilmente più corta di 100vh): la sidebar non deve "saltare" o mostrare artefatti quando il contenuto è più corto del viewport.
4. Ridimensionare la finestra intorno al breakpoint `md` (768px): verificare il passaggio pulito rail↔mobile-topbar (comportamento già esistente, solo verifica di non-regressione).
5. Aprire il pannello chat (`ChatPanel`, `fixed ... z-40/z-50`) e controllare che non ci sia conflitto visivo con la sidebar `z-30` (angoli opposti, non dovrebbe esserci sovrapposizione, ma verificare comunque a schermo stretto).

Nessuna modifica a `sidebar-nav.tsx`, `mobile-topbar.tsx`, `chat-panel.tsx`.

### 4.2 Navigazione fluida — `staleTimes` conservativo (Approccio 1 migliorato)

**File da toccare**: `next.config.ts` (1 file, ~3 righe aggiunte).

```diff
 const nextConfig: NextConfig = {
+  // Router cache client per route dinamiche: default 0s (nessuna cache) rendeva
+  // ogni ri-visita a /calendario o /contenuti un round-trip pieno al server, anche
+  // a pochi secondi dall'ultima visita. 25s è un compromesso: "seconda volta
+  // instant" nella sessione tipica, finestra di staleness cross-tab abbastanza
+  // corta da non essere un problema per un workspace a 2 persone (vedi analisi in
+  // docs/superpowers/specs/2026-07-15-ui-sidebar-nav-perf-analysis.md §3).
+  experimental: {
+    staleTimes: { dynamic: 25 },
+  },
   allowedDevOrigins: ["192.168.168.106"],
   ...
```

**Nessuna modifica** a `calendario/page.tsx`, `contenuti/page.tsx`, `lib/calendar.ts`, `lib/content.ts`, `lib/current.ts`, o alle azioni server (`revalidatePath` resta il meccanismo di invalidazione, invariato — `staleTimes` governa solo quanto a lungo il client riusa una entry di router-cache **prima** che scada da sola, non interferisce con l'invalidazione esplicita che le server action già fanno).

**Pre-requisito da verificare prima di attivare** (non ancora fatto in questa analisi — todo esplicito): leggere `src/app/(app)/kpi/page.tsx` e `src/app/(app)/notifiche/page.tsx` per confermare che nessuna delle due mostri dati per cui una finestra di staleness di 25s sia inaccettabile (es. un badge "non letto" su notifiche che deve sparire istantaneamente dopo essere stato letto altrove). Se `/notifiche` risultasse sensibile, si può escludere selettivamente forzando quella route a `dynamic = 'force-dynamic'` con `fetchCache`/segment-config dedicato, oppure lasciandola fuori aggiungendo `export const experimental_ppr = false` — ma **verificare prima**, non assumere.

**Cosa NON fare in questo giro** (esplicitamente fuori scope, motivato in §3):
- Non attivare `cacheComponents: true` — costo/rischio sproporzionato rispetto a "rendere fluida la seconda visita" con le ~100 `revalidatePath` esistenti da riconciliare e l'introduzione di `Activity`-state-preservation da gestire componente per componente.
- Non introdurre un client data-layer parallelo (SWR/React Query) o parallel routes — duplica la fonte di verità dei dati e rompe deep-linking/history per un guadagno che `staleTimes` già copre.
- Non toccare `src/lib/db.ts` (retry Neon già gestito correttamente) — il cold-start sulla primissima richiesta di sessione resta e **il titolare l'ha esplicitamente accettato**.

### 4.3 Riepilogo file toccati (per il piano di implementazione)

| File | Modifica | Rischio |
|---|---|---|
| `src/app/(app)/layout.tsx` | riga 56: `absolute left-0 top-0` → `sticky top-3` (+ commento) | Basso — verificare in browser su `/contenuti` con scroll lungo |
| `next.config.ts` | aggiungere `experimental.staleTimes.dynamic = 25` | Basso-medio — richiede verifica preliminare su `/kpi` e `/notifiche` prima del merge |

Nessun'altra modifica a componenti, query Prisma, server action, o schema. Nessuna dipendenza nuova.
