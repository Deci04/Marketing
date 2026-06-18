# Contenuti & Blocchi (Fase 1 — Modulo 2) Implementation Plan

> Builds on Module 1 (Fondamenta). Stack realized: Next.js 16 (`proxy.ts`), Prisma 6, Neon, Auth.js v5, Tailwind+shadcn, multi-tenant `Workspace`. Working dir: `~/claudbot/content-tool`.

**Goal:** Make content a real thing in the system — `Block`, `Content`, `Comment`, `MetricSnapshot` data models (workspace-scoped), a derived status, and a working **Contenuti** page where you create blocks/contents, see the light cards, and leave comments.

**Architecture:** Prisma models scoped by `workspaceId` (via `scopedWhere`). Server Actions for mutations, Server Components for reads (using `currentContext()` for the active workspace). Light card UI in the Contenuti area. Derived status computed from dates (no manual upkeep).

---

## Data model (added to `prisma/schema.prisma`)

- **enum Channel** = INSTAGRAM | YOUTUBE
- **enum ContentFormat** = REEL | CAROUSEL | STORY | LONG_VIDEO
- **Block**: workspaceId, label, lucaDeliveryAt?, matteoDeliveryAt?, createdAt → contents[], comments[]
- **Content**: workspaceId, blockId?, title, channel, format?, publishAt?, hook?, notes?, materialsUrl?, performance (views?, reach?, nonFollowerPct?, likes?, commentsCount?, saves?, shares?, followsGenerated?), createdAt → comments[], snapshots[]
- **Comment**: workspaceId, contentId?, blockId?, authorId, body, createdAt (a comment targets a Content OR a Block)
- **MetricSnapshot**: contentId, takenAt, views?, reach?, nonFollowerPct?, likes?, saves?, shares?
- Back-relations added to `Workspace` (blocks/contents/comments) and `User` (comments).

Engagement rate is **computed in app** (not stored): `(likes+commentsCount+saves+shares) / reach`.

Derived status (`src/lib/status.ts`, computed, not stored), given `now`:
- `publishAt` set & ≤ now → **Pubblicato**
- else `matteoDeliveryAt` set & ≤ now → **Revisionato**
- else `lucaDeliveryAt` set & ≤ now → **Consegnato**
- else → **Da consegnare**

---

## File structure

- `prisma/schema.prisma` — models (modify) + migration
- `src/lib/status.ts` — `deriveStatus()` (pure, tested)
- `src/lib/content.ts` — workspace-scoped CRUD for blocks & contents + helpers
- `src/app/(app)/contenuti/page.tsx` — list (light cards) + create forms
- `src/app/(app)/contenuti/actions.ts` — server actions (create block/content, add comment)
- `src/components/content-card.tsx` — the light card
- `src/app/(app)/layout.tsx` — add "Contenuti" to nav (modify)
- `tests/status.test.ts` — deriveStatus unit tests

---

## Tasks

### M1 — Models + migration
Add the enums/models above; add back-relations; `npx prisma migrate dev --name contenuti_blocchi`.

### M2 — deriveStatus (TDD)
Write `tests/status.test.ts` covering the 4 cases + ordering; implement `src/lib/status.ts`; `npm test` green.

### M3 — Data layer (`src/lib/content.ts`)
`listContents(workspaceId)`, `getContent(workspaceId, id)`, `createBlock(workspaceId, data)`, `createContent(workspaceId, data)`, `addComment(workspaceId, {authorId, contentId?|blockId?, body})`, `engagementRate(content)` — all scoped via `scopedWhere`.

### M4 — UI: Contenuti page + light card + create + comments
Server Component page lists contents as light cards (channel badge, derived status, publish date, hook); a "Nuovo contenuto" form (title, channel, publishAt, blockId optional) and "Nuovo blocco" form; clicking a card opens detail with comments thread + add-comment action. Add "Contenuti" to nav.

### M5 — Verify + ship
`npx tsc --noEmit` clean, `npm test` green, `npm run build` clean, dev smoke (create a content, see it, add a comment). Commit + push (auto-deploys).

---

## Definition of Done
Logged in, you can create a block and contents, see them as light cards with the right derived status & channel, open a content and leave a comment (as Matteo or Luca), all scoped to the workspace. Tests + build green; deployed.
