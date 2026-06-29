# Collaborazione & Notifiche — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Turn the home into a Matteo↔Luca sync point: content lifecycle (delivered → review-ready → confirmed), an in-app activity feed with an unread bell, and contextual "Materiale consegnato"/"Conferma contenuto" buttons.

**Architecture:** Next.js 16 App Router (modified — read `node_modules/next/dist/docs/` before Next-specific code). Prisma 6 + Neon. Server Components + server actions. New `Activity` log + lifecycle fields on `Content`; pure `workflowState` helper (TDD).

**Tech Stack:** Next.js 16, React 19, Prisma 6, Auth.js v5, Tailwind v4, Phosphor, Vitest (tests in `tests/`, node env).

## Global Constraints
- Branch `filone/collab-notifiche`. Commit per task.
- Migration is **additive** (nullable columns + new table) → safe on the shared Neon DB; apply with `prisma migrate dev`. `DATABASE_URL`/`DIRECT_URL` already in `.env`.
- `npm test` green, `npm run build` clean per task. New pure-logic tests in `tests/`.
- Roles: actions visible to all members for now; every Activity records `actorId`. (Luca's account gating deferred.)
- Browser-verify the full loop before merge (audit gate). Non-destructive where possible; clean up any test rows.

---

### Task 1: Schema migration + workflowState (TDD) + activity layer

**Files:** `prisma/schema.prisma`, `src/lib/workflow.ts` (+ `tests/workflow.test.ts`), `src/lib/activity.ts`

- [ ] **Step 1: Add schema** — on `Content`: `deliveredAt DateTime?`, `confirmedAt DateTime?`. On `User`: `notificationsSeenAt DateTime?`. Add `Activity` model + `ActivityType` enum (DELIVERED, REVIEW_READY, CONFIRMED, COMMENT, CREATED) with `@@index([workspaceId, createdAt])`; add inverse `activities Activity[]` on `Workspace` and `Content`.
- [ ] **Step 2: Migrate** — `npx prisma migrate dev --name collab_notifiche` → expect: migration created + applied, `prisma generate` runs. Verify no data loss prompt (all additive).
- [ ] **Step 3: Write failing test** — `tests/workflow.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { workflowState } from "@/lib/workflow";
describe("workflowState", () => {
  it("Da consegnare when nothing happened", () =>
    expect(workflowState({ deliveredAt: null, confirmedAt: null, hasMontato: false })).toBe("Da consegnare"));
  it("Da revisionare when delivered but no montato", () =>
    expect(workflowState({ deliveredAt: new Date(), confirmedAt: null, hasMontato: false })).toBe("Da revisionare"));
  it("Da confermare when montato present and not confirmed", () =>
    expect(workflowState({ deliveredAt: new Date(), confirmedAt: null, hasMontato: true })).toBe("Da confermare"));
  it("Confermato when confirmedAt set", () =>
    expect(workflowState({ deliveredAt: new Date(), confirmedAt: new Date(), hasMontato: true })).toBe("Confermato"));
  it("montato without explicit delivery still Da confermare", () =>
    expect(workflowState({ deliveredAt: null, confirmedAt: null, hasMontato: true })).toBe("Da confermare"));
});
```
- [ ] **Step 4: Run → fail** (`npx vitest run tests/workflow.test.ts`).
- [ ] **Step 5: Implement** `src/lib/workflow.ts`:
```ts
export type WorkflowState = "Da consegnare" | "Da revisionare" | "Da confermare" | "Confermato";
export function workflowState(c: { deliveredAt: Date | null; confirmedAt: Date | null; hasMontato: boolean }): WorkflowState {
  if (c.confirmedAt) return "Confermato";
  if (c.hasMontato) return "Da confermare";
  if (c.deliveredAt) return "Da revisionare";
  return "Da consegnare";
}
```
- [ ] **Step 6: Run → pass.**
- [ ] **Step 7: Activity layer** `src/lib/activity.ts`:
```ts
import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/workspace";
import type { ActivityType } from "@prisma/client";

export async function createActivity(workspaceId: string, data: { type: ActivityType; contentId?: string | null; actorId?: string | null }) {
  return db.activity.create({ data: { workspaceId, type: data.type, contentId: data.contentId ?? null, actorId: data.actorId ?? null } });
}
export async function listActivity(workspaceId: string, limit = 20) {
  return db.activity.findMany({ where: scopedWhere(workspaceId), include: { content: { select: { id: true, title: true, channel: true } } }, orderBy: { createdAt: "desc" }, take: limit });
}
export async function unreadCount(workspaceId: string, userId: string, seenAt: Date | null) {
  return db.activity.count({ where: { ...scopedWhere(workspaceId), actorId: { not: userId }, ...(seenAt ? { createdAt: { gt: seenAt } } : {}) } });
}
```
- [ ] **Step 8: Build + test + commit.** `npm test && npm run build` → commit `feat(collab): schema lifecycle/Activity + workflowState (TDD) + activity layer`.

---

### Task 2: Lifecycle actions + activity hooks

**Files:** `src/lib/content.ts`, `src/app/(app)/contenuti/actions.ts`

- [ ] **Step 1: content.ts helpers** — `setDelivered(workspaceId, id, link?)` (sets `deliveredAt=new Date()`, `masterLink` if link), `setConfirmed(workspaceId, id)` (sets `confirmedAt=new Date()`), `setNotificationsSeen(userId)`. Add `hasMontato` derivation where content is loaded (videoProxyUrl != null || materials.length > 0).
- [ ] **Step 2: actions** in `contenuti/actions.ts`:
  - `markDeliveredAction(formData)` → `setDelivered` + `createActivity(DELIVERED, contentId, actorId)`.
  - `confirmContentAction(formData)` → `setConfirmed` + `createActivity(CONFIRMED, ...)`.
  - `markNotificationsSeenAction()` → `setNotificationsSeen(ctx.user.id)`.
- [ ] **Step 3: hooks** — in `addMaterialAction` & `setVideoProxyAction`: after persisting, if this is the first montato (was none before), `createActivity(REVIEW_READY, ...)`. In `addCommentAction`/`addAudioCommentAction`: `createActivity(COMMENT, ...)`. In `createContentAction` (+ calendar `addContentAction`): `createActivity(CREATED, ...)`.
- [ ] **Step 4:** all actions `revalidatePath("/home")` + existing paths.
- [ ] **Step 5: Build + commit** `feat(collab): azioni consegna/conferma + hook attività`.

---

### Task 3: Card/modal buttons + status badge

**Files:** `src/components/content-modal.tsx`, `src/components/content-card.tsx`, modal route `@modal/(.)contenuti/[id]/page.tsx` (pass deliveredAt/confirmedAt/hasMontato into ModalContent)

- [ ] **Step 1: Plumb fields** — extend `ModalContent` with `deliveredAt`, `confirmedAt`, `hasMontato`; map them in the modal route + the standalone detail page.
- [ ] **Step 2: Modal actions UI** — in `content-modal.tsx`: show `workflowState` badge; a **"Materiale consegnato"** button (with an optional Drive-link input) calling `markDeliveredAction` when `!deliveredAt`; a **"Conferma contenuto"** button calling `confirmContentAction` when `hasMontato && !confirmedAt`; "Confermato" badge after.
- [ ] **Step 3: Card badge** — small `workflowState` chip on `content-card.tsx` (needs deliveredAt/confirmedAt/materials count in the card query — extend `listContents` include if needed, or compute from existing fields).
- [ ] **Step 4: Build + commit** `feat(collab): pulsanti Consegnato/Conferma + badge stato`.

---

### Task 4: Home "Da fare adesso"

**Files:** `src/lib/content.ts` (or new `src/lib/todo.ts`), `src/app/(app)/home/page.tsx`

- [ ] **Step 1: query** — `listActionable(workspaceId)`: contents where `confirmedAt == null` AND (`deliveredAt != null` OR has montato OR ...), returning each with its `workflowState` so the home can label the action ("Da revisionare"/"Da confermare"). Exclude already-confirmed.
- [ ] **Step 2: home** — replace the "Novità (recent)" section with **"Da fare adesso"**: each row = content + the pending action + deep link; empty state "Tutto in pari ✨". Keep "Prossime uscite".
- [ ] **Step 3: Build + commit** `feat(home): 'Da fare adesso' azionabile al posto del feed grezzo`.

---

### Task 5: Notification bell + activity feed

**Files:** `src/components/notification-bell.tsx` (client), `src/app/(app)/layout.tsx` (mount in shell), feed page `src/app/(app)/notifiche/page.tsx` (or a panel)

- [ ] **Step 1: bell** — server-compute `unreadCount` in layout, pass to a client `NotificationBell` showing a dot/count; link to `/notifiche`.
- [ ] **Step 2: feed page** — `/notifiche`: `listActivity` rendered as "chi · cosa · quando" with link to the content; on mount call `markNotificationsSeenAction()` (server action via a small client effect/form) to reset unread.
- [ ] **Step 3: Build + commit** `feat(collab): campanello non-letti + feed attività`.

---

### Task 6: Browser-verify (audit gate)

- [ ] Dev server; with Chrome (puppeteer) drive the loop: open a content → "Materiale consegnato" (+link) → appears in Home "Da fare" + feed → (simulate montato) → "Conferma contenuto" → feed/badge update; bell unread increments then clears on opening `/notifiche`. Screenshots + 0 console errors.
- [ ] Clean up any test rows created. Present to Matteo for the merge checkpoint.

## Self-Review
- **Coverage:** spec §dati→T1; §azioni→T2; §UI card→T3; §home→T4; §campanello/feed→T5; §DoD→T6. Covered.
- **Placeholders:** pure logic has full code+tests; UI/action steps give concrete files + signatures. No TBDs.
- **Types:** `workflowState({deliveredAt,confirmedAt,hasMontato})`, `createActivity/listActivity/unreadCount`, `markDeliveredAction/confirmContentAction/markNotificationsSeenAction` consistent across tasks.
