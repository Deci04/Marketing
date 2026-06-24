# Materiali unificati — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fondere le tab "Video" e "Materiali e commenti" in un'unica tab "Materiali" che mostra una galleria foto (post/carosello) o un video con timeline (reel), dedotta dai materiali caricati.

**Architecture:** Nuova tabella `Material` (molti per contenuto, `kind` image|video, `order`). La logica pura (modalità di display, scelta copertina) vive in `src/lib/materials.ts` ed è unit-testata (vitest). Le azioni DB (add/remove/reorder + recompute cover) stanno in `src/lib/content.ts` + `actions.ts`. La UI riusa `VideoReview` per i video e una nuova `MaterialGallery` per le foto, dentro `content-modal.tsx`. `Content.thumbnailUrl` resta come copertina denormalizzata (usata dalle card), ricalcolata a ogni modifica.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Prisma + Postgres, React 19, Vitest, Vercel Blob.

## Global Constraints

- Leggere `node_modules/next/dist/docs/` per API Next.js incerte (AGENTS.md: "This is NOT the Next.js you know").
- Tutti gli upload passano da `/api/video-upload` (già corretto per content-type `;codecs` e localhost).
- Verifica finale: `npx tsc --noEmit` e `npx eslint` puliti + browser-verify su localhost prima del merge.
- Lingua UI: italiano, in linea con il resto dell'app.
- Decisione: un contenuto è **foto _oppure_ video**, non misto.

---

### Task 1: Modello `Material` + logica pura testata

**Files:**
- Modify: `prisma/schema.prisma` (aggiungi model `Material`, relazione su `Content`)
- Create: migration `prisma/migrations/<ts>_materiali/`
- Create: `src/lib/materials.ts`
- Test: `tests/materials.test.ts`

**Interfaces:**
- Produces:
  - `type MaterialKind = "image" | "video"`
  - `type MaterialLike = { id: string; kind: MaterialKind; url: string; order: number }`
  - `galleryMode(materials: MaterialLike[]): "empty" | "single" | "carousel" | "video"`
  - `coverUrl(materials: MaterialLike[]): string | null` (URL della prima foto per `order`, else null)
  - `sortByOrder(materials: MaterialLike[]): MaterialLike[]`

- [ ] **Step 1: Aggiungi il model a `prisma/schema.prisma`**

```prisma
model Material {
  id        String   @id @default(cuid())
  contentId String
  content   Content  @relation(fields: [contentId], references: [id], onDelete: Cascade)
  kind      String   // "image" | "video"
  url       String
  order     Int      @default(0)
  createdAt DateTime @default(now())

  @@index([contentId])
}
```
E sul model `Content` aggiungi la relazione inversa: `materials Material[]`.

- [ ] **Step 2: Crea la migrazione**

Run: `npx prisma migrate dev --name materiali`
Expected: nuova cartella in `prisma/migrations/`, client rigenerato, nessun errore.

- [ ] **Step 3: Scrivi i test (falliscono)**

```ts
// tests/materials.test.ts
import { describe, it, expect } from "vitest";
import { galleryMode, coverUrl, sortByOrder } from "@/lib/materials";

const img = (id: string, order: number) => ({ id, kind: "image" as const, url: `i/${id}`, order });
const vid = (id: string, order: number) => ({ id, kind: "video" as const, url: `v/${id}`, order });

describe("galleryMode", () => {
  it("empty when no materials", () => expect(galleryMode([])).toBe("empty"));
  it("single for one image", () => expect(galleryMode([img("a", 0)])).toBe("single"));
  it("carousel for >1 image", () => expect(galleryMode([img("a", 0), img("b", 1)])).toBe("carousel"));
  it("video when any video present", () => expect(galleryMode([vid("a", 0)])).toBe("video"));
  it("video wins over images", () => expect(galleryMode([img("a", 0), vid("b", 1)])).toBe("video"));
});

describe("coverUrl", () => {
  it("first image by order", () => expect(coverUrl([img("b", 1), img("a", 0)])).toBe("i/a"));
  it("null when only video", () => expect(coverUrl([vid("a", 0)])).toBe(null));
  it("null when empty", () => expect(coverUrl([])).toBe(null));
});

describe("sortByOrder", () => {
  it("orders ascending by order", () =>
    expect(sortByOrder([img("b", 2), img("a", 1)]).map((m) => m.id)).toEqual(["a", "b"]));
});
```

