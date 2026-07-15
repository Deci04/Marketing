# PWA / Web-app installabile — Analisi di design

Data: 2026-07-15
Stato: SOLO ANALISI DI DESIGN (nessun codice modificato)
App: `content-tool` — Next.js 16.2.9 (App Router, versione modificata, vedi `AGENTS.md`), deploy Vercel (`marketing-ashy-one.vercel.app`), DB Neon condiviso.
Utenti: Matteo (admin) e Luca (creator).

Obiettivo del titolare: una web-app usabile da PC e da telefono, **installabile** (icona + finestra dedicata su desktop, home screen su mobile) e con **notifiche push** sul dispositivo. Questo documento è un piano, non un'implementazione.

> Fonte autorevole usata: la guida PWA inclusa localmente in questa versione modificata di Next, `node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md`, più `.../03-file-conventions/01-metadata/manifest.md`, `.../04-functions/generate-viewport.md`, `.../03-file-conventions/01-metadata/app-icons.md`. Come impone `AGENTS.md`, le convenzioni sono state verificate su questi doc, non sulla memoria.

---

## 1. Stato attuale rispetto all'installabilità

Verifica puntuale (file per file). **Riassunto: l'app oggi non è installabile.** Manca tutto lo strato PWA; esiste però l'infrastruttura di notifiche (Telegram) da cui il push web può ereditare la logica.

### Cosa manca (bloccanti per l'installabilità)

| Requisito PWA | Stato | Evidenza |
|---|---|---|
| Web App Manifest (`manifest.json`/`manifest.ts`) | **ASSENTE** | `find` su tutto il repo (escluso `node_modules`/`graphify-out`) non trova alcun manifest. `src/app/` contiene solo `layout.tsx`, `page.tsx`, `globals.css`, `favicon.ico`, gruppi `(app)`/`(auth)`, `api/`. |
| Service Worker (`public/sw.js`) | **ASSENTE** | `public/` contiene solo `file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg` (asset di default `create-next-app`). Nessun `sw.js`, nessun `service-worker.js`. |
| Icone PWA (192/512, maskable, apple-icon) | **ASSENTE** | Nessun `icon.png`, `apple-icon.png`, `icon-192x192.png`, `icon-512x512.png` né in `src/app/` né in `public/`. Presente solo `src/app/favicon.ico`. |
| `viewport`/`themeColor` nel root layout | **ASSENTE** | `src/app/layout.tsx` esporta `metadata` (solo `title` + `description`, L23-26) ma **nessun** export `viewport`/`generateViewport`, nessun `themeColor`, nessun `appleWebApp`. In Next 13.4+ `themeColor` vive nell'export `viewport`, non in `metadata`. |
| Libreria PWA (next-pwa / serwist / workbox / web-push) | **ASSENTE** | `package.json` e `package-lock.json` non contengono `web-push`, `serwist`, `next-pwa`, `workbox`. |
| Chiavi VAPID | **ASSENTE** | `.env` ha `AUTH_SECRET`, `BLOB_*`, `DATABASE_URL`, `DIRECT_URL`, `GOOGLE_*`, `GROQ_API_KEY`, `NEXT_PUBLIC_APP_URL`, `TELEGRAM_*`, `ZERNIO_API_KEY`. Nessuna `VAPID_PRIVATE_KEY` / `NEXT_PUBLIC_VAPID_PUBLIC_KEY`. |
| Modello DB per le subscription push | **ASSENTE** | `prisma/schema.prisma` ha `Activity`, `User` (con `notificationsSeenAt`), `Session`, ecc. ma **nessun** modello `PushSubscription`. |

### Cosa c'è già (basi utili)

