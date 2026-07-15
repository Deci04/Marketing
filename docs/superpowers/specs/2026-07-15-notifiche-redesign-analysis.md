# Redesign del sistema di notifiche — Analisi di design

**Data:** 2026-07-15
**Tipo:** analisi di design (NON implementazione)
**Scope:** superficie "Da fare adesso" in home + notifiche push sul dispositivo
**Autore intento prodotto:** Matteo (titolare), input da Luca (creator/collaboratore)

---

## 0. Executive summary

Oggi la home genera gli item "Da fare adesso" con `homeActions()` in `src/lib/workflow.ts`. Per Luca produce **una riga per ogni valore intero distinto di `daysUntil(block.lucaDeliveryAt)`**, ma la funzione che compone il testo (`deadlineText`) **collassa tutti i giorni in ritardo (`d < 0`) nella stessa identica frase** "Sei in ritardo: consegna i prossimi N Reel". Risultato: due blocchi scaduti in giorni diversi generano due righe **byte-identiche**. In più non c'è nessun tetto al numero di righe, e la riga "montato da revisionare" si somma alle deadline: da qui la percezione di caos e assillo.

C'è anche un **bug logico di prodotto grave**: quando Luca preme "consegna materiale" (`setDelivered` → `deliveredAt`), la notifica di deadline **non sparisce**, perché `lucaDeadlineGroups` filtra su `workflowState(c) !== "Da fare"` e `workflowState` **ignora completamente `deliveredAt`** (guarda solo `confirmedAt` e `hasMontato`). Il ciclo "consegna → la notifica sparisce" che Matteo descrive semplicemente non è cablato.

Infine esistono **due modelli di stato paralleli e incoerenti** (`workflowState` a 3 stati event-based vs `deriveStatus` a 4 stati date-based): la home usa il primo, le card usano il secondo. Vanno riconciliati.

Per il push: **non esiste alcuna infrastruttura Web Push / PWA / service worker** nel repo (nessun `manifest`, nessun service worker, `web-push` non è tra le dipendenze). L'unico canale "fuori piattaforma" già presente è **Telegram** (`notifyTelegramForActivity` in `src/lib/activity.ts`), event-based e funzionante. La strada raccomandata è un modello ibrido: Telegram come push affidabile immediato + Web Push PWA come canale nativo, con i limiti noti di iOS Safari.

---

## 1. Come funziona il sistema OGGI (meccanismo preciso)

### 1.1 Due superfici distinte di "notifica"

Il sistema ha **due superfici indipendenti**, spesso confuse tra loro:

| Superficie | Sorgente dati | Modello | File |
|---|---|---|---|
| **Campana + feed "Notifiche"** | tabella `Activity` (eventi storici) | event log immutabile | `src/lib/activity.ts`, `src/app/(app)/notifiche/page.tsx`, `src/components/notification-bell.tsx` |
| **"Da fare adesso" (home)** | stato *corrente* dei `Content` (calcolato al volo) | derivato, non persistito | `src/lib/workflow.ts`, `src/app/(app)/home/page.tsx` |

Sono due cose diverse: il feed è **cronologia** ("Luca ha consegnato…"), "Da fare adesso" è **task list corrente**. Il redesign riguarda soprattutto la seconda, ma il push (parte 2) nasce dalla prima.

### 1.2 Il feed Activity + campana (event log)

- **Modello dati** (`prisma/schema.prisma`): `model Activity { type: ActivityType, contentId?, actorId?, workspaceId, createdAt }`. `ActivityType = DELIVERED | REVIEW_READY | CONFIRMED | COMMENT | CREATED`.
- **Generazione:** `createActivity(workspaceId, {type, contentId, actorId})` in `src/lib/activity.ts`. Chiamata dalle server action in `src/app/(app)/contenuti/actions.ts`:
  - `markDeliveredAction` → `DELIVERED`
  - `setVideoProxyAction` / `addMaterialAction` → `REVIEW_READY` (solo se non aveva già un montato: guardia `contentHasMontato`)
  - `confirmContentAction` → `CONFIRMED`
  - `addCommentAction` / `addAudioCommentAction` → `COMMENT`
  - `createContentAction` → `CREATED`
