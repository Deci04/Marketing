# Orchestrazione a subagenti — Runbook della serata

> Compagno di: `specs/2026-07-04-serata-multi-feature-design.md` (design) e `plans/2026-07-04-fondamenta.md` (piano 0).
> Questo doc è il **runbook operativo**: chi fa cosa, in che ordine, con quali gate. Pronto da eseguire dopo l'Onda 0.

## 1. Modello di orchestrazione

- **Orchestratore = io** (loop principale). Non un Workflow autonomo: l'Onda 0 (OAuth/chiavi) e i browser-verify sono interattivi e non automatizzabili.
- **Per ogni filone**, pipeline fissa:
  ```
  Planner → Implementer (worktree isolato) → Reviewer ×N (avversariale) → fix loop → [browser-verify] → merge seriale su main
  ```
- **Isolamento**: ogni filone dell'Onda 2 gira in un **git worktree** dedicato (branca da `main` post-Fondamenta). I filoni non si toccano i file a vicenda (vedi §4).
- **Merge seriali**: i worktree lavorano in parallelo, ma il **merge su `main` è uno alla volta**, dopo il gate del filone. "Commit solo quando funziona" → il merge su main *è* l'atto di commit, fatto solo a filone verificato; nessun push finché non concordato.

## 2. Grafo delle onde (ordine eseguibile + dipendenze)

```
ONDA 0  setup interattivo (insieme)         ── gate: chiavi/OAuth ok
   │
ONDA 1  Fondamenta (1 agente, seriale)      ── gate: migration prod deliberata + merge
   │      Piano: plans/2026-07-04-fondamenta.md
   ▼
ONDA 2  PARALLELO (worktree)                 ── file disgiunti
   ├ G  Google Calendar        (browser-verify)
   ├ Z  Zernio ingestion       (browser-verify)   [per-post dipende da W]
   ├ T  Diario/webhook         (browser-verify)
   ├ H  Home per-ruolo         (review only)
   └ S  Ricerca + archivio     (review only)
   ▼
ONDA 3
   ├ N  Notifiche      dipende da T (telegram client + telegramChatId)
   ├ W  Pubblicazione  ULTIMO, QA rinforzato + post di prova reale
   └ A  Verifica viz   dipende dai dati di Z
   ▼
ONDA 4  cross-cutting (per ultimi)
   ├ M  Mobile completo
   └ P  Caccia bug avversariale + debug
```

**Dipendenze dure**: N→T · W→(Z client) · Z(per-post)→W · A→Z · tutto→Fondamenta.

## 3. Contratti dei subagenti (template riusabili)

### 3a. Planner (input: spec §4 del filone + file-set §4 del runbook)
> Sei il Planner del filone **{COD}**. Leggi lo spec del filone in `specs/2026-07-04-serata-multi-feature-design.md` §4 e la mappa file. Produci un piano bite-sized TDD (stile `plans/2026-07-04-fondamenta.md`): file esatti, interfacce (consumes/produces con firme), step da 2-5 min, test reali. Rispetta le Global Constraints. NON scrivere codice di feature, solo il piano. Output = il markdown del piano.

### 3b. Implementer (input: piano del filone + worktree)
> Implementa il piano del filone **{COD}** nel worktree assegnato, task per task, TDD. Tocca SOLO i file nel tuo file-set (§4); se ti serve altro, fermati e segnalalo. NON fare merge su main. Rispetta la Gotcha checklist (§5). Output = diff + note su cosa hai verificato.

### 3c. Reviewer avversariale (input: diff + spec del filone)
> Sei un revisore avversariale del filone **{COD}**. NON dire "sembra ok": **prova a romperlo**. Verifica (1) aderenza allo spec §4, (2) correttezza (dai uno scenario di fallimento concreto), (3) ogni voce della Gotcha checklist §5. Riporta i finding come CONFIRMED/PLAUSIBLE con file:line e scenario. Verdetto finale: PASS / FAIL-con-fix-richiesti.

**#reviewer per rischio**: G/Z/W/T = 2-3 reviewer · H/S = 1 · M/P = pass dedicato (P *è* la caccia bug).

### 3d. Fix loop — a convergenza, con lente che ruota

Il loop review→fix **non è un numero fisso di giri**: cicla finché il reviewer passa pulito, con un **tetto per rischio**. La chiave è che **ogni giro guarda un asse diverso**, così i giri extra trovano cose nuove invece di ri-timbrare.

**Lente per giro:**
1. **Correttezza** — logica giusta? casi base? funziona?
2. **Casi limite & gotcha** — la checklist §5, input malformati, stati assurdi, race di sync.
3. **Aderenza allo spec & completezza** — fa *esattamente* lo spec §4? manca un pezzo? requisito scoperto?

**Guard anti-thrash:**
- Ogni fix **non deve regredire** i finding dei giri precedenti (si ri-controllano).
- Se un giro non trova **niente di nuovo due volte di fila** → stop (convergenza raggiunta).

