"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { X, Plus, PencilSimple, Trash } from "@phosphor-icons/react";
import {
  upsertValueConversationAction,
  deleteValueConversationAction,
  upsertMeasurementAction,
  deleteMeasurementAction,
  upsertBenchmarkAction,
  deleteBenchmarkAction,
  upsertAudienceSegmentAction,
  deleteAudienceSegmentAction,
} from "@/app/(app)/kpi/actions";

export type EditorKind =
  | "valueConversations"
  | "measurements"
  | "benchmarks"
  | "audience"
  | null;

type VC = {
  id: string;
  date: string;
  who: string;
  what: string;
  channel: string | null;
  link: string | null;
};
type Measurement = {
  id: string;
  date: string;
  metric: string;
  value: number;
  series: string;
  channel: string | null;
};
type Benchmark = {
  id: string;
  metric: string;
  value: number;
  rangeLabel: string | null;
  source: string | null;
  channel: string | null;
};
type Segment = {
  id: string;
  date: string;
  dimension: string;
  label: string;
  value: number;
  channel: string | null;
};

const field =
  "mt-1 w-full rounded-[12px] border border-border bg-secondary/70 px-3.5 py-2.5 text-sm outline-none focus:border-ink/30 focus:bg-paper";
const label = "text-xs font-medium text-ink";

function dateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

function Shell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[60] flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
        <motion.div
          className="relative z-10 flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-border bg-paper shadow-[0_24px_60px_rgba(26,24,19,0.22)]"
          initial={{ opacity: 0, scale: 0.97, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 10 }}
          transition={{ type: "spring", stiffness: 320, damping: 30 }}
        >
          <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
            <h2 className="font-heading text-2xl text-ink">{title}</h2>
            <button
              onClick={onClose}
              aria-label="Chiudi"
              className="rounded-full border border-border bg-paper p-2 text-ink/55 transition-colors hover:bg-secondary hover:text-ink"
            >
              <X size={16} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-6">{children}</div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function RowActions({
  onEdit,
  deleteAction,
  id,
}: {
  onEdit: () => void;
  deleteAction: (fd: FormData) => Promise<void>;
  id: string;
}) {
  const router = useRouter();
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        onClick={onEdit}
        aria-label="Modifica"
        className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-ink"
      >
        <PencilSimple size={15} />
      </button>
      <form
        action={async (fd) => {
          await deleteAction(fd);
          toast.success("Eliminato");
          router.refresh();
        }}
      >
        <input type="hidden" name="id" value={id} />
        <button
          aria-label="Elimina"
          className="rounded-full p-1.5 text-muted-foreground hover:bg-coral/40 hover:text-coral-ink"
        >
          <Trash size={15} />
        </button>
      </form>
    </div>
  );
}

function ChannelSelect({ defaultValue }: { defaultValue?: string | null }) {
  return (
    <select name="channel" defaultValue={defaultValue ?? ""} className={field}>
      <option value="">Tutti / cross-canale</option>
      <option value="INSTAGRAM">Instagram</option>
      <option value="YOUTUBE">YouTube</option>
      <option value="TIKTOK">TikTok</option>
    </select>
  );
}

// --- Value conversations ---

