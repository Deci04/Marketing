# HANDOFF — Trasferire il lavoro su un altro ambiente / account

Tutto il necessario per riprendere il progetto (tool di gestione contenuti per il personal brand di Luca) da un'altra macchina o da Claude Code Terminal su un secondo account.

## 1. Repository (fonte di verità — il codice è tutto qui)
- **GitHub:** https://github.com/Deci04/Marketing
- **App live:** https://marketing-ashy-one.vercel.app
  - Vercel project `marketing` (team `matteos-projects-5d98a31d`), auto-deploy a ogni push su `main`.

```bash
git clone https://github.com/Deci04/Marketing.git
cd Marketing
npm install
npx prisma generate
# crea .env (vedi §3) poi:
npm run dev        # http://localhost:3001
```

## 2. Cartella Claude Code di questa conversazione (su questa macchina)
- Progetto: `~/.claude/projects/-Users-matteodecenzo-claudbot/`
- Transcript chat principale: `…/d897dbac-5719-446b-b9ae-88144d3ac084.jsonl`
- Memoria di progetto (contesto per il nuovo Claude): `…/memory/`
  - `MEMORY.md`
  - `matteo-luca-personal-brand-project.md` ← stato completo del progetto
  - `visuals-must-add-information.md`
- Nota: Claude Code indicizza le chat per **percorso della cwd**. Per fare `claude --resume` sull'altro account, lavora dallo stesso path e copia la cartella `memory/` (ed eventualmente il `.jsonl`) in `~/.claude/projects/<hash>/`.

## 3. Variabili d'ambiente (NON versionate — `.env` è gitignored)
Ricrea `.env` nella root del progetto con (valori da **Vercel → marketing → Settings → Environment Variables**, oppure `vercel link` + `vercel env pull .env`):
```
DATABASE_URL=…     # Neon Postgres pooled (con pgbouncer)
DIRECT_URL=…       # Neon Postgres unpooled (per le migrazioni)
AUTH_SECRET=…      # segreto Auth.js
# BLOB_READ_WRITE_TOKEN=…  # manca: serve per l'upload di file su Vercel Blob
```

## 4. Documenti utili (già nella repo)
- `DESIGN.md` — linguaggio di design completo + log implementazione
- `AGENTS.md` — **è Next.js 16**: leggere i doc in `node_modules/next/dist/docs/` prima di scrivere codice
- `docs/superpowers/specs/2026-06-18-software-gestione-contenuti-design.md` — spec di prodotto
- `docs/superpowers/plans/…` — piani dei moduli

## 5. Stack
Next.js 16 (App Router, `src/proxy.ts` al posto di `middleware.ts`) · Prisma 6 + Neon Postgres · Auth.js v5 (login via email per utenti seedati) · Tailwind CSS v4 + Phosphor icons + `motion` + Recharts + sonner · multi-tenant via `Workspace` · deploy su Vercel.

Comandi: `npm run dev` (porta 3001) · `npm run build` · `npm test` (Vitest) · `npx prisma migrate dev`.

## 6. Cosa è fatto
- Login/auth, Workspace multi-tenant, deploy live.
- **Contenuti & blocchi** (CRUD, commenti, stati derivati).
- **Calendario interattivo**: blocco da intervallo (ingloba i contenuti del periodo + scadenze Luca/Matteo), eventi/pubblicazioni **trascinabili**, blocco **ridimensionabile** dai bordi, eventi custom con responsabile, **elimina**, e **drawer informativo** al click sul box.
- **Dettaglio contenuto**: modale ampia in sovrapposizione (intercepting routes) con sezioni Panoramica/Performance/Materiali/Commenti, modifica/elimina, elimina commenti.
- **Card** con anteprima materiale (upload Blob o URL); grafica mantenuta anche con thumbnail.
- **KPI**: North Star (conversazioni di valore), card metrica con sparkline + delta + benchmark, grafico interattivo Luca vs benchmark, imbuto.
- **Archivio**: tabella ordinabile.
- **Home/Dashboard** con illustrazione SVG, stat, prossime uscite.
- Toast a tema sulle azioni.

## 7. Cosa resta aperto
- **Upload file su Blob**: collegare lo store al progetto Vercel → ottenere `BLOB_READ_WRITE_TOKEN` (l'anteprima via URL funziona già).
- **KPI estesi + dashboard a box movibili** (drag/resize/hide, layout salvato per utente): prima una ricerca sui KPI utili, poi box statici/derivati aggiungibili e riordinabili.
- Parcheggio: sync Google Calendar (one-way), bot Telegram + idea inbox, fasi YouTube extra, ingestione KPI IG/YT, replicabilità multi-cliente, email reale di Luca nel seed.