**Tetto per rischio:**
- **G, Z, W, T** → fino a **3 giri** con le 3 lenti (un bug costa caro: sync errato, qualità post degradata).
- **H, S** → **1-2 giri** (basso rischio).
- **M** → giro correttezza + giro mobile-specifico. **P** *è* già la caccia bug avversariale (nessun loop aggiuntivo).

## 4. Assegnazioni per filone (file-set posseduti)

| Filone | Worktree | File-set posseduto (owned) | Dipende da | Gate |
|--------|----------|-----------------------------|-----------|------|
| **G** | `wt/g-gcal` | `src/lib/google-calendar.ts`, `src/app/api/integrations/google/**`, hook in `src/lib/calendar.ts`+`content.ts`, UI `profilo` | Fondamenta | browser-verify |
| **Z** | `wt/z-zernio` | `src/lib/zernio.ts` (analytics), `src/app/(app)/kpi/actions.ts` (refresh), UI `/kpi`+`profilo` | Fondamenta | browser-verify |
| **T** | `wt/t-diario` | `src/app/api/telegram/webhook/**`, `src/lib/telegram.ts`, `src/app/(app)/diario/**`, `searchDiary` in `chat-tools.ts`, sidebar `layout.tsx`, linking in `profilo` | Fondamenta | browser-verify |
| **H** | `wt/h-home` | `src/app/(app)/home/page.tsx`, `src/lib/workflow.ts` | Fondamenta | review |
| **S** | `wt/s-ricerca` | `src/lib/content.ts` (split+paginazione), `src/app/(app)/contenuti/**`, `src/app/(app)/archivio/**`, `archive-table.tsx` | Fondamenta | review |
| **N** | `wt/n-notifiche` | corpo di `notifyTelegramForActivity` in `src/lib/activity.ts` | T | review |
| **W** | `wt/w-publish` | `publish()` in `src/lib/zernio.ts`, `publishContentAction`, UI `content-modal.tsx` | Z, T merge | browser-verify + post reale |
| **A** | — | eventuali box in `dashboard-config.ts`+`kpi-boxes.tsx` (solo se richiesti) | Z | review |
| **M** | `wt/m-mobile` | responsive cross-cutting (dopo i merge) | tutto | browser-verify mobile |
| **P** | — | caccia bug su tutta l'app + fix mirati | tutto | — |

**Conflitti potenziali da sorvegliare** (stesso file toccato da più filoni → merge attento, non parallelo cieco): `src/lib/content.ts` (G hook + S split), `src/lib/calendar.ts` (solo G), `src/lib/activity.ts` (stub in Fondamenta, corpo in N), `profilo` (G+Z+T UI). Mitigazione: G e S ordinati (S prima, poi G rebase), UI profilo aggregata in un piccolo task condiviso in Fondamenta se serve.

## 5. Gotcha checklist (i reviewer la applicano sempre)

- [ ] Env letto via `process.env.X`, **valori senza virgolette**; degrada in silenzio se manca.
- [ ] Next 16 **custom** → API App Router verificate su `node_modules/next/dist/docs/`.
- [ ] `react-grid-layout` **v2** (API diversa) per KPI/mobile.
- [ ] Date calendario = **mezzanotte UTC** (`new Date(\`${ymd}T00:00:00.000Z\`)`), niente fuso locale.
- [ ] Ogni query lib usa **`scopedWhere(workspaceId, …)`**.
- [ ] Webhook (Telegram/Google) = **secret header**, MAI `currentContext()`.
- [ ] Media Telegram = **solo `file_id`**, nessun byte su Blob (T).
- [ ] Pubblicazione (W) = **originale a piena qualità, mai il proxy**; validazione specifiche.
- [ ] Migration = **additiva** (nullable/CREATE), nessun DROP.

## 6. Protocollo di merge & commit

1. Worktree lavora → gate del filone (browser-verify o review pulita).
2. Merge su `main` **uno alla volta** (rebase se il file-set collide — vedi §4).
3. **Commit su main = solo a filone funzionante e verificato** (regola utente). Nessun push finché non concordato.
4. Dopo ogni merge dei filoni "shared-file", il worktree successivo fa **rebase su main** prima di continuare.

## 7. Gate che richiedono l'utente (dove mi fermo)

- **Onda 0**: creare OAuth Google + calendario condiviso · account Zernio + key + connettere social · bot @BotFather + webhook · env su Vercel (no virgolette). *Insieme.*
- **Migration Fondamenta**: è su Neon **condiviso col prod** → conferma esplicita prima di `prisma migrate`.
- **Browser-verify** G/Z/T/W: i login/gli OAuth li fai tu; W = post di prova reale.
- **Il "via"** al rilascio parallelo dei subagenti dell'Onda 2.

## 8. Stato attuale

- ✅ Spec design completo · ✅ Piano 0 Fondamenta · ✅ questo runbook.
- ⏸️ In attesa dell'utente per: Onda 0 + conferma migration su prod, poi rilascio parallelo Onda 2.
- Nulla è stato eseguito su DB/codice/servizi esterni.
```
