import { Suspense } from "react";
import { currentContext } from "@/lib/current";
import { listContents, listBlocks } from "@/lib/content";
import { listClasses } from "@/lib/classes";
import { FORMAT_ORDER, FORMAT_LABELS } from "@/lib/format";
import { parseFormat } from "@/lib/format";
import { deriveStatus } from "@/lib/status";
import { ContentCard } from "@/components/content-card";
import { ContentFilters } from "@/components/content-filters";
import { ClassManager } from "@/components/class-manager";
import { ClassSelect } from "@/components/class-select";
import { TextField, SelectField } from "@/components/field";
import { ToastForm } from "@/components/toast-form";
import { createContentAction, createBlockAction } from "./actions";
import {
  Stack,
  PaperPlaneTilt,
  Files,
  Plus,
  Tag,
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

function toArray(v: string | string[] | undefined): string[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

export default async function ContenutiPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const ctx = await currentContext();
  if (!ctx) return null;

  const sp = await searchParams;
  const formats = toArray(sp.format)
    .map((f) => parseFormat(f))
    .filter((f): f is NonNullable<typeof f> => f != null);
  const classIds = toArray(sp.class);
  const hasFilters = formats.length > 0 || classIds.length > 0;

  const [contents, blocks, classes] = await Promise.all([
    listContents(ctx.workspaceId, { formats, classIds }),
    listBlocks(ctx.workspaceId),
    listClasses(ctx.workspaceId),
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

  // Group contents by publication month ("Senza data" first, then chronological).
  type Group = { key: string; label: string; sort: number; items: typeof contents };
  const groupMap = new Map<string, Group>();
  for (const c of contents) {
    const d = c.publishAt;
    const key = d ? `${d.getUTCFullYear()}-${d.getUTCMonth()}` : "none";
    const label = d
      ? d.toLocaleDateString("it-IT", { month: "long", year: "numeric", timeZone: "UTC" })
      : "Senza data";
    const sort = d ? d.getUTCFullYear() * 12 + d.getUTCMonth() : -1;
    if (!groupMap.has(key)) groupMap.set(key, { key, label, sort, items: [] });
    groupMap.get(key)!.items.push(c);
  }
  const groups = [...groupMap.values()].sort((a, b) => a.sort - b.sort);
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

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
            <TextField name="title" placeholder="Titolo / concept (opz. — numero automatico)" />
            <SelectField name="channel" defaultValue="INSTAGRAM">
              <option value="INSTAGRAM">Instagram</option>
              <option value="YOUTUBE">YouTube</option>
            </SelectField>
            <SelectField name="format" defaultValue="REEL" aria-label="Tipologia">
              <option value="">Nessuna tipologia</option>
              {FORMAT_ORDER.map((f) => (
                <option key={f} value={f}>
                  {FORMAT_LABELS[f]}
                </option>
              ))}
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
            <ClassSelect classes={classes} />
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

      <details className="group">
        <summary className={`${summaryClass} bg-secondary text-ink`}>
          <Tag size={16} weight="bold" />
          Classi
          {classes.length > 0 && (
            <span className="opacity-70">({classes.length})</span>
          )}
        </summary>
        <div className={`mt-4 ${cardClass}`}>
          <h2 className="mb-3 text-lg">Gestione classi</h2>
          <ClassManager classes={classes} />
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
        <Suspense fallback={null}>
          <ContentFilters
            formatOptions={FORMAT_ORDER.map((f) => ({
              value: f,
              label: FORMAT_LABELS[f],
            }))}
            classOptions={classes.map((c) => ({ value: c.id, label: c.name }))}
          />
        </Suspense>
        {n === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center text-sm text-muted-foreground">
            {hasFilters
              ? "Nessun contenuto corrisponde ai filtri selezionati."
              : "Nessun contenuto ancora. Premi Nuovo per crearne uno."}
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map((g) => (
              <div key={g.key} className="space-y-3">
                <div className="flex items-baseline gap-2">
                  <h3 className="text-sm font-medium text-ink">{cap(g.label)}</h3>
                  <span className="text-xs text-muted-foreground">
                    {g.items.length}
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {g.items.map((c) => (
                    <ContentCard key={c.id} content={c} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
