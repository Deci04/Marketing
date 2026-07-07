# Inventario completo dei dati Zernio — account Instagram di Luca

> **Scopo**: base per creare un box dashboard per OGNI singolo dato che Zernio raccoglie.
> **Modalità**: sola scoperta. Nessuna modifica al codice dell'app. Endpoint chiamati DAVVERO
> con lo script temporaneo `scripts/zernio-inventory-probe.ts` (già cancellato), account reale di Luca.

## Contesto account (reale, catturato il 2026-07-07)

| Campo | Valore |
|---|---|
| `accountId` (Zernio SocialAccount) | `6a4cd5009d9472faaea5eab9` |
| Piattaforma | `instagram` (Business/Creator, `accountType: MEDIA_CREATOR`) |
| Username / display | `lucademarco.cf` / "Luca De Marco" |
| Bio | "Building the company of the future" |
| Follower | **317** · Following: 13 · Media pubblicati: 12 |
| `profileId` Zernio | `6a4849ee74e3018e76e606c5` ("Default") |
| Token IG | valido, scade 2026-09-05 (~59 giorni) |
| **`hasAnalyticsAccess`** | **`true`** — l'add-on Analytics è attivo, tutti gli endpoint premium rispondono |
| Account connesso il | 2026-07-07 (**oggi**) → le serie storiche giornaliere sono ancora VUOTE |

> **Nota trasversale sulle serie storiche**: l'account è stato collegato oggi. Gli endpoint che
> dipendono dallo *snapshotter giornaliero* di Zernio (`follower-history`, `follower-stats`)
> restituiscono array **vuoti** finché non accumulano giorni. Le metriche aggregate su finestra
> (account-insights, per-post, demografiche) invece funzionano già perché leggono lo storico Meta.

---

## Sintesi (conteggio metriche per fonte)

| Fonte (endpoint) | # dati distinti | Stato per Luca | Già ingerito da noi? |
|---|---|---|---|
| `GET /accounts` (profilo/oggetto account) | ~30 campi | pieno | Solo `zernioAccountId`, `platform`, `handle` |
| `GET /accounts/follower-stats` | 5 (+serie) | serie **vuota** | Sì (followers) — ma vuoto ora |
| `GET /accounts/health` + `/{id}/health` | ~12 | pieno | No |
| `GET /analytics/instagram/account-insights` | **12 metriche** + 2 breakdown | pieno (2 a zero) | Solo `reach` (per non_follower_pct) |
| `GET /analytics/instagram/follower-history` | 3 metriche (+serie) | **vuoto** (snapshotter nuovo) | No |
| `GET /analytics/instagram/demographics` | 4 dimensioni × 2 metriche | pieno e ricco | age, gender, country (solo follower) |
| `GET /analytics/daily-metrics` | 8 metriche/giorno + breakdown piattaforma | pieno | Solo per derivare engagement_rate |
| `GET /analytics` (per-post list + overview) | 12 campi/post + overview (5) | 12 post pieni | 6 metriche su Content |
| `GET /analytics/post-timeline` | 8 metriche/giorno/post | disponibile | No |
| `GET /analytics/best-time` | 4 campi/slot | pieno | No |
| `GET /analytics/content-decay` | 4 campi/bucket | pieno | No |
| `GET /analytics/posting-frequency` | 4 campi/riga | pieno | No |
| `GET /accounts/{id}/instagram/stories` + `/insights` | 13 metriche/storia | 0 storie attive ora | No |

**Totale**: ~13 fonti / ~90+ campi-dato distinti. Oggi ne ingeriamo una manciata
(followers, engagement_rate derivato, non_follower_pct, 6 metriche per-post + demografiche).

---

## 1. `GET /accounts` — oggetto account / profilo

Tipo: valore-singolo (snapshot). Ritorna `{ accounts: [...], hasAnalyticsAccess }`.

