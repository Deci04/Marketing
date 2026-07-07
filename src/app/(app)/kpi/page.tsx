import { Suspense } from "react";
import Link from "next/link";
import { currentContext } from "@/lib/current";
import { db } from "@/lib/db";
import { getKpiData, resolveFilter } from "@/lib/kpi";
import { normalizeLayout } from "@/lib/dashboard-config";
import { KpiFilters } from "@/components/kpi/kpi-filters";
import { DashboardGrid } from "@/components/dashboard-grid";
import { RefreshKpiButton } from "@/components/kpi/refresh-kpi-button";

export default async function KpiPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const ctx = await currentContext();
  if (!ctx) return null;

  const filter = resolveFilter(sp);
  const [data, layoutRow, socialCount] = await Promise.all([
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
    db.socialAccount.count({ where: { workspaceId: ctx.workspaceId } }),
  ]);

  const layout = normalizeLayout(layoutRow?.layout);
  const isAdmin = ctx.user.isAdmin;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl">KPI</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Il numero è la porta; conta il confronto e l&apos;andamento.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshKpiButton isAdmin={isAdmin} />
          <Suspense fallback={<div className="h-9" />}>
            <KpiFilters />
          </Suspense>
        </div>
      </header>

      {socialCount === 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-border bg-secondary/30 px-4 py-3">
          <p className="text-sm text-muted-foreground">
            Nessun account social collegato: collegane uno per popolare i KPI con
            dati reali.
          </p>
          <Link
            href="/profilo"
            className="shrink-0 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Collega account
          </Link>
        </div>
      )}

      <DashboardGrid data={data} initialLayout={layout} />
    </div>
  );
}
