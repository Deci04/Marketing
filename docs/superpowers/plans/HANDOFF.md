# 🔻 START HERE — Handoff sessione content-tool

> Ultimo aggiornamento: 2026-07-09. Leggi **prima** questo, poi `2026-07-04-STATO.md` per il dettaglio storico.

## Dove sono i lavori
- **Branch git**: tutto su **`main`** in locale, **NON pushato** (regola: push solo su richiesta esplicita). Working tree pulito. Ultimo commit `90bdf69`. Il branch `serata/multi-feature` esiste ancora (allineato a un vecchio stato).
- **Specs/piani ONDATA 1**: `docs/superpowers/specs/2026-07-07-kpi-ondata1-diretti-card-combinabili-design.md` + `docs/superpowers/plans/2026-07-07-kpi-ondata1-diretti-card-combinabili.md`
- **Inventario dati Zernio**: `docs/superpowers/plans/2026-07-07-zernio-data-inventory.md`
- **Graphify**: `graphify-out/graph.json` — interrogalo prima di greppare.

## ⚠️ RIPRESA — l'utente ha delle modifiche da fare
Matteo ha detto che **prima di riprendere i tasselli mancanti (blocco prod-gated) ha delle sue modifiche da fare**. Alla ripresa: **chiedigli quali modifiche ha fatto / vuole fare** prima di attaccare il prod-gated. Non partire a testa bassa sul prod-gated.

## Cosa è FATTO e verificato dal vivo ✅
### KPI (ONDATA 1 + 2) — su main
- **ONDATA 1** — box KPI **diretti da Zernio** (12 metriche `account-insights`) con **delta che segue il periodo** (7/30/90), profilo/salute, demografiche `city` + `engaged`. **Card combinabili**: dividi (menu ⋯) e **unisci trascinando** una card su un'altra e tenendola ~3s. Empty-state puliti; Save/Share rate e Reach+non-follower con **fallback a livello account**. Nessuna migration (namespacing su `Measurement`).
- **ONDATA 2** — modello **`ZernioSnapshot`** (Json, migration additiva applicata su Neon) + `src/lib/zernio-snapshot.ts` (fetcher/mapper puri, TDD). Box: **Classifica post** (ER **ricalcolato** da noi), **Orari migliori** (heatmap), **Frequenza vs engagement**, **Decadimento contenuti**. Popolato per Luca. Il grafico "vs benchmark" ora **segue il periodo**.

### Mobile — su main, verificato dal vivo dall'utente
- **Top bar mobile** (`src/components/mobile-topbar.tsx`): sotto `md` il rail sinistro sparisce → barra fissa in alto (workspace · sezione · 🔔 · ☰) con **menu aree a scomparsa**. Contenuto full-width.
- **Calendario mobile** → vista **agenda** (lista giorni con eventi leggibili); la griglia 7-col resta solo desktop (`calendar-board.tsx`).
- Form dei modali (KPI editors, content-modal) e griglie stackano su mobile.

### Fix chiave di sessione (vedi memory `content-tool-known-fixes`)
- **`allowedDevOrigins`** in `next.config.ts` → senza, Next 16 bloccava le risorse dev cross-origin aprendo l'app dal **telefono via IP** → hydration morta, "pulsanti non funzionano" su mobile. **L'IP (`192.168.168.106`) può cambiare** con la rete: se il mobile smette di funzionare, aggiorna l'IP e riavvia.
- **Retry P1001/P1017** nel client Prisma (`src/lib/db.ts`, extension `$allOperations`) → Neon serverless va in auto-suspend; senza retry le azioni fallivano "a intermittenza".
- **`src/lib/class-format.ts`** + **`src/lib/metric-keys.ts`** → helper client-safe estratti per NON trascinare `db`(PrismaClient)/googleapis nel bundle browser. **Regola**: un client component non deve importare (per valori) un modulo `@/lib/*` che importa `db`.
- Loop Recharts "Maximum update depth" (CSS animare solo `transform` + guard `sameItems`), placeholder RGL (selettori lib + `!important`), hydration Grammarly (`suppressHydrationWarning` sul body).

## Restano — i "tasselli mancanti" (prod-gated / da-fare)
Sessione con DEPLOY, in quest'ordine (Telegram per ultimo):
1. **Google entrata** (webhook push, URL pubblico) + **P-finding #3** (`@@unique([workspaceId, googleEventId])` + upsert idempotente). Route già esistente: `src/app/api/integrations/google/webhook`.
2. **W — post reale su Zernio** (`publish()` esiste in `zernio.ts`; il post vero è azione live).
3. **P-finding #4** (`resolveWorkspaceForChat` non deterministico → pinna il workspace al link; `src/lib/telegram-link.ts`) e **#5** (codice link Telegram senza scadenza). Entrambi servono campi su `User` → migration.
4. **Bot Telegram** (setWebhook prod; l'utente spiegherà come lo costruisce — **DA FARE PER ULTIMO**).
- Residui minori: box **storico follower** + **storie** (data-gated, vuoti finché Zernio non matura). Caption post (dal dettaglio, +1 call/post).
- **Push di `main`** su origin: solo quando l'utente lo chiede.

## Ambiente
- **DB**: Neon condiviso (dev=prod). Migration additive applicate deliberatamente.
- **Dev server**: `npm run dev` (localhost:3000, ascolta anche su IP LAN). **Dopo una migration: riavvia il dev E `rm -rf .next`** (Turbopack cachea il client Prisma vecchio → `db.<newModel>` undefined). Log: `/tmp/content-tool-dev.log`.
- **Mobile test dal telefono**: `http://<IP-Mac>:3000` (stessa WiFi); IP con `ipconfig getifaddr en0`; serve l'IP in `allowedDevOrigins`. Alternativa: Chrome devtools device mode.
- **Regole**: tutto locale; commit solo a verde; merge/push su main **solo verificato / su richiesta**. Browser-verify: l'utente verifica dal vivo (il browser MCP non raggiunge localhost in questa sessione). Notifica audio ai checkpoint: `afplay /System/Library/Sounds/Glass.aiff` (forma **pulita**, senza `2>/dev/null &`, così non chiede il permesso).
