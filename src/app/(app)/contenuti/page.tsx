import { currentContext } from "@/lib/current";
import { listContents, listBlocks } from "@/lib/content";
import { ContentCard } from "@/components/content-card";
import { createContentAction, createBlockAction } from "./actions";

export default async function ContenutiPage() {
  const ctx = await currentContext();
  if (!ctx) return null;
  const [contents, blocks] = await Promise.all([
    listContents(ctx.workspaceId),
    listBlocks(ctx.workspaceId),
  ]);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Contenuti</h1>

      <div className="grid gap-6 md:grid-cols-2">
        <form
          action={createContentAction}
          className="space-y-3 rounded-xl border p-4"
        >
          <h2 className="font-medium">Nuovo contenuto</h2>
          <input
            name="title"
            required
            placeholder="Titolo / concept"
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <select
              name="channel"
              className="rounded-md border px-3 py-2 text-sm"
            >
              <option value="INSTAGRAM">Instagram</option>
              <option value="YOUTUBE">YouTube</option>
            </select>
            <input
              name="publishAt"
              type="date"
              className="rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <select
            name="blockId"
            className="w-full rounded-md border px-3 py-2 text-sm"
          >
            <option value="">— Nessun blocco (contenuto-evento) —</option>
            {blocks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
          <input
            name="hook"
            placeholder="Hook / angolo (opz.)"
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
          <button className="rounded-md bg-black px-3 py-2 text-sm font-medium text-white">
            Crea contenuto
          </button>
        </form>

        <form
          action={createBlockAction}
          className="space-y-3 rounded-xl border p-4"
        >
          <h2 className="font-medium">Nuovo blocco</h2>
          <input
            name="label"
            required
            placeholder='Etichetta (es. "Settimana 34")'
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
          <label className="block text-xs text-neutral-500">
            Consegna Luca
            <input
              name="lucaDeliveryAt"
              type="date"
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs text-neutral-500">
            Consegna Matteo
            <input
              name="matteoDeliveryAt"
              type="date"
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <button className="rounded-md bg-black px-3 py-2 text-sm font-medium text-white">
            Crea blocco
          </button>
        </form>
      </div>

      <div>
        <h2 className="mb-3 font-medium">Tutti i contenuti ({contents.length})</h2>
        {contents.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Nessun contenuto ancora. Creane uno qui sopra.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {contents.map((c) => (
              <ContentCard key={c.id} content={c} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
