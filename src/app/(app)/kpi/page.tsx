import { Suspense } from "react";
import { currentContext } from "@/lib/current";
import { db } from "@/lib/db";
import { getKpiData, resolveFilter } from "@/lib/kpi";
import { normalizeLayout } from "@/lib/dashboard-config";
import { KpiFilters } from "@/components/kpi/kpi-filters";
import { DashboardGrid } from "@/components/dashboard-grid";

export default async function KpiPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const ctx = await currentContext();
  if (!ctx) return null;

  const filter = resolveFilter(sp);
  const [data, layoutRow] = await Promise.all([
    getKpiData(ctx.workspaceId, filter),
    db.dashboardLayout.findUnique({
      where: {
        userId_workspaceId: {
          userId: ctx.user.id,
          workspaceId: ctx.workspaceId,
        },
      },
      select: { layout: true },
    }),
  ]);

  const layout = normalizeLayout(layoutRow?.layout);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl">KPI</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Il numero è la porta; conta il confronto e l&apos;andamento.
          </p>
        </div>
        <Suspense fallback={<div className="h-9" />}>
          <KpiFilters />
        </Suspense>
      </header>

      <DashboardGrid data={data} initialLayout={layout} />
    </div>
  );
}