| Campo | Tipo | Unità | Valore reale Luca | Ingerito? | Note |
|---|---|---|---|---|---|
| `followersCount` | valore-singolo | conteggio | **317** | Parziale | duplicato in più endpoint |
| `metadata.profileData.extraData.followsCount` | valore-singolo | conteggio | 13 | No | "seguiti" |
| `metadata.profileData.extraData.mediaCount` | valore-singolo | conteggio | 12 | No | # post totali |
| `metadata.profileData.bio` | testo | — | "Building the company of the future" | No | |
| `metadata.profileData.accountType` | enum | — | `MEDIA_CREATOR` | No | |
| `profilePicture` / `profileUrl` | url | — | (cdn IG) / instagram.com/lucademarco.cf | No | avatar per header dashboard |
| `displayName` / `username` | testo | — | Luca De Marco / lucademarco.cf | Parziale (`handle`) | |
| `tokenExpiresAt` | data | — | 2026-09-05 | No | utile per warning riconnessione |
| `platformStatus` | enum | — | `active` | No | |
| `permissions[]` | array | — | 5 scope IG business | No | |
| `analyticsLastSyncedAt` | data | — | 2026-07-07T10:41:48Z | No | freschezza dati |
| `analyticsSyncFailureCount` | valore-singolo | conteggio | 0 | No | salute sync |
| `adsStatus` | enum | — | `connected` | No | |
| `hasAnalyticsAccess` (root) | booleano | — | `true` | No | gate per tutti i box premium |

## 2. `GET /accounts/follower-stats`

Storia follower + crescita. Tipo: serie-temporale + aggregati. `granularity` = daily/weekly/monthly.

| Campo | Tipo | Unità | Valore reale Luca | Ingerito? | Note |
|---|---|---|---|---|---|
| `accounts[].currentFollowers` | valore-singolo | conteggio | 317 | Sì | |
| `accounts[].growth` | valore-singolo | conteggio (delta) | 0 | No | crescita nella finestra |
| `accounts[].growthPercentage` | valore-singolo | % | 0 | No | |
| `accounts[].dataPoints` | valore-singolo | conteggio | 0 | No | # punti disponibili |
| `stats[accountId][]` = `{date, followers}` | **serie-temporale** | conteggio/giorno | **`[]` VUOTO** | Sì (via mapAccountMeasurements) | **GAP**: snapshotter appena partito |

## 3. `GET /accounts/health` e `/accounts/{id}/health`

Salute connessione. Tipo: valore-singolo. Non ingerito.

| Campo | Tipo | Valore reale Luca | Note |
|---|---|---|---|
| `status` | enum healthy/warning/error | `healthy` | |
| `canPost` / `canFetchAnalytics` / `analyticsSupported` | booleano | true / true / true | |
| `tokenValid` / `tokenStatus.expiresIn` | booleano / testo | true / "59 days" | |
| `tokenStatus.needsRefresh` / `needsReconnect` | booleano | false / false | trigger banner riconnessione |
| `permissions.posting/analytics/optional[]` | array scope | tutti granted | |
| `issues[]` | array | `[]` | |

## 4. `GET /analytics/instagram/account-insights` — LA FONTE PIÙ RICCA (poco sfruttata)

Insight a livello di ACCOUNT (tutte le superfici: feed, reels, storie, profilo). Finestra **max 90 giorni**
(default 30). Richiede add-on. Envelope: `metrics[<name>] = { total, values[]?, breakdowns[]? }`.