- **Campana:** `unreadCount(workspaceId, userId, seenAt)` conta le Activity di **altri** utenti (`actorId != userId`) create dopo `User.notificationsSeenAt`. Renderizzata in `src/app/(app)/layout.tsx` (server) → `<NotificationBell count={unread} />`. Aprendo `/notifiche`, `<SeenMarker>` chiama `markNotificationsSeenAction` → `setNotificationsSeen` aggiorna `notificationsSeenAt`, azzerando il badge.
- **Push esterno (Telegram):** `createActivity` chiama best-effort `notifyTelegramForActivity(activity)`. Solo i tipi in `PUSH_TYPES = {DELIVERED, REVIEW_READY, CONFIRMED, COMMENT}` (NON `CREATED`) generano un messaggio Telegram, inviato a tutti i membri del workspace **diversi dall'actor** che hanno un `telegramChatId` collegato. Testo composto da `composeText()`. Invio via `sendMessage` (`src/lib/telegram.ts`, Bot API `sendMessage` con `parse_mode: HTML`). Collegamento chat via codice `/start <code>` (`src/lib/telegram-link.ts`, campo `User.telegramChatId @unique`).

Questo canale è **event-based, già funzionante e affidabile**: è la base su cui costruire la parte 2.

### 1.3 "Da fare adesso" — il generatore (dove nasce il problema)

Tutto passa da `homeActions(contents, role, now)` in `src/lib/workflow.ts`, invocata da `src/app/(app)/home/page.tsx` (riga ~45). Il ruolo è binario: `ctx.user.isAdmin ? "matteo" : "luca"`.

**Stato di workflow usato** — `workflowState(c)` (righe 5–12):
```
if (c.confirmedAt) return "Confermato";
if (c.hasMontato)  return "Da revisionare";   // hasMontato = videoProxyUrl != null || _count.materials > 0
return "Da fare";
```
Nota: **`deliveredAt` non compare qui.**

**Ramo Matteo (admin):** una sola riga: `"{N} contenuti da montare"` per tutti i `Content` in stato `"Da fare"` (urgency fissa 50). Semplice, non è il problema principale.

**Ramo Luca (collaborator):** è la fonte del caos. Due blocchi di righe, concatenati e ordinati per urgenza:

1. **Deadline di consegna** — `lucaDeadlineGroups(contents, now)` (righe 75–109):
   - Prende solo i `Content` con `workflowState === "Da fare"` **e** un `block.lucaDeliveryAt` non nullo, entro `DEADLINE_WINDOW_DAYS = 7` giorni (i ritardati `d < 0` sono sempre inclusi).
   - **Raggruppa in bucket per il valore intero di `d = daysUntil(lucaDeliveryAt, now)`.** Ogni bucket = una riga.
   - Il testo è prodotto da `deadlineText(g)` (righe 122–141).

2. **Montati da revisionare** — tutti i `Content` con `workflowState === "Da revisionare"`, aggregati in **una** riga `"{N} montat{o|i} da revisionare"` (urgency 100).

### 1.4 PERCHÉ risulta ripetitivo e confuso — causa esatta nel codice

**Causa A — righe byte-identiche per i ritardi (il "ripetuto più volte").**
`deadlineText` per `g.daysUntil < 0` ritorna:
```
`Sei in ritardo: consegna i prossimi ${g.count} ${g.noun}`
```
**Non include il valore del giorno.** Ma i bucket sono chiavati sul valore *esatto* di `d`. Quindi due blocchi scaduti in giorni diversi (es. `d = -2` e `d = -5`), entrambi con 3 REEL, producono **due bucket distinti** → **due righe con testo identico** "Sei in ritardo: consegna i prossimi 3 Reel". Ecco l'assillo duplicato descritto da Matteo. Stessa dinamica per due blocchi futuri con `d` diverso: "Hai 7 giorni…" convive con "Sei in ritardo…" → percezione di ridondanza.

