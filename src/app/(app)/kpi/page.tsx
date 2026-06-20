import { currentContext } from "@/lib/current";
import { getKpiOverview, type MetricSummary, type SeriesPoint } from "@/lib/kpi";
import { KpiChart } from "@/components/kpi-chart";
import { Sparkline } from "@/components/sparkline";
import { ChatCircleDots, Eye, Heart, PaperPlaneTilt } from "@phosphor-icons/react/dist/ssr";

function lucaValues(series: SeriesPoint[]) {
  return series.map((p) => p.Luca).filter((v): v is number => v != null);
}

function Metric({
  label,
  unit,
  s,
  series,
  spark,
  icon,
}: {
  label: string;
  unit: string;
  s: MetricSummary;
  series: SeriesPoint[];
  spark: string;
  icon: React.ReactNode;
}) {
  const delta =
    s.latest != null && s.prev != null
      ? Math.round((s.latest - s.prev) * 10) / 10
      : null;
  const vsBench =
    s.latest != null && s.benchmark != null
      ? Math.round((s.latest - s.benchmark) * 10) / 10
      : null;
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(26,24,19,0.04)]">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <div className="mt-1 flex items-end justify-between gap-2">
        <div className="text-2xl font-semibold text-ink">
          {s.latest != null ? `${s.latest}${unit}` : "—"}
        </div>
        <div style={{ color: spark }}>
          <Sparkline values={lucaValues(series)} color={spark} />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {delta != null && (
          <span className={delta >= 0 ? "text-sage-ink" : "text-coral-ink"}>
            {delta >= 0 ? "+" : ""}
            {delta}
            {unit} vs sett. prec.
          </span>
        )}
        {vsBench != null && (
          <span className="text-muted-foreground">
            {vsBench >= 0 ? "+" : ""}
            {vsBench}
            {unit} vs benchmark
          </span>
        )}
      </div>
    </div>
  );
}

const FUNNEL = [
  { label: "Reach", tone: "bg-blush text-blush-ink" },
  { label: "Risonanza", tone: "bg-butter text-butter-ink" },
  { label: "Interesse", tone: "bg-lavender text-lavender-ink" },
  { label: "North Star", tone: "bg-sage text-sage-ink" },
];

export default async function KpiPage() {
  const ctx = await currentContext();
  if (!ctx) return null;
  const k = await getKpiOverview(ctx.workspaceId);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-3xl">KPI</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Il numero è la porta; conta il confronto e l&apos;andamento.
        </p>
      </header>

      <div className="rounded-3xl bg-ink p-6 text-cream">
        <div className="flex items-center gap-2 text-sm text-cream/70">
          <ChatCircleDots size={18} weight="fill" />
          North Star · Conversazioni di valore
        </div>
        <div className="mt-2 flex items-end gap-3">
          <span className="font-heading text-5xl">{k.vc.length}</span>
          <span className="mb-1.5 text-sm text-cream/60">questo periodo</span>
        </div>
        <div className="mt-4 space-y-2 border-t border-cream/15 pt-4">
          {k.vc.slice(0, 3).map((c) => (
            <div key={c.id} className="flex items-baseline justify-between gap-3 text-sm">
              <span>
                <span className="font-medium">{c.who}</span>{" "}
                <span className="text-cream/60">— {c.what}</span>
              </span>
              <span className="shrink-0 text-xs text-cream/50">{c.channel}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric
          label="Engagement rate"
          unit="%"
          s={k.er}
          series={k.erSeries}
          spark="#3F3680"
          icon={<Heart size={18} weight="fill" />}
        />
        <Metric
          label="Reach non-follower"
          unit="%"
          s={k.nf}
          series={k.nfSeries}
          spark="#0F6E56"
          icon={<Eye size={18} weight="fill" />}
        />
        <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(26,24,19,0.04)]">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Contenuti pubblicati</span>
            <span className="text-muted-foreground">
              <PaperPlaneTilt size={18} weight="fill" />
            </span>
          </div>
          <div className="mt-1 text-2xl font-semibold text-ink">{k.publishedCount}</div>
          <div className="mt-2 text-xs text-muted-foreground">costanza di uscita</div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(26,24,19,0.04)]">
        <h2 className="mb-1 text-lg">Andamento vs benchmark</h2>
        <KpiChart er={k.erSeries} nf={k.nfSeries} />
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(26,24,19,0.04)]">
        <h2 className="mb-3 text-lg">L&apos;imbuto</h2>
        <div className="flex flex-wrap items-center gap-2">
          {FUNNEL.map((f, i) => (
            <div key={f.label} className="flex items-center gap-2">
              <span className={`rounded-full px-3 py-1.5 text-sm font-medium ${f.tone}`}>
                {f.label}
              </span>
              {i < FUNNEL.length - 1 && (
                <span className="text-muted-foreground">→</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
