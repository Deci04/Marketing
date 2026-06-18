# Software di gestione contenuti — Design (Fase 1: Core)

- **Data:** 2026-06-18
- **Stato:** Design approvato — pronto per il piano di implementazione
- **Progetto Gantt Smart:** "SOFTWARE MARKETING" (grafo di sviluppo con 8 sezioni, 33 step tecnici + 8 nodi-risultato)
- **Nome di lavoro:** Software di gestione contenuti (sostituto di Notion per il progetto Luca, replicabile)

---

## 1. Contesto e obiettivo

Matteo segue Luca (personal brand): edita i contenuti e gestisce strategia, pubblicazione e misurazione. Oggi tutto è su Notion, che è poco personalizzabile e ha un costo di abbonamento.

**Obiettivo:** costruire uno strumento di gestione **proprio**, che sostituisca Notion, **possieda il flusso di lavoro**, eviti i costi di abbonamento e sia **replicabile** su clienti futuri.

La visione completa è a più livelli; questo documento specifica **solo la Fase 1 (Core)**. Le fasi successive sono mappate ma non specificate qui.

### Criterio guida
La direzione tecnica è scelta per ottenere **il prodotto più funzionale e di qualità possibile**, non per la familiarità con uno stack già noto.

---

## 2. Decisioni chiave (congelate)

