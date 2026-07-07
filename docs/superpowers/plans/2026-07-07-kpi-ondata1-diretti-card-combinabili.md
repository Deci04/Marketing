# KPI ONDATA 1 — Diretti Zernio + Card Combinabili — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portare in dashboard le 12 metriche DIRETTE di `account-insights` (con delta che segue il selettore 7/30/90), le demografiche `city`/*engaged*, e rendere i box numero-singolo card combinabili (divisibili/unibili).

**Architecture:** Pipeline invariata (`fetchAnalytics`→`ingestAnalytics`→`getKpiData`→`KpiBox`). Si aggiunge un ramo dati "diretti" salvato su `Measurement` con `metric` namespaced (`insight:<m>:p<p>:cur|:prev`, `profile:*`) e demografiche nuove su `AudienceSegment`. La UI introduce "metric card" data-driven persistite nel Json di `DashboardLayout` (`metricCards`), rese da un nuovo componente `MetricCard`, con dividi/unisci puri su `StoredLayout`.

**Tech Stack:** Next.js (versione custom del repo), Prisma + Neon, react-grid-layout v2, Vitest, Tailwind, Phosphor icons.

## Global Constraints

- **Nessuna migration Prisma.** Solo riuso di `Measurement`, `AudienceSegment`, `DashboardLayout` (Json). Verbatim dallo spec: "Nessuna modifica a `prisma/schema.prisma`".
- **Delta segue il periodo** 7/30/90 (`PERIOD_PRESETS` in `kpi.ts`).
- **Valori `0` reali vanno preservati** (non trattati come null): `replies`, `follows_and_unfollows`, `profile_links_taps` per Luca sono 0.
- **Engagement/percentuali in % (0..100)**, conteggi come interi (convenzioni esistenti in `kpi-format.ts`).
- **Tutto locale su branch `serata/multi-feature`**, commit solo a step verde, mai push/main finché non verificato in prod. Browser-verify prima del merge. `afplay /System/Library/Sounds/Glass.aiff` ai checkpoint.
- **Test runner:** `npm test` (= `vitest run`). Import alias `@/` → `src/`.
- **Encoding delta (raffinamento vs spec):** invece del pairing per data (fragile con refresh giornalieri accumulati) si usano nomi espliciti `insight:<m>:p<p>:cur` e `insight:<m>:p<p>:prev`, **una riga ciascuno**, con ingest `deleteMany({metric})`-then-create per metric.

---

### Task 1: Tipi metriche + reader delta puro (`kpi.ts`)

**Files:**
- Modify: `src/lib/kpi.ts` (aggiunte in testa, vicino a `PERIOD_PRESETS`)
- Test: `tests/kpi-direct.test.ts` (create)

**Interfaces:**
- Produces:
  - `INSIGHT_KEYS: readonly InsightKey[]`, `PROFILE_KEYS: readonly ProfileKey[]`
  - `type InsightKey`, `type ProfileKey`, `type MetricKey = InsightKey | ProfileKey`
  - `type DirectMetric = { value: number | null; deltaAbs: number | null; deltaPct: number | null }`
  - `readInsightDeltas(rows: { metric: string; value: number }[], period: number): Record<InsightKey, DirectMetric>`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/kpi-direct.test.ts
import { describe, it, expect } from "vitest";
import { readInsightDeltas, INSIGHT_KEYS } from "@/lib/kpi";

