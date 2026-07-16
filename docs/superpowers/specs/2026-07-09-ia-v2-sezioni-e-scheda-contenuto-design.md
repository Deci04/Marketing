# Spec — IA v2: sezioni + ridisegno scheda contenuto (A + B)

> Data: 2026-07-09. Scope: **solo A + B**. Il punto **C** (Diario come raccolta/ingestion su cloud) è
> uno spec separato (ricerca cloud in corso). Qui C compare solo come destinazione di ciò che
> "esce" dalla scheda (la consegna materiale).

## Obiettivo

Ridurre il rumore di navigazione e **rendere chiaro il ciclo di collaborazione**, che oggi ha stati
ambigui su "di chi è il turno". Due interventi:

- **A** — meno sezioni: Archivio smette di essere una voce a sé e vive dentro Contenuti.
- **B** — la scheda contenuto passa da 3 tab a **scorrimento unico** con i Materiali al centro, e il
  ciclo di collaborazione si riduce da 4 a **3 stati** nominati per chi deve agire.

## Contesto attuale (verificato nel codice)

- **Nav** (`src/components/sidebar-nav.tsx`, `src/components/mobile-topbar.tsx`): 6 voci — Home,
  Calendario, Contenuti, Archivio, KPI, Diario.
- **Due sistemi di stato paralleli, da non confondere**:
  - `src/lib/workflow.ts` → **ciclo di collaborazione** basato su eventi reali
    (`deliveredAt` / `hasMontato` / `confirmedAt`). Stati oggi:
    `Da consegnare → Da revisionare → Da confermare → Confermato`. Usato nel badge della card
    (`content-card.tsx`) e nella tab Panoramica (`content-modal.tsx`). **È questo che ridisegniamo.**
  - `src/lib/status.ts` → **stato derivato dalle date** (`Da consegnare/Consegnato/Revisionato/Pubblicato`).
    Serve alla timeline di pubblicazione e allo split attivo/archivio. **Resta invariato.**
- **Split attivo/archivio già esistente**: `splitActiveArchived()` in `src/lib/content.ts`
  (archivio = "Pubblicato" da >14 giorni). Oggi `/contenuti` mostra gli attivi, `/archivio` mostra
  l'archiviato con `ArchiveTable` (tabella **ordinabile**).
- **Scheda contenuto** (`src/components/content-modal.tsx`): 3 tab `Panoramica / Materiali / Performance`.
  La Panoramica **non è decorativa**: contiene stato collaborazione + azioni (Materiale consegnato,
  Conferma, PublishPanel), hook, metadati (data, tipologia, blocco, classi, consegne) e Modifica/Elimina.

---

## A — Ristrutturazione sezioni

