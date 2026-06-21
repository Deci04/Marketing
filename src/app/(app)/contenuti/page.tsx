import { currentContext } from "@/lib/current";
import { listContents, listBlocks } from "@/lib/content";
import { deriveStatus } from "@/lib/status";
import { ContentCard } from "@/components/content-card";
import { TextField, SelectField } from "@/components/field";
import { ToastForm } from "@/components/toast-form";
import { createContentAction, createBlockAction } from "./actions";
import {
  Stack,
  PaperPlaneTilt,
  Files,
  Plus,
} from "@phosphor-icons/react/dist/ssr";

const cardClass =
  "rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(26,24,19,0.04)]";
const btnClass =
  "inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-transform active:scale-[0.98]";
const summaryClass =
  "inline-flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-transform active:scale-[0.98] [&::-webkit-details-marker]:hidden";

function Stat({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: string;
  icon: React.ReactNode;
}) {
  return (
    <div className={`flex items-center justify-between rounded-2xl px-4 py-3.5 ${tone}`}>
      <div>
        <div className="text-xs opacity-80">{label}</div>
        <div className="mt-0.5 text-2xl font-medium leading-none">{value}</div>
      </div>
      <span className="opacity-70">{icon}</span>
    </div>
  );
}

export default async function ContenutiPage() {
  const ctx = await currentContext();
  if (!ctx) return null;
  const [contents, blocks] = await Promise.all([
    listContents(ctx.workspaceId),
    listBlocks(ctx.workspaceId),
  ]);
  const published = contents.filter(
    (c) =>
      deriveStatus({
        publishAt: c.publishAt,
        lucaDeliveryAt: c.block?.lucaDeliveryAt ?? null,
        matteoDeliveryAt: c.block?.matteoDeliveryAt ?? null,
      }) === "Pubblicato"
  ).length;
  const pipeline = contents.length - published;
  const n = contents.length;
  const subtitle = `${n} ${n === 1 ? "contenuto" : "contenuti"} · ${pipeline} in lavorazione`;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Contenuti</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </header>

      <details className="group">
        <summary className={summaryClass}>
          <Plus size={16} weight="bold" />
          Nuovo
        </summary>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <ToastForm
            action={createContentAction}
            success="Contenuto creato"
            resetOnSuccess
            className={`space-y-3 ${cardClass}`}
          >
            <h2 className="text-lg">Nuovo contenuto</h2>
            <TextField name="title" required placeholder="Titolo / concept" />
            <SelectField name="channel" defaultValue="INSTAGRAM">
              <option value="INSTAGRAM">Instagram</option>
              <option value="YOUTUBE">YouTube</option>
            </SelectField>
            <TextField name="publishAt" type="date" aria-label="Data pubblicazione" />
            <SelectField name="blockId" defaultValue="">
              <option value="">Nessun blocco (contenuto-evento)</option>
              {blocks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </SelectField>
            <TextField name="hook" placeholder="Hook / angolo (opz.)" />
            <button className={btnClass}>
              <Plus size={16} weight="bold" />
              Crea contenuto
            </button>
          </ToastForm>

          <ToastForm
            action={createBlockAction}
            success="Blocco creato"
            resetOnSuccess
            className={`space-y-3 ${cardClass}`}
          >
            <h2 className="text-lg">Nuovo blocco</h2>
            <TextField name="label" required placeholder='Etichetta (es. "Settimana 34")' />
            <label className="block text-xs text-muted-foreground">
              Consegna Luca
              <TextField name="lucaDeliveryAt" type="date" className="mt-1" />
            </label>
            <label className="block text-xs text-muted-foreground">
              Consegna Matteo
              <TextField name="matteoDeliveryAt" type="date" className="mt-1" />
            </label>
            <button className={btnClass}>
              <Plus size={16} weight="bold" />
              Crea blocco
            </button>
          </ToastForm>
        </div>
      </details>

      <div className="grid grid-cols-3 gap-3">
        <Stat
          label="In pipeline"
          value={pipeline}
          tone="bg-lavender text-lavender-ink"
          icon={<Stack size={20} weight="fill" />}
        />
        <Stat
          label="Pubblicati"
          value={published}
          tone="bg-butter text-butter-ink"
          icon={<PaperPlaneTilt size={20} weight="fill" />}
        />
        <Stat
          label="Totale"
          value={n}
          tone="bg-blush text-blush-ink"
          icon={<Files size={20} weight="fill" />}
        />
      </div>

      <section className="space-y-3">
        <h2 className="text-lg">Tutti i contenuti</h2>
        {n === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center text-sm text-muted-foreground">
            Nessun contenuto ancora. Premi <span className="font-medium text-ink">Nuovo</span> per crearne uno.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {contents.map((c) => (
              <ContentCard key={c.id} content={c} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
