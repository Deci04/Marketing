"use server";

import { revalidatePath } from "next/cache";
import { currentContext, currentUser } from "@/lib/current";
import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/workspace";
import { updateContent } from "@/lib/content";
import {
  fetchAnalytics,
  ingestAnalytics,
  isConfigured,
  platformToChannel,
  fetchAccountInsights,
  fetchAccountProfile,
  mapDirectInsights,
  mapProfile,
  writeDirectMeasurements,
  type IngestSummary,
  type InsightWindow,
} from "@/lib/zernio";
import { PERIOD_PRESETS } from "@/lib/kpi";
import type { Channel, Prisma } from "@prisma/client";

function num(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function asChannel(v: FormDataEntryValue | null): Channel | null {
  const s = String(v ?? "").trim();
  return s === "INSTAGRAM" || s === "YOUTUBE" || s === "TIKTOK"
    ? (s as Channel)
    : null;
}

// --- Per-content performance (editable Performance tab) ---

export async function updatePerformanceAction(formData: FormData) {
  const ctx = await currentContext();
  if (!ctx) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await updateContent(ctx.workspaceId, id, {
    views: num(formData.get("views")),
    reach: num(formData.get("reach")),
    nonFollowerPct: num(formData.get("nonFollowerPct")),
    likes: num(formData.get("likes")),
    commentsCount: num(formData.get("commentsCount")),
    saves: num(formData.get("saves")),
    shares: num(formData.get("shares")),
    followsGenerated: num(formData.get("followsGenerated")),
  });
  revalidatePath("/contenuti");
  revalidatePath(`/contenuti/${id}`);
  revalidatePath("/kpi");
}

// --- ValueConversation CRUD ---

export async function upsertValueConversationAction(formData: FormData) {
  const ctx = await currentContext();
  if (!ctx) return;
  const id = String(formData.get("id") ?? "").trim();
  const who = String(formData.get("who") ?? "").trim();
  const what = String(formData.get("what") ?? "").trim();
  if (!who || !what) return;
  const dateRaw = String(formData.get("date") ?? "").trim();
  const data = {
    who,
    what,
    channel: String(formData.get("channel") ?? "").trim() || null,
    link: String(formData.get("link") ?? "").trim() || null,
    date: dateRaw ? new Date(dateRaw) : new Date(),
  };
  if (id) {
    const existing = await db.valueConversation.findFirst({
      where: scopedWhere(ctx.workspaceId, { id }),
      select: { id: true },
    });
    if (!existing) return;
    await db.valueConversation.update({ where: { id }, data });
  } else {
    await db.valueConversation.create({
      data: { ...data, workspaceId: ctx.workspaceId },
    });
  }
  revalidatePath("/kpi");
}

export async function deleteValueConversationAction(formData: FormData) {
  const ctx = await currentContext();
  if (!ctx) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const existing = await db.valueConversation.findFirst({
    where: scopedWhere(ctx.workspaceId, { id }),
    select: { id: true },
  });
  if (!existing) return;
  await db.valueConversation.delete({ where: { id } });
  revalidatePath("/kpi");
}

// --- Measurement CRUD ---

export async function upsertMeasurementAction(formData: FormData) {
  const ctx = await currentContext();
  if (!ctx) return;
  const id = String(formData.get("id") ?? "").trim();
  const metric = String(formData.get("metric") ?? "").trim();
  const value = num(formData.get("value"));
  if (!metric || value == null) return;
  const dateRaw = String(formData.get("date") ?? "").trim();
  const series = String(formData.get("series") ?? "Luca").trim() || "Luca";
  const data = {
    metric,
    value,
    series,
    channel: asChannel(formData.get("channel")),
    date: dateRaw ? new Date(dateRaw) : new Date(),
  };
  if (id) {
    const existing = await db.measurement.findFirst({
      where: scopedWhere(ctx.workspaceId, { id }),
      select: { id: true },
    });
    if (!existing) return;
    await db.measurement.update({ where: { id }, data });
  } else {
    await db.measurement.create({
      data: { ...data, workspaceId: ctx.workspaceId },
    });
  }
  revalidatePath("/kpi");
}

export async function deleteMeasurementAction(formData: FormData) {
  const ctx = await currentContext();
  if (!ctx) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const existing = await db.measurement.findFirst({
    where: scopedWhere(ctx.workspaceId, { id }),
    select: { id: true },
  });
  if (!existing) return;
  await db.measurement.delete({ where: { id } });
  revalidatePath("/kpi");
}

// --- Benchmark CRUD ---

export async function upsertBenchmarkAction(formData: FormData) {
  const ctx = await currentContext();
  if (!ctx) return;
  const id = String(formData.get("id") ?? "").trim();
  const metric = String(formData.get("metric") ?? "").trim();
  const value = num(formData.get("value"));
  if (!metric || value == null) return;
  const data = {
    metric,
    value,
    rangeLabel: String(formData.get("rangeLabel") ?? "").trim() || null,
    source: String(formData.get("source") ?? "").trim() || null,
    channel: asChannel(formData.get("channel")),
  };
  if (id) {
    const existing = await db.benchmark.findFirst({
      where: scopedWhere(ctx.workspaceId, { id }),
      select: { id: true },
    });
    if (!existing) return;
    await db.benchmark.update({ where: { id }, data });
  } else {
    await db.benchmark.create({
      data: { ...data, workspaceId: ctx.workspaceId },
    });
  }
  revalidatePath("/kpi");
}

export async function deleteBenchmarkAction(formData: FormData) {
  const ctx = await currentContext();
  if (!ctx) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const existing = await db.benchmark.findFirst({
    where: scopedWhere(ctx.workspaceId, { id }),
    select: { id: true },
  });
  if (!existing) return;
  await db.benchmark.delete({ where: { id } });
  revalidatePath("/kpi");
}

// --- AudienceSegment CRUD ---

export async function upsertAudienceSegmentAction(formData: FormData) {
  const ctx = await currentContext();
  if (!ctx) return;
  const id = String(formData.get("id") ?? "").trim();
  const dimension = String(formData.get("dimension") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  const value = num(formData.get("value"));
  if (!dimension || !label || value == null) return;
  const dateRaw = String(formData.get("date") ?? "").trim();
  const data = {
    dimension,
    label,
    value,
    channel: asChannel(formData.get("channel")),
    date: dateRaw ? new Date(dateRaw) : new Date(),
  };
  if (id) {
    const existing = await db.audienceSegment.findFirst({
      where: scopedWhere(ctx.workspaceId, { id }),
      select: { id: true },
    });
    if (!existing) return;
    await db.audienceSegment.update({ where: { id }, data });
  } else {
    await db.audienceSegment.create({
      data: { ...data, workspaceId: ctx.workspaceId },
    });
  }
  revalidatePath("/kpi");
}

export async function deleteAudienceSegmentAction(formData: FormData) {
  const ctx = await currentContext();
  if (!ctx) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const existing = await db.audienceSegment.findFirst({
    where: scopedWhere(ctx.workspaceId, { id }),
    select: { id: true },
  });
  if (!existing) return;
  await db.audienceSegment.delete({ where: { id } });
  revalidatePath("/kpi");
}

// --- Dashboard layout persistence (debounced from client) ---

export async function saveDashboardLayoutAction(layout: unknown) {
  const ctx = await currentContext();
  if (!ctx) return;
  await db.dashboardLayout.upsert({
    where: {
      userId_workspaceId: {
        userId: ctx.user.id,
        workspaceId: ctx.workspaceId,
      },
    },
    update: { layout: layout as Prisma.InputJsonValue },
    create: {
      userId: ctx.user.id,
      workspaceId: ctx.workspaceId,
      layout: layout as Prisma.InputJsonValue,
    },
  });
}

export async function resetDashboardLayoutAction() {
  const ctx = await currentContext();
  if (!ctx) return;
  await db.dashboardLayout
    .delete({
      where: {
        userId_workspaceId: {
          userId: ctx.user.id,
          workspaceId: ctx.workspaceId,
        },
      },
    })
    .catch(() => {});
  revalidatePath("/kpi");
}

// --- Refresh KPI on-demand da Zernio (solo admin, niente cron) ---

export async function refreshKpiAction(): Promise<{
  ok: boolean;
  error?: string;
  summary?: IngestSummary;
}> {
  const user = await currentUser();
  if (!user?.isAdmin) return { ok: false, error: "Non autorizzato" };
  const ctx = await currentContext();
  if (!ctx) return { ok: false, error: "Nessun workspace" };
  if (!isConfigured()) return { ok: false, error: "Zernio non configurato" };

  const accounts = await db.socialAccount.findMany({
    where: scopedWhere(ctx.workspaceId),
  });
  if (accounts.length === 0)
    return { ok: false, error: "Nessun account social collegato" };

  let total: IngestSummary = {
    measurements: 0,
    segments: 0,
    postsMatched: 0,
    postsMissing: 0,
  };
  for (const acc of accounts) {
    try {
      const analytics = await fetchAnalytics({
        profileId: acc.zernioAccountId,
        platform: acc.platform,
      });
      const s = await ingestAnalytics(ctx.workspaceId, analytics, {
        channel: platformToChannel(acc.platform),
      });
      total = {
        measurements: total.measurements + s.measurements,
        segments: total.segments + s.segments,
        postsMatched: total.postsMatched + s.postsMatched,
        postsMissing: total.postsMissing + s.postsMissing,
      };

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
    } catch (e) {
      return { ok: false, error: `Zernio: ${(e as Error).message}` };
    }
  }
  revalidatePath("/kpi");
  return { ok: true, summary: total };
}
