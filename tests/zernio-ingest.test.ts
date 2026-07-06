import { describe, it, expect, afterAll } from "vitest";
import fixture from "./fixtures/zernio-analytics.json";
import { db } from "@/lib/db";
import { ingestAnalytics, type ZernioAnalytics } from "@/lib/zernio";
import { scopedWhere } from "@/lib/workspace";

describe("ingestAnalytics idempotente", () => {
  const ws = { id: `ws_test_zernio_${Date.now()}`, name: "z-test" };

  it("non duplica Measurement/AudienceSegment e aggancia il post via externalId", async () => {
    await db.workspace.create({ data: ws });
    await db.content.create({
      data: { workspaceId: ws.id, title: "post", externalId: "post_ext_1" },
    });
    const analytics = fixture as ZernioAnalytics;

    await ingestAnalytics(ws.id, analytics, { channel: "INSTAGRAM" });
    const second = await ingestAnalytics(ws.id, analytics, { channel: "INSTAGRAM" });

    const meas = await db.measurement.count({ where: scopedWhere(ws.id) });
    const segs = await db.audienceSegment.count({ where: scopedWhere(ws.id) });
    const c = await db.content.findFirst({
      where: scopedWhere(ws.id, { externalId: "post_ext_1" }),
    });
    const snaps = await db.metricSnapshot.count({ where: { content: { workspaceId: ws.id } } });

    expect(meas).toBe(analytics.account.length * 3);
    expect(segs).toBe(analytics.demographics.length);
    expect(c?.commentsCount).toBe(analytics.posts[0].comments);
    expect(snaps).toBe(2); // append storico ad ogni refresh
    expect(second.postsMatched).toBe(1);
    expect(second.postsMissing).toBe(0);
  }, 20000);

  afterAll(async () => {
    await db.workspace.delete({ where: { id: ws.id } }).catch(() => {});
  });
});
