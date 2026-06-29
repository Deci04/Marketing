# Spec — Collaborazione & Notifiche (Matteo ↔ Luca)

**Data:** 2026-06-29
**Filone:** `filone/collab-notifiche`
**Origine:** la home (post-ottimizzazione) mostra un muro di "novità"; Matteo vuole trasformarla nel **punto di confronto tra lui e Luca** — un sistema di attività/notifiche + un'azione di conferma. Vincolo reale: **Luca non carica i materiali nel software** (arrivano via Drive/iCloud/WhatsApp). Il software è il livello di **coordinamento**, non il magazzino dei grezzi.

## Modello concordato (brainstorming)
Ciclo di vita del contenuto basato su **eventi reali** (non solo date):

```
Da consegnare → Consegnato → Da confermare → Confermato → Pubblicato
                (Luca preme   (Matteo carica  (Luca preme
                 "Consegnato"   il montato)     "Conferma")
                 + link opz.)
```

- **Consegna di Luca** = gesto leggero in-app (opzione B scelta): pulsante **"Materiale consegnato"** sul contenuto, con **link Drive/iCloud opzionale** (riusa il campo `masterLink`). Nessun upload di file da parte di Luca.
- **Montato di Matteo** = upload del proxy di review (già esiste, F4: `videoProxyUrl` / `Material`).
- **Conferma di Luca** = pulsante **"Conferma contenuto"** quando c'è il montato.
- **Home** = due blocchi: **"Da fare adesso"** (azionabile, ogni voce sparisce quando l'azione è compiuta) + **"Prossime uscite"** (già esistente).
- **Notifiche in-app**: feed condiviso di attività + **campanello con contatore non-letti** per utente.

## Out of scope (per dopo)
- Notifiche **esterne** (email / bot Telegram) → Fase 2 (già parcheggiata).
- Riorganizzazione **Contenuti/Archivio** per mese/stato → pezzo separato successivo.
- Ruoli rigidi (gating "Conferma" solo a Luca) → vedi §Ruoli: per ora azioni visibili a tutti, si affina quando l'account di Luca è nel workspace.

---

## Modello dati (migrazione additiva)

**Content** — due campi nuovi (oltre a `masterLink` già esistente, riusato per il link di consegna):
```prisma
deliveredAt   DateTime?   // Luca ha segnato "materiale consegnato"
confirmedAt   DateTime?   // Luca ha confermato il montato
```

**User** — tracciamento non-letti:
```prisma
notificationsSeenAt DateTime?   // ultimo momento in cui l'utente ha aperto il feed
```

**Nuovo modello Activity** (log condiviso di workspace):
```prisma
model Activity {
  id          String       @id @default(cuid())
  workspaceId String
  type        ActivityType
  contentId   String?
  actorId     String?      // chi ha generato l'evento (per non auto-notificarsi)
  createdAt   DateTime     @default(now())
  workspace   Workspace    @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  content     Content?     @relation(fields: [contentId], references: [id], onDelete: Cascade)
  @@index([workspaceId, createdAt])
}

enum ActivityType {
  DELIVERED      // Luca ha consegnato il materiale
  REVIEW_READY   // Matteo ha caricato il montato → da confermare
  CONFIRMED      // Luca ha confermato
  COMMENT        // nuovo commento (testo/audio)
  CREATED        // nuovo contenuto creato
}
```
(Aggiungere la relation inversa `activities Activity[]` su Workspace e Content.)

**Nota migrazione:** tutto additivo (colonne nullable + nuova tabella) → sicuro sul DB Neon condiviso; l'app attuale in prod continua a funzionare finché non arriva il nuovo codice. Creare la migrazione con `prisma migrate dev` e verificarla.

## Stato derivato per il loop
Nuovo helper puro `workflowState(content)` in `src/lib/workflow.ts` (TDD):
- `confirmedAt` → **"Confermato"**
- montato presente (`videoProxyUrl` o ≥1 `Material`) & non confermato → **"Da confermare"**
- `deliveredAt` presente & nessun montato → **"Da revisionare"**
- altrimenti → **"Da consegnare"**
- (la pubblicazione resta gestita da `publishAt`/`deriveStatus` per il calendario; i due stati coesistono: `deriveStatus` = vista pianificazione per data, `workflowState` = avanzamento reale della collaborazione.)

Interfaccia: `workflowState({ deliveredAt, confirmedAt, hasMontato }): "Da consegnare"|"Da revisionare"|"Da confermare"|"Confermato"`.

## Azioni (server actions)
In `src/app/(app)/contenuti/actions.ts` (+ riuso da calendario/modale):
- `markDeliveredAction(formData)` — set `deliveredAt = now`, `masterLink` se fornito; crea `Activity(DELIVERED)`.
- `confirmContentAction(formData)` — set `confirmedAt = now`; crea `Activity(CONFIRMED)`.
- Hook negli upload esistenti (`addMaterialAction` / `setVideoProxyAction`): crea `Activity(REVIEW_READY)` la prima volta che compare un montato.
- Hook in `addComment` esistente: crea `Activity(COMMENT)`.
- Hook in `createContent`: crea `Activity(CREATED)`.
- `markNotificationsSeenAction()` — set `User.notificationsSeenAt = now`.

Tutte fanno `revalidatePath` su `/home`, `/contenuti`, `/contenuti/[id]`.

Layer dati in `src/lib/activity.ts`: `listActivity(workspaceId, limit)`, `unreadCount(workspaceId, userId, seenAt)`, `createActivity(...)`.

## UI

**Card / modale contenuto** (`content-card.tsx`, `content-modal.tsx`):
- Badge stato `workflowState`.
- Pulsante **"Materiale consegnato"** (+ input link Drive opz.) quando `!deliveredAt`.
- Pulsante **"Conferma contenuto"** quando montato presente & `!confirmedAt`; dopo, badge "Confermato".

**Home** (`home/page.tsx`) — sostituisce la sezione "Novità (ultimi creati)":
1. **"Da fare adesso"** — lista azionabile derivata dagli stati: *Da revisionare* (consegnato, no montato) · *Da confermare* (montato, no conferma) · *commenti non letti*. Ogni voce con link diretto al contenuto e sparisce quando l'azione è compiuta.
2. **"Prossime uscite"** — invariata.

**Campanello notifiche** (nuovo `notification-bell.tsx` nella sidebar/shell):
- Icona con **contatore non-letti** (`unreadCount` = Activity dopo `notificationsSeenAt`, escluse le proprie).
- Click → pannello/pagina **feed attività** (chi · cosa · quando, link al contenuto); all'apertura chiama `markNotificationsSeenAction()`.

## Ruoli / account (prerequisito gestito con grazia)
Per essere un vero "punto di confronto" servono **due utenti reali** (Matteo + Luca) nel workspace. Oggi ce n'è uno solo (email di Luca ancora da inserire). **Per ora**: i pulsanti "Consegnato"/"Conferma" sono visibili a tutti i membri e ogni `Activity` registra l'`actorId`; il feed mostra "chi" ha fatto cosa. **Quando l'account di Luca sarà nel workspace** (Matteo fornirà l'email vera), si potrà gating "Conferma" sul ruolo. Aggiungere l'email di Luca al `prisma/seed.ts` (o invito) è uno step di setup, non blocca la build.

## Verifica / Definition of Done
- `npm run build` pulito; `npm test` verde + nuovi test per `workflowState`.
- Migrazione applicata e verificata sul DB.
- **Audit gate (browser, Chrome reale)** del loop completo: segna "Consegnato" (+link) → compare in "Da fare"/feed → carica montato → compare "Da confermare" → "Conferma" → feed aggiornato; campanello con contatore non-letti che si azzera all'apertura. 0 errori console. ([[matteo-browser-verify-before-merge]])
- Niente dati di test lasciati nel DB condiviso (cleanup o verifica non distruttiva dove possibile).

## Piano d'implementazione
Da dettagliare con writing-plans. Ordine suggerito: (1) migrazione + `workflowState` (TDD) + `activity.ts`; (2) azioni + hook attività; (3) pulsanti su card/modale; (4) home "Da fare adesso"; (5) campanello + feed; (6) browser-verify.