- [ ] **Step 4: Esegui i test → falliscono**

Run: `npx vitest run tests/materials.test.ts`
Expected: FAIL (modulo non trovato).

- [ ] **Step 5: Implementa `src/lib/materials.ts`**

```ts
export type MaterialKind = "image" | "video";
export type MaterialLike = { id: string; kind: MaterialKind; url: string; order: number };

export function sortByOrder<T extends { order: number }>(m: T[]): T[] {
  return [...m].sort((a, b) => a.order - b.order);
}

export function galleryMode(materials: MaterialLike[]): "empty" | "single" | "carousel" | "video" {
  if (materials.length === 0) return "empty";
  if (materials.some((m) => m.kind === "video")) return "video";
  return materials.length > 1 ? "carousel" : "single";
}

export function coverUrl(materials: MaterialLike[]): string | null {
  const images = sortByOrder(materials.filter((m) => m.kind === "image"));
  return images[0]?.url ?? null;
}
```

- [ ] **Step 6: Esegui i test → passano**

Run: `npx vitest run tests/materials.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/lib/materials.ts tests/materials.test.ts
git commit -m "feat(materiali): Material model + pure gallery/cover logic (tested)"
```

---

### Task 2: Data layer — azioni CRUD materiali + backfill

**Files:**
- Modify: `src/lib/content.ts` (helper DB)
- Modify: `src/app/(app)/contenuti/actions.ts` (server actions)
- Create: `scripts/backfill-materials.ts` (one-shot, idempotente)

**Interfaces:**
- Consumes: `coverUrl`, `MaterialKind` (Task 1)
- Produces (lib/content.ts):
  - `listMaterials(workspaceId, contentId): Promise<Material[]>`
  - `addMaterial(workspaceId, contentId, kind, url): Promise<Material | null>`
  - `removeMaterial(workspaceId, materialId): Promise<{ contentId: string } | null>`
  - `reorderMaterials(workspaceId, contentId, orderedIds): Promise<void>`
  - `recomputeCover(contentId): Promise<void>` (interno, chiamato dopo ogni mutazione)
- Produces (actions.ts): `addMaterialAction(fd)`, `removeMaterialAction(materialId, contentId)`, `reorderMaterialsAction(fd)`

- [ ] **Step 1: Helper in `src/lib/content.ts`**

Aggiungi (riusa `scopedWhere` e `db` già presenti nel file):

```ts
import { coverUrl } from "@/lib/materials";

export async function listMaterials(workspaceId: string, contentId: string) {
  const c = await db.content.findFirst({ where: scopedWhere(workspaceId, { id: contentId }), select: { id: true } });
  if (!c) return [];
  return db.material.findMany({ where: { contentId }, orderBy: { order: "asc" } });
}

async function recomputeCover(contentId: string) {
  const materials = await db.material.findMany({ where: { contentId }, orderBy: { order: "asc" } });
  const cover = coverUrl(materials.map((m) => ({ id: m.id, kind: m.kind as "image" | "video", url: m.url, order: m.order })));
  await db.content.update({ where: { id: contentId }, data: { thumbnailUrl: cover } });
}

export async function addMaterial(workspaceId: string, contentId: string, kind: "image" | "video", url: string) {
  const c = await db.content.findFirst({ where: scopedWhere(workspaceId, { id: contentId }), select: { id: true } });
  if (!c) return null;
  const max = await db.material.aggregate({ where: { contentId }, _max: { order: true } });
  const m = await db.material.create({ data: { contentId, kind, url, order: (max._max.order ?? -1) + 1 } });
  await recomputeCover(contentId);
  return m;
}

export async function removeMaterial(workspaceId: string, materialId: string) {
  const m = await db.material.findFirst({ where: { id: materialId, content: scopedWhere(workspaceId, {}) }, select: { id: true, contentId: true } });
  if (!m) return null;
  await db.material.delete({ where: { id: materialId } });
  await recomputeCover(m.contentId);
  return { contentId: m.contentId };
}

export async function reorderMaterials(workspaceId: string, contentId: string, orderedIds: string[]) {
  const c = await db.content.findFirst({ where: scopedWhere(workspaceId, { id: contentId }), select: { id: true } });
  if (!c) return;
  await db.$transaction(orderedIds.map((id, i) => db.material.update({ where: { id }, data: { order: i } })));
  await recomputeCover(contentId);
}
```

