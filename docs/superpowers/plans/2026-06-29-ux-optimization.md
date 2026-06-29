# UX Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce daily-use friction in the content-tool app: instant calendar/content creation, faster perceived navigation, and one-click discovery of new content.

**Architecture:** Next.js 16 App Router (modified — `proxy.ts`, not `middleware.ts`). Server Components fetch via Prisma; mutations via server actions. We add `loading.tsx` skeletons, dedup the per-navigation auth, narrow queries, add inline calendar creation + a numeric-title fallback, and a "Novità" feed on home.

**Tech Stack:** Next.js 16, React 19, Prisma 6 + Neon Postgres, Auth.js v5, Tailwind v4, Phosphor icons, motion, Vitest (tests in `tests/`, node env).

## Global Constraints
- **Next.js is modified** — before writing any Next-specific code, read the relevant file under `node_modules/next/dist/docs/` (e.g. `01-app/03-api-reference/03-file-conventions/loading.md`, `01-app/02-guides/lazy-loading.md`). Do NOT rely on memorized Next APIs (per `AGENTS.md`).
- Branch: `filone/ux-speed`. Commit per task.
- `npm test` (Vitest) must stay green; `npm run build` must stay clean. New tests go in `tests/*.test.ts` (node env, pure logic only — no React rendering).
- Responsible enum on calendar = `"LUCA" | "MATTEO" | null`. Format enum values: `STORY|CAROUSEL|REEL|LONG_VIDEO` (`src/lib/format.ts`).
- Browser-verify all new flows before merge to main (audit gate).
- Order matches Matteo's priority: content creation + calendar first, then speed, then novità, then polish.

---

### Task 1: Fast content creation — Reel default + numeric-title fallback

**Files:**
- Create: `src/lib/content-title.ts` (pure helper)
- Test: `tests/content-title.test.ts`
- Modify: `src/app/(app)/contenuti/actions.ts:30-51` (`createContentAction`)
- Modify: `src/app/(app)/contenuti/page.tsx:111,116-117` (form defaults)

**Interfaces:**
- Produces: `nextNumericTitle(existingTitles: string[]): string` — returns the smallest positive integer (as string) not already present as an exact title in the list. `["1","3","foo"] → "2"`, `[] → "1"`, `["1","2"] → "3"`.

- [ ] **Step 1: Write the failing test** — `tests/content-title.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { nextNumericTitle } from "@/lib/content-title";

describe("nextNumericTitle", () => {
  it("returns '1' when there are no titles", () => {
    expect(nextNumericTitle([])).toBe("1");
  });
  it("returns the next integer after a contiguous run", () => {
    expect(nextNumericTitle(["1", "2"])).toBe("3");
  });
  it("fills the smallest gap", () => {
    expect(nextNumericTitle(["1", "3"])).toBe("2");
  });
  it("ignores non-numeric titles", () => {
    expect(nextNumericTitle(["foo", "bar", "1"])).toBe("2");
  });
  it("treats '01' / ' 2 ' loosely (trim, no leading zeros match)", () => {
    expect(nextNumericTitle(["1", " 2 "])).toBe("3");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/content-title.test.ts`
Expected: FAIL — cannot find module `@/lib/content-title`.

- [ ] **Step 3: Write minimal implementation** — `src/lib/content-title.ts`

```ts
/** Smallest positive integer (as string) not already used as an exact title. */
export function nextNumericTitle(existingTitles: string[]): string {
  const used = new Set<number>();
  for (const t of existingTitles) {
    const trimmed = t.trim();
    if (/^\d+$/.test(trimmed)) used.add(Number(trimmed));
  }
  let n = 1;
  while (used.has(n)) n++;
  return String(n);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/content-title.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Wire the fallback into the action** — `src/app/(app)/contenuti/actions.ts`

Replace the early-return on empty title (lines 33-34) so an empty title auto-numbers instead of aborting:

```ts
  // (top of file) add import:
  import { nextNumericTitle } from "@/lib/content-title";
  import { listContents } from "@/lib/content"; // if not already imported

  // inside createContentAction, replace:
  //   const title = String(formData.get("title") ?? "").trim();
  //   if (!title) return;
  // with:
  let title = String(formData.get("title") ?? "").trim();
  if (!title) {
    const existing = await listContents(ctx.workspaceId);
    title = nextNumericTitle(existing.map((c) => c.title));
  }