function ValueConversationsEditor({ items, onClose }: { items: VC[]; onClose: () => void }) {
  const router = useRouter();
  const [edit, setEdit] = useState<VC | null>(null);
  const [adding, setAdding] = useState(items.length === 0);
  const current = edit ?? (adding ? null : undefined);

  return (
    <Shell title="Conversazioni di valore" onClose={onClose}>
      <div className="space-y-2">
        {items.map((c) => (
          <div
            key={c.id}
            className="flex items-start justify-between gap-3 rounded-2xl border border-border bg-card p-3"
          >
            <div className="min-w-0">
              <div className="text-sm font-medium text-ink">{c.who}</div>
              <div className="text-sm text-muted-foreground">{c.what}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {new Date(c.date).toLocaleDateString("it-IT")}
                {c.channel ? ` · ${c.channel}` : ""}
                {c.link ? " · 🔗" : ""}
              </div>
            </div>
            <RowActions
              id={c.id}
              onEdit={() => {
                setEdit(c);
                setAdding(false);
              }}
              deleteAction={deleteValueConversationAction}
            />
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground">Nessuna conversazione ancora.</p>
        )}
      </div>

      {current !== undefined ? (
        <form
          key={edit?.id ?? "new"}
          action={async (fd) => {
            await upsertValueConversationAction(fd);
            toast.success(edit ? "Conversazione aggiornata" : "Conversazione aggiunta");
            setEdit(null);
            setAdding(false);
            router.refresh();
          }}
          className="mt-5 space-y-3 rounded-2xl border border-border bg-secondary/30 p-4"
        >
          <input type="hidden" name="id" value={edit?.id ?? ""} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Chi</label>
              <input name="who" required defaultValue={edit?.who ?? ""} className={field} />
            </div>
            <div>
              <label className={label}>Data</label>
              <input type="date" name="date" defaultValue={dateInput(edit?.date ?? null)} className={field} />
            </div>
          </div>
          <div>
            <label className={label}>Cosa</label>
            <input name="what" required defaultValue={edit?.what ?? ""} className={field} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Canale</label>
              <input name="channel" placeholder="Instagram / DM…" defaultValue={edit?.channel ?? ""} className={field} />
            </div>
            <div>
              <label className={label}>Link</label>
              <input name="link" placeholder="https://…" defaultValue={edit?.link ?? ""} className={field} />
            </div>
          </div>
          <div className="flex gap-2">
            <button className="rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground active:scale-[0.98]">
              {edit ? "Salva" : "Aggiungi"}
            </button>
            {edit && (
              <button type="button" onClick={() => setEdit(null)} className="rounded-full border border-border px-4 py-2.5 text-sm text-muted-foreground hover:bg-secondary">
                Annulla
              </button>
            )}
          </div>
        </form>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-paper px-3.5 py-2 text-sm text-ink hover:bg-secondary"
        >
          <Plus size={15} weight="bold" /> Aggiungi conversazione
        </button>
      )}
    </Shell>
  );
}

// --- Measurements ---

function MeasurementsEditor({ items, onClose }: { items: Measurement[]; onClose: () => void }) {
  const router = useRouter();
  const [edit, setEdit] = useState<Measurement | null>(null);
  const [adding, setAdding] = useState(items.length === 0);
  const current = edit ?? (adding ? null : undefined);

  return (
    <Shell title="Misurazioni settimanali" onClose={onClose}>
      <div className="space-y-2">
        {items.map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3">
            <div className="min-w-0 text-sm">
              <span className="font-medium text-ink">{m.metric}</span>{" "}
              <span className="text-muted-foreground">
                = {m.value} · {m.series} · {new Date(m.date).toLocaleDateString("it-IT")}
                {m.channel ? ` · ${m.channel}` : ""}
              </span>
            </div>
            <RowActions id={m.id} onEdit={() => { setEdit(m); setAdding(false); }} deleteAction={deleteMeasurementAction} />
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-muted-foreground">Nessuna misurazione ancora.</p>}
      </div>

      {current !== undefined ? (
        <form
          key={edit?.id ?? "new"}
          action={async (fd) => {
            await upsertMeasurementAction(fd);
            toast.success(edit ? "Misurazione aggiornata" : "Misurazione aggiunta");
            setEdit(null); setAdding(false); router.refresh();
          }}
          className="mt-5 space-y-3 rounded-2xl border border-border bg-secondary/30 p-4"
        >
          <input type="hidden" name="id" value={edit?.id ?? ""} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Metrica</label>
              <input name="metric" required placeholder="followers / engagement_rate…" defaultValue={edit?.metric ?? ""} className={field} />
            </div>
            <div>
              <label className={label}>Valore</label>
              <input name="value" type="number" step="any" required defaultValue={edit?.value ?? ""} className={field} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={label}>Serie</label>
              <select name="series" defaultValue={edit?.series ?? "Luca"} className={field}>
                <option value="Luca">Luca</option>
                <option value="Benchmark">Benchmark</option>
              </select>
            </div>
            <div>
              <label className={label}>Data</label>
              <input type="date" name="date" defaultValue={dateInput(edit?.date ?? null)} className={field} />
            </div>
            <div>
              <label className={label}>Canale</label>
              <ChannelSelect defaultValue={edit?.channel} />
            </div>
          </div>
          <div className="flex gap-2">
            <button className="rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground active:scale-[0.98]">
              {edit ? "Salva" : "Aggiungi"}
            </button>
            {edit && <button type="button" onClick={() => setEdit(null)} className="rounded-full border border-border px-4 py-2.5 text-sm text-muted-foreground hover:bg-secondary">Annulla</button>}
          </div>
        </form>
      ) : (
        <button onClick={() => setAdding(true)} className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-paper px-3.5 py-2 text-sm text-ink hover:bg-secondary">
          <Plus size={15} weight="bold" /> Aggiungi misurazione
        </button>
      )}
    </Shell>
  );
}

// --- Benchmarks ---

function BenchmarksEditor({ items, onClose }: { items: Benchmark[]; onClose: () => void }) {
  const router = useRouter();
  const [edit, setEdit] = useState<Benchmark | null>(null);
  const [adding, setAdding] = useState(items.length === 0);
  const current = edit ?? (adding ? null : undefined);

  return (
    <Shell title="Benchmark di mercato" onClose={onClose}>
      <div className="space-y-2">
        {items.map((b) => (
          <div key={b.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3">
            <div className="min-w-0 text-sm">
              <span className="font-medium text-ink">{b.metric}</span>{" "}
              <span className="text-muted-foreground">
                = {b.value}
                {b.rangeLabel ? ` (${b.rangeLabel})` : ""}
                {b.source ? ` · ${b.source}` : ""}
                {b.channel ? ` · ${b.channel}` : ""}
              </span>
            </div>
            <RowActions id={b.id} onEdit={() => { setEdit(b); setAdding(false); }} deleteAction={deleteBenchmarkAction} />
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-muted-foreground">Nessun benchmark ancora.</p>}
      </div>

      {current !== undefined ? (
        <form
          key={edit?.id ?? "new"}
          action={async (fd) => {
            await upsertBenchmarkAction(fd);
            toast.success(edit ? "Benchmark aggiornato" : "Benchmark aggiunto");
            setEdit(null); setAdding(false); router.refresh();
          }}
          className="mt-5 space-y-3 rounded-2xl border border-border bg-secondary/30 p-4"
        >
          <input type="hidden" name="id" value={edit?.id ?? ""} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Metrica</label>
              <input name="metric" required defaultValue={edit?.metric ?? ""} className={field} />
            </div>
            <div>
              <label className={label}>Valore</label>
              <input name="value" type="number" step="any" required defaultValue={edit?.value ?? ""} className={field} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={label}>Range</label>
              <input name="rangeLabel" placeholder="3-5%" defaultValue={edit?.rangeLabel ?? ""} className={field} />
            </div>
            <div>
              <label className={label}>Fonte</label>
              <input name="source" defaultValue={edit?.source ?? ""} className={field} />
            </div>
            <div>
              <label className={label}>Canale</label>
              <ChannelSelect defaultValue={edit?.channel} />
            </div>
          </div>
          <div className="flex gap-2">
            <button className="rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground active:scale-[0.98]">
              {edit ? "Salva" : "Aggiungi"}
            </button>
            {edit && <button type="button" onClick={() => setEdit(null)} className="rounded-full border border-border px-4 py-2.5 text-sm text-muted-foreground hover:bg-secondary">Annulla</button>}
          </div>
        </form>
      ) : (
        <button onClick={() => setAdding(true)} className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-paper px-3.5 py-2 text-sm text-ink hover:bg-secondary">
          <Plus size={15} weight="bold" /> Aggiungi benchmark
        </button>
      )}
    </Shell>
  );
}

// --- Audience segments ---

const DIMENSIONS = [
  { value: "age", label: "Età" },
  { value: "gender", label: "Genere" },
  { value: "geo", label: "Geografia" },
  { value: "followerType", label: "Follower vs non" },
  { value: "activity", label: "Attività (orari/giorni)" },
  { value: "returning", label: "New vs returning" },
];

function AudienceEditor({ items, onClose }: { items: Segment[]; onClose: () => void }) {
  const router = useRouter();
  const [edit, setEdit] = useState<Segment | null>(null);
  const [adding, setAdding] = useState(items.length === 0);
  const current = edit ?? (adding ? null : undefined);

  return (
    <Shell title="Segmenti audience" onClose={onClose}>
      <div className="space-y-2">
        {items.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3">
            <div className="min-w-0 text-sm">
              <span className="font-medium text-ink">{s.dimension}</span>{" "}
              <span className="text-muted-foreground">
                · {s.label} = {s.value}
                {s.channel ? ` · ${s.channel}` : ""}
              </span>
            </div>
            <RowActions id={s.id} onEdit={() => { setEdit(s); setAdding(false); }} deleteAction={deleteAudienceSegmentAction} />
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-muted-foreground">Nessun segmento ancora.</p>}
      </div>

      {current !== undefined ? (
        <form
          key={edit?.id ?? "new"}
          action={async (fd) => {
            await upsertAudienceSegmentAction(fd);
            toast.success(edit ? "Segmento aggiornato" : "Segmento aggiunto");
            setEdit(null); setAdding(false); router.refresh();
          }}
          className="mt-5 space-y-3 rounded-2xl border border-border bg-secondary/30 p-4"
        >
          <input type="hidden" name="id" value={edit?.id ?? ""} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Dimensione</label>
              <select name="dimension" defaultValue={edit?.dimension ?? "age"} className={field}>
                {DIMENSIONS.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>Etichetta</label>
              <input name="label" required placeholder="25-34 / F / Italia / lun 18-21" defaultValue={edit?.label ?? ""} className={field} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={label}>Valore (%)</label>
              <input name="value" type="number" step="any" required defaultValue={edit?.value ?? ""} className={field} />
            </div>
            <div>
              <label className={label}>Data</label>
              <input type="date" name="date" defaultValue={dateInput(edit?.date ?? null)} className={field} />
            </div>
            <div>
              <label className={label}>Canale</label>
              <ChannelSelect defaultValue={edit?.channel} />
            </div>
          </div>
          <div className="flex gap-2">
            <button className="rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground active:scale-[0.98]">
              {edit ? "Salva" : "Aggiungi"}
            </button>
            {edit && <button type="button" onClick={() => setEdit(null)} className="rounded-full border border-border px-4 py-2.5 text-sm text-muted-foreground hover:bg-secondary">Annulla</button>}
          </div>
        </form>
      ) : (
        <button onClick={() => setAdding(true)} className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-paper px-3.5 py-2 text-sm text-ink hover:bg-secondary">
          <Plus size={15} weight="bold" /> Aggiungi segmento
        </button>
      )}
    </Shell>
  );
}

export function KpiEditors({
  kind,
  onClose,
  valueConversations,
  measurements,
  benchmarks,
  audienceSegments,
}: {
  kind: EditorKind;
  onClose: () => void;
  valueConversations: VC[];
  measurements: Measurement[];
  benchmarks: Benchmark[];
  audienceSegments: Segment[];
}) {
  if (kind === "valueConversations")
    return <ValueConversationsEditor items={valueConversations} onClose={onClose} />;
  if (kind === "measurements")
    return <MeasurementsEditor items={measurements} onClose={onClose} />;
  if (kind === "benchmarks")
    return <BenchmarksEditor items={benchmarks} onClose={onClose} />;
  if (kind === "audience")
    return <AudienceEditor items={audienceSegments} onClose={onClose} />;
  return null;
}
