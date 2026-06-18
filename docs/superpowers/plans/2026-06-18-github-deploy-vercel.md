# GitHub + Deploy su Vercel — Setup Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to run this task-by-task. This is an **ops/setup runbook**, not a TDD feature plan: steps use *verification* (expected outcome) instead of unit tests. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Mettere il codice su GitHub e l'app online su Vercel, con **deploy automatico a ogni modifica** e un **database nel cloud** (Neon), così c'è un link live da mostrare a Luca e un backup dal giorno 1.

**Architecture:** GitHub ospita il codice (con cronologia). Vercel è collegato al repo: a ogni `push` ricostruisce e ripubblica l'app da solo. Il database in produzione è **Neon Postgres** provisionato dal Vercel Marketplace (inietta da solo le variabili nel progetto). Lo sviluppo locale resta su Postgres locale (file `.env`); il cloud usa le variabili iniettate da Vercel.

**Tech Stack:** GitHub · Vercel CLI · Vercel Marketplace (Neon Postgres) · Prisma (`migrate deploy`).

> **Prerequisito:** il **Modulo 1 "Fondamenta"** dev'essere già stato costruito in locale (app che gira, `git init` già fatto in `~/claudbot/content-tool`, schema Prisma + migrazione locale presenti). Questo piano si esegue **dopo** quello.

> **Grounding:** comandi verificati con le skill `vercel:vercel-cli` e `vercel:vercel-storage` (mar 2026). Note importanti recepite: `@vercel/postgres` è dismesso → si usa Neon; Prisma con Neon richiede una **URL diretta** per le migrazioni; Prisma legge solo `.env` (non `.env.local`).

> **Legenda:** 👤 = azione che fai tu (account/clic/autorizzazioni) · 🤖 = la faccio io (codice/config/comandi). Per le azioni 👤 ti guido a voce passo-passo.

---

## Prerequisiti (una tantum)

- [ ] **👤 Step 1: Account GitHub** — se non ce l'hai, crealo su https://github.com (gratis).
- [ ] **👤 Step 2: Account Vercel** — crealo su https://vercel.com con "Continue with GitHub" (così sono già collegati).
- [ ] **🤖 Step 3: Aggiorna la Vercel CLI** (la tua è vecchia):
```bash
npm i -g vercel@latest
vercel --version
```
Atteso: versione ≥ 54.x.
- [ ] **🤖 Step 4: Verifica Node** ≥ 20:
```bash
node -v
```
Atteso: v20 o superiore (richiesto da Neon/strumenti). Se è inferiore, installiamo Node 20+ prima di proseguire.

---

## Task 1: Repository su GitHub + primo push

**Files:** nessuna modifica al codice; si crea il repo remoto e si carica.

- [ ] **👤 Step 1: Login GitHub da terminale (se hai `gh`)**

Verifico io se hai la GitHub CLI:
```bash
gh --version
```
Se c'è: 👤 esegui `gh auth login` e segui il browser. Se non c'è: salta al passo "fallback" qui sotto.

- [ ] **🤖 Step 2a: Crea il repo e fai push (con `gh`)**

Dalla cartella dell'app:
```bash
cd ~/claudbot/content-tool
gh repo create content-tool --private --source=. --remote=origin --push
```
Atteso: repo privato creato su GitHub e codice caricato.

- [ ] **👤🤖 Step 2b (fallback, senza `gh`):**

👤 Crea un repo **privato** vuoto su https://github.com/new chiamato `content-tool` (niente README/gitignore). Poi 🤖 io collego e pusho:
```bash
cd ~/claudbot/content-tool
git remote add origin https://github.com/<tuo-utente>/content-tool.git
git branch -M main
git push -u origin main
```
Atteso: il codice compare nel repo su GitHub.

- [ ] **Step 3: Verifica** — 👤 apri il repo su GitHub: vedi i file dell'app.

---

## Task 2: Collega il progetto a Vercel (+ deploy automatico da Git)

**Files:** crea `.vercel/` (config locale, già git-ignorato).

- [ ] **🤖 Step 1: Login Vercel**

```bash
vercel login
```
👤 conferma nel browser. Poi verifico l'account giusto:
```bash
vercel whoami
```

- [ ] **🤖 Step 2: Collega la cartella a un progetto Vercel**

```bash
cd ~/claudbot/content-tool
vercel link
```
Rispondi alle domande (crea nuovo progetto "content-tool"). Atteso: creato `.vercel/project.json`.

- [ ] **🤖 Step 3: Collega il repo Git per l'auto-deploy**

```bash
vercel git connect
```
Atteso: il progetto Vercel è agganciato al repo GitHub → ogni `push` su `main` farà un deploy di produzione, ogni push su altri branch un'anteprima.

- [ ] **Step 4: Verifica** — 👤 sul dashboard Vercel il progetto "content-tool" risulta connesso al repo GitHub.

---

## Task 3: Database nel cloud (Neon via Marketplace)

**Files:** nessuna (le variabili le inietta Vercel).

- [ ] **🤖 Step 1: Provisiona Neon Postgres**

```bash
cd ~/claudbot/content-tool
vercel integration add neon
```
👤 segui il browser per autorizzare/creare il database (piano free). Atteso: Neon collegato al progetto; Vercel inietta da solo le variabili (`DATABASE_URL`, e una versione **unpooled/diretta** tipo `DATABASE_URL_UNPOOLED`).

