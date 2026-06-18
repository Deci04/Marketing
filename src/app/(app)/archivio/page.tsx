import { Archive } from "@phosphor-icons/react/dist/ssr";

export default function ArchivioPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-3xl">Archivio</h1>
      <div className="mt-6 rounded-3xl border border-dashed border-border bg-card/50 p-12 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
          <Archive size={22} />
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          La raccolta dei contenuti con le performance arriva nel prossimo
          modulo.
        </p>
      </div>
    </div>
  );
}