- **Root layout** `src/app/layout.tsx`: `<html lang="it">`, font via `next/font`, `metadata` base. È il punto giusto dove aggiungere l'export `viewport`. `lang="it"` corretto.
- **Metadata parziale**: `title: "Luca — Gestione contenuti"`, `description: "..."` — riusabili nel manifest.
- **Palette brand** già definita in `src/app/globals.css`: `--color-paper: #fffdf8`, `--background: #f4eee3`, card `#fffdf8`, ink scuro. Da questi derivano `background_color` e `theme_color` del manifest (niente `#000`/`#fff` generici).
- **Auth** `src/lib/auth.ts`: NextAuth v5 (beta.31), **strategy JWT**, cookie `authjs.session-token` / `__Secure-authjs.session-token`. Il push va legato a `User.id` via sessione, non a un device anonimo.
- **Gate di autenticazione** `src/proxy.ts` (in Next 16 `middleware.ts` è rinominato `proxy.ts`): redirect a `/login` se manca il cookie sessione. Matcher:
  `"/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)"`.
- **Infrastruttura notifiche già presente** `src/lib/activity.ts`: `createActivity()` chiama `notifyTelegramForActivity()`; esiste già l'insieme `PUSH_TYPES = { DELIVERED, REVIEW_READY, CONFIRMED, COMMENT }`. Il web push si aggancia **qui** (stesso punto del fan-out Telegram), non in un percorso nuovo. C'è già una UI notifiche: `src/app/(app)/notifiche/page.tsx`, `NotificationBell`, `unreadCount`, `User.notificationsSeenAt`.
- **Deploy**: HTTPS su Vercel garantito (`vercel.json` = `{ "framework": "nextjs" }`) — precondizione PWA soddisfatta in prod. `next.config.ts` **non** ha `headers()` (da aggiungere per `sw.js`) e ha `serverExternalPackages` (rilevante per `web-push`, vedi §oltre).

### GOTCHA CRITICO scoperto — il matcher del proxy intercetta manifest e SW

Il matcher di `src/proxy.ts` esclude `api/auth`, `login`, `_next/static`, `_next/image`, `favicon.ico`. **Non esclude** `/manifest.webmanifest`, `/sw.js`, `/icon-*.png`, `/apple-icon*`. Conseguenza: per un browser **senza** cookie di sessione, una richiesta a `/sw.js` o `/manifest.webmanifest` riceve un **redirect 307 verso `/login` (HTML)** invece del file atteso.

Impatti concreti:
- Il **service worker** viene registrato client-side dopo il login (cookie presente), quindi il `register('/sw.js')` iniziale funziona. **Ma** il browser ricontrolla periodicamente `/sw.js` per gli update: se nel frattempo la sessione è scaduta, la richiesta di update riceve HTML di login → il browser rifiuta di aggiornare il SW (MIME/redirect non valido) e può marcare il SW come rotto.
- Il **manifest** è linkato solo nelle pagine autenticate, ma un update check o una fetch a sessione scaduta dà lo stesso problema.

**Azione obbligatoria in qualunque approccio**: aggiungere `manifest.webmanifest|sw.js|icon-*|apple-icon*` alle esclusioni del matcher del proxy (o servirli come asset statici sempre pubblici). Questo è il primo pezzo di codice da toccare, indipendentemente dall'approccio scelto.

---

## 2. Tre approcci proposti

Tutti e tre condividono lo **strato manifest + icone + viewport** (identico) e lo **strato push** (identico, §push). Divergono sul **service worker e sul caching**.

### Elementi comuni a tutti gli approcci

**A. Manifest** — `src/app/manifest.ts` (convenzione Next 16, genera `/manifest.webmanifest`, tipizzato `MetadataRoute.Manifest`):

```ts
import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Luca — Gestione contenuti",
    short_name: "Contenuti",
    description: "Pianificazione, pubblicazione e KPI dei contenuti.",
    start_url: "/home",           // NON "/": evita il redirect proxy → landing utile
    id: "/home",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4eee3",   // = --background di globals.css
    theme_color: "#fffdf8",        // = --color-paper
    lang: "it",
    dir: "ltr",
    categories: ["productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
```
Note: `start_url: "/home"` perché `/` è la landing minima (`src/app/page.tsx`, 101 byte) e `/home` è la vera dashboard (`src/app/(app)/home`). Serve almeno una icona `maskable` per Android (altrimenti icona con bordo bianco). Le `shortcuts` (scorciatoie long-press: "Calendario", "Nuovo contenuto") sono un plus facoltativo.

