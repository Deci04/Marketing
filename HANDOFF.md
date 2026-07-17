# HANDOFF — Riprendere il progetto (content tool per il personal brand di Luca)

Tutto il necessario per riprendere il lavoro da un'altra macchina/account. Aggiornato: 17 lug 2026.

## 1. Repository (fonte di verità)
- **GitHub:** https://github.com/Deci04/Marketing
- **App live:** https://marketing-ashy-one.vercel.app — Vercel project `marketing` (team `matteos-projects-5d98a31d`), **auto-deploy a ogni push su `main`**.

```bash
git clone https://github.com/Deci04/Marketing.git
cd Marketing
npm install
npx prisma generate
# crea .env (vedi §3) — oppure: vercel link && vercel env pull .env
npm run dev        # http://localhost:3000
```

## 2. Contesto Claude Code (questa macchina)
- Progetto: `~/.claude/projects/-Users-matteodecenzo-claudbot/`
- Memoria (contesto per il nuovo Claude): `…/memory/` — leggi `MEMORY.md` (indice) e i file collegati (progetto, storage-drive-lifecycle, pwa-notifiche-v2, known-fixes…).
- Claude Code indicizza le chat per **path della cwd**: per `claude --resume` su un altro account, lavora dallo stesso path e copia `memory/` in `~/.claude/projects/<hash>/`.

## 3. Variabili d'ambiente (`.env`, gitignored; su Vercel per prod)
Valori da **Vercel → marketing → Settings → Env Variables** o `vercel env pull .env`. ⚠️ Su Vercel incollare i valori **senza virgolette** (un gotcha noto ruppe gli upload).
```
# Database (Neon Postgres)
DATABASE_URL=          # pooled (pgbouncer)
DIRECT_URL=            # unpooled (migrazioni)
AUTH_SECRET=           # Auth.js v5
# Storage
BLOB_READ_WRITE_TOKEN= # Vercel Blob (proxy/anteprime + originali transitori)
BLOB_STORE_ID=
R2_ACCOUNT_ID= R2_ACCESS_KEY_ID= R2_SECRET_ACCESS_KEY= R2_BUCKET= R2_ENDPOINT=   # Cloudflare R2 (raw Diario, lifecycle 7gg)
# Google (Calendar + Drive OAuth "come Luca", scope drive.file)
GOOGLE_CLIENT_ID= GOOGLE_CLIENT_SECRET= GOOGLE_SERVICE_ACCOUNT_B64=
# Web Push (PWA)
NEXT_PUBLIC_VAPID_PUBLIC_KEY= VAPID_PRIVATE_KEY= VAPID_SUBJECT=   # mailto:
CRON_SECRET=           # protegge /api/cron/*
# Altri
GROQ_API_KEY=          # trascrizione audio diario (Whisper)
ZERNIO_API_KEY=        # pubblicazione/ingestione social
NEXT_PUBLIC_APP_URL=
# TELEGRAM_BOT_TOKEN / TELEGRAM_WEBHOOK_SECRET  ← NON più usate (Telegram rimosso); rimovibili
```

## 4. Stack
Next.js 16 (App Router — **è modificato**, leggi `AGENTS.md` + `node_modules/next/dist/docs/`; middleware = `src/proxy.ts`) · Prisma 6 + Neon · Auth.js v5 (login email, utenti seedati) · Tailwind v4 + Phosphor + `motion` + Recharts + sonner · multi-tenant via `Workspace` · **PWA** (manifest + service worker + web-push) · deploy Vercel (cron in `vercel.json`).

Comandi: `npm run dev` (3000) · `npm run build` · `npm test` (Vitest) · `npx prisma migrate dev` · `npm run r2:lifecycle 7` (lifecycle R2, **solo dopo** aver verificato l'archiviazione Drive) · `graphify update .` (grafo, dopo modifiche al codice).

## 5. Architettura media/storage (importante)
- **Originali a piena qualità → Google Drive** (OAuth come Luca, 5TB): girato Diario, materiale per-contenuto, originale di publish. "Approccio A": client→Blob/R2, poi il server streama →Drive (best-effort). Cartelle `ContentTool/raw/{main,broll}`, `editati` (id in `DriveConfig`).
- **Proxy/anteprime → Vercel Blob** (compressione video client-side via ffmpeg.wasm, Safari-safe).
- **R2** = solo raw Diario caldo, **lifecycle expire `raw/` a 7gg** (attiva); lettura ripiega su Drive dopo 6gg.
- Spec: `docs/superpowers/specs/2026-07-15-storage-originali-drive-lifecycle-r2-design.md`.

## 6. Cosa è fatto e LIVE
- Auth, Workspace multi-tenant, deploy live.
- **Contenuti & blocchi** (CRUD, commenti, ciclo di vita consegnato→da confermare→confermato).
- **Calendario** interattivo (blocchi come bande, eventi trascinabili/ridimensionabili, drawer).
- **Dettaglio contenuto** modale (Panoramica/Performance/Materiali/Commenti).
- **KPI**: North Star "conversazioni di valore", card metrica (sparkline+delta+benchmark), grafico Luca vs benchmark, imbuto.
- **Diario/Raccolta** in-app (upload media su R2, trascrizione audio Groq, "Riorganizza" C2).
- **Storage originali → Drive** + lifecycle R2 (vedi §5).
- **PWA installabile** (manifest + icone dal logo brand + service worker).
- **Notifiche push** sul dispositivo (web-push/VAPID) — testate su iOS. Home **"Da fare adesso"** riscritta: per-blocco, max 2 item, tono neutro, si azzera con "Ho consegnato". Promemoria giornaliero via cron `/api/cron/block-reminders` (07:00 UTC).
- **UI**: sidebar sticky, navigazione più rapida (`staleTimes`).
- **Telegram rimosso** (notifiche + intake diario + link UI); colonne DB Telegram lasciate vestigiali.
- Toast a tema, Archivio ordinabile.

## 7. Cosa resta aperto
- **Dashboard KPI a box movibili** (drag/resize/hide, layout salvato per utente) — l'ultima voce grossa del `DESIGN.md`. Prossimo candidato naturale.
- Follow-up storage (minori): gate dell'upload-originale sul "Drive connesso"; retry/backfill originali bloccati su Blob se Drive era off; orphan del file Drive alla sostituzione video; Range/seek sul media servito da Drive dopo il cutover.
- Nome PWA sul dispositivo: mostra "Content tool" (ok così per scelta di Matteo).
- Eventuale: drop delle colonne DB Telegram vestigiali (migration distruttiva, rimandata); refactor `src/lib/` in sottocartelle per dominio (storage/notifiche/kpi…) se si vuole.

## 8. Documenti chiave
- `docs/README.md` — indice/mappa del repo. `DESIGN.md` — design system. `docs/brand-logo-brief.md` — brief logo.
- `docs/superpowers/specs/` (design) + `plans/` (implementazione). Analisi recenti: `2026-07-15-{notifiche-redesign,webapp-pwa,ui-sidebar-nav-perf}-analysis.md`.
