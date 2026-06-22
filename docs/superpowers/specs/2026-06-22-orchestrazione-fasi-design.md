# Orchestrazione delle fasi — modello operativo & roadmap dei filoni

**Data:** 2026-06-22
**Contesto:** il tool di gestione contenuti per il personal brand di Luca (`content-tool`) cresce su molti fronti. Serve un modo per portarne avanti più pezzi **in parallelo, velocemente**, tenendo **questo terminale come riferimento centrale** e mantenendo la qualità. Questo documento definisce *come* lavoriamo (il modello) e *su cosa* (la decomposizione in filoni). Ogni filone avrà poi una sua spec + piano dedicati.

---

## 1. Modello operativo: **B — flotta di subagent + spec a monte + audit gate**

Un solo posto dove Matteo parla: **questo terminale (la torre di controllo)**. Il lavoro vero lo fanno **subagent** lanciati da qui, ognuno nel suo worktree isolato, che tornano per il giudizio.

Tre principi che lo rendono robusto:

1. **Spec a monte.** La parte creativa/dialogica (decisioni di prodotto, UX, confini) si fa **prima**, qui, insieme a Matteo, dentro la spec del filone. Il subagent **esegue una spec già decisa**, non improvvisa.
2. **Audit gate.** Quando un subagent finisce, la torre di controllo **revisiona** prima di integrare.
3. **Schema posseduto al centro.** Le migrazioni Prisma si serializzano da qui, mai nei worktree (vedi §4).

Perché B e non l'ibrido "a volte finestra, a volte subagent": l'ibrido è confusionario su chi possiede cosa. B tiene un unico centro di controllo e nessuna finestra da giostrare.

---

## 2. Ruoli & substrato

- **Torre di controllo = questo terminale.** Possiede: la roadmap master, la libreria spec/piani, il branch `main`, lo **schema Prisma/migrazioni**, l'audit e il merge. È dove Matteo pensa e decide le priorità.
- **Filone = git worktree + branch** `filone/<nome>` partito da `main`. File isolati → zero collisioni finché non si fa merge dalla torre. (`content-tool` è già un repo git; i worktree stanno fuori, es. `~/claudbot/wt/<filone>`.)

---

## 3. Dove vivono spec e piani

- `docs/superpowers/specs/<data>-<filone>-design.md` — spec per filone.
- `docs/superpowers/plans/<data>-<filone>.md` — piano per filone.
- `docs/ROADMAP.md` — **cruscotto vivo** dei filoni (stato, dipendenze, blocchi, ordine). Lo aggiorna la torre di controllo a ogni merge. *(Finché i filoni non partono, questo documento fa da roadmap; ROADMAP.md verrà estratto quando serve.)*
- **Gantt Smart** (`progetto "SOFTWARE MARKETING"`) resta lo specchio visuale dell'avanzamento.

---

## 4. Regola dello schema condiviso ⚠️ (la più importante)

Lo schema Prisma è l'unica risorsa davvero condivisa: due migrazioni in parallelo si scontrano.

- **Nessun subagent tocca le migrazioni** nel proprio worktree.
- Ogni spec dichiara in testa i **modelli/campi Prisma che le servono** ("schema needs").
- Prima dell'ondata parallela, **la torre applica tutte le migrazioni necessarie su `main` in un colpo**; i worktree partono da un `main` che ha già lo schema. I subagent scrivono solo **codice applicativo** contro modelli esistenti.
- Se a metà serve un campo nuovo → lo si chiede alla torre, viene aggiunto su `main`, il filone fa rebase.

---

## 5. Audit gate (cosa fa la torre quando un subagent finisce)

1. **Diff review** — ha toccato solo l'area del suo filone?
2. **`npm run build` + `npm test`** puliti.
3. **Far girare l'app** — verifica comportamentale, non solo "compila".
4. **Confronto con la spec** — requisiti soddisfatti?
5. Esito: ✅ merge su `main` · 🔧 correzione al volo dalla torre · ↩️ rimando al subagent con note.

Per i filoni **creativi** (chatbot, video/audio): **checkpoint a metà** prima di proseguire, non solo audit finale.