- [ ] **🤖 Step 2: Vedi quali variabili sono state iniettate**

```bash
vercel env ls
```
Atteso: compaiono `DATABASE_URL` e una variante unpooled. Annoto il nome esatto della variante diretta (serve al Task 4).

---

## Task 4: Configura Prisma per Neon (URL diretta per le migrazioni)

Neon dà due indirizzi: uno "pooled" (per l'app) e uno "diretto" (per le migrazioni). Prisma li vuole entrambi.

**Files:**
- Modify: `prisma/schema.prisma` (datasource)
- Modify: `package.json` (build script)

- [ ] **🤖 Step 1: Aggiungi `directUrl` allo schema**

In `prisma/schema.prisma`, sostituisci il blocco `datasource`:
```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")   // pooled, usato dall'app
  directUrl = env("DIRECT_URL")     // diretto, usato dalle migrazioni
}
```

- [ ] **🤖 Step 2: Imposta `DIRECT_URL` su Vercel**

Mappa `DIRECT_URL` sul valore della variabile unpooled vista al Task 3 (sostituisci il nome reale se diverso):
```bash
vercel env add DIRECT_URL production
# quando chiede il valore, incolla il contenuto di DATABASE_URL_UNPOOLED
```
(Ripeti per `preview` e `development` se vuoi anteprime funzionanti.) Atteso: `DIRECT_URL` presente in `vercel env ls`.

- [ ] **🤖 Step 3: La build deve generare il client Prisma e applicare le migrazioni**

In `package.json`, cambia lo script `build`:
```json
"build": "prisma generate && prisma migrate deploy && next build"
```
Così, a ogni deploy, Vercel applica le migrazioni al DB cloud e poi costruisce l'app.

- [ ] **🤖 Step 4: Commit**

```bash
git add prisma/schema.prisma package.json
git commit -m "chore: configure Prisma for Neon (directUrl) + migrate on build"
```

---

## Task 5: Variabile di sessione (AUTH_SECRET) su Vercel

L'app online ha bisogno del segreto di Auth.js, come in locale.

- [ ] **🤖 Step 1: Aggiungi AUTH_SECRET in produzione**

```bash
cd ~/claudbot/content-tool
vercel env add AUTH_SECRET production
```
Incolla un segreto (puoi rigenerarne uno con `npx auth secret` e copiarne il valore, oppure una stringa casuale lunga). Ripeti per `preview` se vuoi le anteprime.

- [ ] **Step 2: Verifica** — `vercel env ls` mostra `AUTH_SECRET`, `DATABASE_URL`, `DIRECT_URL`.

---

## Task 6: Primo deploy in produzione

- [ ] **🤖 Step 1: Deploy**

```bash
cd ~/claudbot/content-tool
vercel --prod
```
Atteso: build OK (genera Prisma, applica migrazioni sul DB cloud, builda Next.js) e una **URL di produzione** stampata a fine comando.

- [ ] **🤖 Step 2: Se la build fallisce** — leggo i log:
```bash
vercel logs <url-del-deploy>
```
Le cause tipiche: variabile mancante (rimando al Task 4/5) o `DIRECT_URL` errata. Le sistemo e rilancio.

- [ ] **Step 3: Verifica** — 👤 apri la URL di produzione: vieni rediretto a `/login`.

---

## Task 7: Popola il database cloud (seed: workspace + Matteo + Luca)

Le migrazioni sono già applicate dalla build; manca solo il seed iniziale, una tantum.

**Files:** crea (temporaneo, git-ignorato) `.env.production.local`.

- [ ] **🤖 Step 1: Strumenti per leggere le env cloud**

```bash
npm i -D dotenv-cli
vercel env pull .env.production.local
```
(`.env.production.local` è ignorato in sviluppo, quindi NON tocca il tuo `next dev` locale.)

- [ ] **🤖 Step 2: Esegui il seed contro il DB cloud**

```bash
npx dotenv -e .env.production.local -- npx prisma db seed
```
Atteso: "Seeded workspace 'Luca' …" (Prisma di norma legge solo `.env`, per questo usiamo `dotenv` per puntare alle env cloud).

- [ ] **Step 3: Verifica** — 👤 sulla URL di produzione fai login con `matteodecenzo@gmail.com` → entri nella shell, sidebar mostra "Luca".

---

## Task 8: Verifica dell'auto-deploy (il pezzo "magico")

- [ ] **🤖 Step 1: Fai una micro-modifica e pusha**

Cambio una parola visibile (es. il titolo nella pagina KPI), poi:
```bash
git add -A
git commit -m "chore: test auto-deploy"
git push
```

- [ ] **Step 2: Verifica** — 👤 sul dashboard Vercel parte un nuovo deploy da solo; a fine, la modifica è online senza che nessuno abbia rilanciato `vercel --prod`.

---

## Definition of Done (questo setup)

- Il codice è su GitHub (repo privato `content-tool`).
- Vercel è collegato al repo: **ogni push ripubblica l'app da solo**.
- Esiste un **database Neon nel cloud**; le migrazioni si applicano in build.
- C'è una **URL di produzione** dove fai login ed entri nel workspace "Luca".
- Lo sviluppo locale (`.env` + Postgres locale) resta separato e intatto.

**Da qui in poi:** costruisci i moduli successivi in locale; ogni volta che pushi, la versione online si aggiorna da sola. Quando un modulo aggiunge tabelle nuove, basta una nuova migrazione Prisma (la build la applica al cloud).