describe("readInsightDeltas", () => {
  it("calcola value + deltaAbs + deltaPct dalle righe :cur/:prev del periodo", () => {
    const rows = [
      { metric: "insight:reach:p30:cur", value: 120 },
      { metric: "insight:reach:p30:prev", value: 100 },
      { metric: "insight:reach:p7:cur", value: 50 }, // periodo diverso: ignorato
    ];
    const out = readInsightDeltas(rows, 30);
    expect(out.reach).toEqual({ value: 120, deltaAbs: 20, deltaPct: 20 });
  });

  it("deltaPct null se prev è 0 o assente; value 0 preservato", () => {
    const rows = [
      { metric: "insight:replies:p30:cur", value: 0 },
      { metric: "insight:reposts:p30:cur", value: 24 }, // nessun :prev
    ];
    const out = readInsightDeltas(rows, 30);
    expect(out.replies.value).toBe(0);
    expect(out.reposts).toEqual({ value: 24, deltaAbs: null, deltaPct: null });
  });

  it("metrica assente → value null", () => {
    const out = readInsightDeltas([], 30);
    for (const k of INSIGHT_KEYS) expect(out[k].value).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- kpi-direct`
Expected: FAIL — `readInsightDeltas` / `INSIGHT_KEYS` not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/kpi.ts`, dopo `export const PERIOD_PRESETS = [7, 30, 90] as const;` (riga ~25) aggiungi:

```typescript
export const INSIGHT_KEYS = [
  "reach", "views", "accounts_engaged", "total_interactions",
  "likes", "comments", "saves", "shares", "replies", "reposts",
  "follows_and_unfollows", "profile_links_taps",
] as const;
export type InsightKey = (typeof INSIGHT_KEYS)[number];

export const PROFILE_KEYS = ["followers_direct", "following", "media", "token_days"] as const;
export type ProfileKey = (typeof PROFILE_KEYS)[number];

export type MetricKey = InsightKey | ProfileKey;

export type DirectMetric = {
  value: number | null;
  deltaAbs: number | null;
  deltaPct: number | null;
};

/** Legge le righe Measurement namespaced `insight:<key>:p<period>:cur|:prev` → delta per metrica. */
export function readInsightDeltas(
  rows: { metric: string; value: number }[],
  period: number
): Record<InsightKey, DirectMetric> {
  const byMetric = new Map<string, number>();
  for (const r of rows) byMetric.set(r.metric, r.value);
  const out = {} as Record<InsightKey, DirectMetric>;
  for (const key of INSIGHT_KEYS) {
    const cur = byMetric.get(`insight:${key}:p${period}:cur`);
    const prev = byMetric.get(`insight:${key}:p${period}:prev`);
    const value = cur ?? null;
    const deltaAbs = cur != null && prev != null ? cur - prev : null;
    const deltaPct =
      cur != null && prev != null && prev !== 0 ? ((cur - prev) / prev) * 100 : null;
    out[key] = { value, deltaAbs, deltaPct };
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- kpi-direct`
Expected: PASS (3 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/kpi.ts tests/kpi-direct.test.ts
git commit -m "feat(kpi): MetricKey + readInsightDeltas (delta per periodo, no migration)"
```

---

### Task 2: Mapper puro `mapDirectInsights` (`zernio.ts`)

**Files:**
- Modify: `src/lib/zernio.ts` (tipo `MeasurementUpsert`, nuovo mapper)
- Test: `tests/zernio-direct.test.ts` (create)

**Interfaces:**
- Consumes: `InsightKey` da `@/lib/kpi`, `Channel` da `@prisma/client`.
- Produces:
  - Modifica `MeasurementUpsert.metric` da union ristretta a `string`.
  - `type InsightWindow = { period: number; current: Partial<Record<InsightKey, number>>; previous: Partial<Record<InsightKey, number>> }`
  - `mapDirectInsights(windows: InsightWindow[], channel: Channel | null, date: Date): MeasurementUpsert[]`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/zernio-direct.test.ts
import { describe, it, expect } from "vitest";
import { mapDirectInsights } from "@/lib/zernio";

const D = new Date("2026-07-07T00:00:00.000Z");

describe("mapDirectInsights", () => {
  it("emette :cur e :prev per ogni metrica presente, con lo stesso date", () => {
    const out = mapDirectInsights(
      [{ period: 30, current: { reach: 120, replies: 0 }, previous: { reach: 100 } }],
      "INSTAGRAM",
      D
    );
    expect(out).toContainEqual({ metric: "insight:reach:p30:cur", value: 120, date: D, series: "Luca", channel: "INSTAGRAM" });
    expect(out).toContainEqual({ metric: "insight:reach:p30:prev", value: 100, date: D, series: "Luca", channel: "INSTAGRAM" });
    // replies=0 (reale) preservato come :cur; nessun :prev perché previous.replies assente
    expect(out).toContainEqual({ metric: "insight:replies:p30:cur", value: 0, date: D, series: "Luca", channel: "INSTAGRAM" });
    expect(out.find((r) => r.metric === "insight:replies:p30:prev")).toBeUndefined();
  });

  it("più periodi → metric namespacate distinte", () => {
    const out = mapDirectInsights(
      [
        { period: 7, current: { views: 5 }, previous: {} },
        { period: 90, current: { views: 40 }, previous: {} },
      ],
      "INSTAGRAM",
      D
    );
    expect(out.map((r) => r.metric).sort()).toEqual(["insight:views:p7:cur", "insight:views:p90:cur"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- zernio-direct`
Expected: FAIL — `mapDirectInsights` not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/zernio.ts`: cambia il tipo `metric` di `MeasurementUpsert` (riga ~352) da
`metric: "followers" | "engagement_rate" | "non_follower_pct";` a `metric: string;`.
Poi aggiungi (import in testa: `import { INSIGHT_KEYS, type InsightKey } from "@/lib/kpi";`):

```typescript
export type InsightWindow = {
  period: number;
  current: Partial<Record<InsightKey, number>>;
  previous: Partial<Record<InsightKey, number>>;
};

/** Mapper puro: finestre corrente/precedente per periodo → righe Measurement namespaced.
 *  Scrive `insight:<key>:p<period>:cur|:prev`. Conserva gli 0 reali; salta gli undefined. */
export function mapDirectInsights(
  windows: InsightWindow[],
  channel: Channel | null,
  date: Date
): MeasurementUpsert[] {
  const out: MeasurementUpsert[] = [];
  for (const w of windows) {
    for (const key of INSIGHT_KEYS) {
      const cur = w.current[key];
      if (cur != null)
        out.push({ metric: `insight:${key}:p${w.period}:cur`, value: cur, date, series: "Luca", channel });
      const prev = w.previous[key];
      if (prev != null)
        out.push({ metric: `insight:${key}:p${w.period}:prev`, value: prev, date, series: "Luca", channel });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- zernio-direct` → PASS. Poi `npm test` completo per assicurarsi che il cambio di tipo `metric: string` non rompa gli altri test.
Expected: tutti verdi.

- [ ] **Step 5: Commit**

```bash
git add src/lib/zernio.ts tests/zernio-direct.test.ts
git commit -m "feat(zernio): mapDirectInsights — righe Measurement namespaced cur/prev"
```

---

### Task 3: Mapper puro `mapProfile` (`zernio.ts`)

**Files:**
- Modify: `src/lib/zernio.ts`
- Test: `tests/zernio-direct.test.ts` (append)

**Interfaces:**
- Produces:
  - `type AccountProfile = { following: number | null; mediaCount: number | null; tokenDays: number | null }`
  - `mapProfile(p: AccountProfile, channel: Channel | null, date: Date): MeasurementUpsert[]`

- [ ] **Step 1: Write the failing test** (append a `tests/zernio-direct.test.ts`)

```typescript
import { mapProfile } from "@/lib/zernio";

describe("mapProfile", () => {
  it("mappa following/media/token_days; salta i null", () => {
    const out = mapProfile({ following: 13, mediaCount: 12, tokenDays: 59 }, "INSTAGRAM", D);
    expect(out.map((r) => r.metric).sort()).toEqual(["profile:following", "profile:media", "profile:token_days"]);
    expect(out.find((r) => r.metric === "profile:following")!.value).toBe(13);
  });
  it("null → nessuna riga", () => {
    expect(mapProfile({ following: null, mediaCount: null, tokenDays: null }, "INSTAGRAM", D)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- zernio-direct` → FAIL (`mapProfile` not exported).

- [ ] **Step 3: Write minimal implementation** (in `zernio.ts`)

```typescript
export type AccountProfile = {
  following: number | null;
  mediaCount: number | null;
  tokenDays: number | null;
};

/** Mapper puro: snapshot profilo → righe Measurement `profile:*` (single-value). */
export function mapProfile(
  p: AccountProfile,
  channel: Channel | null,
  date: Date
): MeasurementUpsert[] {
  const out: MeasurementUpsert[] = [];
  if (p.following != null) out.push({ metric: "profile:following", value: p.following, date, series: "Luca", channel });
  if (p.mediaCount != null) out.push({ metric: "profile:media", value: p.mediaCount, date, series: "Luca", channel });
  if (p.tokenDays != null) out.push({ metric: "profile:token_days", value: p.tokenDays, date, series: "Luca", channel });
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- zernio-direct` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/zernio.ts tests/zernio-direct.test.ts
git commit -m "feat(zernio): mapProfile — righe Measurement profile:*"
```

---

### Task 4: Demografiche estese city + engaged (`zernio.ts`)

**Files:**
- Modify: `src/lib/zernio.ts` (`ZernioDemographic.dimension`, `fetchDemographics`)
- Test: `tests/zernio-map.test.ts` (append a un `describe` esistente o nuovo)

**Interfaces:**
- Produces: `ZernioDemographic["dimension"]` esteso con `"city" | "age_engaged" | "gender_engaged"`. `fetchDemographics` invariato di firma, emette le nuove dimensioni.
- `mapAudienceSegments` (esistente) resta invariato ma ora normalizza anche le nuove dimensioni.

- [ ] **Step 1: Write the failing test** (append a `tests/zernio-map.test.ts`)

```typescript
describe("mapAudienceSegments — city + engaged", () => {
  it("normalizza a % per-dimensione anche city e *_engaged", () => {
    const { mapAudienceSegments } = require("@/lib/zernio");
    const date = new Date("2026-07-07T00:00:00.000Z");
    const out = mapAudienceSegments(
      [
        { dimension: "city", label: "Roncade", value: 13 },
        { dimension: "city", label: "Treviso", value: 7 },
        { dimension: "age_engaged", label: "18-24", value: 182 },
        { dimension: "age_engaged", label: "25-34", value: 18 },
      ],
      "INSTAGRAM",
      date
    );
    const city = out.filter((r: { dimension: string }) => r.dimension === "city");
    expect(Math.round(city.reduce((s: number, r: { value: number }) => s + r.value, 0))).toBe(100);
    const eng = out.find((r: { dimension: string; label: string }) => r.dimension === "age_engaged" && r.label === "18-24");
    expect(Math.round(eng.value)).toBe(91); // 182/200
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- zernio-map` → FAIL sui TS type se la union non include le nuove dimensioni (o passa già se `dimension` è usata liberamente — in tal caso verifica solo il verde e prosegui).

- [ ] **Step 3: Write minimal implementation**

In `zernio.ts` estendi la union (riga ~49):
```typescript
export type ZernioDemographic = {
  dimension: "age" | "gender" | "geo" | "followerType" | "activity" | "returning" | "city" | "age_engaged" | "gender_engaged";
  label: string;
  value: number;
};
```
E in `fetchDemographics` (riga ~268) aggiungi city + la seconda metric engaged:
```typescript
async function fetchDemographics(
  accountId: string,
  platform: string | undefined
): Promise<ZernioDemographic[]> {
  if (platform !== "instagram" || !accountId) return [];
  const out: ZernioDemographic[] = [];
  const push = (dim: ZernioDemographic["dimension"], rows: { dimension: string; value: number }[] | undefined) => {
    for (const r of rows ?? []) out.push({ dimension: dim, label: r.dimension, value: r.value });
  };
  // follower_demographics: age/gender/country(→geo)/city
  try {
    const q = new URLSearchParams({ accountId, breakdown: "age,gender,country,city", metric: "follower_demographics" });
    const res = await zernioFetch<ZernioDemographicsResponse>(`/analytics/instagram/demographics?${q.toString()}`);
    const d = res.demographics ?? {};
    push("age", d.age); push("gender", d.gender); push("geo", d.country); push("city", d.city);
  } catch (e) {
    console.warn(`[zernio] demographics follower non disponibili: ${(e as Error).message}`);
  }
  // engaged_audience_demographics: age/gender → age_engaged/gender_engaged
  try {
    const q = new URLSearchParams({ accountId, breakdown: "age,gender", metric: "engaged_audience_demographics" });
    const res = await zernioFetch<ZernioDemographicsResponse>(`/analytics/instagram/demographics?${q.toString()}`);
    const d = res.demographics ?? {};
    push("age_engaged", d.age); push("gender_engaged", d.gender);
  } catch (e) {
    console.warn(`[zernio] demographics engaged non disponibili: ${(e as Error).message}`);
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- zernio-map` → PASS. Poi `npm test` completo.

- [ ] **Step 5: Commit**

```bash
git add src/lib/zernio.ts tests/zernio-map.test.ts
git commit -m "feat(zernio): demografiche city + engaged (follower vs engaged)"
```

---

### Task 5: Fetcher di rete `fetchAccountInsights` + `fetchAccountProfile` (`zernio.ts`)

**Files:**
- Modify: `src/lib/zernio.ts`

**Interfaces:**
- Consumes: `InsightKey`, `zernioFetch`, `AccountProfile`.
- Produces:
  - `fetchAccountInsights(accountId: string, since: string, until: string): Promise<Partial<Record<InsightKey, number>>>`
  - `fetchAccountProfile(accountId: string): Promise<AccountProfile>`

*(Rete: nessun unit test — segue il pattern degrade-to-empty degli altri fetcher; verificato live in Task 9.)*

- [ ] **Step 1: Implementa i fetcher** (in `zernio.ts`)

```typescript
const INSIGHT_METRICS_CSV = INSIGHT_KEYS.join(",");

/** Legge i total_value delle 12 metriche account-insights per la finestra [since, until] (YMD). */
export async function fetchAccountInsights(
  accountId: string,
  since: string,
  until: string
): Promise<Partial<Record<InsightKey, number>>> {
  const out: Partial<Record<InsightKey, number>> = {};
  try {
    const q = new URLSearchParams({
      accountId,
      metrics: INSIGHT_METRICS_CSV,
      metricType: "total_value",
      since,
      until,
    });
    const res = await zernioFetch<ZernioAccountInsightsResponse>(
      `/analytics/instagram/account-insights?${q.toString()}`
    );
    for (const key of INSIGHT_KEYS) {
      const total = res.metrics?.[key]?.total;
      if (typeof total === "number") out[key] = total;
    }
  } catch (e) {
    console.warn(`[zernio] account-insights (${since}..${until}) non disponibile: ${(e as Error).message}`);
  }
  return out;
}

/** Snapshot profilo: following, media count, giorni alla scadenza token. */
export async function fetchAccountProfile(accountId: string): Promise<AccountProfile> {
  try {
    const res = await zernioFetch<ZernioAccountsListResponse & { accounts: ZernioApiAccountFull[] }>(`/accounts`);
    const acc = res.accounts?.find((a) => a._id === accountId) ?? res.accounts?.[0];
    if (!acc) return { following: null, mediaCount: null, tokenDays: null };
    const extra = acc.metadata?.profileData?.extraData ?? {};
    const expiresAt = acc.tokenExpiresAt ? new Date(acc.tokenExpiresAt) : null;
    const tokenDays = expiresAt
      ? Math.max(0, Math.round((expiresAt.getTime() - Date.parse(new Date().toISOString())) / 86_400_000))
      : null;
    return {
      following: typeof extra.followsCount === "number" ? extra.followsCount : null,
      mediaCount: typeof extra.mediaCount === "number" ? extra.mediaCount : null,
      tokenDays,
    };
  } catch (e) {
    console.warn(`[zernio] account profile non disponibile: ${(e as Error).message}`);
    return { following: null, mediaCount: null, tokenDays: null };
  }
}
```

E aggiungi il tipo grezzo esteso vicino a `ZernioApiAccount` (riga ~75):
```typescript
type ZernioApiAccountFull = ZernioApiAccount & {
  tokenExpiresAt?: string;
  metadata?: { profileData?: { extraData?: { followsCount?: number; mediaCount?: number } } };
};
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add src/lib/zernio.ts
git commit -m "feat(zernio): fetchAccountInsights (12 metriche) + fetchAccountProfile"
```

---

### Task 6: Scrittura idempotente diretti `writeDirectMeasurements` (`zernio.ts`)

**Files:**
- Modify: `src/lib/zernio.ts`
- Test: `tests/zernio-direct.test.ts` (append — test puro sulla forma dei comandi, non sul DB)

**Interfaces:**
- Consumes: `MeasurementUpsert`, `db`, `scopedWhere`.
- Produces: `writeDirectMeasurements(workspaceId: string, upserts: MeasurementUpsert[]): Promise<number>` — per ogni `metric` distinta fa `deleteMany({ metric })` poi crea le righe (delete-by-metric, non per data, per evitare accumulo). Ritorna il numero di righe scritte.

- [ ] **Step 1: Implementa** (in `zernio.ts`, vicino a `ingestAnalytics`)

```typescript
/** Scrive righe Measurement "dirette" (insight:*, profile:*) in modo idempotente:
 *  cancella TUTTE le righe della stessa `metric` (Luca+channel) poi ricrea. Evita
 *  l'accumulo di righe datate a refresh successivi (a differenza del delete-per-data). */
export async function writeDirectMeasurements(
  workspaceId: string,
  upserts: MeasurementUpsert[]
): Promise<number> {
  if (upserts.length === 0) return 0;
  const metrics = [...new Set(upserts.map((u) => u.metric))];
  await db.$transaction([
    ...metrics.map((m) =>
      db.measurement.deleteMany({
        where: scopedWhere(workspaceId, { metric: m, series: "Luca" }),
      })
    ),
    ...upserts.map((u) => db.measurement.create({ data: { ...u, workspaceId } })),
  ]);
  return upserts.length;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` → nessun errore.

- [ ] **Step 3: Commit**

```bash
git add src/lib/zernio.ts
git commit -m "feat(zernio): writeDirectMeasurements — delete-by-metric idempotente"
```

---

### Task 7: Wiring refresh per-periodo + profilo (`kpi/actions.ts`)

**Files:**
- Modify: `src/app/(app)/kpi/actions.ts` (`refreshKpiAction`, ~riga 300)

**Interfaces:**
- Consumes: `fetchAccountInsights`, `fetchAccountProfile`, `mapDirectInsights`, `mapProfile`, `writeDirectMeasurements`, `PERIOD_PRESETS`, `periodWindow`.

*(Integrazione: verificata live in Task 9.)*

- [ ] **Step 1: Aggiorna gli import** in `actions.ts`

Aggiungi ai named import da `@/lib/zernio`: `fetchAccountInsights, fetchAccountProfile, mapDirectInsights, mapProfile, writeDirectMeasurements, type InsightWindow`. Da `@/lib/kpi`: `PERIOD_PRESETS, periodWindow`.

- [ ] **Step 2: Estendi il loop account** dentro `refreshKpiAction` (dopo `ingestAnalytics`, prima della chiusura `try`)

```typescript
      // --- Diretti (ONDATA 1): account-insights per periodo + profilo ---
      if (acc.platform === "INSTAGRAM") {
        const now = new Date();
        const to = now.toISOString().slice(0, 10);
        const ymd = (d: Date) => d.toISOString().slice(0, 10);
        const windows: InsightWindow[] = [];
        for (const period of PERIOD_PRESETS) {
          const eff = Math.min(period, 88); // limite finestra Zernio
          const curSince = ymd(new Date(now.getTime() - eff * 86_400_000));
          const prevUntil = curSince;
          const prevSince = ymd(new Date(now.getTime() - 2 * eff * 86_400_000));
          const [current, previous] = await Promise.all([
            fetchAccountInsights(acc.zernioAccountId, curSince, to),
            fetchAccountInsights(acc.zernioAccountId, prevSince, prevUntil),
          ]);
          windows.push({ period, current, previous });
        }
        const profile = await fetchAccountProfile(acc.zernioAccountId);
        const channel = platformToChannel(acc.platform);
        const snapDate = new Date(`${to}T00:00:00.000Z`);
        const written = await writeDirectMeasurements(ctx.workspaceId, [
          ...mapDirectInsights(windows, channel, snapDate),
          ...mapProfile(profile, channel, snapDate),
        ]);
        total = { ...total, measurements: total.measurements + written };
      }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit` → nessun errore.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/kpi/actions.ts"
git commit -m "feat(kpi): refresh — fetch diretti per periodo (7/30/90) + profilo"
```

---

### Task 8: Espone `directMetrics` in `getKpiData` (`kpi.ts`)

**Files:**
- Modify: `src/lib/kpi.ts` (`KpiData`, `getKpiData`)

**Interfaces:**
- Consumes: `readInsightDeltas`, `PROFILE_KEYS`, `MetricKey`, `DirectMetric`.
- Produces: `KpiData.directMetrics: Record<MetricKey, DirectMetric>`.

*(Wiring su DB reale: verificato live in Task 9. La logica pura di delta è già coperta da Task 1.)*

- [ ] **Step 1: Aggiungi il campo al tipo** `KpiData` (dopo `nonFollowerPct`, ~riga 262)

```typescript
  directMetrics: Record<MetricKey, DirectMetric>;
```

- [ ] **Step 2: Fetch delle righe dirette** dentro `getKpiData` (aggiungi al `Promise.all`, come nuova voce, e destruttura)

```typescript
    db.measurement.findMany({
      where: scopedWhere(workspaceId, {
        series: "Luca",
        ...channelWhere,
        OR: [{ metric: { startsWith: "insight:" } }, { metric: { startsWith: "profile:" } }],
      }),
      select: { metric: true, value: true },
    }),
```
Aggiungi `directRows` alla lista destrutturata dei risultati.

- [ ] **Step 3: Assembla `directMetrics`** (prima del `return`)

```typescript
  const insight = readInsightDeltas(directRows, filter.period);
  const byMetric = new Map(directRows.map((r) => [r.metric, r.value]));
  const single = (metric: string, value: number | null): DirectMetric => ({
    value: byMetric.get(metric) ?? value,
    deltaAbs: null,
    deltaPct: null,
  });
  const directMetrics: Record<MetricKey, DirectMetric> = {
    ...insight,
    followers_direct: { value: end, deltaAbs: null, deltaPct: followerGrowth },
    following: single("profile:following", null),
    media: single("profile:media", null),
    token_days: single("profile:token_days", null),
  };
```

- [ ] **Step 4: Aggiungi `directMetrics` all'oggetto ritornato** da `getKpiData`.

- [ ] **Step 5: Typecheck + test**

Run: `npx tsc --noEmit && npm test`
Expected: verde (nessun test rotto; nuovo campo non testato in unit, coperto live).

- [ ] **Step 6: Commit**

```bash
git add src/lib/kpi.ts
git commit -m "feat(kpi): getKpiData espone directMetrics (insight + profilo)"
```

---

### Task 9: CHECKPOINT — verifica live ingest + delta (dati reali Luca)

**Files:**
- Create (temporaneo): `scripts/verify-direct.ts` (script diagnostico, cancellato a fine task)

- [ ] **Step 1: Script diagnostico** che chiama i fetcher reali e stampa i valori.

```typescript
// scripts/verify-direct.ts — run: npx tsx --env-file=.env scripts/verify-direct.ts
import { fetchAccountInsights, fetchAccountProfile } from "@/lib/zernio";
const ACC = process.env.LUCA_ZERNIO_ACCOUNT_ID ?? "6a4cd5009d9472faaea5eab9";
const to = new Date().toISOString().slice(0, 10);
const since = new Date(Date.now() - 88 * 86_400_000).toISOString().slice(0, 10);
console.log("insights", await fetchAccountInsights(ACC, since, to));
console.log("profile", await fetchAccountProfile(ACC));
```
*(Nota: se l'alias `@/` non risolve in tsx, usa il path relativo `../src/lib/zernio`.)*

- [ ] **Step 2: Esegui**

Run: `npx tsx --env-file=.env scripts/verify-direct.ts`
Expected: `insights` con `views≈41337, accounts_engaged≈753, total_interactions≈1732, likes≈1284, saves≈112, shares≈131, reposts≈24, reach≈9363` (valori aggiornati; `replies/follows_and_unfollows/profile_links_taps`=0). `profile` con `following≈13, mediaCount≈12, tokenDays≈~59`.

- [ ] **Step 3: Refresh reale + lettura DB.** Avvia `npm run dev`, apri `/kpi` come admin, premi "Aggiorna dati". Poi verifica con un secondo script che `getKpiData` ritorni `directMetrics` valorizzati e che il delta cambi tra period=7 e period=90.

- [ ] **Step 4: Cleanup + segnala**

```bash
rm scripts/verify-direct.ts
afplay /System/Library/Sounds/Glass.aiff
```
Riporta a Matteo i valori reali osservati. **Gate:** se i valori sono coerenti con l'inventario, prosegui; altrimenti debugga il fetch prima della UI.

---

### Task 10: Formatter delta + META metriche (`kpi-format.ts`)

**Files:**
- Modify: `src/components/kpi/kpi-format.ts`
- Test: `tests/kpi-format.test.ts` (create)

**Interfaces:**
- Produces: `deltaFmt(deltaPct: number | null): { text: string; tone: "up" | "down" | "flat" }`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/kpi-format.test.ts
import { describe, it, expect } from "vitest";
import { deltaFmt } from "@/components/kpi/kpi-format";

describe("deltaFmt", () => {
  it("positivo → up con +", () => expect(deltaFmt(12.3)).toEqual({ text: "+12%", tone: "up" }));
  it("negativo → down", () => expect(deltaFmt(-4.6)).toEqual({ text: "−5%", tone: "down" }));
  it("null → flat trattino", () => expect(deltaFmt(null)).toEqual({ text: "—", tone: "flat" }));
  it("zero → flat", () => expect(deltaFmt(0)).toEqual({ text: "0%", tone: "flat" }));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- kpi-format` → FAIL.

- [ ] **Step 3: Implement** (append a `kpi-format.ts`)

```typescript
export function deltaFmt(deltaPct: number | null): { text: string; tone: "up" | "down" | "flat" } {
  if (deltaPct == null) return { text: "—", tone: "flat" };
  const r = Math.round(deltaPct);
  if (r > 0) return { text: `+${r}%`, tone: "up" };
  if (r < 0) return { text: `−${Math.abs(r)}%`, tone: "down" }; // U+2212 minus
  return { text: "0%", tone: "flat" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- kpi-format` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/kpi/kpi-format.ts tests/kpi-format.test.ts
git commit -m "feat(kpi): deltaFmt helper"
```

---

### Task 11: Modello card combinabili + transform puri (`dashboard-config.ts`)

**Files:**
- Modify: `src/lib/dashboard-config.ts`
- Test: `tests/dashboard-config.test.ts` (create)

**Interfaces:**
- Consumes: `MetricKey` da `@/lib/kpi`.
- Produces:
  - `type MetricCard = { i: string; metrics: MetricKey[] }`
  - `StoredLayout` guadagna `metricCards: MetricCard[]`
  - `DEFAULT_METRIC_CARDS: MetricCard[]` + posizioni default in `defaultLayout()`
  - `normalizeLayout` accetta `mc:*` presenti in `metricCards`
  - `splitCard(layout, cardId): StoredLayout` · `mergeCards(layout, srcId, dstId): StoredLayout` · `addMetricCard(layout, metric): StoredLayout` · `removeMetricCard(layout, cardId): StoredLayout`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/dashboard-config.test.ts
import { describe, it, expect } from "vitest";
import { normalizeLayout, splitCard, mergeCards, defaultLayout } from "@/lib/dashboard-config";

describe("metric cards", () => {
  it("defaultLayout include metricCards e relativi items", () => {
    const l = defaultLayout();
    expect(l.metricCards.length).toBeGreaterThan(0);
    for (const mc of l.metricCards) expect(l.items.find((it) => it.i === mc.i)).toBeTruthy();
  });

  it("normalizeLayout droppa metric-card orfane (item mc:* senza metricCards)", () => {
    const raw = { items: [{ i: "mc:ghost", x: 0, y: 0, w: 3, h: 3, minW: 2, minH: 2 }], hidden: [], metricCards: [] };
    const out = normalizeLayout(raw);
    expect(out.items.find((it) => it.i === "mc:ghost")).toBeFalsy();
  });

  it("splitCard esplode un cluster in N card single-metric", () => {
    const base = normalizeLayout({
      items: [{ i: "mc:x", x: 0, y: 0, w: 4, h: 3, minW: 2, minH: 2 }],
      hidden: [],
      metricCards: [{ i: "mc:x", metrics: ["likes", "saves"] }],
    });
    const out = splitCard(base, "mc:x");
    expect(out.metricCards.find((m) => m.i === "mc:x")).toBeFalsy();
    expect(out.metricCards).toHaveLength(2);
    expect(out.metricCards.every((m) => m.metrics.length === 1)).toBe(true);
    for (const m of out.metricCards) expect(out.items.find((it) => it.i === m.i)).toBeTruthy();
  });

  it("mergeCards unisce le metriche nella target e dedup", () => {
    const base = normalizeLayout({
      items: [
        { i: "mc:a", x: 0, y: 0, w: 3, h: 3, minW: 2, minH: 2 },
        { i: "mc:b", x: 3, y: 0, w: 3, h: 3, minW: 2, minH: 2 },
      ],
      hidden: [],
      metricCards: [
        { i: "mc:a", metrics: ["likes"] },
        { i: "mc:b", metrics: ["likes", "saves"] },
      ],
    });
    const out = mergeCards(base, "mc:a", "mc:b");
    expect(out.metricCards.find((m) => m.i === "mc:a")).toBeFalsy();
    expect(out.metricCards.find((m) => m.i === "mc:b")!.metrics).toEqual(["likes", "saves"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- dashboard-config` → FAIL.

- [ ] **Step 3: Implement** in `dashboard-config.ts`

In testa: `import type { MetricKey } from "@/lib/kpi";`

```typescript
export type MetricCard = { i: string; metrics: MetricKey[] };
```
Estendi `StoredLayout`:
```typescript
export type StoredLayout = { items: GridItem[]; hidden: BoxId[]; metricCards: MetricCard[] };
```
Aggiungi il default curato (id deterministici) e le loro posizioni in cima (y=0..2, sopra i box legacy che sposti più in basso — vedi nota ordine):
```typescript
export const DEFAULT_METRIC_CARDS: MetricCard[] = [
  { i: "mc:reach", metrics: ["reach"] },
  { i: "mc:views", metrics: ["views"] },
  { i: "mc:accounts_engaged", metrics: ["accounts_engaged"] },
  { i: "mc:total_interactions", metrics: ["total_interactions"] },
  { i: "mc:interazioni", metrics: ["likes", "comments", "saves", "shares", "reposts", "replies"] },
  { i: "mc:profilo", metrics: ["followers_direct", "following", "media", "token_days"] },
];

const METRIC_CARD_DEFAULT_ITEMS: Record<string, GridItem> = {
  "mc:reach": { i: "mc:reach", x: 0, y: 0, w: 3, h: 3, minW: 2, minH: 2 },
  "mc:views": { i: "mc:views", x: 3, y: 0, w: 3, h: 3, minW: 2, minH: 2 },
  "mc:accounts_engaged": { i: "mc:accounts_engaged", x: 6, y: 0, w: 3, h: 3, minW: 2, minH: 2 },
  "mc:total_interactions": { i: "mc:total_interactions", x: 9, y: 0, w: 3, h: 3, minW: 2, minH: 2 },
  "mc:interazioni": { i: "mc:interazioni", x: 0, y: 3, w: 6, h: 4, minW: 3, minH: 3 },
  "mc:profilo": { i: "mc:profilo", x: 6, y: 3, w: 6, h: 4, minW: 3, minH: 3 },
};

function metricCardItem(i: string): GridItem {
  return METRIC_CARD_DEFAULT_ITEMS[i] ?? { i, x: 0, y: 0, w: 3, h: 3, minW: 2, minH: 2 };
}
```
Sposta i box legacy sotto le card (in `defaultLayout`, aggiungi un offset `y` costante `+7` ai default del catalogo così stanno sotto Diretti → poi Derivati → Manuali resta l'ordine interno del catalogo). Aggiorna `defaultLayout`:
```typescript
const LEGACY_Y_OFFSET = 7;
export function defaultLayout(): StoredLayout {
  return {
    items: [
      ...DEFAULT_METRIC_CARDS.map((mc) => metricCardItem(mc.i)),
      ...BOX_CATALOG.map((b) => ({ i: b.id, ...b.default, y: b.default.y + LEGACY_Y_OFFSET })),
    ],
    hidden: [],
    metricCards: DEFAULT_METRIC_CARDS,
  };
}
```
Estendi `normalizeLayout` (dopo aver ricostruito `byId` dei box legacy): valida `metricCards`, tieni gli item `mc:*` solo se hanno una card, e reintegra le card mancanti:
```typescript
export function normalizeLayout(raw: unknown): StoredLayout {
  const fallback = defaultLayout();
  if (!raw || typeof raw !== "object") return fallback;
  const obj = raw as Partial<StoredLayout>;
  const items = Array.isArray(obj.items) ? obj.items : [];
  const hidden = Array.isArray(obj.hidden)
    ? obj.hidden.filter((h): h is BoxId => ALL_BOX_IDS.includes(h as BoxId))
    : [];
  const metricCards: MetricCard[] = Array.isArray(obj.metricCards)
    ? obj.metricCards.filter(
        (m): m is MetricCard =>
          !!m && typeof m.i === "string" && m.i.startsWith("mc:") && Array.isArray(m.metrics) && m.metrics.length > 0
      )
    : obj.metricCards === undefined && items.length === 0
      ? fallback.metricCards // layout mai personalizzato → default curato
      : [];
  const mcIds = new Set(metricCards.map((m) => m.i));

  const byId = new Map<string, GridItem>();
  for (const it of items) {
    if (!it || typeof it.i !== "string") continue;
    const isLegacy = ALL_BOX_IDS.includes(it.i as BoxId);
    const isMetric = it.i.startsWith("mc:") && mcIds.has(it.i);
    if (!isLegacy && !isMetric) continue;
    byId.set(it.i, {
      i: it.i,
      x: Number(it.x) || 0, y: Number(it.y) || 0,
      w: Number(it.w) || 3, h: Number(it.h) || 3,
      minW: Number(it.minW) || 2, minH: Number(it.minH) || 2,
    });
  }
  for (const b of BOX_CATALOG) if (!byId.has(b.id) && !hidden.includes(b.id)) byId.set(b.id, { i: b.id, ...b.default, y: b.default.y + 7 });
  for (const mc of metricCards) if (!byId.has(mc.i)) byId.set(mc.i, metricCardItem(mc.i));
  // default curato al primo caricamento (nessun metricCards salvato E nessun item mc:*)
  if (metricCards.length === 0 && obj.metricCards === undefined) {
    for (const mc of fallback.metricCards) { metricCards.push(mc); if (!byId.has(mc.i)) byId.set(mc.i, metricCardItem(mc.i)); }
  }
  return { items: [...byId.values()], hidden, metricCards };
}
```
Aggiungi i transform puri:
```typescript
function placeBelow(items: GridItem[], i: string, w: number, h: number): GridItem {
  const maxY = items.reduce((m, it) => Math.max(m, it.y + it.h), 0);
  return { i, x: 0, y: maxY, w, h, minW: 2, minH: 2 };
}

export function splitCard(layout: StoredLayout, cardId: string): StoredLayout {
  const card = layout.metricCards.find((m) => m.i === cardId);
  if (!card || card.metrics.length < 2) return layout;
  const others = layout.metricCards.filter((m) => m.i !== cardId);
  const newCards: MetricCard[] = card.metrics.map((metric) => ({ i: `mc:${metric}`, metrics: [metric] }));
  const items = layout.items.filter((it) => it.i !== cardId);
  for (const nc of newCards) if (!items.find((it) => it.i === nc.i)) items.push(placeBelow(items, nc.i, 3, 3));
  // dedup: se una metrica era già in un'altra card, la nuova single vince (rimuovi duplicati altrove)
  const merged = [...others, ...newCards];
  return { ...layout, items, metricCards: dedupCards(merged) };
}

export function mergeCards(layout: StoredLayout, srcId: string, dstId: string): StoredLayout {
  const src = layout.metricCards.find((m) => m.i === srcId);
  const dst = layout.metricCards.find((m) => m.i === dstId);
  if (!src || !dst || srcId === dstId) return layout;
  const metrics = [...new Set([...dst.metrics, ...src.metrics])];
  const metricCards = layout.metricCards
    .filter((m) => m.i !== srcId)
    .map((m) => (m.i === dstId ? { ...m, metrics } : m));
  const items = layout.items.filter((it) => it.i !== srcId);
  return { ...layout, items, metricCards };
}

export function addMetricCard(layout: StoredLayout, metric: MetricKey): StoredLayout {
  const i = `mc:${metric}`;
  if (layout.metricCards.find((m) => m.i === i)) return layout;
  const items = layout.items.find((it) => it.i === i) ? layout.items : [...layout.items, placeBelow(layout.items, i, 3, 3)];
  return { ...layout, items, metricCards: [...layout.metricCards, { i, metrics: [metric] }] };
}

export function removeMetricCard(layout: StoredLayout, cardId: string): StoredLayout {
  return {
    ...layout,
    items: layout.items.filter((it) => it.i !== cardId),
    metricCards: layout.metricCards.filter((m) => m.i !== cardId),
  };
}

/** Una metrica deve stare in UNA sola card: tieni la prima occorrenza. */
function dedupCards(cards: MetricCard[]): MetricCard[] {
  const seen = new Set<string>();
  return cards
    .map((c) => ({ ...c, metrics: c.metrics.filter((m) => (seen.has(m) ? false : (seen.add(m), true))) }))
    .filter((c) => c.metrics.length > 0);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- dashboard-config` → PASS. Poi `npm test` completo.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboard-config.ts tests/dashboard-config.test.ts
git commit -m "feat(dashboard): metric cards combinabili — model, normalize, split/merge"
```

---

### Task 12: Renderer `MetricCard` (`metric-card.tsx`)

**Files:**
- Create: `src/components/kpi/metric-card.tsx`
- Modify: `src/components/kpi/kpi-format.ts` (nessuna, già fatto) — solo consumo.

**Interfaces:**
- Consumes: `KpiData.directMetrics`, `MetricKey`, `deltaFmt`, `int`, `pctFromPercent`.
- Produces: `<MetricCard metrics={MetricKey[]} data={KpiData} onSplit onMergeInto onRemove title? />` e `METRIC_META: Record<MetricKey, { label: string; icon: ReactNode; unit: "int" | "days" }>`.

- [ ] **Step 1: Implementa il componente** (client). Include `METRIC_META`, rendering 1-metrica (tile grande con delta colorato) vs N-metriche (lista), e un menu ⋯ con Dividi/Unisci/Rimuovi.

```tsx
"use client";
import { useState } from "react";
import {
  Eye, ChartLineUp, UsersThree, PulseIcon, Heart, ChatCircleDots, BookmarkSimple,
  ShareNetwork, ArrowBendUpLeft, Repeat, UserPlus, LinkSimple, Users, ImageSquare, Clock,
  DotsThree, ArrowsInSimple, ArrowsOutSimple, Trash,
} from "@phosphor-icons/react";
import type { KpiData, MetricKey } from "@/lib/kpi";
import { int, deltaFmt } from "./kpi-format";

export const METRIC_META: Record<MetricKey, { label: string; icon: React.ReactNode; unit: "int" | "days" }> = {
  reach: { label: "Reach", icon: <Eye size={16} weight="fill" />, unit: "int" },
  views: { label: "Views", icon: <ChartLineUp size={16} weight="fill" />, unit: "int" },
  accounts_engaged: { label: "Accounts engaged", icon: <UsersThree size={16} weight="fill" />, unit: "int" },
  total_interactions: { label: "Interazioni totali", icon: <PulseIcon size={16} weight="fill" />, unit: "int" },
  likes: { label: "Like", icon: <Heart size={16} weight="fill" />, unit: "int" },
  comments: { label: "Commenti", icon: <ChatCircleDots size={16} weight="fill" />, unit: "int" },
  saves: { label: "Salvataggi", icon: <BookmarkSimple size={16} weight="fill" />, unit: "int" },
  shares: { label: "Condivisioni", icon: <ShareNetwork size={16} weight="fill" />, unit: "int" },
  replies: { label: "Risposte", icon: <ArrowBendUpLeft size={16} weight="fill" />, unit: "int" },
  reposts: { label: "Repost", icon: <Repeat size={16} weight="fill" />, unit: "int" },
  follows_and_unfollows: { label: "Follow netti", icon: <UserPlus size={16} weight="fill" />, unit: "int" },
  profile_links_taps: { label: "Tap sui link", icon: <LinkSimple size={16} weight="fill" />, unit: "int" },
  followers_direct: { label: "Follower", icon: <Users size={16} weight="fill" />, unit: "int" },
  following: { label: "Seguiti", icon: <Users size={16} weight="fill" />, unit: "int" },
  media: { label: "Post pubblicati", icon: <ImageSquare size={16} weight="fill" />, unit: "int" },
  token_days: { label: "Token (giorni)", icon: <Clock size={16} weight="fill" />, unit: "days" },
};

const TONE_CLASS = { up: "text-sage-ink", down: "text-coral-ink", flat: "text-muted-foreground" } as const;

function DeltaBadge({ deltaPct }: { deltaPct: number | null }) {
  const { text, tone } = deltaFmt(deltaPct);
  return <span className={`text-xs font-medium ${TONE_CLASS[tone]}`}>{text}</span>;
}

function fmtVal(key: MetricKey, value: number | null): string {
  if (value == null) return "—";
  if (METRIC_META[key].unit === "days") return `${Math.round(value)}g`;
  return int(value);
}

export function MetricCard({
  cardId, metrics, data, title, onSplit, onRemove, onMergeInto, otherCards,
}: {
  cardId: string;
  metrics: MetricKey[];
  data: KpiData;
  title?: string;
  onSplit: (id: string) => void;
  onRemove: (id: string) => void;
  onMergeInto: (srcId: string, dstId: string) => void;
  otherCards: { i: string; label: string }[];
}) {
  const [menu, setMenu] = useState(false);
  const single = metrics.length === 1;
  return (
    <div className="relative flex h-full flex-col rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(26,24,19,0.04)]">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{title ?? (single ? METRIC_META[metrics[0]].label : "Metriche")}</span>
        <button
          onClick={() => setMenu((v) => !v)}
          onMouseDown={(e) => e.stopPropagation()}
          aria-label="Gestisci card"
          className="kpi-no-drag rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-ink"
        >
          <DotsThree size={16} weight="bold" />
        </button>
      </div>

      {single ? (
        <div className="mt-1 flex flex-1 flex-col justify-center">
          <div className="flex items-end justify-between gap-2">
            <span className="text-3xl font-semibold text-ink">{fmtVal(metrics[0], data.directMetrics[metrics[0]]?.value ?? null)}</span>
            <span className="text-muted-foreground">{METRIC_META[metrics[0]].icon}</span>
          </div>
          <div className="mt-2"><DeltaBadge deltaPct={data.directMetrics[metrics[0]]?.deltaPct ?? null} /> <span className="text-xs text-muted-foreground">vs periodo prec.</span></div>
        </div>
      ) : (
        <div className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto">
          {metrics.map((m) => (
            <div key={m} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-1.5 text-muted-foreground">{METRIC_META[m].icon}{METRIC_META[m].label}</span>
              <span className="flex items-center gap-2">
                <span className="tabular-nums text-ink">{fmtVal(m, data.directMetrics[m]?.value ?? null)}</span>
                <DeltaBadge deltaPct={data.directMetrics[m]?.deltaPct ?? null} />
              </span>
            </div>
          ))}
        </div>
      )}

      {menu && (
        <div className="kpi-no-drag absolute right-2 top-9 z-30 w-44 rounded-xl border border-border bg-paper p-1 shadow-lg" onMouseDown={(e) => e.stopPropagation()}>
          {!single && (
            <button onClick={() => { onSplit(cardId); setMenu(false); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-secondary">
              <ArrowsOutSimple size={14} /> Dividi in singoli
            </button>
          )}
          {otherCards.length > 0 && (
            <div className="px-2 py-1 text-[11px] text-muted-foreground">Unisci a…</div>
          )}
          {otherCards.map((c) => (
            <button key={c.i} onClick={() => { onMergeInto(cardId, c.i); setMenu(false); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-secondary">
              <ArrowsInSimple size={14} /> {c.label}
            </button>
          ))}
          <button onClick={() => { onRemove(cardId); setMenu(false); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-coral-ink hover:bg-secondary">
            <Trash size={14} /> Rimuovi
          </button>
        </div>
      )}
    </div>
  );
}
```
*(Nota implementativa: verifica i nomi icone Phosphor esistenti nel repo; se `PulseIcon`/`Repeat`/`ArrowBendUpLeft` non esistono in questa versione, sostituisci con icone presenti — `grep -r "@phosphor-icons/react" src` per la convenzione.)*

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` → nessun errore (risolvi eventuali icone mancanti).

- [ ] **Step 3: Commit**

```bash
git add src/components/kpi/metric-card.tsx
git commit -m "feat(kpi): componente MetricCard (tile singolo / cluster) con menu dividi/unisci"
```

---

### Task 13: Integrazione griglia — render mc:*, preserva metricCards, palette metriche (`dashboard-grid.tsx`)

**Files:**
- Modify: `src/components/dashboard-grid.tsx`

**Interfaces:**
- Consumes: `MetricCard` (componente), `splitCard`, `mergeCards`, `addMetricCard`, `removeMetricCard`, `METRIC_META`, `INSIGHT_KEYS`, `PROFILE_KEYS`.

*(UI: verificata live in Task 14.)*

- [ ] **Step 1: Import** in `dashboard-grid.tsx`

Aggiungi: `import { MetricCard, METRIC_META } from "./kpi/metric-card";` e da `dashboard-config` `splitCard, mergeCards, addMetricCard, removeMetricCard, type MetricCard as MetricCardModel`; da `@/lib/kpi` `INSIGHT_KEYS, PROFILE_KEYS, type MetricKey`.

- [ ] **Step 2: Preserva `metricCards` in `onLayoutChange`** (bug fix critico)

Nel `merged` dentro `onLayoutChange`, aggiungi `metricCards: prev.metricCards,` all'oggetto `StoredLayout` (attualmente omesso → li cancellerebbe).
Idem: in `hideBox`/`addBox`/altre mutazioni che ricostruiscono `StoredLayout`, assicurati che `metricCards` sia sempre riportato (`...prev` già lo fa dove usato; dove si costruisce l'oggetto esplicito, aggiungilo).

- [ ] **Step 3: Rendering ramo mc:*** dentro il `.map(visibleItems)`

```tsx
{visibleItems.map((it) => {
  const isMetric = it.i.startsWith("mc:");
  const card = isMetric ? layout.metricCards.find((m) => m.i === it.i) : null;
  return (
    <div key={it.i} className="group/box relative">
      {/* handle drag + (solo box legacy) bottone nascondi — invariato per legacy */}
      <div className="absolute -top-1 right-1 z-20 flex translate-y-1 items-center gap-1 opacity-0 transition-opacity group-hover/box:opacity-100">
        <span className="kpi-drag-handle cursor-grab rounded-full bg-ink/80 p-1 text-cream active:cursor-grabbing"><DotsSixVertical size={13} /></span>
        {!isMetric && (
          <button onClick={() => hideBox(it.i as BoxId)} onMouseDown={(e) => e.stopPropagation()} aria-label="Nascondi box" className="kpi-no-drag rounded-full bg-ink/80 p-1 text-cream hover:bg-ink"><EyeSlash size={13} /></button>
        )}
      </div>
      <div className="h-full overflow-hidden">
        {isMetric && card ? (
          <MetricCard
            cardId={card.i}
            metrics={card.metrics}
            data={data}
            title={card.metrics.length > 1 ? metricCardTitle(card.i) : undefined}
            onSplit={applySplit}
            onRemove={applyRemove}
            onMergeInto={applyMerge}
            otherCards={layout.metricCards.filter((m) => m.i !== card.i).map((m) => ({ i: m.i, label: metricCardTitle(m.i) }))}
          />
        ) : (
          <KpiBox id={it.i as BoxId} data={data} onManage={setEditor} />
        )}
      </div>
    </div>
  );
})}
```
Aggiungi gli handler (usano i transform puri + persist) e un titolo leggibile:
```tsx
const applyTransform = useCallback((fn: (l: StoredLayout) => StoredLayout) => {
  setLayout((prev) => { const next = fn(prev); persist(next); return next; });
}, [persist]);
const applySplit = useCallback((id: string) => applyTransform((l) => splitCard(l, id)), [applyTransform]);
const applyMerge = useCallback((src: string, dst: string) => applyTransform((l) => mergeCards(l, src, dst)), [applyTransform]);
const applyRemove = useCallback((id: string) => { applyTransform((l) => removeMetricCard(l, id)); toast.success("Card rimossa"); }, [applyTransform]);
```
`metricCardTitle`: default per gli id noti (`mc:interazioni`→"Interazioni", `mc:profilo`→"Profilo & salute"), altrimenti la label della prima metrica.

- [ ] **Step 4: Palette "Aggiungi box" estesa alle metriche**

Nel modale catalogo, sotto i box legacy nascosti, elenca le `MetricKey` non presenti in nessuna card (`[...INSIGHT_KEYS, ...PROFILE_KEYS].filter(...)`) come pulsanti che chiamano `applyTransform((l) => addMetricCard(l, metric))` e chiudono il modale. Etichetta da `METRIC_META[metric].label`.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit` → nessun errore.

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard-grid.tsx
git commit -m "feat(dashboard): griglia rende MetricCard, preserva metricCards, palette metriche"
```

---

### Task 14: CHECKPOINT finale — browser-verify + report

**Files:** nessuno (verifica).

- [ ] **Step 1:** `npm run dev` attivo. Login come admin (account `lucademarco2005`).
- [ ] **Step 2:** Vai su `/kpi`. Verifica in browser (Puppeteer o Chrome MCP): le 6 card dirette compaiono in cima con valori reali; ogni tile mostra delta colorato "vs periodo prec.".
- [ ] **Step 3:** Cambia periodo 7→30→90: i **delta cambiano** (valore corrente e delta diversi per finestra).
- [ ] **Step 4:** Sul cluster "Interazioni" → ⋯ → **Dividi**: diventa 6 tile singoli; ricarica la pagina → persistono. Poi **Unisci** due tile → tornano cluster; ricarica → persiste.
- [ ] **Step 5:** "Aggiungi box" → aggiungi una metrica non presente; **Reset** → torna al default curato.
- [ ] **Step 6:** `npm test` completo verde + `npx tsc --noEmit` pulito.
- [ ] **Step 7:** `graphify update .` per aggiornare il grafo. Poi `afplay /System/Library/Sounds/Glass.aiff` e **riporta a Matteo** con screenshot/valori. NON fare merge su main: attendi ok esplicito (regola browser-verify-before-merge + commit-only-when-working).

---

## Self-Review

**Spec coverage:**
- §1 metriche → Task 1 (keys), 2 (mapper), 5 (fetch), 8 (expose). ✓
- §1b profilo → Task 3, 5, 8. ✓
- §1c demografiche city/engaged → Task 4. ✓
- §2 data layer per-periodo → Task 5, 7. ✓
- §3 storage no-migration → Task 2, 3, 6 (delete-by-metric, raffinamento cur/prev documentato nei Global Constraints). ✓
- §4 read directMetrics → Task 1, 8. ✓
- §5 card combinabili (model, renderer, split/merge, default, ordine) → Task 11, 12, 13. ✓
- §5e delta helper → Task 10. ✓
- §6 refresh integration → Task 7. ✓
- §7 test → Task 1,2,3,4,10,11 (unit) + Task 9,14 (live). ✓

**Placeholder scan:** nessun TBD/TODO; ogni step di codice ha codice reale. Note "verifica nomi icone Phosphor" e "alias @ in tsx" sono istruzioni operative concrete, non placeholder.

**Type consistency:** `MetricKey`/`InsightKey`/`ProfileKey` definiti in Task 1 e usati coerentemente in 2/8/11/12/13. `StoredLayout.metricCards` definito in Task 11 e consumato in 13. `deltaFmt` (Task 10) usato in 12. `writeDirectMeasurements`/`mapDirectInsights`/`mapProfile` firme coerenti tra 2/3/6/7. `readInsightDeltas` firma coerente tra 1 e 8.

**Nota divergenza spec→plan (intenzionale):** lo spec §3a proponeva pairing per data (`date=to` / `date=to−p`); il piano usa nomi espliciti `:cur`/`:prev` con `writeDirectMeasurements` delete-by-metric per eliminare il rischio di accumulo righe a refresh giornalieri. Documentato nei Global Constraints.
