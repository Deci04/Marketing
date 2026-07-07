# Design — KPI ONDATA 1: dati diretti Zernio + card combinabili

> Data: 2026-07-07 · Branch: `serata/multi-feature` · Stato precedente: `docs/superpowers/plans/HANDOFF.md`
> Contesto dati: `docs/superpowers/plans/2026-07-07-zernio-data-inventory.md`

## Obiettivo

Portare in dashboard **tutti i dati DIRETTI** che Zernio espone via `account-insights` (12 metriche
oggi non sfruttate) e le demografiche mancanti (`city`, audience *engaged*), ognuno con **delta vs
periodo precedente** che **segue il selettore 7/30/90**. I box numero-singolo diventano **card
combinabili**: divisibili in tile singoli e unibili in cluster, a scelta dell'utente.

Ordine di priorità dei box (direttiva utente): **DIRETTI da Zernio → DERIVATI → MANUALI**.

**Vincolo**: nessuna migration Prisma. Si riusano i modelli esistenti `Measurement`,
`AudienceSegment`, `DashboardLayout` (colonna Json).

Fuori scope (ONDATA 2, sessione futura): per-post ranking, best-time, posting-frequency,
content-decay, watch-time reel, storie, health series, modello `ZernioSnapshot`.

---

## 1. Metriche in gioco

### 1a. Diretti da `account-insights` (12) — `metricType=total_value`
`reach, views, accounts_engaged, total_interactions, likes, comments, saves, shares, replies,
reposts, follows_and_unfollows, profile_links_taps`.

Valori reali Luca (finestra ~88gg): views 41337, accounts_engaged 753, total_interactions 1732,
likes 1284, comments 50, saves 112, shares 131, reposts 24, reach 9363; `replies`,
`follows_and_unfollows`, `profile_links_taps` = 0 (Meta non li popola per questo account →
si mostrano come `0`/`n.d.`, non nascosti).

Breakdown extra: `reach` × `media_product_type` (REEL 100% per Luca).

### 1b. Profilo & salute (da `/accounts` + `/accounts/health`)
`followers` (già), `following` (13), `mediaCount` (12), `tokenExpiresAt` (→ giorni alla scadenza),
`platformStatus`/`health.status`. Servono per una card "Profilo & salute" con warning riconnessione.

### 1c. Demografiche nuove (da `/analytics/instagram/demographics`)
- `city` (oltre a country già ingerito) per `follower_demographics`.
- `engaged_audience_demographics` per `age` e `gender` (confronto follower-vs-engaged).

### 1d. DERIVATI (già esistenti, invariati)
`engagement_rate`, `save_rate`, `share_rate`, `reach_rate`, `non_follower_pct`, `follower_growth`,
`conversion_to_conversation`, funnel, vs-benchmark.

### 1e. MANUALI (già esistenti, invariati)
North Star / conversazioni di valore, audience manuali (activity/returning).

---

## 2. Data layer (`src/lib/zernio.ts`)

### 2a. `fetchAccountInsights(accountId, since, until) → Record<MetricKey, number>`
Una sola chiamata GET `/analytics/instagram/account-insights?accountId=…&metrics=<12 csv>&metricType=total_value&since=…&until=…`.
Legge `metrics[<name>].total` per ciascuna. Degrada a `{}` su errore (endpoint premium/flaky).
Nota: `since` non può superare `until − 88gg` (limite Zernio); il chiamante rispetta la finestra.

### 2b. Fetch per-periodo con doppia finestra (nel refresh action, non in `fetchAnalytics`)
Il delta segue il selettore, quindi per **ogni preset p ∈ {7,30,90}** si fetchano due finestre:
- corrente: `[to−p, to]`
- precedente: `[to−2p, to−p]`

→ 6 chiamate `account-insights` per refresh (accettabile). `p=90` usa finestra effettiva 88 per il
limite Zernio (documentato nel codice). Le finestre sono calcolate con `periodWindow` (già in `kpi.ts`).

### 2c. `fetchDemographics` esteso
`breakdown=age,gender,country,city` e due `metric`: `follower_demographics` +
`engaged_audience_demographics`. Ritorna `ZernioDemographic[]` con `dimension` estesa:
`age | gender | geo | city | age_engaged | gender_engaged` (`geo` resta = country per retrocompat).