```

(Note: `parseFormat` already maps `"REEL"` → the enum; passing `format` unchanged is fine.)

- [ ] **Step 6: Default the form to Reel + make title optional** — `src/app/(app)/contenuti/page.tsx`

- Line 111: remove `required` and update placeholder:
  `<TextField name="title" placeholder="Titolo / concept (opz. — numero automatico)" />`
- Lines 116-117: default format to Reel and relabel the empty option:
```tsx
<SelectField name="format" defaultValue="REEL" aria-label="Tipologia">
  <option value="">Nessuna tipologia</option>
```
(`FORMAT_ORDER.map(...)` already renders `REEL` as "Reel"; `defaultValue="REEL"` selects it.)

- [ ] **Step 7: Verify build + tests**

Run: `npm test` then `npm run build`
Expected: all tests pass; build clean.

- [ ] **Step 8: Commit**

```bash
git add src/lib/content-title.ts tests/content-title.test.ts src/app/(app)/contenuti/actions.ts "src/app/(app)/contenuti/page.tsx"
git commit -m "feat(contenuti): creazione veloce — Reel di default + nome numerico automatico"
```

---

### Task 2: Calendar inline quick-create

**Files:**
- Modify: `src/components/calendar/calendar-board.tsx` (cell click → inline input; ~220-289 cell render, add state near other `useState`)
- Modify: `src/app/(app)/calendario/page.tsx` (pass `defaultResponsible` prop derived from current user)
- Read first: `node_modules/next/dist/docs/01-app/...` server actions reference if unsure about calling `addEventAction` from a client form.

**Interfaces:**
- Consumes: `addEventAction(formData)` from `src/app/(app)/calendario/actions.ts` (fields: `title`, `date`=YYYY-MM-DD, `responsible`).
- The board gains a prop: `defaultResponsible: "LUCA" | "MATTEO" | null`.

- [ ] **Step 1: Derive the current user's responsible default** — `src/app/(app)/calendario/page.tsx`

Where `ctx` is available, compute and pass:
```tsx
const email = (ctx.user.email ?? "").toLowerCase();
const name = (ctx.user.name ?? "").toLowerCase();
const defaultResponsible =
  name.includes("matteo") || email.includes("matteo") ? "MATTEO"
  : name.includes("luca") || email.includes("luca") ? "LUCA"
  : null;