**Nav 6 → 5 voci**: Home · Calendario · Contenuti · KPI · Diario. Si rimuove la voce **Archivio**.
Home resta **invariata** (salvo l'impatto lifecycle sotto).

**Contenuti diventa il posto unico** per lavoro attivo + archivio, con un **segmented control** in cima:

| Filtro | Insieme | Presentazione |
|---|---|---|
| **In lavorazione** (default) | `splitActiveArchived().active` | Griglia di card (come oggi) |
| **Pubblicati** | `splitActiveArchived().archived` | `ArchiveTable` (tabella **ordinabile**, come l'attuale Archivio) |
| **Tutti** | tutti i contenuti | `ArchiveTable` ordinabile |

- Il default è **In lavorazione** → apri Contenuti e vedi solo ciò su cui stai lavorando (obiettivo:
  meno rumore). L'archivio è a un click, e mantiene l'ordinabilità perché **riusa `ArchiveTable`**.
- Stato del filtro nell'URL: `?stato=lavorazione|pubblicati|tutti` (coerente con `content-filters.tsx`
  che già usa i query param). I filtri esistenti (tipologia/classe) restano e si combinano.
- **Route `/archivio`**: rimossa dalla nav; la pagina resta come **redirect** a
  `/contenuti?stato=pubblicati` (per eventuali link salvati). La sua logica confluisce in `/contenuti`.

**File toccati (A)**: `sidebar-nav.tsx`, `mobile-topbar.tsx` (togli voce), `content-filters.tsx`
(+ segmented control), `app/(app)/contenuti/page.tsx` (render condizionale griglia vs ArchiveTable
in base a `stato`), `app/(app)/archivio/page.tsx` (→ redirect).

---

## B — Ridisegno scheda contenuto

### B.1 — Ciclo di collaborazione a 3 stati (`workflow.ts`)

Nominati **per chi deve agire**:

| Stato | Quando | Chi agisce | Trigger tecnico |
|---|---|---|---|
| **Da fare** | non c'è ancora il contenuto: va creato e caricato | **Matteo** | `hasMontato = false` |
| **Da revisionare** | contenuto caricato, Luca deve controllarlo | **Luca** | `hasMontato = true`, `confirmedAt = null` |
| **Confermato** | Luca ha confermato → pubblicabile | (fatto → pubblica) | `confirmedAt != null` |

Nuova `workflowState`:
```
if (confirmedAt) return "Confermato";
if (hasMontato)  return "Da revisionare";
return "Da fare";
```

Rispetto ad oggi: **`Da consegnare` + `Da revisionare` → `Da fare`**; **`Da confermare` → `Da revisionare`**;
`Confermato` invariato.

**Due "consegna" diverse — da non confondere:**
- **Consegna PER-CONTENUTO** (il vecchio `deliveredAt` + `masterLink` + pulsante "Materiale
  consegnato" nella scheda) → **rimossa dalla scheda**. Non è più una fase del singolo contenuto: il
  materiale arriverà dalla **raccolta del Diario (C)**. I campi DB `deliveredAt` / `masterLink`
  **restano** (nessuna migration distruttiva ora), ma non più usati nella UI del ciclo. Cleanup → C.
- **Consegna A LIVELLO DI BLOCCO** (`block.lucaDeliveryAt`, `block.matteoDeliveryAt`) → **resta.** Sono
  gli eventi/scadenze creati quando si fa il blocco temporale: *"Luca consegna i materiali della
  settimana"* (l'evento "registra video" di Luca) e *"Matteo consegna gli editati"*. **La Home "Da fare
  adesso" si rifà a queste scadenze di blocco**, non al ciclo per-contenuto.
- Azioni per stato nella scheda: **Da fare** → Matteo carica il contenuto (setta `hasMontato`);
  **Da revisionare** → Luca "Conferma" (setta `confirmedAt`); **Confermato** → Matteo "Pubblica"
  (PublishPanel, invariato). La server action `markDeliveredAction` esce dalla scheda.

### B.2 — Scheda a scorrimento unico (niente tab)

Da modale a 3 tab → **una colonna che scorre**, impilata così:

1. **Header compatto stato + azioni** (la "Panoramica" ridotta all'osso, in cima):
   - badge dello stato (3 stati) + **il pulsante-azione del momento** (Carica contenuto / Conferma /
     Pubblica) ben visibile;
   - metadati essenziali inline e stringati: data pubblicazione · tipologia · classi;
   - Modifica / Elimina in overflow (menu ⋯), non più pulsanti in primo piano;
   - i metadati secondari (blocco, consegne Luca/Matteo, hook) vanno in un **"Dettagli" collassabile**
     sotto l'header o in testa ai Materiali (decisione D2 sotto).
2. **Materiali** (il corpo, la cosa che conta): galleria/reel + link materiali + **commenti**
   (il badge commenti oggi sta su Materiali → coerente). `material-gallery.tsx` / `video-review.tsx`
   invariati nella sostanza.
3. **Performance** (in fondo): **visibile solo dopo la pubblicazione**. Per ora resta **manuale**
   (`updatePerformanceAction`); appena C/pubblicazione reale la alimenta, diventa automatica. Prima
   della pubblicazione la sezione non compare.

**File toccati (B)**: `workflow.ts` (stati + homeActions), `content-modal.tsx` (rimozione tab →
scroll unico, header compatto, gate performance), `content-card.tsx` (badge 3 stati),
server actions contenuto (rimuovere `markDeliveredAction` dalla scheda; `confirm`/`publish` restano).

---

## Impatti collaterali (da validare in review)

1. **Home "Da fare adesso" (`homeActions` / `lucaDeadlineGroups` in `workflow.ts`)** — la Home resta
   guidata dalle **scadenze di consegna del blocco** (`block.lucaDeliveryAt` / `block.matteoDeliveryAt`),
   NON dal ciclo per-contenuto. Restano:
   - **Luca**: "consegna i materiali della settimana" entro `block.lucaDeliveryAt` (l'evento "registra
     video"). Questa scadenza è anche ciò che alimenterà la raccolta del Diario (C).
   - **Matteo**: "consegna gli editati" entro `block.matteoDeliveryAt`.
   - **Intervento tecnico necessario**: oggi `lucaDeadlineGroups` filtra `workflowState === "Da consegnare"`
     (stato che sparisce). Va scollegato dal ciclo per-contenuto e ancorato **solo** alle scadenze di
     blocco (contenuti del blocco ancora non consegnati/non montati). Comportamento visibile per l'utente:
     **invariato** (stesse frasi "consegna entro…"). ✅ nessun cambiamento UX in Home.
2. **`content-card.tsx`** — mappa toni/colori del badge aggiornata ai 3 stati.
3. **Test** — aggiornare i test di `workflowState` / `homeActions` ai 3 stati.

## Decisioni prese con default (per la tua review)

- **D1** — Su "Pubblicati/Tutti" si riusa `ArchiveTable` (ordinabile); su "In lavorazione" la griglia
  di card. *Default: sì.*
- **D2** — Metadati secondari (blocco, consegne, hook) → in un "Dettagli" collassabile nell'header
  compatto. *Default: sì, collassato.*
- **D3** — Home invariata a livello UX: le scadenze "Da fare adesso" restano ancorate alle **consegne
  di blocco** (Luca settimana / Matteo editati); si scollega solo il calcolo dal ciclo per-contenuto.
  *Confermato dall'utente (2026-07-09).*

## Fuori scope (→ spec C)

Raccolta Diario, upload di Luca, transizione hot→cold, alimentazione automatica delle Performance.
Oggetto di uno spec dedicato. **Direzione decisa (2026-07-09):** storage a due tier — **Cloudflare R2
hot** (10 GB free, `raw/` con auto-scadenza via lifecycle) **+ Google Drive (Shared Drive del Workspace
aziendale di Luca) come archivio cold organizzato**, via service account membro dello Shared Drive
(niente gotcha quota, costo incrementale ≈ 0). Upload client→R2 con presigned PUT + multipart. Migrare
comunque via da Telegram (uso contro i TOS).

## Testing / verifica

- **Unit**: `workflowState` a 3 stati; nuove `homeActions`; selezione insieme per `?stato`.
- **Browser-verify dal vivo** (Matteo): nav a 5 voci, filtro Contenuti + ordinamento archivio,
  scheda a scorrimento unico con i 3 stati e le azioni giuste per ruolo, Performance nascosta finché
  non pubblicato. Regola progetto: merge/commit solo a verde e su verifica.