**Causa B — nessun tetto al numero di righe.**
`homeActions` per Luca fa `lucaDeadlineGroups(...).map(...)` (N righe, una per bucket) **+** eventuale riga "montati da revisionare". Non esiste alcuna regola "max 1–2": se ci sono 3 deadline-day distinti + 1 revisione, si vedono 4 righe. Il requisito di Matteo "MAX 1–2 notifiche" non esiste in codice.

**Causa C — la notifica NON sparisce quando Luca consegna (bug di prodotto).**
Il ciclo che Matteo vuole ("Luca consegna il materiale → la notifica sparisce") non è cablato. `markDeliveredAction` chiama `setDelivered` → imposta `Content.deliveredAt`. Ma `lucaDeadlineGroups` filtra su `workflowState(c) !== "Da fare"`, e `workflowState` **ignora `deliveredAt`**: guarda solo `confirmedAt` e `hasMontato`. Quindi dopo la consegna il contenuto resta `"Da fare"` e **continua a comparire nella deadline**. La notifica di ritardo persiste anche dopo che Luca ha fatto la sua parte → esattamente il comportamento da "assillo" lamentato.

**Causa D — granularità sbagliata (contenuto vs blocco).**
Matteo vuole comunicare per **blocco** ("Siamo nel blocco X: in 7 giorni 3 video da registrare"), con una **conferma a livello di blocco**. Oggi:
- Il `Block` ha solo date (`lucaDeliveryAt`, `matteoDeliveryAt`, `startDate`, `endDate`, `label`) e **nessuno stato di avanzamento** (niente `deliveredAt`/`confirmedAt`/`producedAt` sul blocco).
- Le deadline sono raggruppate per *data*, non per *blocco*: `lucaDeadlineGroups` non usa mai `blockId` né `block.label`, solo `block.lucaDeliveryAt`. Il nome del blocco non arriva mai in home.
- Non esiste azione "conferma blocco". La conferma esiste solo per-contenuto (`confirmContentAction`), che nel modello riguarda il *montato*, non la consegna del materiale.

**Causa E — due modelli di stato incoerenti.**
- `workflowState` (`workflow.ts`): 3 stati **event-based** (`Da fare` / `Da revisionare` / `Confermato`) da `confirmedAt` + `hasMontato`. Usato dalla home.
- `deriveStatus`/`effectiveStatus` (`src/lib/status.ts`): 4 stati **date-based** (`Da consegnare` / `Consegnato` / `Revisionato` / `Pubblicato`) calcolati dal *passaggio* delle date (`publishAt`, `matteoDeliveryAt`, `lucaDeliveryAt`). Usato dalle card/badge.

Sono due verità diverse sullo stesso contenuto. `deriveStatus` è per giunta **date-derived** (una data passata "avanza" lo stato anche senza che nessuno abbia fatto nulla — noto anche in memoria progetto come "date-derived status" gotcha). Il redesign deve scegliere una sola sorgente di verità event-based.

### 1.5 Superficie push oggi

- **In-app:** solo la campana (badge server-rendered, si aggiorna al reload/navigazione — nessun realtime).
- **Fuori piattaforma:** solo **Telegram** (vedi 1.2).
- **Web Push / PWA:** **assente**. Nessun `public/manifest.webmanifest`, nessun service worker, nessun `web-push`/`serwist`/`next-pwa` in `package.json`, nessun campo per salvare `PushSubscription`. `public/` contiene solo SVG. Nessun `applicationServerKey`/VAPID.

---

## 2. Tre approcci di redesign (primo giro)

Obiettivi condivisi da tutti: (i) comunicare **compiti per blocco**, non assillo sul ritardo; (ii) **max 1–2** item; (iii) ciclo **consegna materiale → conferma → l'item sparisce**; (iv) push sul dispositivo.

### Approccio A — "Task per blocco con stato persistito sul Block"

**Idea:** promuovere il `Block` a unità di notifica con stato di avanzamento proprio.