// <CalendarBoard ... defaultResponsible={defaultResponsible} />
```
Add `defaultResponsible` to the board's props type.

- [ ] **Step 2: Add inline-create state to the board** — `src/components/calendar/calendar-board.tsx`

Near the existing `addDay`/`selected` state, add:
```tsx
const [inlineDay, setInlineDay] = useState<string | null>(null);
const [inlineTitle, setInlineTitle] = useState("");
```

- [ ] **Step 3: Make the empty cell area start inline-create**

On the cell `<div>` (the container around line 222), add an `onClick` that only fires when clicking empty space (not a chip): set `inlineDay` to `cell.ymd`. Guard so clicks on chips/buttons don't trigger it (chips already `stopPropagation` on their own handlers; add `e.stopPropagation()` to the chip `onClick` if missing).

```tsx
onClick={() => { setInlineDay(cell.ymd); setInlineTitle(""); }}
```

- [ ] **Step 4: Render the inline input inside the cell when active**

Inside the cell, after the `dayItems.map(...)` list, when `inlineDay === cell.ymd` render:
```tsx
{inlineDay === cell.ymd && (
  <input
    autoFocus
    value={inlineTitle}
    onChange={(e) => setInlineTitle(e.target.value)}
    onClick={(e) => e.stopPropagation()}
    onKeyDown={async (e) => {
      if (e.key === "Escape") { setInlineDay(null); return; }
      if (e.key === "Enter" && inlineTitle.trim()) {
        const fd = new FormData();
        fd.set("title", inlineTitle.trim());
        fd.set("date", cell.ymd);
        if (defaultResponsible) fd.set("responsible", defaultResponsible);
        await addEventAction(fd);
        toast.success("Evento aggiunto");
        setInlineDay(null);
        router.refresh();
      }
    }}
    onBlur={() => { if (!inlineTitle.trim()) setInlineDay(null); }}
    placeholder="Titolo + Invio"
    className="w-full rounded-md border border-border bg-paper px-1.5 py-1 text-[11px]"
  />
)}
```

- [ ] **Step 5: Update the legend** — in the header legend row, append a hint: `· clic su un giorno per aggiungere`. Keep the hover "+" as-is (secondary affordance).

- [ ] **Step 6: Build + lint**

Run: `npm run build`
Expected: clean (no type errors on the new prop / handlers).

- [ ] **Step 7: Commit**

```bash
git add src/components/calendar/calendar-board.tsx "src/app/(app)/calendario/page.tsx"
git commit -m "feat(calendario): quick-create inline (clic cella + Invio, responsabile precompilato)"
```

---

### Task 3: Dedup per-navigation auth

**Files:**
- Modify: `src/lib/current.ts`
- Modify: `src/app/(app)/layout.tsx:17-22`

**Interfaces:**
- `currentContext()` keeps its return shape (`{ user, role, workspace, workspaceId }`).
- `currentUser()` keeps returning the user record or null.
- Both wrapped so a single navigation hits `auth()` + DB once (React per-request cache).

- [ ] **Step 1: Read the Next/React caching doc** for `cache()` semantics in this Next version (`node_modules/next/dist/docs/01-app/...`). Confirm `import { cache } from "react"` is supported.

- [ ] **Step 2: Wrap session + membership lookups in `cache()`** — `src/lib/current.ts`

```ts
import { cache } from "react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const getSession = cache(async () => auth());

const getMembership = cache(async (userId: string) =>
  db.membership.findFirst({
    where: { userId },
    include: { workspace: true, user: true },
  })
);

export const currentUser = cache(async () => {
  const session = await getSession();
  if (!session?.user?.id) return null;
  const m = await getMembership(session.user.id);
  return m?.user ?? db.user.findUnique({ where: { id: session.user.id } });
});

export async function currentContext() {
  const session = await getSession();
  if (!session?.user?.id) return null;
  const membership = await getMembership(session.user.id);
  if (!membership) return null;
  return {
    user: membership.user,
    role: membership.role,
    workspace: membership.workspace,
    workspaceId: membership.workspaceId,
  };
}
```
Now `layout.tsx` calling both `currentUser()` then `currentContext()` resolves `auth()` and the membership query once each per request.

- [ ] **Step 3: Build + smoke test**

Run: `npm run build` then `npm test`
Expected: clean; `tests/smoke.test.ts` still green.

- [ ] **Step 4: Commit**

```bash
git add src/lib/current.ts
git commit -m "perf(auth): una sola auth()+lookup per navigazione (React cache)"
```

---

### Task 4: Loading skeletons on every page

**Files (create one per route):**
- `src/app/(app)/home/loading.tsx`
- `src/app/(app)/calendario/loading.tsx`
- `src/app/(app)/contenuti/loading.tsx`
- `src/app/(app)/archivio/loading.tsx`
- `src/app/(app)/kpi/loading.tsx`
- Optional shared: `src/components/skeleton.tsx`

- [ ] **Step 1: Read** `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md` to confirm `loading.tsx` conventions in this version.

- [ ] **Step 2: Create a shared skeleton primitive** — `src/components/skeleton.tsx`

```tsx
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-ink/5 ${className}`} />;
}
```

