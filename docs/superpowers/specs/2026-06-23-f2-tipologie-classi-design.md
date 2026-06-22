# F2 — Tipologia di contenuto + Classi nominabili + filtri

**Data:** 2026-06-23 · **Filone:** F2 (prima ondata, parallelo a F1) · **Tipo:** meccanico → subagent + audit finale
**Worktree:** `~/claudbot/wt/f2-tags` · branch `filone/f2-tags`
**Spec madre:** `2026-06-22-orchestrazione-fasi-design.md`

## Obiettivo
Permettere di classificare e raggruppare i contenuti su due assi, e di filtrarli:
1. **Tipologia di contenuto** (formato) — già esiste come `Content.format` (`STORY | CAROUSEL | REEL | LONG_VIDEO`) ma non è esposto bene in UI.
2. **Classi nominabili** — gruppi creabili dall'utente (es. "Tutorial", "Q&A del venerdì") per raccogliere contenuti trasversali, opzionali.
3. **Filtri** nella pagina Contenuti, per tipologia **e** per classe (e per canale, se già presente).

## 1. Tipologia di contenuto (formato) — niente schema, solo UI
- **Selezionabile in creazione** contenuto (form create-content) e **modificabile** nel modale (tab Panoramica).
- **Mostrata** su card e in Archivio (chip).
- **Filtrabile** nella pagina Contenuti.
- Label IT: Storie / Carosello / Reel / Video lungo.

## 2. Classi nominabili — schema needs ⚠️ (applicato dalla torre PRIMA del dispatch; il subagent NON crea migrazioni)
- Nuovo modello **`ContentClass`** (workspace-scoped): `id`, `workspaceId`, `name`, `color String?` (pastello, opz.), relazione **many-to-many** con `Content`.
- Back-relation: `classes ContentClass[]` su `Content`, `contents Content[]` su `ContentClass`, `contentClasses ContentClass[]` su `Workspace`.
- UI:
  - **Crea/rinomina/elimina** classi (gestione classi, scoped al workspace).
  - **Assegna/rimuovi** classi su un contenuto (chip multi-select nel modale / nel create form).
  - Le classi appaiono come **chip pastello** su card e nel modale.

## 3. Filtri nella pagina Contenuti
- Barra filtri: **Tipologia** (multi/single) + **Classe** (se ne esistono) + eventuale **Canale** già presente.
- Stato via URL searchParams. Funziona anche senza classi (filtro per tipologia sempre disponibile).

## Pattern da rispettare
- Multi-tenant: `scopedWhere(workspaceId, ...)` + `currentContext()`; DB via `src/lib/db.ts`.
- Design: token di `globals.css` (chip pastello), Phosphor (`/dist/ssr` nei server component), toast `sonner`.
- **Next.js 16** — leggi `AGENTS.md` e i doc in `node_modules/next/dist/docs/` prima di usare feature di Next.

## Fuori scope (→ altri filoni)
- Breakdown KPI per formato/classe → lo gestisce F1 (dashboard).
- Tag a livello di singolo slide/storia (non richiesto).

## Criteri di accettazione
- [ ] Posso impostare/cambiare la tipologia di un contenuto e vederla sulla card/archivio.
- [ ] Posso creare classi, assegnarle ai contenuti e vederle come chip.
- [ ] Posso filtrare i contenuti per tipologia e per classe; i filtri persistono nell'URL.
- [ ] `npm run build` + `npm test` puliti; nessuna migrazione creata nel branch del filone.