### 2d. Profilo
`fetchAccountProfile(accountId) → { following, mediaCount, tokenExpiresAt, status }` da
`/accounts` (+ `/accounts/health` per `status`/giorni-token). Degrada a `null`.

---

## 3. Storage — nessuna migration

### 3a. `Measurement` con namespacing sul campo `metric` (stringa libera, come `non_follower_pct`)
Per ogni metrica diretta `m`, periodo `p`, si scrivono **due righe**:

| metric | date | value | series | channel |
|---|---|---|---|---|
| `insight:<m>:p<p>` | `to` (fine finestra corrente) | totale corrente | `Luca` | canale |
| `insight:<m>:p<p>` | `to−p` (fine finestra precedente) | totale precedente | `Luca` | canale |

Delta a lettura = `value(date=max) − value(date=precedente)`. L'idempotenza delete-then-create
esistente è già keyed su `(metric, series, channel, date)` → nessun cambiamento alla transazione.

Profilo → `Measurement` `profile:following`, `profile:media`, `profile:token_days`. Un'unica data =
giorno di refresh. Il conteggio follower diretto (`MetricKey` `followers_direct`) **non** crea una
riga nuova: legge l'ultima `Measurement` `followers` già ingerita (nessuna duplicazione).

### 3b. `AudienceSegment` con nuove `dimension`
`city`, `age_engaged`, `gender_engaged` (oltre a `age`/`gender`/`geo` esistenti). Normalizzazione a
% per-dimensione già gestita da `mapAudienceSegments` (invariata). `city` → top 45; in UI si mostrano
top ~8.

### 3c. Nuovi mapper puri (unit-testabili)
- `mapDirectInsights(perPeriod: { period, current, previous }[], channel) → MeasurementUpsert[]`
  produce le righe `insight:<m>:p<p>` (salta i null; scrive `0` reali come 0).
- `mapProfile(profile, channel, date) → MeasurementUpsert[]`.
- `mapAudienceSegments` invariato (riceve anche city/engaged).

`MeasurementUpsert.metric` diventa `string` (non più union ristretta), per accogliere i namespace.

---

## 4. Read layer (`src/lib/kpi.ts` / `getKpiData`)

### 4a. Nuovo tipo `MetricKey` (12 diretti + profilo)
```
type MetricKey =
  | "reach" | "views" | "accounts_engaged" | "total_interactions"
  | "likes" | "comments" | "saves" | "shares" | "replies" | "reposts"
  | "follows_and_unfollows" | "profile_links_taps"
  | "following" | "media" | "token_days" | "followers_direct";
```