> Nota: `scopedWhere(workspaceId, {})` deve produrre un filtro `{ workspaceId }` usabile dentro la
> relazione `content`. Se la firma non lo consente, filtra con `content: { workspaceId }` esplicito.

- [ ] **Step 2: Server actions in `actions.ts`**

```ts
import { addMaterial, removeMaterial, reorderMaterials } from "@/lib/content";

export async function addMaterialAction(formData: FormData) {
  const ctx = await currentContext();
  if (!ctx) throw new Error("Non autorizzato");
  const contentId = String(formData.get("contentId") ?? "");
  const kind = String(formData.get("kind") ?? "") as "image" | "video";
  const url = String(formData.get("url") ?? "");
  if (!contentId || !url || (kind !== "image" && kind !== "video")) throw new Error("Dati materiale non validi");
  await addMaterial(ctx.workspaceId, contentId, kind, url);
  revalidatePath(`/contenuti/${contentId}`);
}

export async function removeMaterialAction(materialId: string, contentId: string) {
  const ctx = await currentContext();
  if (!ctx) throw new Error("Non autorizzato");
  await removeMaterial(ctx.workspaceId, materialId);
  revalidatePath(`/contenuti/${contentId}`);
}

export async function reorderMaterialsAction(formData: FormData) {
  const ctx = await currentContext();
  if (!ctx) throw new Error("Non autorizzato");
  const contentId = String(formData.get("contentId") ?? "");
  const ids = String(formData.get("orderedIds") ?? "").split(",").filter(Boolean);
  await reorderMaterials(ctx.workspaceId, contentId, ids);
  revalidatePath(`/contenuti/${contentId}`);
}
```
(Allinea `revalidatePath` al pattern già usato nel file — se usa `router.refresh()` lato client, mantieni quello.)

- [ ] **Step 3: Backfill idempotente `scripts/backfill-materials.ts`**

```ts
import { db } from "@/lib/db";

async function main() {
  const contents = await db.content.findMany({ select: { id: true, thumbnailUrl: true, videoProxyUrl: true } });
  for (const c of contents) {
    const existing = await db.material.findMany({ where: { contentId: c.id }, select: { url: true } });
    const have = new Set(existing.map((m) => m.url));
    if (c.thumbnailUrl && !have.has(c.thumbnailUrl)) {
      await db.material.create({ data: { contentId: c.id, kind: "image", url: c.thumbnailUrl, order: 0 } });
    }
    if (c.videoProxyUrl && !have.has(c.videoProxyUrl)) {
      await db.material.create({ data: { contentId: c.id, kind: "video", url: c.videoProxyUrl, order: 0 } });
    }
  }
  console.log(`backfill done for ${contents.length} contents`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 4: Esegui backfill**

Run: `npx tsx scripts/backfill-materials.ts` (o `node --import tsx`)
Expected: "backfill done for N contents", nessun errore.

- [ ] **Step 5: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint src/lib/content.ts "src/app/(app)/contenuti/actions.ts"`
Expected: nessun errore.

- [ ] **Step 6: Commit**

```bash
git add src/lib/content.ts "src/app/(app)/contenuti/actions.ts" scripts/backfill-materials.ts
git commit -m "feat(materiali): azioni CRUD materiali + recompute cover + backfill"
```

---

### Task 3: UI — tab "Materiali" unificata (galleria + review video)