- **Dati:** aggiungere a `Block` uno stato di produzione Luca: `lucaDeliveredAt: DateTime?` (Luca ha consegnato il materiale del blocco) e `producedConfirmedAt: DateTime?` (blocco chiuso). Opzionale `producedCount`/target.
- **Home:** un solo item per blocco "attivo" (finestra ≤7g o in corso): "Blocco «{label}»: {N} {formato} da registrare entro {data}". Con CTA "Ho consegnato il materiale" → set `lucaDeliveredAt` → l'item passa a "in lavorazione da Matteo" o sparisce dalla lista di Luca.
- **Regola max 1–2:** mostra solo il blocco corrente più urgente (+ eventuale "montati da revisionare" come seconda riga).
- **Push:** riusa `createActivity` → aggiungere `BLOCK_DUE`/tipi blocco al canale Telegram esistente; Web Push in fase 2.

### Approccio B — "Notification store persistito + regole di dedup/priorità"

**Idea:** smettere di calcolare gli item al volo; introdurre una tabella `Notification`/`Task` persistita con dedup key, priorità e stato (open/done/snoozed). Un layer di "reconciler" la mantiene allineata agli eventi di dominio.

- **Dati:** `model Notification { workspaceId, userId?, kind, dedupeKey @unique, title, body, entityType, entityId, priority, state, snoozeUntil, createdAt, resolvedAt }`.
- **Generazione:** funzione `reconcileNotifications(workspace)` idempotente (chiamata dopo ogni mutation e/o da cron): calcola il set desiderato (per blocco/deadline/revisione), fa upsert per `dedupeKey`, chiude quelle non più valide. La home legge le top-2 per priorità/utente.
- **Regola max 1–2:** query `take: 2 order by priority`. Il resto resta consultabile in una vista "tutto".
- **Push:** ogni notifica "aperta" nuova → fan-out su canali (Telegram ora, Web Push poi). Stato `state` evita ri-notifiche.

### Approccio C — "Minimal fix + Web Push, niente nuovo modello"

**Idea:** correggere i bug di `workflow.ts` senza toccare il data model (se non un campo), e aggiungere il push come layer separato.

- **Fix generatore:** (1) far entrare `deliveredAt` in `workflowState` così la consegna rimuove l'item; (2) **una sola riga di deadline** (aggregare tutti i "Da consegnare" imminenti in un unico item, senza bucket per giorno); (3) cap a 2 righe in `homeActions`; (4) mostrare il nome del blocco.
- **Ciclo conferma:** riusare `markDeliveredAction` come "conferma consegna" a livello contenuto; l'item sparisce perché ora `workflowState` considera `deliveredAt`.
- **Push:** modulo `web-push` nuovo, indipendente da `workflow.ts`, agganciato allo stesso hook di `createActivity`.

---

## 3. Confutazione avversariale + miglioramento (giro 1)

### A — critiche
- **Contenuti fuori blocco:** molti `Content` hanno `blockId = null` (il campo è opzionale, il seed non popola blocchi). Un modello "solo blocco" perde tutti i contenuti orfani → item persi. **Fix:** fallback: i contenuti senza blocco confluiscono in uno pseudo-blocco "Sciolti" o restano gestiti dalla logica per-contenuto.
- **Duplicazione stato:** aggiungere `lucaDeliveredAt` sul Block crea una *terza* sorgente di verità accanto a `workflowState` e `deriveStatus`. **Fix:** derivare lo stato blocco dai suoi contenuti (blocco "consegnato" quando tutti i contenuti hanno `deliveredAt`) invece di un flag ridondante, oppure eleggere il flag come unica verità e deprecare `deriveStatus`.
- **Cosa conta "il blocco"?** Serve un target ("3 video"). Oggi non esiste `Block.targetCount`; il numero deriverebbe dal conteggio dei `Content` collegati. **Fix:** usare `contents.filter(blockId==b).length` come N, niente nuovo campo target nella v1.

### B — critiche
- **Over-engineering:** una tabella `Notification` con reconciler è molta infrastruttura per un tool a 2 utenti. Rischio di drift (reconciler che diverge dallo stato reale) e bug di dedup. **Fix:** mantenere la *derivazione* al volo per la home (economica, sempre coerente) e persistere SOLO ciò che serve al push (per evitare doppioni tra dispositivi/sessioni): una piccola tabella `PushDispatch(dedupeKey)` invece di un notification store completo.
- **Snooze/stati:** utili ma non richiesti; aggiungono UI. **Fix:** rimandare snooze a v2.