### 4b. `directMetrics: Record<MetricKey, DirectMetric>` nel `KpiData`
```
type DirectMetric = { value: number | null; deltaAbs: number | null; deltaPct: number | null };
```
Calcolato leggendo, per il periodo `filter.period`, le righe `insight:<m>:p<period>` (corrente =
data max, precedente = l'altra). `deltaPct = (cur−prev)/prev*100` (null se `prev` 0/assente).

### 4c. `audience` esteso
Le nuove `dimension` (`city`, `age_engaged`, `gender_engaged`) fluiscono già nel raggruppamento
esistente di `getKpiData` (nessuna logica nuova, solo dati in più).

---

## 5. UI — card combinabili

### 5a. Modello dati nel Json di `DashboardLayout` (nessuna migration)
`dashboard-config.ts` — `StoredLayout` guadagna un campo:
```
type MetricCard = { i: string; metrics: MetricKey[] };   // i = `mc:<slug>`
type StoredLayout = { items: GridItem[]; hidden: BoxId[]; metricCards: MetricCard[] };
```
- `items` continua a contenere UN grid-item per ogni card (chiave `i` = `mc:*`) oltre ai box legacy.
- `normalizeLayout` esteso: accetta gli `i` che iniziano con `mc:` **se** presenti in `metricCards`;
  droppa metric-card orfane; se `metricCards` manca (layout vecchio) usa il **default curato** (§5c).
- `ALL_BOX_IDS` resta per i box legacy; le metric-card sono validate contro `metricCards`.

### 5b. Renderer `MetricCard` (nuovo componente in `kpi-boxes.tsx` o file dedicato)
- **1 metrica** → tile grande: label, icona, valore (`int`/`pctFromPercent` secondo unità),
  **delta** `▲ +12%` / `▼ −4%` colorato (verde sage / rosso coral / grigio se null), sparkline se
  esiste serie giornaliera per quella metrica (per ora solo dove disponibile; altrimenti niente).
- **N metriche** → lista compatta: righe `icona · label · valore · delta`. Titolo card editabile
  (default "Interazioni", "Profilo & salute", …).
- Header con menu `⋯` (`kpi-no-drag`): **Dividi** (se `metrics.length > 1`) · **Unisci a…**
  (lista altre metric-card) · **Rimuovi**.

### 5c. Default curato (quando `metricCards` assente)
- `mc:reach` (Reach) · `mc:views` (Views) · `mc:engaged` (Accounts engaged) ·
  `mc:interactions-total` (Total interactions) — 4 tile headline.
- `mc:interazioni` = cluster [likes, comments, saves, shares, reposts, replies].
- `mc:profilo` = cluster [followers_direct, following, media, token_days] "Profilo & salute".

Posizionati in cima (y più bassi), **sopra** i box derivati e manuali → realizza l'ordine
Diretti → Derivati → Manuali nel `defaultLayout()`.

### 5d. Split / merge (server action + client)
- **Dividi**: rimuove la card cluster, crea N `MetricCard` single-metric (`i=mc:<metric>`), assegna
  grid-item nello spazio liberato; salva il layout.
- **Unisci**: sposta le metriche della card sorgente nella target (dedup, ordine preservato),
  rimuove la sorgente; salva.
- **Aggiungi**: la palette "aggiungi box" elenca le `MetricKey` non presenti in nessuna card →
  crea una card single-metric.
- Persistenza via l'azione di salvataggio layout esistente (stessa che salva drag/resize).

### 5e. Formattazione delta
Nuovo helper in `kpi-format.ts`: `delta(deltaPct) → { text: "+12%" | "−4%" | "—", tone: "up"|"down"|"flat" }`.

---

## 6. Ordine e integrazione refresh

`refreshKpiAction` (`src/app/(app)/kpi/actions.ts`): dopo `fetchAnalytics`/`ingestAnalytics`
attuali, per ogni account IG aggiunge il fetch per-periodo (§2b) + `fetchAccountProfile` e chiama i
nuovi mapper → `ingestAnalytics` (o una funzione sorella `ingestDirectInsights`) scrive le righe
namespaced. Il summary toast include il conteggio delle nuove misure.

---

## 7. Test

**Unit (pure, no rete)** in `tests/`:
- `mapDirectInsights`: 12 metriche × 3 periodi × 2 finestre → righe `insight:*:p*` corrette; `0`
  reali preservati; null saltati.
- lettura delta in `getKpiData` (con DB fixture o funzione pura estratta): `cur−prev`, `deltaPct`,
  `prev=0 → null`.
- `normalizeLayout`: metric-card valide sopravvivono, orfane droppate, layout vecchio → default curato.
- split/merge: trasformazioni pure su `StoredLayout` (dividi produce N card; unisci deduplica).
- `mapAudienceSegments` con city/engaged: normalizzazione % per-dimensione.

**Verifica live** (dati reali Luca, come da regole): refresh → i valori diretti compaiono coi delta,
divido un cluster, unisco due tile, cambio periodo e il delta cambia. Browser-verify prima del merge.

---

## 8. File toccati (riepilogo)

- `src/lib/zernio.ts` — `fetchAccountInsights`, `fetchAccountProfile`, `fetchDemographics` esteso,
  nuovi mapper, `MeasurementUpsert.metric: string`.
- `src/app/(app)/kpi/actions.ts` — refresh per-periodo + profilo.
- `src/lib/kpi.ts` — `MetricKey`, `directMetrics`, lettura delta, audience esteso.
- `src/lib/dashboard-config.ts` — `MetricCard`, `StoredLayout.metricCards`, `normalizeLayout`,
  `defaultLayout` con ordine Diretti→Derivati→Manuali, trasformazioni split/merge pure.
- `src/components/kpi/kpi-boxes.tsx` (+ eventuale `metric-card.tsx`) — renderer card + menu ⋯.
- `src/components/kpi/kpi-format.ts` — helper `delta`.
- `tests/` — nuovi unit.

Nessuna modifica a `prisma/schema.prisma`.
