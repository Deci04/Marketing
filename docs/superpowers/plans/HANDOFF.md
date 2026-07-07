# 🔻 START HERE — Handoff sessione content-tool

> Ultimo aggiornamento: 2026-07-07 (sera). Leggi **prima** questo, poi `2026-07-04-STATO.md` per il dettaglio storico.

## Dove sono i lavori
- **Branch git**: KPI **ONDATA 1 + 2 mergiati su `main`** in locale (merge commit `0ad0a02`, **NON pushato** — regola: push solo su richiesta esplicita). Il branch `serata/multi-feature` è tenuto e allineato a main.
- **Specs/piani ONDATA 1**: `docs/superpowers/specs/2026-07-07-kpi-ondata1-diretti-card-combinabili-design.md` + `docs/superpowers/plans/2026-07-07-kpi-ondata1-diretti-card-combinabili.md`
- **Inventario dati Zernio**: `docs/superpowers/plans/2026-07-07-zernio-data-inventory.md`
- **Graphify**: `graphify-out/graph.json` — interrogalo prima di greppare.

## Cosa è FATTO e verificato dal vivo ✅
- **ONDATA 1** — box KPI **diretti da Zernio** (12 metriche `account-insights`) con **delta che segue il periodo** (7/30/90), profilo/salute, demografiche `city` + `engaged`. **Card combinabili**: dividi (menu ⋯) e **unisci trascinando** una card su un'altra e tenendola ~3s. Empty-state puliti; Save/Share rate e Reach+non-follower con **fallback a livello account**. Delta reali verificati (reach p7 −74%). Nessuna migration (namespacing su `Measurement`).
- **ONDATA 2** — modello **`ZernioSnapshot`** (Json, migration additiva **applicata** su Neon) + `src/lib/zernio-snapshot.ts` (fetcher/mapper puri, TDD). Box: **Classifica post** (thumbnail, reach/ER/watch, ER **ricalcolato** da noi), **Orari migliori** (heatmap giorno×ora), **Frequenza vs engagement**, **Decadimento contenuti**. Snapshot popolato per Luca (12 post, 10 orari, 3 freq, 2 decay).
- **Fix chiave di sessione**: bundle client/server (`src/lib/metric-keys.ts` per non trascinare googleapis nel client), loop Recharts "Maximum update depth" (CSS: animare solo `transform`, guard `sameItems`), placeholder RGL (selettori lib + `!important`), hydration Grammarly (`suppressHydrationWarning` sul body). Vedi memory `content-tool-known-fixes`.
- Il grafico "Andamento vs benchmark" ora **segue il periodo** (`getMetricSeries` filtra la finestra).

## PROSSIMO PASSO
1. **Se l'utente conferma il visual finale** → si può **pushare `main`** (finora tenuto locale).
2. **ONDATA 2 residui (data-gated, minori)**: box **storico follower** e **storie** — entrambi tornano vuoti finché lo snapshotter Zernio non matura giorni / non ci sono storie attive. Caption post: il list endpoint la dà vuota (recuperabile dal dettaglio, +1 call/post — nice-to-have).

## Restano — prod-gated (sessione con DEPLOY)
Google **entrata** (webhook push), **bot Telegram** (l'utente spiegherà come lo costruisce — DA FARE PER ULTIMO), **W** post reale su Zernio, **M** mobile/responsive, P-findings #3/#4/#5.

## Ambiente
- **DB**: Neon condiviso (dev=prod). Migration additive applicate deliberatamente (ultima: `ZernioSnapshot`).
- **Dev server**: `npm run dev` (localhost:3000). **Dopo una migration riavvia il dev E pulisci `.next`** (Turbopack cachea il client Prisma vecchio → `db.<newModel>` undefined). Log dev: `/tmp/content-tool-dev.log`.
- **Env**: `.env` locale compilato (Google/Zernio/Telegram/NEXT_PUBLIC_APP_URL) + Vercel. Segreti NON in git.
- **Regole**: tutto locale; merge su main solo verificato; **push solo su richiesta**. Browser-verify prima del merge (l'utente verifica dal vivo, il browser MCP non raggiunge localhost in questa sessione). Notifica audio ai checkpoint: `afplay /System/Library/Sounds/Glass.aiff` (forma **pulita**, senza `2>/dev/null &`).
