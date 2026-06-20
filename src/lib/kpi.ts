import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/workspace";

export type SeriesPoint = {
  date: string;
  Luca: number | null;
  Benchmark: number | null;
};

export async function getMetricSeries(
  workspaceId: string,
  metric: string
): Promise<SeriesPoint[]> {
  const rows = await db.measurement.findMany({
    where: scopedWhere(workspaceId, { metric }),
    orderBy: { date: "asc" },
  });
  const byDate = new Map<string, SeriesPoint>();
  for (const r of rows) {
    const key = r.date.toISOString().slice(0, 10);
    const p = byDate.get(key) ?? { date: key, Luca: null, Benchmark: null };
    if (r.series === "Luca") p.Luca = r.value;
    else if (r.series === "Benchmark") p.Benchmark = r.value;
    byDate.set(key, p);
  }
  return [...byDate.values()];
}

export type MetricSummary = {
  latest: number | null;
  prev: number | null;
  benchmark: number | null;
};

export function summarize(series: SeriesPoint[]): MetricSummary {
  const luca = series.map((p) => p.Luca).filter((v): v is number => v != null);
  const latest = luca.length ? luca[luca.length - 1] : null;
  const prev = luca.length > 1 ? luca[luca.length - 2] : null;
  const benchmark =
    series.map((p) => p.Benchmark).filter((v): v is number => v != null).pop() ??
    null;
  return { latest, prev, benchmark };
}

export async function getKpiOverview(workspaceId: string) {
  const [erSeries, nfSeries, vc, contents] = await Promise.all([
    getMetricSeries(workspaceId, "engagement_rate"),
    getMetricSeries(workspaceId, "non_follower_pct"),
    db.valueConversation.findMany({
      where: scopedWhere(workspaceId),
      orderBy: { date: "desc" },
    }),
    db.content.findMany({ where: scopedWhere(workspaceId) }),
  ]);
  const published = contents.filter((c) => c.publishAt != null).length;
  return {
    erSeries,
    nfSeries,
    er: summarize(erSeries),
    nf: summarize(nfSeries),
    vc,
    publishedCount: published,
  };
}