**Files:**
- Create: `src/components/material-gallery.tsx`
- Modify: `src/components/video-review.tsx` (sorgente video dal Material; uploader generico)
- Modify: `src/components/content-modal.tsx` (TABS: rimuovi "Video" e "Materiali e commenti", aggiungi "Materiali"; passa i materiali)
- Modify: `src/app/(app)/@modal/(.)contenuti/[id]/page.tsx` e `src/app/(app)/contenuti/[id]/page.tsx` (carica `materials`)

**Interfaces:**
- Consumes: `galleryMode`, `sortByOrder`, `MaterialLike` (Task 1); `addMaterialAction`, `removeMaterialAction`, `reorderMaterialsAction` (Task 2); `uploadViaServer` (esistente)

- [ ] **Step 1: `MaterialGallery` (foto: single + carosello)**

Componente client: riceve `contentId` e `materials` (solo immagini). Mostra:
- uploader "Aggiungi foto" (`accept="image/*"`, multiplo) → per ogni file `uploadViaServer(file, \`materials/${contentId}\`, file.name)` poi `addMaterialAction`;
- modalità `single`: una foto grande; `carousel`: foto principale + striscia di miniature cliccabili, ognuna con bottone elimina (`removeMaterialAction`).
Usa `router.refresh()` dopo ogni mutazione (pattern del file `video-review.tsx`). Riordino: opzionale in questo step (può arrivare come miglioria); se incluso, invia `orderedIds` a `reorderMaterialsAction`.

- [ ] **Step 2: Adatta `video-review.tsx`**

`VideoReview` prende il video dal `Material` (prop `videoUrl: string | null`) invece di `videoProxyUrl`. Dopo l'upload del proxy chiama `addMaterialAction(kind:"video")` invece di `setVideoProxyAction`. Sostituzione video = rimuovi il vecchio Material video + aggiungi il nuovo. Il resto (timeline, commenti ancorati, note vocali) invariato.

- [ ] **Step 3: Unifica le tab in `content-modal.tsx`**

```ts
const TABS = ["Panoramica", "Materiali", "Performance"] as const;
```
Nel corpo: blocco `tab === "Materiali"` che, in base a `galleryMode(materials)`:
- `video` → `<VideoReview videoUrl={...} ... />` + sotto i link esterni (`masterLink`, `materialsUrl`);
- altrimenti → `<MaterialGallery .../>` + lista commenti piatta (riusa il markup commenti già esistente) + uploader.
Rimuovi i vecchi blocchi `tab === "Video"` e `tab === "Materiali e commenti"`.

- [ ] **Step 4: Carica i materiali nelle page**

In entrambe le page del contenuto, includi `materials` (via `listMaterials` o `include: { materials: ... }`) e passali a `ContentModal`/`page`.

- [ ] **Step 5: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint src/components/material-gallery.tsx src/components/video-review.tsx src/components/content-modal.tsx`
Expected: nessun errore.

- [ ] **Step 6: Verifica end-to-end (HTTP + manuale)**

Smoke test della route upload con sessione (come già fatto per il fix). Poi **browser-verify** dei 6 scenari della sezione "Verifica" dello spec.

- [ ] **Step 7: Commit**

```bash
git add src/components/material-gallery.tsx src/components/video-review.tsx src/components/content-modal.tsx "src/app/(app)"
git commit -m "feat(materiali): tab Materiali unificata (galleria foto + review video)"
```

---

## Self-Review

- **Spec coverage:** Material model (T1), display adattivo single/carosello/reel (T1 logica + T3 UI), commenti ancorati su video / piatti su foto (T3 riusa markup), copertina denormalizzata + ricalcolo (T2 `recomputeCover`), migrazione/backfill (T1 migration + T2 backfill), link esterni mantenuti (T3), merge delle 2 tab (T3). ✔
- **Vincolo body produzione:** documentato come follow-up nello spec; non in scope qui. ✔
- **Type consistency:** `MaterialLike`/`MaterialKind` usati coerentemente in T1→T2→T3; `galleryMode`/`coverUrl`/`sortByOrder` stesse firme ovunque. ✔
- **Placeholder:** il riordino in T3 è marcato come opzionale (non un placeholder di codice mancante); tutto il resto ha codice concreto. ✔