**B. Icone** — generare da un master (es. via realfavicongenerator) e mettere in `public/`: `icon-192.png`, `icon-512.png`, `icon-maskable-{192,512}.png`, `apple-icon-180.png`. Su iOS l'apple-touch-icon **non** supporta trasparenza/maskable: fondo pieno `#fffdf8`. In alternativa usare le file-convention Next `src/app/icon.png` + `src/app/apple-icon.png` (Next inietta i `<link>` da solo), ma per il manifest servono comunque i PNG referenziati per `src` espliciti — quindi meglio i file in `public/` con path stabili.

**C. Viewport / theme-color** — aggiungere a `src/app/layout.tsx` (non tocca `metadata`, solo un nuovo export):

```ts
import type { Viewport } from "next";
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fffdf8" },
    { media: "(prefers-color-scheme: dark)",  color: "#1A1813" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",   // safe-area iPhone notch in standalone
};
```
E per iOS standalone, in `metadata`: `appleWebApp: { capable: true, statusBarStyle: "default", title: "Contenuti" }`.

**D. Proxy** — escludere manifest/sw/icone dal redirect (vedi gotcha §1).

**E. Push** — modello Prisma `PushSubscription`, Server Actions subscribe/unsubscribe, `web-push` server-side, aggancio in `activity.ts`. Dettaglio in §Push.

---

### Approccio 1 — "Installable senza offline" (manifest + SW minimale scritto a mano, solo push)

Il SW **non** fa caching: gestisce solo `push` e `notificationclick`. È esattamente il pattern della guida Next locale (`progressive-web-apps.md`, step 5). Nessuna cache RSC, nessun rischio di asset stantii.

