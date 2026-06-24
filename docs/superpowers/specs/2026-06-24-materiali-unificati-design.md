# Materiali unificati — galleria foto/video con review

> Stato: **spec approvata** (approccio A + 4 decisioni). Data: 2026-06-24.
> Estende F4 (review video). Branch: `filone/f-materiali`.

## Contesto e obiettivo

Oggi, dentro la card di un contenuto, ci sono **due tab separate che si sovrappongono**:

- **"Video"** (`VideoReview`): carica un proxy video compresso → player + timeline + commenti
  ancorati al minutaggio + note vocali.
- **"Materiali e commenti"**: carica **una sola** immagine di anteprima (`thumbnailUrl`) + un
  link materiali esterno (`materialsUrl`), più una lista piatta di commenti.

Concettualmente fanno la stessa cosa (carichi un media). L'obiettivo è **fonderle in un'unica tab
"Materiali"** che si adatta al tipo di contenuto social di Luca:

- **post singolo** → 1 foto;
- **carosello** → più foto;
- **reel / video lungo** → 1 video con timeline commentabile.

La modalità di visualizzazione si **deduce dai materiali caricati** (foto vs video), non dal campo
`format` (che è opzionale, non ha un valore "foto singola", e resta solo metadato/etichetta).

## Decisioni approvate

1. **Commenti**: ancorati al minutaggio quando c'è un video; piatti (lista unica condivisa, come
   oggi) per foto/caroselli. *Niente* commenti ancorati alla singola foto del carosello.
2. **Un contenuto = foto _oppure_ video**, non misto. Se è presente un video → modalità reel;
   altrimenti galleria di foto.
3. **Le 2 tab diventano 1**: "Materiali" (media + commenti insieme). Restano "Panoramica" e
   "Performance". Sparisce la tab "Video" e la vecchia "Materiali e commenti".
4. **Master esterno** (`masterLink`) e **link materiali** (`materialsUrl`) restano come campi
   opzionali dentro la tab Materiali.

## Modello dati

Nuova tabella `Material` (molti per contenuto, ordinati):

```prisma
model Material {
  id        String   @id @default(cuid())
  contentId String
  content   Content  @relation(fields: [contentId], references: [id], onDelete: Cascade)
  kind      String   // "image" | "video"
  url       String   // Blob URL (immagine, oppure proxy video)
  order     Int      @default(0)
  createdAt DateTime @default(now())

  @@index([contentId])
}
```

- `Content.materials Material[]` (relazione inversa).
- **Copertina**: si mantiene `Content.thumbnailUrl` come campo *denormalizzato*, perché è usato
  dalle card nelle liste/calendario (`content-card.tsx`) e dall'archivio. Viene **ricalcolata
  automaticamente** a ogni modifica dei materiali: = URL della prima foto (`order` minore); se non
  ci sono foto ma c'è un video, resta `null` (poster video = follow-up, fuori scope).
- `Content.videoProxyUrl` viene **deprecato** a favore del `Material` di tipo `video`. Lo si può
  lasciare in schema durante la migrazione e rimuovere in un secondo momento, oppure rimuovere
  subito dopo il backfill (decisione nel piano).
- `Content.masterLink` e `Content.materialsUrl` **restano** invariati.
- `Comment.videoTimestamp` **resta** invariato (ancoraggio al video).

### Migrazione / backfill

Migrazione Prisma + script di backfill idempotente:

- per ogni `Content` con `thumbnailUrl` non nullo → crea `Material{ kind:"image", url, order:0 }`
  se non già presente;
- per ogni `Content` con `videoProxyUrl` non nullo → crea `Material{ kind:"video", url, order:0 }`
  se non già presente;
- `thumbnailUrl` resta valorizzato (è la copertina), coerente con la regola di ricalcolo.

## UI — tab "Materiali"

Sostituisce le tab "Video" e "Materiali e commenti". Struttura dall'alto:

1. **Uploader unico**: "Aggiungi foto o video" (`accept="image/*,video/*"`). Più file per le foto;
   un solo file per il video. Se l'utente carica un video mentre ci sono foto (o viceversa),
   mostriamo un avviso (decisione 2: un contenuto è foto *oppure* video) e chiediamo conferma di
   sostituzione. *(Dettaglio UX da rifinire nel piano.)*
2. **Display adattivo**:
   - **Video presente** → riusa `VideoReview` (player + timeline + commenti ancorati + note
     vocali). La sorgente del player diventa il `Material` video invece di `content.videoProxyUrl`.
   - **Foto** → **galleria**: 1 foto = anteprima singola grande; >1 foto = carosello con miniature
     ordinabili (riordino = aggiornamento `order`) ed eliminabili.
3. **Commenti** (sotto al media): un'unica lista condivisa, come oggi. Ancorati al minutaggio solo
   in modalità video (il campo timestamp è popolato dal player); piatti per le foto.
4. **Link esterni** (in fondo, opzionali): `masterLink` (master pesante Drive/iCloud) e
   `materialsUrl` (cartella materiali). Invariati.

La pipeline di upload (compressione proxy lato browser → `uploadViaServer` → `/api/video-upload`
→ Blob) resta quella corrente, già corretta per i bug di content-type e localhost.

## Server actions

- `addMaterialAction(contentId, kind, url)` — crea una riga `Material` con `order` = max+1, poi
  ricalcola la copertina.
- `removeMaterialAction(materialId)` — elimina la riga (e il blob? → vedi sotto), poi ricalcola.
- `reorderMaterialsAction(contentId, orderedIds[])` — aggiorna `order`, poi ricalcola copertina.
- Helper interno `recomputeCover(contentId)` — `thumbnailUrl` = prima foto per `order`, else `null`.
- Le action esistenti `setVideoProxyAction` / `setThumbnailAction` vengono sostituite/riadattate a
  questo modello (il proxy video diventa un `Material kind:"video"`).
- **Pulizia blob**: alla rimozione di un materiale si elimina anche il blob su Vercel Blob
  (`del`), per non lasciare orfani. *(Da confermare nel piano: best-effort, non bloccante.)*

## Vincoli noti / non-goal

- **Limite body in produzione**: l'upload passa dal server (`/api/video-upload`), quindi in
  produzione i video oltre il tetto di body delle Vercel Functions falliranno. In locale non è un
  problema. **Follow-up separato** quando si va online: upload diretto client→Blob in produzione,
  server-side in dev.
- **Non-goal (YAGNI)**: commenti ancorati alla singola foto del carosello; poster/thumbnail
  generata dal video; materiali misti (foto + video nello stesso contenuto); editing immagini.

## Verifica (browser-verify prima del merge)

1. Post singolo: carica 1 foto → appare in galleria; la card in lista mostra la copertina.
2. Carosello: carica 3 foto → carosello con miniature; riordino aggiorna copertina; elimina una.
3. Reel: carica un video → compressione, upload, player + timeline; commento ancorato a un minuto.
4. Commenti piatti su un contenuto-foto; note vocali sul video.
5. Backfill: i contenuti esistenti (con thumbnail/proxy) mostrano i materiali corretti dopo la
   migrazione.
6. `tsc` + `eslint` puliti; verifica end-to-end nel browser su localhost.
