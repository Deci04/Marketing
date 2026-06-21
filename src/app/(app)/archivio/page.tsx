import { currentContext } from "@/lib/current";
import { listContents, engagementRate } from "@/lib/content";
import { deriveStatus } from "@/lib/status";
import { ArchiveTable, type ArchiveRow } from "@/components/archive-table";

export default async function ArchivioPage() {
  const ctx = await currentContext();
  if (!ctx) return null;
  const contents = await listContents(ctx.workspaceId);

  const rows: ArchiveRow[] = contents.map((c) => {
    const er = engagementRate(c);
    return {
      id: c.id,
      title: c.title,
      channel: c.channel,
      status: deriveStatus({
        publishAt: c.publishAt,
        lucaDeliveryAt: c.block?.lucaDeliveryAt ?? null,
        matteoDeliveryAt: c.block?.matteoDeliveryAt ?? null,
      }),
      publishAt: c.publishAt ? c.publishAt.toISOString() : null,
      views: c.views ?? null,
      er: er != null ? Math.round(er * 1000) / 10 : null,
    };
  });

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header>
        <h1 className="text-3xl">Archivio</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {rows.length} contenuti · ordina cliccando le colonne
        </p>
      </header>
      <ArchiveTable rows={rows} />
    </div>
  );
}
