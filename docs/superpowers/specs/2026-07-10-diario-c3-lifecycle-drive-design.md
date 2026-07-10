# Spec C3 — Diario: lifecycle R2 + archivio Google Drive

> Data: 2026-07-10. Terza fase del filone C (dopo C1 storage/chat e C2 riorganizza).
> Policy definita da Matteo. Richiede il setup Google Drive (Shared Drive + service account).

## Vincolo
Lo storage HOT è **Cloudflare R2**, free tier **10 GB**. Il Postgres (Neon) tiene solo **metadati**
(righe piccole), NON i media. Quindi il tetto da gestire è R2. Soglia soft di lavoro: **~9 GB**.

## Policy di retention (2 categorie)
- **Raw di Luca (main + B-roll)**: hot su R2 a breve (~pochi giorni / 1 settimana), poi archiviati su
  **Google Drive** come *raw*, in **cartelle `main/` e `broll/`** (la classificazione main vs B-roll
  arriva da C2 — la "Riorganizza informazioni").
- **Contenuti editati (montati)**: restano hot **più a lungo**; i **più vecchi** vengono archiviati su
  Drive come *editati* quando R2 si avvicina ai 9 GB. R2 si libera.

## Meccanica (importante)
- Il **lifecycle nativo di R2 è a TEMPO e può solo CANCELLARE**, non spostare su Drive. Quindi:
  - **Archiviazione R2→Drive**: la fa un **job dell'app** (Vercel Cron, es. giornaliero) che (a) misura
    l'uso di R2, (b) se ≥ soglia (o per età), prende i più vecchi, li **streamma R2→Drive** (egress R2 $0),
    aggiorna la `DiaryEntry`/record (`driveFileId`, `archivedAt`, azzera `r2Key`), poi **cancella da R2**.
    Ordine di sfratto: prima i **raw** più vecchi, poi gli **editati** più vecchi.
  - **Lifecycle nativo R2**: solo **rete di sicurezza** (expiration su `raw/` dopo X giorni) per pulire
    l'eventuale raw dimenticato **dopo** che è già stato archiviato — mai come unico meccanismo.
- **Lettura post-archivio**: se un media è su Drive, il proxy di lettura serve il link Drive invece di R2.

## Setup richiesto (gate)
- **Shared Drive** sul Workspace aziendale di Luca + **service account** membro (niente gotcha quota).
- Env: credenziali service account, id dello Shared Drive, ids/paths cartelle (`raw/main`, `raw/broll`, `editati`).
- Decisione da confermare al momento: soglia esatta (9 GB?), età raw (7 gg?), cadenza cron.

## Dipendenze
- C2 fornisce la classificazione **main vs B-roll** (necessaria per la struttura cartelle raw su Drive).
- I "contenuti editati" arrivano dal flusso di montaggio/pubblicazione (fuori dal Diario): l'aggancio
  editati→Drive è una seconda parte, dopo il raw.

## Fuori scope
Creazione `Content`, pubblicazione. Qui solo storage lifecycle + archivio.