### C — critiche
- **`deliveredAt` in `workflowState` non basta:** se il contenuto è "consegnato" ma poi Matteo carica il montato, deve passare a "da revisionare" per Luca — la catena di stati va ridisegnata coerentemente, non solo aggiunto un `if`. **Fix:** definire una singola macchina a stati (vedi §6.1).
- **"Una riga sola" nasconde le date:** aggregare tutti i "Da consegnare imminenti" in una riga perde l'informazione "entro quando". **Fix:** l'item mostra la deadline più vicina + conteggio ("entro {data}, {N} da consegnare"); il dettaglio per contenuto resta nell'accordion `<details>` già presente in `home/page.tsx`.
- **Push slegato dagli item home:** il push nasce da `Activity` (eventi passati), la home da stato corrente. Un "promemoria di blocco in scadenza" è uno *stato*, non un *evento* → non ha un `Activity` che lo generi, quindi non verrebbe mai pushato. **Fix:** introdurre un trigger temporale (cron) per i promemoria di scadenza, distinto dagli eventi realtime.

---

## 4. Confutazione + miglioramento (giro 2)

### Convergenza dei tre approcci
Le critiche spingono verso un **ibrido**: derivazione al volo per la home (da C/B-migliorato), **stato per-blocco derivato dai contenuti** con fallback per gli orfani (da A-migliorato), **una macchina a stati unica** (da C), e **push su due binari**: eventi realtime (da `Activity`, già c'è) + promemoria di scadenza via cron (nuovo).

### Nuove critiche sul push
- **iOS Safari:** Web Push su iOS funziona **solo** per PWA installata in Home Screen (Safari 16.4+, marzo 2023), `display: standalone`, permesso richiesto da gesto utente *dentro* la PWA installata. In un tab Safari normale su iPhone **non c'è push**. Se Luca usa l'app nel browser senza installarla → nessuna notifica nativa. **Fix:** UI che invita all'"Aggiungi a Home", con Telegram come fallback garantito su iOS non-installato.
- **Subscription che scadono:** `PushSubscription` può essere invalidata dal browser; l'endpoint restituisce `410 Gone`/`404`. Serve pulizia. **Fix:** on-send, rimuovere le subscription che tornano 404/410.
- **Doppio push (Telegram + Web Push):** stesso evento notificato due volte. **Fix:** preferenze per-utente sul canale, o de-dup per `dedupeKey` (una consegna avvisa una volta sul canale scelto).
- **Costo/manutenzione VAPID:** trascurabile (chiavi statiche, `web-push` è leggero, invio da server action/route). Nessun costo di servizio (a differenza di FCM lato server non serve). OK.

### Migliorie recepite
- Preferenza canale per utente (`pushChannel: telegram|web|both`).
- Tabella `WebPushSubscription` con cleanup su 404/410.
- Cron giornaliero (Vercel Cron) per i promemoria "blocco in scadenza" con guardia di idempotenza (non ri-pushare lo stesso `dedupeKey` nello stesso giorno).

---

## 5. Confutazione + miglioramento (giro 3, focus robustezza)

- **Fuso orario deadline:** `daysUntil` usa indici giorno **UTC** (`dayNumUTC`). Le deadline sono date-only a mezzanotte UTC. Un cron "alle 8 del mattino" va schedulato con offset per l'Italia (UTC+1/+2) o si rischia il promemoria a orario sbagliato. **Fix:** cron alle 07:00 UTC (~08–09 locali) e calcolo `daysUntil` invariato (già UTC-safe).
- **Item vuoto = stato positivo:** la home già mostra "Tutto in pari ✨" quando `actions.length === 0`. Mantenerlo: max 1–2 significa anche **zero** quando non c'è nulla. Bene.
- **Ruolo dinverso:** oggi il ramo è `isAdmin ? matteo : luca`. Con più collaboratori futuri, la logica "luca" va parametrizzata sul *ruolo membership* (`Role.COLLABORATOR`) non su "non-admin". **Fix:** leggere `membership.role`; per la v1 con 2 utenti l'attuale mapping resta valido ma va isolato dietro una funzione.
- **Concorrenza push cron + evento:** se Luca consegna alle 07:59 e il cron gira alle 08:00, rischio doppio avviso. **Fix:** il cron salta i blocchi già consegnati (stato derivato) e i `dedupeKey` già dispatchati oggi.
- **Confermare il blocco quando i contenuti non ci sono ancora:** Matteo dice "in 7 giorni 3 video da registrare". Se i 3 `Content` non sono ancora stati creati, il conteggio-da-contenuti dà 0. **Fix v1:** il numero viene dai `Content` già pianificati nel blocco (workflow reale: i contenuti esistono come placeholder in pipeline). Se serve un target indipendente → `Block.targetCount` in v2.

I design sono ora specifici e robusti. Segue il finale.

---

## 6. Design finale raccomandato (piano d'implementazione)

Filosofia: **una sola macchina a stati event-based**, **home derivata al volo** (niente notification store), **stato blocco derivato dai contenuti**, **push a due binari** (eventi realtime già esistenti via Telegram + Web Push nuovo; promemoria scadenza via cron). Regola **max 2** item in home.

### 6.1 Modello dati — modifiche

1. **Macchina a stati unica del Content** (nuova funzione in `src/lib/workflow.ts`, deprecare la duplicazione con `status.ts`):
   ```
   ContentStage =
     "DaConsegnare"   // Luca deve consegnare il materiale (deliveredAt == null)
   | "InProduzione"   // Luca ha consegnato, Matteo deve montare (deliveredAt != null, !hasMontato)
   | "DaRevisionare"  // Matteo ha caricato il montato (hasMontato, !confirmedAt)
   | "Confermato"     // Luca ha confermato (confirmedAt != null)
   ```
   Derivata da `deliveredAt`, `hasMontato`, `confirmedAt`. **Include `deliveredAt`** — corregge la Causa C. `deriveStatus`/`effectiveStatus` (date-based) va o rimosso o reso puramente cosmetico (badge storico), NON usato per decidere le notifiche.

2. **Nessun nuovo stato ridondante sul Block.** Lo **stato del blocco è derivato**:
   - `bloccoDaConsegnare` = esiste ≥1 content del blocco in `DaConsegnare`.
   - `bloccoConsegnato` = tutti i content del blocco hanno `deliveredAt`.
   Questo evita la terza sorgente di verità (critica A/giro1).

3. **Web Push subscription (nuova tabella):**
   ```
   model WebPushSubscription {
     id         String   @id @default(cuid())
     userId     String
     endpoint   String   @unique
     p256dh     String
     auth       String
     userAgent  String?
     createdAt  DateTime @default(now())
     user       User     @relation(...)
     @@index([userId])
   }
   ```

4. **Preferenza canale (campo su User):** `pushChannel String @default("telegram")` — `"telegram" | "web" | "both" | "off"`. Evita il doppio-push (critica giro2).

5. **De-dup promemoria di scadenza (nuova tabella minimale):**
   ```
   model PushDispatch {
     id         String   @id @default(cuid())
     workspaceId String
     dedupeKey  String   // es. "block-due:{blockId}:{yyyy-mm-dd}"
     sentAt     DateTime @default(now())
     @@unique([dedupeKey])
   }
   ```
   Usata solo dal cron per non ripushare lo stesso promemoria nello stesso giorno.

### 6.2 Generazione degli item "Da fare adesso" (riscrittura di `homeActions`)

Riscrivere `homeActions` / `lucaDeadlineGroups` in `src/lib/workflow.ts` con queste regole:

**Ramo Luca (collaborator):**
1. **Un solo item "consegna" per blocco imminente**, non per giorno. Raggruppare i `Content` in `DaConsegnare` **per `blockId`** (non per `daysUntil`). Per ogni blocco entro la finestra (≤7g o già in ritardo): un item
   - Testo positivo per blocco: `"Blocco «{label}»: {N} {formato} da consegnare entro {data più vicina}"`.
   - **Niente frase-assillo sul ritardo.** Se in ritardo, tono neutro: `"Blocco «{label}»: {N} da consegnare (scaduto {data})"` — una volta sola, mai duplicato (chiave = blockId, non giorno). Corregge Cause A + D.
2. **Item "revisione"** (se presenti `DaRevisionare`): `"{N} montat{o|i} da revisionare"` (invariato, già aggregato).
3. **Cap a 2:** ordinare per urgenza (deadline più vicina prima; revisione dopo) e `slice(0, 2)`. Corregge Causa B. Il resto è raggiungibile dalla pagina Contenuti; l'accordion `<details>` esistente in `home/page.tsx` continua a elencare i singoli contenuti dell'item.

**Ramo Matteo (admin):** già una riga (`"{N} da montare"`). Aggiungere al massimo la seconda riga "consegne ricevute oggi" se utile, comunque cap 2.

**Ciclo "conferma" (Causa C risolta):**
- Luca preme **"Ho consegnato il materiale"** sull'item di blocco (o sul singolo contenuto). Server action = `markDeliveredAction` (già esiste) su ciascun content del blocco, oppure una nuova `markBlockDeliveredAction(blockId)` che itera i content in `DaConsegnare` del blocco → `setDelivered` + `createActivity(DELIVERED)`.
- Poiché il nuovo `ContentStage` considera `deliveredAt`, i content escono da `DaConsegnare` → **l'item sparisce** dalla lista di Luca (passa a `InProduzione`, di competenza di Matteo). Esattamente il comportamento richiesto.

### 6.3 Consegna push sul dispositivo (parte 2)

Due binari, un solo punto di fan-out.

**Binario 1 — eventi realtime (già esistente, da estendere).**
`createActivity` → `notifyForActivity` (rinominare `notifyTelegramForActivity`) che fa fan-out multi-canale in base a `User.pushChannel`:
- Telegram (già implementato, affidabile ovunque incluso iOS non-installato).
- Web Push (nuovo): per ogni `WebPushSubscription` del destinatario, invio con `web-push` (libreria) + chiavi VAPID.

**Binario 2 — promemoria di scadenza (nuovo, cron).**
Vercel Cron giornaliero (07:00 UTC, cfr. giro3 fuso) → route `app/api/cron/block-reminders/route.ts`:
- Per ogni workspace, calcola i blocchi con content `DaConsegnare` in scadenza (`daysUntil` in {0,1,2}).
- Per ognuno, `dedupeKey = "block-due:{blockId}:{today}"`; se non in `PushDispatch`, invia push "Blocco «{label}»: {N} da consegnare entro {data}" e registra il dispatch. Evita doppioni con l'evento realtime.

**Web Push — stack tecnico:**
- **Manifest PWA:** `public/manifest.webmanifest` (`display: standalone`, `name`, `icons`), linkato via metadata Next. Necessario perché iOS installi la PWA.
- **Service worker:** `public/sw.js` con handler `push` (mostra `showNotification`) e `notificationclick` (apre `/contenuti/{id}` o `/home`). Registrato client-side dopo login.
- **Subscribe flow:** componente client "Attiva notifiche" → `Notification.requestPermission()` (da gesto utente) → `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: VAPID_PUBLIC })` → POST endpoint+keys a una server action che fa upsert in `WebPushSubscription`.
- **Invio:** `web-push` con `VAPID_PUBLIC`/`VAPID_PRIVATE` (env). Payload JSON `{title, body, url}` < ~4KB. Su risposta `404`/`410` → cancellare la subscription (cleanup).
- **Env nuove:** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (mailto). Generabili una volta con `web-push generate-vapid-keys`.

**Comportamento per piattaforma (cosa è possibile e cosa NO):**
| Piattaforma | Web Push | Requisiti / limiti |
|---|---|---|
| **Android** (Chrome/Firefox/Edge) | Sì, anche in tab browser | Permesso + service worker. Nessuna installazione richiesta. Pienamente supportato. |
| **Desktop** (Chrome/Edge/Firefox) | Sì, in tab browser | Idem. Safari macOS 16+ supporta Web Push in-browser. |
| **iOS/iPadOS Safari 16.4+** | Sì, **solo PWA installata** in Home Screen | Serve `display: standalone` + "Aggiungi a Home". **Nessun push in tab Safari normale.** Permesso richiesto da gesto utente dentro la PWA installata. La consegna passa da APNs ma è trasparente allo sviluppatore (Web Push standard, nessun account Apple Developer necessario). |
| **iOS < 16.4** | **No** | Nessun Web Push. Fallback obbligatorio: Telegram. |

**Cosa NON è possibile:**
- Push nativo su iPhone senza installare la PWA in Home Screen.
- Badge count affidabile sull'icona iOS (Badging API limitata/incoerente in standalone).
- Wake-up/background sync affidabile su iOS oltre alla notifica push stessa.
- Re-prompt del permesso se l'utente ha negato (va gestito con UI che spiega come riattivare dalle impostazioni).
- Garanzia di consegna/timing: il push è best-effort; per l'affidabilità critica resta Telegram.

### 6.4 Ordine di implementazione consigliato (fasi)

1. **Fase 1 — Fix home (nessuna dipendenza esterna):** macchina a stati unica con `deliveredAt` (§6.1.1); riscrittura `homeActions` per blocco + cap 2 + tono neutro (§6.2); azione `markBlockDeliveredAction`. Risolve Cause A–D subito, zero infrastruttura. Aggiornare `tests/workflow.test.ts`.
2. **Fase 2 — Preferenze canale + Web Push:** tabelle `WebPushSubscription`/`PushDispatch`, campo `pushChannel`; libreria `web-push` + VAPID; manifest + service worker + subscribe UI; fan-out multicanale in `notifyForActivity`.
3. **Fase 3 — Cron promemoria di scadenza:** route cron + `PushDispatch` dedup + `vercel.json` cron entry.
4. **Fase 4 — Cleanup:** deprecare/riconciliare `deriveStatus` (Causa E) come puro badge storico, non decisionale.

### 6.5 File toccati (mappa)
- `src/lib/workflow.ts` — nuova macchina a stati, `homeActions` per blocco, cap 2. **(cuore del fix)**
- `src/app/(app)/home/page.tsx` — passa `blockId`/label a `HomeContent`, CTA "Ho consegnato".
- `src/app/(app)/contenuti/actions.ts` — nuova `markBlockDeliveredAction`.
- `src/lib/activity.ts` — `notifyForActivity` multicanale (Telegram + Web Push).
- `prisma/schema.prisma` — `WebPushSubscription`, `PushDispatch`, `User.pushChannel`.
- **Nuovi:** `public/manifest.webmanifest`, `public/sw.js`, `src/lib/web-push.ts`, componente subscribe, `app/api/cron/block-reminders/route.ts`, voci in `vercel.json`.

---

## Appendice — riferimenti codice citati
- Generatore home: `src/lib/workflow.ts` (`homeActions` L144, `lucaDeadlineGroups` L75, `deadlineText` L122, `workflowState` L5).
- Render home: `src/app/(app)/home/page.tsx` (L36–45 ruolo/azioni, L118–159 accordion).
- Event log + push Telegram: `src/lib/activity.ts` (`createActivity` L7, `notifyTelegramForActivity` L80, `PUSH_TYPES` L25).
- Server actions ciclo: `src/app/(app)/contenuti/actions.ts` (`markDeliveredAction` L78, `confirmContentAction` L96, `setVideoProxyAction` L354, `addMaterialAction` L375).
- Stato date-based parallelo: `src/lib/status.ts` (`deriveStatus`, `effectiveStatus`).
- Persistenza consegna/conferma: `src/lib/content.ts` (`setDelivered` L352, `setConfirmed` L369, `contentHasMontato` L379, `listContents` include `block`).
- Campana: `src/app/(app)/layout.tsx` (L29 `unreadCount`), `src/components/notification-bell.tsx`, `src/app/(app)/notifiche/page.tsx`.
- Modello dati: `prisma/schema.prisma` (`Activity` L24, `Block` L142, `Content.deliveredAt/confirmedAt/publishState` L184–202, `User.telegramChatId/notificationsSeenAt` L70–71).
- Telegram: `src/lib/telegram.ts` (`sendMessage`), `src/lib/telegram-link.ts` (`chatIdForUser`).
- Infra push assente: nessun `manifest`/`sw`/`web-push` in `public/` o `package.json`.