- [ ] **Step 3: Add one `loading.tsx` per route** that mirrors each page's top-level layout (title bar + the stat/grid containers) using `<Skeleton>`. Example — `src/app/(app)/contenuti/loading.tsx`:

```tsx
import { Skeleton } from "@/components/skeleton";
export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Skeleton className="h-9 w-48" />
      <Skeleton className="h-11 w-28" />
      <div className="grid grid-cols-3 gap-3">
        <Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-56" />)}
      </div>
    </div>
  );
}
```
Repeat with layout-appropriate shapes for home (banner + 3 stats + list), calendario (header + 6×7 grid block), archivio (table rows), kpi (stat row + chart block).

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/skeleton.tsx "src/app/(app)/"*/loading.tsx
git commit -m "perf(ux): skeleton loading.tsx su tutte le pagine (niente schermo fermo)"
```

---

### Task 5: Narrow over-fetching (calendar range + home dedup)

**Files:**
- Modify: `src/lib/calendar.ts` (`getMonthItems` ~121, `getMonthBlocks` ~257)
- Modify: `src/app/(app)/home/page.tsx:21-24` + `src/lib/kpi.ts:getKpiOverview`

- [ ] **Step 1: Read** the current `tests/calendar.test.ts` to learn the expected `getMonthItems`/`getMonthBlocks` contract so the refactor stays green.

- [ ] **Step 2: Add date-range `where` to block queries** — in `getMonthItems`/`getMonthBlocks`, filter blocks whose delivery dates OR content publish dates intersect `[start, end)` at the DB level instead of fetching all and filtering in JS. Keep the same returned shape.

```ts
where: {
  ...scopedWhere(workspaceId),
  OR: [
    { lucaDeliveryAt: { gte: start, lt: end } },
    { matteoDeliveryAt: { gte: start, lt: end } },
    { contents: { some: { publishAt: { gte: start, lt: end } } } },
  ],
}
```

- [ ] **Step 3: Run calendar tests**

Run: `npx vitest run tests/calendar.test.ts`
Expected: PASS (refactor preserves behavior).

- [ ] **Step 4: Dedup home content fetch** — `src/app/(app)/home/page.tsx`: fetch `listContents` once and pass the result into `getKpiOverview` (add an optional `contents` param to `getKpiOverview` that, if provided, skips its internal `db.content.findMany()`), OR compute the home stats directly from the single `listContents` call. Keep KPI numbers identical.

- [ ] **Step 5: Build + full tests**

Run: `npm test` then `npm run build`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/calendar.ts "src/app/(app)/home/page.tsx" src/lib/kpi.ts
git commit -m "perf(query): filtro data calendario lato DB + dedup fetch home"
```

---

### Task 6: "Novità" feed on home (4 clicks → 1)

**Files:**
- Modify: `src/lib/content.ts` (add `listRecentContent`)
- Modify: `src/app/(app)/home/page.tsx` (render Novità section)

**Interfaces:**
- Produces: `listRecentContent(workspaceId: string, limit = 5)` → contents ordered by `createdAt` desc, with `block` + `classes` included (same shape as `listContents` items, so `ContentCard`/links work).

- [ ] **Step 1: Add the query** — `src/lib/content.ts`

```ts
export async function listRecentContent(workspaceId: string, limit = 5) {
  return db.content.findMany({
    where: scopedWhere(workspaceId),
    include: { block: true, classes: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
```

