# 🔻 START HERE — Handoff sessione content-tool

> Ultimo aggiornamento: 2026-07-07. Leggi **prima** questo, poi `2026-07-04-STATO.md` per il dettaglio completo.

## Dove sono i lavori
- **Branch git**: `serata/multi-feature` (NON su `main`). Ultimo commit `21869fa`. **Tutto committato e al sicuro.**
- **Stato completo**: `docs/superpowers/plans/2026-07-04-STATO.md`
- **Design**: `docs/superpowers/specs/2026-07-04-serata-multi-feature-design.md`
- **Runbook subagenti**: `docs/superpowers/plans/2026-07-04-orchestrazione-subagenti.md`
- **Piani filone**: `docs/superpowers/plans/2026-07-04-{fondamenta,h-home,s-ricerca,z-zernio,t-diario,g-gcal}.md`
- **Inventario dati Zernio**: `docs/superpowers/plans/2026-07-07-zernio-data-inventory.md`
- **Graphify**: `graphify-out/graph.json` aggiornato — interrogalo prima di greppare.

## Cosa è FATTO e verificato dal vivo ✅
- 8 filoni (Fondamenta, H home per-ruolo, S ricerca+archivio, T diario/Telegram, Z Zernio KPI, N notifiche, G Google Calendar, W pubblicazione) + coordinamento UI. `tsc` pulito, test verdi.
- **Google Calendar**: connesso live, uscita (tool→Google) + backfill 27 item verificati.
- **Zernio**: connesso live (IG di Luca `lucademarco.cf`, 317 follower). KPI reali corretti dopo audit (engagement 7.5%, non-follower 96.7%, demografiche normalizzate a %). Bottone connetti/disconnetti funzionante.
- H, S, N verificati in browser.

## PROSSIMO PASSO immediato (riparti da qui) → Redesign box KPI
Direttiva utente: prima i box **DIRETTI da Zernio**, poi DERIVATI, poi MANUALI. Box movibili invariati. Numero-singolo = **valore + delta vs periodo prima**. Costruire TUTTI i box (inclusi extra).
- **ONDATA 1**: 12 metriche `account-insights` → `Measurement` (+ delta: fetch finestra corrente + precedente); demografiche `city` + `engaged` → `AudienceSegment`; esporre in `getKpiData`; poi box UI. **No migration.** (Reali Luca: views 41337, accounts_engaged 753, total_interactions 1732, likes 1284, saves 112, shares 131, reposts 24.)
- **ONDATA 2**: per-post ranking + extra (best-time, posting-frequency, content-decay, watch-time reel, storie, health) → nuovo modello `ZernioSnapshot` (Json, migration additiva deliberata) + box.
- ⚠️ Nota: i subagenti fallivano per infra sotto stress il 07-07. In sessione fresca: riprovare i subagenti o fare inline a piccoli passi verificati coi dati reali (`npx tsx --env-file=.env` script in `scripts/`).

## Restano (prod-gated) — sessione con DEPLOY
- Google **entrata** (webhook push), **bot Telegram** (l'utente spiegherà come lo costruisce — DA FARE PER ULTIMO), **W** post reale, **M** mobile, P-findings #3/#4/#5.

## Ambiente
- **DB**: Neon condiviso (dev=prod). Migration additive applicate deliberatamente.
- **Env**: `.env` locale compilato (Google/Zernio/Telegram/NEXT_PUBLIC_APP_URL) + Vercel prod+dev. Segreti NON in git.
- **Dev server**: `npm run dev` (localhost:3000). Se giù, riavviare. Fix runtime chiave già applicato: `googleapis` fuori dal bundle client (`chat-describe.ts` + `serverExternalPackages`).
- **Regole**: tutto locale, commit su branch (mai push/main finché non verificato in prod). Browser-verify prima del merge. Notifica audio ai checkpoint (`afplay Glass.aiff`).
