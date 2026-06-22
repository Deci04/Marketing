# F3 — Chatbot agente condiviso

**Data:** 2026-06-23 · **Filone:** F3 (prima ondata; **build dopo il merge di F1/F2**) · **Tipo:** creativo → spec a monte + checkpoint a metà + audit finale
**Worktree:** `~/claudbot/wt/f3-chatbot` · branch `filone/f3-chatbot`
**Spec madre:** `2026-06-22-orchestrazione-fasi-design.md`

## Obiettivo
Un assistente sempre accessibile, in un **pannello laterale**, con una **chat condivisa e persistente** tra Matteo e Luca, che **agisce dentro la piattaforma** (crea blocchi/contenuti/pubblicazioni, ecc.) su richiesta in linguaggio naturale.

## Decisioni prese con l'utente
1. **Autonomia**: il bot **legge e propone liberamente**, ma **chiede conferma** prima di qualunque azione di **creazione / modifica / eliminazione** (almeno nella v1; allentabile dopo).
2. **Sequenziamento**: si costruisce **dopo il merge di F1 e F2** (gli strumenti del bot avvolgono il data layer che quei filoni stanno modificando). Prima del build: `npm install` nel worktree + **rebase di `filone/f3-chatbot` su `main` aggiornato**.
3. **Attribuzione**: ogni messaggio mostra **chi l'ha scritto** (nome di Matteo / Luca, oppure "Assistente").

## 1. Schema needs ⚠️ (applicati dalla torre prima del dispatch; il subagent NON crea migrazioni)
- **`ChatThread`**: `id`, `workspaceId`, `title String?`, `createdAt`. (v1: un thread condiviso di default per workspace; il modello regge più thread per il futuro.)
- **`ChatMessage`**: `id`, `threadId`, `workspaceId`, `role` (`"user" | "assistant" | "tool"`), **`authorId String?`** (User che ha scritto; null per l'assistente) + relazione a `User`, `content String`, `toolPayload Json?` (tool call/risultato proposti o eseguiti), `status String?` (`"proposed" | "confirmed" | "executed" | "rejected"` per le azioni), `createdAt`. Indici su `threadId`, `workspaceId`.
- Back-relation `chatMessages` su `User` (per l'attribuzione) e `threads`/`messages` su `Workspace`.

## 2. Persistenza & condivisione
- Chat **a livello di workspace**: tutti i membri vedono lo **stesso** thread con **tutti** i messaggi (di entrambe le persone + le risposte del bot). Nessun messaggio privato.
- Storico completo su DB; al caricamento del pannello si legge il thread condiviso (scoped al workspace via `scopedWhere`).

## 3. UI — pannello laterale
- **Slide-over a destra**, apribile da ogni pagina (toggle nello shell). Sempre accessibile.
- Lista messaggi con: **autore** (nome + iniziali/avatar; "Assistente" per il bot, stile distinto), **timestamp**, contenuto. Le risposte del bot sono in **streaming**.
- Per le **azioni proposte**: card "conferma azione" con riepilogo leggibile (es. *"Creo il blocco 'Settimana 26' con 3 contenuti, pubblicazione mar 30/6 — confermi?"*) + bottoni **Conferma / Annulla**. Finché non confermi, l'azione non viene eseguita.
- Input testuale; (voce/audio in chat → fuori scope v1).

## 4. Agente & strumenti (tool-calling)
- **Stack**: Vercel **AI SDK** + **Claude** (streaming + tool-calling). Il subagent leggerà gli skill/doc aggiornati (`ai-sdk`, `claude-api`) in fase di build — NON assumere API a memoria.
- **Strumenti di lettura** (eseguiti liberamente): elenco/ricerca blocchi, contenuti, calendario, KPI overview.
- **Strumenti di scrittura** (richiedono conferma, pattern human-in-the-loop dell'AI SDK): crea/aggiorna blocco; crea/aggiorna/elimina contenuto (inclusa performance); pianifica pubblicazione (CalendarEvent); aggiungi conversazione di valore; aggiungi commento; (assegna classe — da F2).
- Gli strumenti **avvolgono le funzioni del data layer esistente** (`src/lib/content.ts`, `calendar.ts`, `kpi.ts`, …) così la logica e lo scoping al workspace restano una sola fonte di verità. **Da rifinire contro il data layer MERGIATO** di F1+F2.
- Esecuzione lato server, sempre `scopedWhere(workspaceId)`; il bot non può uscire dal workspace.

## 5. Dipendenze esterne
- **API key Claude** (`ANTHROPIC_API_KEY` o via Vercel AI Gateway): dipendenza di Matteo/Luca (come Blob/account). Se assente al build, lasciare il collegamento pronto e la chat non-agentica degrada con un messaggio chiaro.

## 6. Fuori scope v1 (→ dopo / altri filoni)
- Messaggi vocali in chat e azioni via audio.
- Gestione multi-thread in UI (resta un thread condiviso).
- Ingestione KPI esterni da parte del bot (è F5).

## 7. Criteri di accettazione
- [ ] Pannello laterale apribile da ogni pagina; chat condivisa visibile a entrambi gli utenti.
- [ ] Ogni messaggio mostra chiaramente **chi l'ha scritto**; storico persistito e ricaricato.
- [ ] Il bot risponde in streaming e sa **leggere** lo stato (blocchi/contenuti/calendario/KPI).
- [ ] Le **azioni di scrittura** appaiono come proposta e si eseguono **solo dopo conferma**; vengono poi registrate (status executed).
- [ ] Le azioni passano dal data layer scoped al workspace; nessuna fuga cross-workspace.
- [ ] `npm run build` + `npm test` puliti; nessuna migrazione creata nel branch del filone.

## 8. Nota di processo
Essendo creativo, prevede un **checkpoint a metà** (shell chat + persistenza + attribuzione funzionanti, prima di cablare tutti gli strumenti di scrittura) oltre all'audit finale.