- [ ] **Step 2: Render a "Novità" section on home** — `src/app/(app)/home/page.tsx`, above "Prossime uscite". Each item is a `<Link href={`/contenuti/${c.id}`}>` row showing channel + title + status + relative time, deep-linking straight to the detail. Empty state: "Nessuna novità recente." Use the existing `deriveStatus` for the status chip.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/content.ts "src/app/(app)/home/page.tsx"
git commit -m "feat(home): sezione Novità con link diretto al contenuto (da 4 clic a 1)"
```

---

### Task 7: Polish + reproduce/fix the card→detail bug + lazy-load

**Files:**
- Investigate: `src/components/content-card.tsx`, `src/app/(app)/@modal/(.)contenuti/[id]/page.tsx`, `src/app/(app)/@modal/default.tsx`, `src/app/(app)/layout.tsx:66`
- Modify: `src/components/sidebar-nav.tsx` (click area), `src/app/(app)/home/page.tsx` (display name), `src/app/(app)/kpi/page.tsx` (lazy chart/grid)

- [ ] **Step 1: Reproduce the card→detail bug in dev.** Run `npm run dev` (port 3001), open `/contenuti`, click a card. If the modal does NOT open (URL unchanged), inspect: is `ContentCard` a server component with a plain `<Link>`? Is the `@modal` slot wired in `layout.tsx` (line 66 renders `{modal}`)? Does `@modal/(.)contenuti/[id]/page.tsx` exist and render? Check console for errors. **Fix the root cause** (common causes: missing `@modal/default.tsx`, slot not rendered, or an interceptor path mismatch in Next 16 — confirm against the local intercepting-routes doc).

- [ ] **Step 2: Verify the fix** — clicking a card opens the modal; direct URL still works; back button closes modal.

- [ ] **Step 3: Sidebar click area** — `src/components/sidebar-nav.tsx`: ensure each dot's clickable target is the full 48px control (not just the icon); confirm clicks land reliably.

- [ ] **Step 4: Display name on home** — `src/app/(app)/home/page.tsx`: greet with `ctx.user.name` when present, else the email's local-part (before `@`) capitalized, instead of the raw email.

- [ ] **Step 5: Stat-card link affordance** — add `cursor-pointer` + subtle hover to the clickable stat cards (home + contenuti) so it's clear they navigate.

- [ ] **Step 6: Lazy-load heavy client components** — `src/app/(app)/kpi/page.tsx`: load `DashboardGrid`/`KpiChart` via `dynamic(() => import(...), { ssr: false })` with a `<Skeleton>` fallback. Read `node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md` first.

- [ ] **Step 7: Build + tests**

Run: `npm test` then `npm run build`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "fix+polish(ux): card→dettaglio, sidebar, nome utente, affordance link, lazy-load KPI"
```

---

### Task 8: Browser-verify (audit gate) — before merge

- [ ] Run `npm run dev`; with a browser, verify each new flow:
  - Calendar: click empty cell → type → Enter → event appears with correct owner color.
  - Content: open "Nuovo", leave title empty, confirm Reel preselected, click Crea → content created with auto-number title.
  - Home: Novità section lists the new content; clicking it opens the detail in one click.
  - Navigation feels snappier (skeletons appear instantly on click).
  - Card→detail bug fixed.
- [ ] Confirm 0 console errors (smoke).
- [ ] Only after verification: present to Matteo for the merge checkpoint.

---

## Self-Review (done)
- **Spec coverage:** §1 calendar→Task 2; §2 content→Task 1; §3 speed→Tasks 3,4,5 + lazy-load in 7; §4 novità→Task 6; §5 polish+bug→Task 7. All covered.
- **Placeholders:** pure-logic code is complete with tests; UI steps give concrete file targets + handler code + verify commands. The card-bug fix is investigative by nature (Task 7 Step 1 enumerates the suspects) — acceptable since root cause is unconfirmed.
- **Type consistency:** `nextNumericTitle(string[]) → string`, `listRecentContent(workspaceId, limit)`, `defaultResponsible: "LUCA"|"MATTEO"|null` used consistently.
