# Documentazione — content tool (Spazio di Luca)

Mappa di dove vive ogni cosa nel repo. Web-app Next.js 16 (App Router, versione modificata — vedi `AGENTS.md`) + Prisma/Neon, deploy su Vercel (`marketing-ashy-one.vercel.app`).

## Struttura del repo

```
content-tool/
├─ src/
│  ├─ app/                    # route (App Router)
│  │  ├─ (app)/               # area autenticata: home, calendario, contenuti, kpi, diario, profilo…
│  │  ├─ (auth)/              # login
│  │  ├─ api/                 # route handler (integrazioni, upload, cron, diario…)
│  │  ├─ layout.tsx           # root layout (+ metadata, viewport/PWA, theme)
│  │  └─ manifest.ts          # Web App Manifest PWA (serve /manifest.webmanifest)
│  ├─ components/             # componenti React (UI + feature)
│  ├─ lib/                    # logica: db, auth, workflow, storage (r2/drive/blob), web-push, zernio, kpi…
│  └─ proxy.ts                # middleware Next 16 (auth gate; esclude asset PWA)
├─ prisma/                    # schema.prisma + migrations (additive)
├─ public/                    # asset statici + PWA (sw.js, icone icon-*/apple-icon, favicon)
├─ scripts/                   # utility one-shot (vedi sotto)
├─ tests/                     # Vitest (npx vitest run)
├─ docs/                      # QUESTA cartella (vedi sotto)
├─ graphify-out/              # knowledge graph (query prima di grepping — vedi CLAUDE.md)
├─ DESIGN.md                  # linguaggio di design completo (living doc, tema chiaro)
├─ AGENTS.md / CLAUDE.md      # istruzioni per gli agenti (root by convention)
└─ config: next.config.ts, tsconfig.json, vercel.json, eslint/postcss/vitest, components.json
```

## docs/ — cosa c'è dentro

- **`DESIGN.md`** (in root): il design system completo — vibe, palette, tipografia, ogni elemento UI. Punto di verità per lo stile.
- **`brand-logo-brief.md`**: brief distillato per generare il logo/icona (usato per Gemini).
- **`superpowers/specs/`**: **design spec** (il "cosa/perché" di ogni feature), per data. Prodotte con la skill brainstorming.
- **`superpowers/plans/`**: **piani di implementazione** (il "come", task bite-sized TDD), per data. Prodotti con la skill writing-plans. Referenziano gli spec per path relativo.
- I file `HANDOFF.md` / `*-STATO.md` sono note di stato storiche di fine-sessione.

Convenzione date: i doc sono prefissati `YYYY-MM-DD-`. Uno spec e il suo piano condividono lo slug.

## scripts/

- `backfill-materials.ts` — one-shot idempotente: crea righe Material dai vecchi campi thumbnail/videoProxy. `npx tsx scripts/backfill-materials.ts`.
- `r2-set-lifecycle.ts` — imposta la lifecycle R2 (expire `raw/` a N giorni). `npm run r2:lifecycle 7`. **Eseguire solo dopo** aver verificato che l'archiviazione su Drive funziona.

## Architettura (stato attuale)

- **Storage media**: originali a piena qualità → **Google Drive** (OAuth come Luca); proxy/anteprime → **Vercel Blob**; raw Diario caldo → **R2** (max 7gg, lifecycle attiva). Vedi spec `2026-07-15-storage-originali-drive-lifecycle-r2-design.md`.
- **Notifiche**: **web-push** (PWA, VAPID) + home "Da fare adesso" per-blocco; promemoria via cron (`api/cron/block-reminders`). Telegram rimosso. Vedi `2026-07-15-notifiche-redesign-analysis.md`.
- **PWA**: installabile (manifest + icone + service worker). Analisi in `2026-07-15-webapp-pwa-analysis.md`.
- **KPI**: North Star "conversazioni di valore", card metrica + grafici; dashboard a box movibili è la prossima voce grossa.
- **Integrazioni**: Zernio (pubblicazione/ingestione), Google Calendar, Google Drive.