---

## 6. Ciclo di vita di un filone

```
brainstorm (qui, con Matteo) → spec → piano → [torre applica schema su main]
→ dispatch subagent in worktree → [checkpoint a metà se creativo]
→ audit gate → merge su main → aggiorno ROADMAP + Gantt
```

---

## 7. Contratto di autonomia

Bypass permissions **resta attivo di proposito**. La torre lavora in autonomia e si ferma **solo** a: (a) checkpoint a metà dei filoni creativi, (b) audit gate prima del merge, (c) vere forche di prodotto in fase di spec. Nessuno stop a caso.

---

## 8. Decomposizione in filoni

| # | Filone | Tipo | Stato | Dipende da / Blocco |
|---|--------|------|-------|----------------------|
| F1 | **KPI** — sistemare dashboard + KPI derivati/grafici + box movibili | meccanico | da fare | nessuno → pronto |
| F2 | **Tag storie & caroselli** — sul modello Content | meccanico, piccolo | da fare | nessuno → pronto |
| F3 | **Chatbot agente condiviso** — sidebar sempre accessibile, chat persistente e condivisa Matteo↔Luca, esegue azioni interne alla piattaforma | creativo, grande | da fare | nessuno → pronto (con checkpoint) |
| F4 | **Review video & audio sulle card** — commenti audio + upload video con anteprima/proxy + commenti al secondo preciso | creativo | da fare | **Blob ✅ sbloccato** (token in `.env`) |
| F5 | **Connessione account + raccolta KPI** — OAuth IG/YT/TikTok + ingestione analytics | integrazione esterna | da fare | **azione di Matteo**: app sviluppatore + approvazioni piattaforme |
| F6 | **Pubblicazione multi-piattaforma** — postare su IG/TikTok/YT | integrazione esterna | da fare | **azione di Matteo**: permessi/approvazioni (Content Publishing/Posting) |
| F7 | **Brainstorm UI/UX finale** — altre feature di miglioramento | esplorativo | dopo tutto | i filoni sopra |
| — | **Sync Google Calendar (one-way)** | — | parcheggiato | scelta di Matteo |

**Fondamenta condivise che bloccano più filoni:**
- **Blob storage** → ✅ sbloccato (sblocca F4 + upload file).
- **Connessioni account IG/YT/TikTok (OAuth + approvazioni)** → base di F5; F6 ne dipende a sua volta. Tempi di approvazione Meta/TikTok lunghi → **avviare presto la burocrazia**. F5 e F6 restano **filoni distinti** (prima connetti+leggi, poi pubblichi).

---

## 9. Decisioni aperte (da sciogliere nello spec del filone)

- **F4 — video: master intero vs solo anteprima compressa.** Approccio condiviso: generare sempre un **proxy/anteprima compressa** per la review (con commenti al secondo); decidere **separatamente** se conservare anche l'**originale a piena qualità** (e dove/limiti) o solo il proxy. La compressione tocca **solo** la copia di review, mai il master di pubblicazione. Decisione finale da prendere con Matteo nello spec di F4.

---

## 10. Prima ondata (parallela)

**Partono insieme:** **F1 (KPI)** · **F2 (Tag)** · **F3 (Chatbot)**.
- F1 e F2 sono meccanici → subagent + audit finale.
- F3 è creativo → spec ricca + subagent con checkpoint a metà.

**Secondo giro:** **F4 (video/audio)** — creativo e corposo, tenuto fuori dalla prima ondata per non avere due filoni creativi insieme al primo colpo. Tecnicamente già sbloccato (Blob).

**In avvio parallelo della burocrazia:** ricerca requisiti *attuali* di F5/F6 (lanciabile come subagent di ricerca) + setup app sviluppatore da parte di Matteo.

---

## 11. Prossimo passo

Scelta la prima ondata, per **ogni filone** si fa il ciclo di §6 a partire dal suo brainstorm dedicato. L'ordine di brainstorm suggerito: **F1 → F2 → F3** (i due meccanici prima, così partono i subagent mentre si disegna il chatbot).