**Enum metriche VALIDE (confermato dall'API — 12 metriche):**
`reach, views, accounts_engaged, total_interactions, comments, likes, saves, shares, replies, reposts, follows_and_unfollows, profile_links_taps`

> ⚠️ **Correzione rispetto alle assunzioni del brief**: `impressions`, `profile_views`, `website_clicks`
> **NON** sono metriche valide (l'API rifiuta `impressions` con 400). Su IG post-2024 `views` sostituisce
> impressions. `profile_links_taps` è l'equivalente dei tap sui link/sito. `follows_and_unfollows` è
> l'unica metrica per follow/unfollow (non due separate) — e per Luca torna **0** (Meta non la popola
> a livello account per account piccoli/di questo tipo).

### 4a. Metriche (tutte `metricType=total_value`, finestra 88gg per Luca)

| Metrica | Tipo | Unità | Valore reale Luca | `time_series`? | Ingerito? | Note |
|---|---|---|---|---|---|---|
| `reach` | valore-singolo (+ breakdown) | conteggio | **9 363** | **Sì** (unica) | Solo per non_follower_pct | account unici raggiunti |
| `views` | valore-singolo | conteggio | **41 337** | No | **NO** | ex-impressions, tutte le superfici |
| `accounts_engaged` | valore-singolo | conteggio | **753** | No | **NO** | account che hanno interagito |
| `total_interactions` | valore-singolo | conteggio | **1 732** | No | **NO** | somma interazioni account |
| `likes` (account) | valore-singolo | conteggio | **1 284** | No | **NO** | like su tutto l'account |
| `comments` (account) | valore-singolo | conteggio | **50** | No | **NO** | |
| `saves` (account) | valore-singolo | conteggio | **112** | No | **NO** | |
| `shares` (account) | valore-singolo | conteggio | **131** | No | **NO** | |
| `replies` | valore-singolo | conteggio | 0 | No | **NO** | risposte alle storie; 0 ora |
| `reposts` | valore-singolo | conteggio | **24** | No | **NO** | |
| `follows_and_unfollows` | valore-singolo | conteggio netto | 0 (vuoto) | No | **NO** | non popolato per Luca |
| `profile_links_taps` | valore-singolo | conteggio | 0 (vuoto) | No | **NO** | tap sui link in bio; 0 ora |

> `reach` con `metricType=time_series` è teoricamente l'unica serie giornaliera, ma nella prova ha
> restituito **504 (timeout)** — endpoint flaky; da gestire con retry/fallback.

### 4b. Breakdown di `reach` (`metricType=total_value` + `breakdown=`)

Solo `reach` supporta breakdown; valori validi: **`media_product_type`, `follow_type`**
(`follower_type` e `contact_button_type` sono rifiutati con 400 per la metrica reach).

| Breakdown | Tipo | Dimensioni reali Luca | Ingerito? | Note |
|---|---|---|---|---|
| `follow_type` | breakdown per-dim | NON_FOLLOWER: **9 304** · FOLLOWER: **317** | Sì → non_follower_pct (~99,4%) | reach quasi tutta da non-follower |
| `media_product_type` | breakdown per-dim | REEL: **9 363** (100%) | **NO** | Luca posta solo reel |

## 5. `GET /analytics/instagram/follower-history`

Serie giornaliera del conteggio follower (esiste perché Meta ha rimosso `follower_count` dalle insight
in Graph v22+). Max **89 giorni**. Metriche: `follower_count, followers_gained, followers_lost`.

| Metrica | Tipo | Unità | Valore reale Luca | Ingerito? | Note |
|---|---|---|---|---|---|
| `follower_count` | serie-temporale | conteggio/giorno | **`values: []` VUOTO** (total 0) | No | **GAP** — snapshotter nuovo |
| `followers_gained` | serie/aggregato | conteggio | 0 | No | somma delta positivi |
| `followers_lost` | serie/aggregato | conteggio | 0 | No | somma |delta negativi| |

> **Questo è il candidato migliore per la serie follower giornaliera** una volta che avrà accumulato
> giorni (più affidabile di `follower-stats`). Oggi vuoto perché l'account è di oggi.

## 6. `GET /analytics/instagram/demographics` — DATI RICCHI

Demografiche audience. Richiede **100+ follower** (Luca ne ha 317 → funziona). Top 45 per dimensione.
Due `metric`: **`follower_demographics`** e **`engaged_audience_demographics`**. `timeframe`: this_week/this_month.
Dimensioni (`breakdown`): **age, city, country, gender**.

Tipo: breakdown per-dimensione (conteggi assoluti di persone). Envelope: `demographics[dim] = [{dimension, value}]`.

### 6a. `follower_demographics` (audience che ti segue) — valori reali Luca

| Dimensione | Tipo | Valori reali (top) | Ingerito? | Note |
|---|---|---|---|---|
| `age` | barre per-dim | 13-17:4 · **18-24:173** · 25-34:92 · 35-44:18 · 45-54:18 · 55-64:8 · 65+:4 (Σ=317) | Sì | pubblico giovanissimo |
| `gender` | barre per-dim | **M:219** · F:35 · U:63 | Sì | |
| `country` | classifica | 13 paesi (IT dominante, poi DE/AE/CH/…) | Sì (come "geo") | |
| `city` | classifica | 45 città (Roncade 13, Q. d'Altino 7, Meolo/Jesolo/Verona 5…) | **NO** | forte cluster Veneto/FVG |

### 6b. `engaged_audience_demographics` (chi interagisce) — INTERAMENTE NON INGERITO

| Dimensione | Valori reali Luca | Note |
|---|---|---|
| `age` | 13-17:3 · **18-24:182** · 25-34:76 · 35-44:9 · 45-54:10 · 55-64:8 · 65+:4 | pubblico *engaged* ancora più giovane dei follower |
| `city` | 45 città (Roncade 10, Treviso 5…) | |
| `gender` / `country` | disponibili | confronto follower-vs-engaged possibile |

## 7. `GET /analytics/daily-metrics`

Metriche aggregate per giorno (somma dei post pubblicati quel giorno) + breakdown per piattaforma.
Default 180 giorni. Tipo: serie-temporale + aggregato piattaforma.

Per-giorno `dailyData[].metrics` e per-piattaforma `platformBreakdown[]` — stessi 8 campi:

| Campo | Tipo | Unità | Valore reale Luca (totale IG, `platformBreakdown`) | Ingerito? |
|---|---|---|---|---|
| `impressions` | serie/aggregato | conteggio | 29 276 | Solo per derivare ER |
| `reach` | serie/aggregato | conteggio | 18 966 | Solo per derivare ER |
| `likes` | serie/aggregato | conteggio | 1 021 | Solo per derivare ER |
| `comments` | serie/aggregato | conteggio | 45 | Solo per derivare ER |
| `shares` | serie/aggregato | conteggio | 97 | Solo per derivare ER |
| `saves` | serie/aggregato | conteggio | 74 | Solo per derivare ER |
| `clicks` | serie/aggregato | conteggio | 0 | No |
| `views` | serie/aggregato | conteggio | 29 276 | No |
| `postCount` (giorno) + `platforms{}` | valore-singolo | conteggio | 12 post su 12 giorni | No |

> Nota: qui `reach`/`impressions` sono **somme dei post** (18 966), diverse dal reach account-level unico
> di account-insights (9 363). Il nostro codice usa questo endpoint solo per calcolare
> `engagement_rate = (likes+comments+shares+saves)/reach × 100` per giorno.
> Parametro utile non usato: `attribution=publish|received` (engagement-over-time).

## 8. `GET /analytics` (per-post, list + single) + `overview`

Analytics per post. Senza `postId` → lista paginata + `overview`. 12 post reali per Luca (tutti reel esterni).

### 8a. Blocco `overview` (list)

| Campo | Tipo | Valore reale Luca | Ingerito? |
|---|---|---|---|
| `totalPosts` / `publishedPosts` / `scheduledPosts` | valore-singolo | 12 / 12 / 0 | No |
| `lastSync` | data | 2026-07-07T10:41:48Z | No |
| `dataStaleness.staleAccountCount` / `syncTriggered` | valore-singolo/bool | 0 / false | No |

### 8b. `posts[].analytics` (per-post) — valori reali (post migliore: "Let's start!!!")

| Campo | Tipo | Unità | Valore reale (post top) | Ingerito su Content? | Note |
|---|---|---|---|---|---|
| `impressions` | per-post | conteggio | 6 712 | **NO** | |
| `reach` | per-post | conteggio | 4 496 | Sì (`reach`) | |
| `likes` | per-post | conteggio | 216 | Sì (`likes`) | |
| `comments` | per-post | conteggio | 21 | Sì (`commentsCount`) | |
| `shares` | per-post | conteggio | 21 | Sì (`shares`) | |
| `saves` | per-post | conteggio | 25 | Sì (`saves`) | |
| `clicks` | per-post | conteggio | 0 | **NO** | |
| `views` | per-post | conteggio | 6 712 | Sì (`views`) | |
| `igReelsAvgWatchTime` | per-post | ms | 17 810 | **NO** | tempo medio visione reel |
| `igReelsVideoViewTotalTime` | per-post | ms | 85 795 092 | **NO** | tempo totale visione |
| `engagementRate` | per-post | % | 4.22 | **NO** (ricalcolato in kpi.ts) | fornito da Zernio |
| `lastUpdated` | data | — | 2026-07-07 10:41:48 | No | |

Altri campi per-post (metadati): `_id`, `latePostId`, `content` (caption), `publishedAt`, `scheduledFor`,
`status`, `platformPostUrl`, `isExternal` (true), `isAd` (false), `mediaType` (video), `thumbnailUrl`,
`mediaItems[]`, `platforms[]` (con `platformPostId`, `accountUsername`, `syncStatus`).
→ `thumbnailUrl`, `content`, `platformPostUrl`, `publishedAt` sono **non ingeriti** ma utili per una
gallery/classifica visiva dei post.
**NON ingerito a livello post**: `followsGenerated` e `nonFollowerPct` (nel codice sono forzati a `null` —
non esistono per-post in questo endpoint; arrivano solo da account-insights).

## 9. `GET /analytics/post-timeline`

Timeline giornaliera di un singolo post (evoluzione metriche giorno-per-giorno da `postId`).
Tipo: serie-temporale per-post. **Non ingerito.** Campi/giorno: `date, platform, platformPostId,
impressions, reach, likes, comments, shares, saves, clicks, views`. Utile per grafici "crescita del post".

## 10. `GET /analytics/best-time` — orari migliori (valori reali Luca)

Tipo: matrice giorno×ora. **Non ingerito.** `slots[] = {day_of_week (0=Lun), hour (UTC), avg_engagement, post_count}`.
Top slot reali: Mar 12:00 (283) · Ven 14:00 (142) · Lun 14:00 (101) · Lun 16:00 (95, 2 post).

## 11. `GET /analytics/content-decay` — decadimento engagement (valori reali)

Tipo: barre per-bucket temporale. **Non ingerito.** `buckets[] = {bucket_order, bucket_label,
avg_pct_of_final (0-100), post_count}`. Per Luca (post vecchi >7gg): "7-30d" 100% (8 post), "30d+" 100% (4).
Poco significativo ora (i post hanno già maturato tutto l'engagement).

## 12. `GET /analytics/posting-frequency` — frequenza vs engagement (valori reali)

Tipo: barre/scatter. **Non ingerito.** `frequency[] = {platform, posts_per_week, avg_engagement_rate (%),
avg_engagement, weeks_count}`. Reali IG: 1/sett → ER 4.75% · 2/sett → 4.21% · 3/sett → 4.80%.

## 13. `GET /accounts/{id}/instagram/stories` + `/{storyId}/insights`

Storie attive (finestra 24h). Per Luca ora: `data: []` (nessuna storia attiva). **Non ingerito.**
Se attive, `/insights` espone 13 metriche/storia: `views, reach, replies, shares, navigation, tapsForward,
tapsBack, exits, swipesForward, profileVisits, follows, reposts, totalInteractions` (+ `source`: live/cached/unavailable).

---

## Cosa ingeriamo OGGI (mappa DB)

| Modello DB | Campi | Da quale fonte Zernio |
|---|---|---|
| `Measurement` | `followers` | follower-stats (serie, **vuota ora**) |
| `Measurement` | `engagement_rate` (%) | **derivato** da daily-metrics |
| `Measurement` | `non_follower_pct` (%) | account-insights reach × follow_type |
| `AudienceSegment` | `age`, `gender`, `geo`(=country) | demographics (solo `follower_demographics`) |
| `Content` (+`MetricSnapshot`) | `views, reach, likes, commentsCount, saves, shares` | analytics per-post |
| `SocialAccount` | `zernioAccountId, platform, handle` | accounts |

Tutto il resto elencato sopra è **NON ingerito**.

---

## Proposta box (per ogni dato: che box lo mostra meglio)

### Numeri singoli (KPI card / stat tile)
- **Reach account** (9 363), **Views** (41 337), **Accounts engaged** (753), **Total interactions** (1 732) — da account-insights. *4 card immediate, oggi assenti.*
- **Likes/Comments/Saves/Shares/Reposts account** (1 284 / 50 / 112 / 131 / 24) — mini-card cluster.
- **Follower count** (317) + delta (**growth / growthPercentage** da follower-stats).
- **Following** (13), **Media count** (12) — card profilo.
- **Non-follower reach %** (~99,4%) — card con gauge (già calcolato).
- **Token / salute account** — badge "Connesso · scade tra 59gg" (da health) con warning riconnessione.

### Serie temporali (line chart)
- **Follower nel tempo** — da `follower-history` (`follower_count`). **GAP: vuoto ora**, si popola col tempo. *Box da predisporre con empty-state.*
- **Follower gained/lost per giorno** — area chart +/−.
- **Engagement rate nel tempo** (già presente) — da daily-metrics.
- **Reach/Views/Interazioni per giorno** — da daily-metrics `dailyData[]` (7 giorni con dato attualmente).
- **Timeline di un singolo post** — da post-timeline (line chart on-demand per il reel selezionato).

### Barre per-dimensione (bar chart)
- **Età follower** (18-24 dominante) — barre.
- **Genere follower** (M/F/U) — barre o donut.
- **Reach per tipo media** (REEL 100%) — donut, oggi banale (solo reel).
- **Follower vs Engaged per età/genere** — barre affiancate (confronto `follower_demographics` vs `engaged_audience_demographics`). *Insight nuovo e potente.*
- **Content decay** (% engagement per finestra) — barre.
- **Posting frequency vs ER** — barre/scatter (trova la cadenza ottimale).

### Classifiche / mappe (ranked list / geo)
- **Top città** (Roncade, Q. d'Altino, Meolo…) — classifica o mappa Italia. *Non ingerito, dato molto ricco.*
- **Top paesi** — classifica bandiere.
- **Best time to post** — heatmap giorno×ora (Mar 12:00 il migliore).
- **Classifica post** — tabella/gallery con thumbnail + reach/views/ER/watch-time (usa `thumbnailUrl`, `content`, `engagementRate`, `igReelsAvgWatchTime`).

### Box a GAP (vuoti ORA per account nuovo — predisporre con empty-state)
- **Follower series** (`follower-history` + `follower-stats`): entrambi vuoti oggi → si popolano dal giorno dopo la connessione. Serve empty-state "Raccolta dati in corso, torna domani".
- **Reach time_series** (account-insights): unica serie disponibile, ma endpoint **flaky (504)** → retry/fallback.
- **`follows_and_unfollows`, `profile_links_taps`, `replies`**: tornano 0 per Luca (Meta non li popola per questo account) → box con "n/d" o nascosto se 0.
- **Stories insights**: nessuna storia attiva ora → box condizionale (mostra solo se ci sono storie live).

### Metriche account-insights disponibili che NON stavamo usando (la scoperta principale)
`views` · `accounts_engaged` · `total_interactions` · `likes`(account) · `comments`(account) ·
`saves`(account) · `shares`(account) · `reposts` · `replies` · `follows_and_unfollows` ·
`profile_links_taps` · breakdown `media_product_type`.
Di `reach` usavamo solo il breakdown `follow_type`; il valore `reach` totale e la sua serie non erano esposti in dashboard.
