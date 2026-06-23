# F4 — Review video & commenti (audio + ancorati al minutaggio)

**Data:** 2026-06-23 · **Filone:** F4 (seconda ondata; **build dopo F3**, è creativo) · **Tipo:** creativo → checkpoint a metà + audit finale
**Worktree:** `~/claudbot/wt/f4-video` · branch `filone/f4-video`
**Spec madre:** `2026-06-22-orchestrazione-fasi-design.md`

## Obiettivo
Rendere la review dei contenuti video collaborativa e precisa: si guarda il video nella scheda del contenuto, e i **commenti** (testo **o audio**) sono **ancorati al secondo** del video.

## Decisioni prese con l'utente
1. **Commenti audio**: oltre al testo, si possono inviare **messaggi vocali** registrati, ascoltabili da Matteo e Luca nella conversazione del contenuto.
2. **Commenti ancorati al minutaggio**: sotto il video una **timeline stilizzata**; spostandosi a un punto (es. 0:30) il commento viene creato a quel secondo; cliccando un commento il video salta a quel punto.
3. **Storage video**: il **master pesante NON si carica** nel tool. Si ospita solo un **proxy compresso** per far funzionare player + timeline. In più, campo **link al master esterno** (Luca condivide su Drive/album iPhone): se c'è il link → percorso **C** (proxy + link); se non c'è → percorso **A** (solo proxy).

## 1. Schema needs ⚠️ (applicati dalla torre prima del dispatch; il subagent NON crea migrazioni)
- **`Comment`**: aggiungere `audioUrl String?` (commento vocale su Blob) e `videoTimestamp Float?` (secondo del video a cui è ancorato; null = commento generico).
- **`Content`**: aggiungere `videoProxyUrl String?` (proxy di review su Blob) e `masterLink String?` (link al master esterno, percorso C).

## 2. Upload & proxy video
- Caricamento del video → **compressione lato client** in un **proxy** leggero (target ~720p / bitrate ridotto) PRIMA dell'upload, poi `put` su **Vercel Blob** (`BLOB_READ_WRITE_TOKEN` già in env). Il master a piena qualità non entra nel tool.
- *Nota tecnica:* la transcodifica server-side su Vercel è limitata → fare la compressione **nel browser** (es. `ffmpeg.wasm` o re-encode via `MediaRecorder`/canvas). Il subagent valuti l'approccio più semplice e robusto per clip brevi e lo documenti; se la compressione client non è praticabile, ripiego: caricare il file così com'è con un limite di dimensione + avviso (e segnalarlo).
- Campo **link al master** (incolla URL Drive/iCloud) sempre disponibile (percorso C).

## 3. Player + timeline + commenti ancorati
- Player HTML5 del **proxy** nella scheda contenuto (tab dedicata "Video"/"Review" nel `content-modal`, o sezione nel dettaglio).
- **Timeline stilizzata** sotto il video: mostra i commenti come marker al loro `videoTimestamp`; lo scrub aggiorna il "punto corrente".
- Creazione commento: il nuovo commento (testo o audio) prende il **timestamp corrente** del player; click su un commento → `seek` a quel secondo.

## 4. Commenti audio
- Registrazione via browser (`MediaRecorder`) → blob audio → `put` su Vercel Blob → salvato come `Comment.audioUrl` (+ eventuale `videoTimestamp`).
- Player audio inline nella lista commenti; visibile a entrambi gli utenti (i commenti sono già scoped al workspace e condivisi).

## 5. Pattern da rispettare
- Multi-tenant `scopedWhere` + `currentContext`; DB `src/lib/db.ts`; estendere `addComment` (`src/lib/content.ts`) per `audioUrl`/`videoTimestamp`.
- Design: token `globals.css`, Phosphor, toast `sonner`. **Next.js 16** — leggere `AGENTS.md` + doc in `node_modules/next/dist/docs/`.
- Upload Blob: seguire lo skill/doc `vercel-storage` (API aggiornata), non a memoria.

## 6. Fuori scope F4
- Pubblicazione del video sui social (è F6). Editing video. Trascrizione automatica degli audio.

## 7. Checkpoint a metà (creativo)
Fermarsi quando **upload proxy + player + timeline + commenti testo ancorati** funzionano, PRIMA di aggiungere i **commenti audio** (registrazione), per review.

## 8. Criteri di accettazione
- [ ] Carico un video → si genera/ospita un proxy e lo vedo nel player; il master pesante non è nel DB.
- [ ] Posso incollare un link al master esterno (percorso C); senza link funziona comunque (A).
- [ ] Creo un commento testo ancorato a un secondo; cliccandolo il video salta lì.
- [ ] Posso registrare e inviare un **commento audio**, ascoltabile da entrambi.
- [ ] `npm run build` + `npm test` puliti; nessuna migrazione creata nel branch.
