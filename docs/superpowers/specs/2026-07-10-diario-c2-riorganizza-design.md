# Spec C2 — Diario: "Riorganizza informazioni"

> Data: 2026-07-10. Segue C1 (raccolta come chat + upload R2, fatto/verificato).
> Riusa l'infra AI esistente (`@ai-sdk/anthropic`, vision già presente in `diary-vision.ts`).

## Obiettivo

Un bottone **"Riorganizza informazioni"** (lo preme **Matteo**) che guarda **tutta la conversazione**
del Diario — file condivisi + testo detto nel mentre + audio — e produce delle **schede informative
per contenuto**: raggruppa i media in **contenuti distinti**, capisce cosa è **contenuto principale** e
cosa è **clip di contesto/abbellimento (B-roll)**, e per ogni contenuto dà un **brief** (contesto /
intento / cosa dice / messaggio) + il **download di tutte le risorse media** di quel contenuto (i file
veri, per montare). **Non crea `Content` nel tool** — sono brief + bundle di materiale.

## Cosa produce (per ogni scheda = un contenuto proposto)
- **Titolo** breve del contenuto.
- **Brief a 4 facce**: Contesto (dov'è) · Intento (cosa vuole) · Cosa dice (nota/transcript) · Messaggio (cosa vuole trasmettere).
- **Ruolo dei media**: quali sono il/i **principale/i** e quali **contesto/B-roll**.
- **Download risorse**: i file media del contenuto (foto/video), scaricabili — **zip per scheda**.

## Input (dalla chat C1)
Le `DiaryEntry` del workspace: `rawText`/`caption` (testo), `mediaType` + `mediaUrl`/`r2Key` (foto/video/audio),
`aiTitle`/`aiDescription` (vision foto già calcolata all'ingestion, se presente).

## Pipeline AI
1. **Vision foto**: descrizione per ogni immagine (riuso `describePhoto` di `diary-vision.ts`; se
   `aiDescription` già c'è, non ricalcolare).
2. **Video**: Claude non ingerisce video → il "capire il video" si basa su **testo/audio di contesto** +
   nome file (+ opz. una **thumbnail-frame** via vision in un secondo momento). Per l'MVP: contesto testuale.
3. **Audio → transcript** (vedi Decisione D3 sotto).
4. **Sintesi/raggruppamento** con **`generateObject`** (structured output, schema Zod): input = elenco
   media (con descrizione/ruolo-candidato) + messaggi testo + transcript → output = array di schede
   (titolo, brief 4 facce, media[] con ruolo principale/contesto).

## Decomposizione / fasi
- **C2a (senza nuove dipendenze)**: Riorganizza su **testo + foto** → schede raggruppate + brief +
  **download zip** delle risorse per scheda. È il cuore, costruibile subito.
- **C2b**: **transcript audio** integrato nella sintesi (vedi D3, richiede setup provider).
- **C2c (opz.)**: thumbnail-frame dei video per la vision; persistenza delle schede.

## Decisioni (default + da confermare)
- **D-model**: sintesi con `generateObject` su **`claude-sonnet-5`** (equilibrio costo/qualità su volumi),
  vision su `claude-opus-4-8` (com'è ora). *Default.*
- **D-download**: **zip per scheda** (una route che prende i media di quel contenuto da R2, li zippa e li
  streamma). Serve una lib zip lato server (es. `archiver`). *Default.*
- **D-persistenza**: MVP **effimero** — la Riorganizza si ricalcola al click (Matteo la lancia quando il
  materiale è pronto). Persistenza delle schede → C2c. *Default.*
- **D3 — Audio (transcript) — la scelta operativa:** il transcript serve **lato server** al click di
  Riorganizza, quindi la trascrizione on-device (Web Speech) non basta (e su Safari è inaffidabile).
  Opzione **(a)**: provider server con **free tier** — **Groq Whisper** (`@ai-sdk/groq`, chiave free) via
  `experimental_transcribe`. Opzione **(b)**: rimandare l'audio (C2b) e partire con testo+foto (C2a).
  *Proposta: **C2a ora senza audio**; per l'audio serve una **chiave Groq free** (setup tuo, come R2) →
  poi C2b.* ← da confermare.

## File (C2a)
- `src/lib/diary-organize.ts` (nuovo): pipeline pura/testabile — costruzione prompt, schema Zod delle
  schede, mapping entries→input. `generateObject` isolato dietro una funzione iniettabile (test con mock).
- `src/app/(app)/diario/actions.ts`: `organizeDiaryAction()` → esegue la pipeline, ritorna le schede.
- `src/app/api/diario/download/[schedaId]/route.ts` (o action): zip dei media della scheda da R2.
- UI: bottone **"Riorganizza informazioni"** nel Diario + pannello schede (brief + media + "Scarica zip").

## Testing
- Unit: mapping entries→input, schema/parse delle schede, raggruppamento con `generateObject` **mockato**
  (verifica shape), costruzione del prompt. Zip: lista chiavi corrette per scheda.
- Browser-verify (Matteo): carica materiale misto → Riorganizza → schede sensate → scarica lo zip.

## Fuori scope
Creazione di `Content`, pubblicazione, archivio Drive (C3).