1. **La spina dorsale è il calendario.** Tutto il software gira attorno ad esso.
2. **Un contenuto ha due facce:** una **card leggera** nel calendario (per lavorare) e una **scheda completa** nell'archivio (per misurare). Le performance vivono solo nella scheda.
3. **Modello a blocchi:** i contenuti di un periodo si raggruppano in un blocco con **due scadenze** (Luca consegna i materiali; Matteo consegna il revisionato). Le pubblicazioni sono per-contenuto.
4. **La pubblicazione è gestita da Matteo** (l'evento "pubblicazione" è una sua scadenza).
5. **Google Calendar: sincronizzazione a una via** (software → Google). Il software è la fonte della verità; spinge gli eventi su un calendario condiviso. Niente bidirezionale nel core.
6. **Il blocco è un raggruppamento visivo solo nel software**; su Google Calendar arrivano eventi "piatti".
7. **Stack:** Next.js (App Router) + TypeScript · Postgres · Prisma · **Auth.js** (no servizi esterni) · Tailwind + shadcn/ui. Un linguaggio solo (TypeScript) end-to-end.
8. **Multi-tenant dal giorno 1:** alla radice del modello c'è il `Workspace` (= cliente). Oggi un solo workspace (Luca); la replicabilità non è un retrofit.
9. **Il fornitore del database (Neon / Vercel marketplace / Supabase / altro) si decide al deploy** in base al setup di Luca: il codice (Postgres + Prisma) non cambia.
10. **Sviluppo local-first:** `next dev` + Postgres locale o branch di sviluppo; deploy quando serve (hosting e chiavi API le fornisce Luca).
11. **KPI come conseguenza, non punto di partenza:** prima calendario/pipeline, poi archivio, poi i KPI costruiti sopra l'archivio.

---

## 3. Modello dati

### Fondamenta (multi-tenant)
- **Workspace** (Cliente): `nome`, `piano`, `creato_il`. Radice di ogni dato.
- **User**: `nome`, `email`, `ruolo` (admin | collaboratore). Appartiene a un Workspace. Matteo = admin, Luca = collaboratore.

### Spina dorsale (calendario & contenuti)
- **Block (Blocco)**: `etichetta periodo`, `consegna Luca` (data), `consegna Matteo` (data), `stato derivato`. Appartiene a un Workspace. Ha molti Content.
- **Content (Contenuto)**: `titolo`, `canale` (IG | YT), `tipo` (opz.), `data pubblicazione`, `hook`, `note`, `link materiali` (opz.), `stato derivato`. Campi performance *correnti*: views, reach, % non-follower, like, commenti, salvataggi, condivisioni, follow generati, **engagement rate (calcolato)**. Appartiene a un Workspace; il legame al Block è **opzionale** (i contenuti-evento ne stanno fuori, hanno solo la pubblicazione).
- **Comment (Commento)**: `autore` (User), `testo`, `data`. Può essere agganciato **a un Content o a un Block** (nota generale sulla settimana). Il thread tu↔Luca.
- **MetricSnapshot**: `data`, e i valori delle metriche dello stesso Content in un dato momento (7gg, 30gg, 90gg). Tiene lo **storico** performance; i campi "correnti" su Content restano per il colpo d'occhio.

### KPI (nascono dall'archivio)
- **Measurement** (snapshot settimanale account): `data`, `metrica`, `valore`, `serie` (Luca | Benchmark).
- **Benchmark** (riferimento di mercato): `metrica`, `valore`/`range`, `fonte`.
- **ValueConversation** (⭐ North Star): `data`, `chi/fonte`, `cosa`, `canale`, `link`.

### Supporto
- **GoogleSync** (mapping a una via): `tipo entità`, `id`, `googleEventId`, `ultimo_sync`. Mappa scadenze/pubblicazioni → eventi Google Calendar.

### Agganci futuri (modellati, non costruiti nel core)
- **Idea/Spunto** (Fase 2, da Telegram): `testo grezzo`, `struttura`, `stato`; può diventare un Content.
- **Cervello aziendale** (Fase 3): trascrizioni → nodi & archi del grafo (servizio Python separato).

---

## 4. Le due facce del contenuto

**Card nel calendario (leggera — per lavorare):**
Titolo · Canale · Data pubblicazione · Hook · Note · 💬 Commenti · etichetta Blocco · stato derivato. Nessun numero di performance.

**Scheda nell'archivio (completa — per misurare):**
Tutto quanto sopra · Tipo (opz.) · Link materiali (opz.) · Performance completa (views, reach, % non-follower, like, commenti, salvataggi, condivisioni, follow generati, ER calcolato) · storico (MetricSnapshot) · confronto **vs la media di Luca**.

---

## 5. Flussi principali

### 5.1 Flusso a blocchi (base, Instagram)
1. Si crea un **blocco** per un periodo (es. "Settimana 34") con i contenuti previsti (es. mar/gio/sab).
2. **Scadenza ①** — Luca consegna i materiali (giorno fisso, es. lunedì).
3. **Scadenza ②** — Matteo consegna il blocco revisionato (es. mar/mer).
4. Ogni **contenuto** ha la sua **data di pubblicazione** (gestita da Matteo).
5. **Eccezioni** (eventi one-off, time-sensitive): contenuto **senza blocco**, solo data di pubblicazione.

### 5.2 Ciclo di vita del contenuto e stato derivato
Lo stato non è manuale: si **deriva** dalle spunte delle scadenze + data di pubblicazione →
`Da consegnare → Consegnato → Revisionato → Pubblicato`.

### 5.3 Imbuto KPI
Per-contenuto (vs media di Luca) → account (vs benchmark) → **North Star** (conversazioni di valore). Cadenza: settimanale (Matteo, ~30 min), mensile (team), bimestrale (strategico).

### 5.4 Sincronizzazione Google Calendar (una via)
Il software spinge su un Google Calendar condiviso gli eventi "piatti" (consegne + pubblicazioni). Modifiche/cancellazioni nel software si riflettono su Google. Il **raggruppamento per blocco resta solo nel software**.

---

## 6. Architettura tecnica

| Pezzo | Scelta | Note |
|---|---|---|
| Linguaggio | TypeScript | Uno solo, UI + server |
| Framework | Next.js (App Router) | Un codebase, mobile-friendly, deploy push-and-go |
| Database | Postgres | Relazionale; fornitore deciso al deploy |
| ORM | Prisma | Schema dichiarativo, type-safe |
| Auth | Auth.js | In casa, nessun servizio esterno |
| UI | Tailwind + shadcn/ui | Componenti di alto livello |
| Calendario (UI) | da decidere in build | FullCalendar / react-big-calendar / custom |
| Hosting | Vercel o host di Luca | Cron/workflow per job programmati |

**Multi-tenant:** ogni query è scoped al `Workspace`. **Local-first:** dev in locale, deploy a richiesta.

**Quando arriva il "cervello aziendale" (Fase 3):** si aggiunge un **servizio Python dedicato** per trascrizioni + graph DB. L'architettura diventa ibrida *solo quando conviene*.

---

## 7. Moduli & fasi di build (= grafo Gantt Smart)

**Fase 1 — Core**
1. **Fondamenta** — Scaffold Next.js+Tailwind → DB Postgres+Prisma → Login Auth.js · Workspace multi-tenant → Shell UI. → *Risultato: app pronta (login + dati)*
2. **Contenuti & Blocchi** — Modello Blocco (2 scadenze) · Modello Contenuto → Relazione Blocco-Contenuto → Card leggera · Stato derivato · Commenti (contenuto+blocco). → *Risultato: i contenuti vivono nel sistema*
3. **Calendario** (la spina) — Componente calendario → Eventi (consegne+pubblicazioni) → Raggruppamento visivo blocco · Colori/filtri. → *Risultato: schermata Calendario operativa*
4. **Archivio** — Collezione contenuti → Filtri/ricerca · Scheda archivio+performance → Storico performance (snapshot). → *Risultato: archivio consultabile*
5. **KPI** — Performance vs media · Misurazioni settimanali+benchmark · Conversazioni di valore → Dashboard a imbuto. → *Risultato: dashboard KPI viva*
6. **Google Calendar Sync** — Connessione Google (OAuth, una via) → Push eventi+mapping → Aggiorna/cancella. → *Risultato: scadenze sul telefono di Luca*

**Dopo il core**
7. **Fase 2 — Integrazioni** — Bot Telegram → Idea inbox+AI → Da spunto a contenuto · Ingestione KPI da IG/YouTube. → *Risultato: Luca lavora da Telegram*
8. **Fase 3 — Cervello aziendale** — Trascrizione → Servizio Python+graph DB → Query avanzate. → *Risultato: cervello aziendale interrogabile*

**Ordine/dipendenze:** tutto parte da Fondamenta; il Calendario richiede Blocchi+Contenuti; i KPI richiedono l'Archivio; il Sync richiede gli Eventi del Calendario. Catena critica calcolata: 8 step.

---

## 8. Fuori scope / parcheggio (post-core)

1. **Curva di retention / tasso di visione** per contenuto — YouTube via API; Instagram non esposto secondo-per-secondo (manuale o aggregato). Rifinitura della scheda.
2. **Bot Telegram** + Idea inbox (Fase 2).
3. **Fasi extra YouTube** (consegna struttura/script + revisione Matteo, poi come Instagram).
4. **Upload diretto materiali** da parte di Luca (poi Vercel Blob o equivalente).
5. **Sync Google Calendar bidirezionale** (se in futuro serve trascinare eventi dentro Google).
6. **Replicabilità multi-cliente** completa (un calendario per cliente, onboarding nuovo workspace) — le fondamenta multi-tenant ci sono già.

---

## 9. Decisioni rimandate al momento della build (intenzionali)

- **Componente calendario UI:** FullCalendar vs react-big-calendar vs custom — si sceglie in base al look desiderato quando si costruisce il modulo Calendario.
- **Fornitore Postgres:** dipende dal setup/hosting di Luca; il codice è agnostico.
- **Fattibilità retention IG/YT:** da riverificare quando si costruisce la Fase 2 (le API cambiano).

---

## 10. Note

- Il repository `claudbot` non è (ancora) un repo git: questo documento non è committato. Si può inizializzare git quando si vuole versionare.
- Il grafo di sviluppo è già in Gantt Smart (progetto "SOFTWARE MARKETING") e va tenuto allineato a questo documento.
- Ritocco opzionale: riordinare le posizioni dei nodi in Gantt Smart per ridurre le sovrapposizioni di linee.
