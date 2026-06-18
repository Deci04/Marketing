import { ChartLineUp } from "@phosphor-icons/react/dist/ssr";

export default function KpiPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-3xl">KPI</h1>
      <div className="mt-6 rounded-3xl border border-dashed border-border bg-card/50 p-12 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
          <ChartLineUp size={22} />
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          L&apos;imbuto KPI (reach, risonanza, conversazioni di valore) arriva
          dopo l&apos;archivio.
        </p>
      </div>
    </div>
  );
}