- File: `public/sw.js` (statico, ~30 righe): listener `push` → `showNotification`; listener `notificationclick` → `clients.openWindow(url)` con deep-link al contenuto.
- Registrazione: componente client `PushManager` montato nella `(app)/layout.tsx`, `navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })`.
- Caching: **nessuno**. Offline = pagina di errore del browser (accettabile: l'app è inutile offline, è tutta dati live da Neon).
- Install prompt: `beforeinstallprompt` su Chrome/Edge desktop+Android; istruzioni manuali "Aggiungi a Home" su iOS.

Pro: minimo codice, zero rischio caching/RSC, aggiornamenti istantanei (deploy Vercel = subito live), manutenzione quasi nulla. Copre **entrambi** gli obiettivi del titolare (installabile + push): la guida Next dice esplicitamente che gli install prompt non richiedono offline.
Contro: nessuna resilienza a rete lenta; nessuna "app shell" istantanea.

### Approccio 2 — "App shell + offline fallback" con Serwist

Serwist (successore mantenuto di next-pwa/workbox) genera un SW con precache dello shell e strategie runtime. È l'opzione citata dalla stessa guida Next (§"Offline Support").

- Dipendenze: `@serwist/next` + `serwist`. Config in `next.config.ts` (wrappare l'export) + un `src/app/sw.ts` compilato in `public/sw.js`.
- Caching: precache degli asset statici `_next/static` (hashati, quindi sicuri), runtime `NetworkFirst` per le pagine, `StaleWhileRevalidate` per immagini; una `offline.html` di fallback.
- Push: stesso listener `push`/`notificationclick`, ma dentro il SW Serwist (Serwist lascia aggiungere event listener custom).

Pro: shell istantaneo, fallback offline pulito, retry background.
Contro: complessità reale con App Router; rischio concreto di cachare risposte RSC/HTML autenticate e servirle a sessione scaduta o all'utente sbagliato (vedi confuta §3). La guida Next avverte: "this plugin currently requires webpack configuration" — e questo progetto gira su **Turbopack** (Next 16). Va verificata la compatibilità Serwist↔Turbopack prima di adottarlo: è il rischio numero uno di questo approccio.

### Approccio 3 — "SW manuale con caching selettivo dell'app-shell statico"

Via di mezzo: SW scritto a mano (come App.1) ma con un caching **volutamente ristretto** al solo guscio statico e agli asset immutabili, **mai** HTML/RSC/dati.

- `public/sw.js`: `install` → precache di `/icon-*`, `/manifest.webmanifest`, font (se self-hosted), e una `/offline` statica minimale. `fetch` handler che intercetta **solo** GET verso `_next/static/*` e le icone (`CacheFirst`, sicuro perché hashati); **tutto il resto passa alla rete** (network passthrough, nessuna cache). `push`/`notificationclick` come App.1.
- Versioning esplicito: `const CACHE = 'shell-v3'`, cleanup in `activate`.

Pro: benefici di velocità sugli asset immutabili senza rischio di servire HTML autenticato stantio; nessuna dipendenza esterna; pieno controllo (niente sorprese Turbopack). Contro: più codice manuale di App.1; la logica di invalidazione è responsabilità nostra (rischio di cache-versioning sbagliato → App.1 non ce l'ha).

---

## 3. Confuta avversariale (round 1) e miglioramenti

### Contro Approccio 1 (no offline, SW solo push)
- **Push su iOS**: `web-push` su iOS Safari funziona **solo** se l'app è stata **aggiunta alla Home** (installata come standalone) **e** iOS ≥ 16.4. Un Luca che apre il sito nel browser iOS **non** riceverà push finché non installa. Il "subscribe" fallirà silenziosamente in Safari-tab. → **Miglioria**: la UI push deve rilevare `display-mode: standalone`; su iOS in tab, invece del bottone "Attiva notifiche" mostrare l'istruzione "Prima aggiungi alla Home". Ordine obbligato su iOS: installa → apri da Home → poi subscribe.
- **`beforeinstallprompt` non esiste su Safari/iOS** (confermato dalla guida Next: "does not work on Safari iOS"). → **Miglioria**: due percorsi UX distinti — bottone nativo dove l'evento c'è (Chrome/Edge/Android), scheda-istruzioni "Condividi → Aggiungi a Home" dove non c'è (iOS). Già previsto, da rendere esplicito nel componente.
- **Il SW `/sw.js` statico in `public/` viene servito con `Cache-Control` di default di Vercel** → i browser possono servire un SW vecchio. → **Miglioria**: aggiungere in `next.config.ts` gli header per `/sw.js`: `Cache-Control: no-cache, no-store, must-revalidate` + `Content-Type: application/javascript` (pattern esatto dalla guida Next §8). Registrare con `updateViaCache: 'none'`.
- **Manutenzione VAPID**: le chiavi VAPID sono permanenti; se rigenerate, tutte le subscription si invalidano. → **Miglioria**: generarle una volta, documentarle come segreti stabili in Vercel env, mai ruotarle senza migrazione.

### Contro Approccio 2 (Serwist)
- **Caching RSC/autenticazione**: con App Router, le navigazioni fetchano payload RSC (`?_rsc=...`) e HTML che **dipendono dalla sessione** (`currentContext()`/`currentUser()` in `(app)/layout.tsx`). Una strategia di precache/`StaleWhileRevalidate` può servire a Luca una pagina renderizzata per Matteo, o dati di un workspace sbagliato (multi-tenant via `scopedWhere`). Rischio di **data leak cross-tenant**. → **Miglioria**: escludere categoricamente dal caching tutto ciò che è HTML/RSC/`/api/*`; cachare **solo** `_next/static` (hashato, non sensibile) e media pubblici. Ma a quel punto Serwist offre poco più dell'Approccio 3, con più peso.
- **Turbopack**: la guida avverte che Serwist "requires webpack configuration". Questo repo usa Turbopack (Next 16 default). → **Miglioria/decisione**: verificare in un branch spike se `@serwist/next` supporta Turbopack in Next 16; se no, App.2 è **fuori** senza tornare a webpack (regressione su tutta la build). Questo è un gate bloccante.
- **Asset stantii + Vercel**: SW precache può "pinnare" una versione di build mentre Vercel ha già promosso la successiva → utenti su UI vecchia con API nuova (mismatch Server Action IDs → errori). → **Miglioria**: `skipWaiting` + `clients.claim` con prompt di reload all'utente, e non precachare HTML.

### Contro Approccio 3 (SW manuale, shell statico)
- **`_next/static` è già ottimamente cachato dalla CDN di Vercel** (immutable, edge). Cacharlo di nuovo nel SW dà un guadagno marginale su desktop/rete buona, a fronte di codice di invalidazione da mantenere a mano (`shell-vN`). Rischio: dimenticare il bump di versione → asset vecchi. → **Miglioria**: se il guadagno è marginale, **degradare** App.3 verso App.1 e cachare al massimo `/offline` e le icone; lasciare la CDN gestire `_next/static`.
- Stessi limiti iOS/`beforeinstallprompt`/header `sw.js` dell'App.1.

---

## 4. Confuta avversariale (round 2) e convergenza

### SEO / deploy (trasversale)
- L'app è **dietro login** (`proxy.ts` redirige tutto tranne `/login`): la SEO è irrilevante; non ci sono pagine pubbliche da indicizzare. → nessun vincolo SEO sul design PWA. Un rischio residuo: se il SW cacha `/login` o intercetta `/api/auth/*`, può rompere il flusso OAuth Google (`api/auth`, `GOOGLE_CLIENT_*`). → **Regola dura**: il `fetch` handler del SW deve fare `return` immediato (passthrough) per qualsiasi URL sotto `/api/`, `/login`, e per method ≠ GET. Vale per tutti gli approcci con caching.

### Push affidabile (trasversale)
- La guida Next mostra `subscription` in una **variabile in-memory di modulo** (`let subscription = null` in `actions.ts`): inaccettabile in produzione — su Vercel ogni invocazione è stateless/serverless, la variabile si perde e non gestisce 2 utenti. → **Design corretto obbligatorio**: persistere le subscription in Neon (`PushSubscription` model), una-a-molti con `User` (Matteo/Luca possono avere più device: telefono + desktop). L'invio itera su tutte le subscription dell'utente destinatario e **elimina** quelle che tornano `410 Gone`/`404` (endpoint scaduto) — housekeeping essenziale, altrimenti la tabella marcisce.
- **A chi mandare**: riusare la logica già presente in `activity.ts`. Oggi `notifyTelegramForActivity` esclude l'`actorId` (non auto-notificarsi) e filtra `PUSH_TYPES`. Il web push deve agganciarsi **nello stesso punto** con lo stesso filtro/esclusione, così Telegram e Web Push restano coerenti (o si sostituiscono progressivamente). → **Miglioria**: astrarre un `notify(userId, payload)` che fa fan-out su entrambi i canali dai destinatari calcolati una volta sola.

### `web-push` e runtime (trasversale)
- `web-push` è un pacchetto Node (usa crypto Node): deve girare in **Node runtime**, non Edge. Le Server Actions e le route handler di Next su Vercel sono Node di default — ok. → **Nota**: valutare se aggiungerlo a `serverExternalPackages` in `next.config.ts` (già usato per `googleapis` et al.) se Turbopack tenta di bundlarlo e rompe. Da verificare in build.
- **Trigger dell'invio**: le attività nascono dentro Server Actions (`src/app/(app)/**/actions.ts`) già in contesto Node → l'invio push può avvenire inline in `createActivity`, come già fa Telegram. Nessun cron necessario per lo scenario base.

### iOS come vincolo di prodotto (trasversale, decisivo)
- Riepilogo limiti iOS Safari accertati: (a) niente `beforeinstallprompt` → install solo manuale via "Aggiungi a Home"; (b) push solo se **installata** e iOS ≥ 16.4; (c) l'utente deve aprire l'app **dalla Home** perché il permesso notifiche sia richiedibile; (d) niente badge count affidabile pre-iOS 16.4; (e) lo standalone iOS ha quirks di safe-area (serve `viewport-fit=cover` + `env(safe-area-inset-*)` nel CSS). → **Decisione di prodotto**: per Luca su iPhone la sequenza va guidata a mano dentro l'app (scheda onboarding "Installa in 3 passi"). Non è un dettaglio tecnico: è UX obbligata, altrimenti le notifiche "non arrivano" e sembra un bug.

### Convergenza
Dopo due round: **Approccio 2 (Serwist) è sconsigliato** salvo che uno spike dimostri compatibilità Turbopack **e** che serva davvero l'offline (qui non serve: l'app è 100% dati live). **Approccio 3 si degrada verso Approccio 1** perché la CDN Vercel già cacha `_next/static`. → Il design raccomandato è **Approccio 1 rinforzato** con le migliorie estratte da 2 e 3 (header `sw.js`, passthrough rigoroso, persistenza subscription, UX iOS guidata, cache opzionale minimale della sola `/offline`).

---

## 5. Design finale raccomandato

**Strategia: PWA "installable-first, push-enabled, no-offline" — SW minimale scritto a mano.** Copre entrambi gli obiettivi del titolare (installazione desktop/mobile + notifiche push) con rischio e manutenzione minimi, senza toccare la build Turbopack né rischiare leak cross-tenant.

### 5.1 File da creare / modificare

Nuovi:
1. `src/app/manifest.ts` — manifest dinamico (blocco in §2.A). Genera `/manifest.webmanifest`.
2. `public/sw.js` — service worker statico: `push` + `notificationclick` + passthrough totale sul `fetch` (nessuna cache, o al massimo precache di `/offline` + icone). Deep-link: `notificationclick` apre `data.url` (es. `/contenuti/<id>`) con fallback a `/home`; se una finestra è già aperta, `client.focus()`.
3. `public/icon-192.png`, `public/icon-512.png`, `public/icon-maskable-192.png`, `public/icon-maskable-512.png`, `public/apple-icon-180.png` — da master brand (fondo `#fffdf8`).
4. `src/app/(app)/actions-push.ts` (o dentro un `src/lib/push.ts`) — Server Actions `subscribeUser(sub)`, `unsubscribeUser(endpoint)` che scrivono/cancellano su Neon, legate a `currentUser()`.
5. `src/lib/push.ts` — wrapper `web-push`: `setVapidDetails`, `sendPushToUser(userId, payload)` che carica le subscription da DB, invia, e pota le `410/404`.
6. `src/components/pwa/push-manager.tsx` (client) — registra il SW, gestisce subscribe/unsubscribe, rileva `isSupported`/`isStandalone`/`isIOS`.
7. `src/components/pwa/install-prompt.tsx` (client) — cattura `beforeinstallprompt` (Chrome/Edge/Android) e mostra bottone "Installa"; su iOS mostra istruzioni "Condividi → Aggiungi a Home".

Modifiche:
8. `src/app/layout.tsx` — aggiungere export `viewport` (themeColor light/dark, `viewport-fit=cover`) e `appleWebApp` in `metadata`. Non toccare i font/`metadata` esistenti.
9. `src/proxy.ts` — estendere il matcher per **escludere** `manifest.webmanifest`, `sw.js`, `icon-*`, `apple-icon*` dal redirect a `/login` (GOTCHA §1). Esempio: `"/((?!api/auth|login|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icon-|apple-icon).*)"`.
10. `next.config.ts` — aggiungere `headers()` per `/sw.js` (`Cache-Control: no-cache, no-store, must-revalidate`, `Content-Type: application/javascript; charset=utf-8`) e, opzionale, gli header di sicurezza globali della guida (`X-Content-Type-Options`, ecc.). Valutare `web-push` in `serverExternalPackages` se la build lo richiede.
11. `prisma/schema.prisma` — nuovo modello (poi `prisma migrate` sul Neon condiviso, coordinato con l'analisi notifiche):
    ```prisma
    model PushSubscription {
      id        String   @id @default(cuid())
      userId    String
      user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
      endpoint  String   @unique
      p256dh    String
      auth      String
      userAgent String?
      createdAt DateTime @default(now())
      @@index([userId])
    }
    ```
    e relazione inversa `pushSubscriptions PushSubscription[]` su `User`.
12. `.env` (+ Vercel env, tutte e 3 le scope): `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (generate una volta con `npx web-push generate-vapid-keys`). **Attenzione al gotcha noto in memoria**: niente virgolette attorno ai valori quando si aggiungono su Vercel (ha già rotto gli upload Blob in prod).
13. `src/lib/activity.ts` — nel punto dove oggi parte `notifyTelegramForActivity`, aggiungere il fan-out web push riusando destinatari + esclusione `actorId` + filtro `PUSH_TYPES` già presenti. Coordinare concettualmente con l'analisi notifiche separata (unico `notify()` a monte).

### 5.2 Service Worker (comportamento)

- `install`: `self.skipWaiting()`; (opzionale) precache `['/offline', '/icon-192.png']`.
- `activate`: `clients.claim()` + cleanup cache vecchie per versione (`sw-shell-v1`).
- `fetch`: **passthrough** — `return` immediato per tutto ciò che è `/api/*`, `/login`, method ≠ GET, e per HTML/RSC. Nessun HTML/dato autenticato in cache (anti-leak cross-tenant e anti-stale, §3/§4). Al massimo `CacheFirst` per le icone.
- `push`: `event.data.json()` → `showNotification(title, { body, icon: '/icon-192.png', badge: '/badge.png', data: { url } })`.
- `notificationclick`: `close()` → cerca una finestra client sul dominio, `focus()` + `navigate(url)`, altrimenti `clients.openWindow(url)`.

### 5.3 UX di installazione per piattaforma

- **Chrome/Edge desktop**: `beforeinstallprompt` catturato → bottone "Installa app" nel profilo/onboarding; `prompt()` on click. Risultato: icona + finestra dedicata (`display: standalone`).
- **Android (Chrome)**: identico; in più Chrome mostra la mini-infobar nativa.
- **iOS Safari**: nessun evento. Mostrare scheda "Installa in 3 passi": Condividi ⎋ → "Aggiungi alla Home" → aprire l'app dall'icona. Rilevamento `isIOS && !isStandalone` per mostrarla; nasconderla in `display-mode: standalone`.
- **Gating del bottone push**: mostrare "Attiva notifiche" solo se `'serviceWorker' in navigator && 'PushManager' in window`. Su iOS in tab (non-standalone): sostituirlo con l'istruzione di installazione (il push lì non funziona finché non installata, §3).

### 5.4 Aggancio notifiche push (flusso completo)

1. Utente logga (cookie sessione presente) → `PushManager` registra `/sw.js`.
2. Utente clicca "Attiva notifiche" → `Notification.requestPermission()` → `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: <VAPID pubblica> })`.
3. Client invia la subscription serializzata alla Server Action `subscribeUser` → persistita in `PushSubscription` legata a `currentUser().id`.
4. Evento di dominio (es. Luca consegna → `DELIVERED`) crea `Activity` in una Server Action → `createActivity` calcola i destinatari (membri del workspace ≠ actor) → per ciascuno `sendPushToUser(userId, { title, body, url })` (via `web-push`, Node runtime) **in parallelo a/al posto di** Telegram.
5. Il SW del destinatario riceve `push` → `showNotification`. Click → deep-link al contenuto.
6. `sendPushToUser` elimina le subscription che rispondono `410/404`.

### 5.5 Ordine di implementazione consigliato (per quando si passerà al codice)

1. Fix `proxy.ts` matcher + `manifest.ts` + icone + `viewport` → **installabilità** verificabile subito (Lighthouse "Installable", prompt Chrome). Nessun push ancora.
2. Header `sw.js` in `next.config.ts` + `public/sw.js` minimale (solo push/click) + registrazione.
3. Modello `PushSubscription` + migrazione Neon + VAPID env (senza virgolette).
4. Server Actions subscribe/unsubscribe + `src/lib/push.ts`.
5. Aggancio in `activity.ts` + UX gating iOS/standalone.
6. Verifica browser reale su desktop Chrome, Android Chrome, iPhone Safari installato (memoria: sempre verificare in browser prima del merge; commit solo se funziona).

### 5.6 Rischi residui da tenere d'occhio
- iOS: push solo post-installazione, iOS ≥ 16.4 — comunicarlo a Luca come procedura, non come bug.
- Version skew UI/Server Actions post-deploy Vercel: mitigato non cachando HTML/RSC.
- `web-push` + Turbopack bundling: verificare in build; eventuale `serverExternalPackages`.
- Migrazione Prisma su **Neon condiviso** (prod + locale sullo stesso DB): coordinare con l'analisi notifiche per non duplicare il modello subscription.
