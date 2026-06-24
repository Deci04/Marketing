/**
 * One-shot, idempotente: crea righe Material dai vecchi campi thumbnailUrl /
 * videoProxyUrl dei contenuti esistenti. Rieseguibile senza creare duplicati.
 *
 * Run: npx tsx scripts/backfill-materials.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const contents = await db.content.findMany({
    select: { id: true, thumbnailUrl: true, videoProxyUrl: true },
  });
  let created = 0;
  for (const c of contents) {
    const existing = await db.material.findMany({
      where: { contentId: c.id },
      select: { url: true },
    });
    const have = new Set(existing.map((m) => m.url));
    if (c.thumbnailUrl && !have.has(c.thumbnailUrl)) {
      await db.material.create({
        data: { contentId: c.id, kind: "image", url: c.thumbnailUrl, order: 0 },
      });
      created++;
    }
    if (c.videoProxyUrl && !have.has(c.videoProxyUrl)) {
      await db.material.create({
        data: { contentId: c.id, kind: "video", url: c.videoProxyUrl, order: 0 },
      });
      created++;
    }
  }
  console.log(`backfill done: ${contents.length} contents, ${created} materials created`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
