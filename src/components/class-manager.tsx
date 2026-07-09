"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, PencilSimple, Trash, Check, X } from "@phosphor-icons/react";
import { CLASS_COLORS, classChip } from "@/lib/class-format";
import {
  createClassAction,
  renameClassAction,
  deleteClassAction,
} from "@/app/(app)/contenuti/actions";

export type ManagedClass = { id: string; name: string; color: string | null };

const COLOR_LABEL: Record<string, string> = {
  lavender: "Lavanda",
  butter: "Burro",
  blush: "Rosa",
  sage: "Salvia",
  coral: "Corallo",
};

function ColorPicker({ name, defaultValue }: { name: string; defaultValue?: string | null }) {
  const [selected, setSelected] = useState<string>(defaultValue ?? "");
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name={name} value={selected} />
      {CLASS_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={COLOR_LABEL[c]}
          title={COLOR_LABEL[c]}
          onClick={() => setSelected(selected === c ? "" : c)}
          className={`h-6 w-6 rounded-full border-2 transition ${classChip(c)} ${
            selected === c ? "border-ink" : "border-transparent"
          }`}
        />
      ))}
    </div>
  );
}

export function ClassManager({ classes }: { classes: ManagedClass[] }) {
  const router = useRouter();
  const createRef = useRef<HTMLFormElement>(null);
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <form
        ref={createRef}
        action={async (fd) => {
          const name = String(fd.get("name") ?? "").trim();
          if (!name) return;
          await createClassAction(fd);
          toast.success("Classe creata");
          createRef.current?.reset();
          router.refresh();
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <input
          name="name"
          required
          placeholder="Nome classe (es. Tutorial)"
          className="h-10 flex-1 min-w-40 rounded-[12px] border border-border bg-secondary/70 px-3.5 text-sm outline-none focus:border-ink/30 focus:bg-paper"
        />
        <ColorPicker name="color" />
        <button className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground">
          <Plus size={15} weight="bold" /> Crea
        </button>
      </form>

      {classes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nessuna classe ancora. Creane una per raggruppare i contenuti.
        </p>
      ) : (
        <ul className="space-y-2">
          {classes.map((cl) => (
            <li
              key={cl.id}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2"
            >
              {editing === cl.id ? (
                <form
                  action={async (fd) => {
                    await renameClassAction(fd);
                    toast.success("Classe aggiornata");
                    setEditing(null);
                    router.refresh();
                  }}
                  className="flex flex-1 flex-wrap items-center gap-2"
                >
                  <input type="hidden" name="id" value={cl.id} />
                  <input
                    name="name"
                    defaultValue={cl.name}
                    className="h-9 flex-1 min-w-36 rounded-[10px] border border-border bg-secondary/70 px-3 text-sm outline-none focus:border-ink/30 focus:bg-paper"
                  />
                  <ColorPicker name="color" defaultValue={cl.color} />
                  <button
                    aria-label="Salva"
                    className="rounded-full bg-primary p-2 text-primary-foreground"
                  >
                    <Check size={14} weight="bold" />
                  </button>
                  <button
                    type="button"
                    aria-label="Annulla"
                    onClick={() => setEditing(null)}
                    className="rounded-full border border-border p-2 text-muted-foreground hover:bg-secondary"
                  >
                    <X size={14} />
                  </button>
                </form>
              ) : (
                <>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${classChip(cl.color)}`}
                  >
                    {cl.name}
                  </span>
                  <span className="flex-1" />
                  <button
                    type="button"
                    aria-label="Rinomina"
                    onClick={() => setEditing(cl.id)}
                    className="rounded-full border border-border p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-ink"
                  >
                    <PencilSimple size={14} />
                  </button>
                  <form
                    action={async (fd) => {
                      await deleteClassAction(fd);
                      toast.success("Classe eliminata");
                      router.refresh();
                    }}
                  >
                    <input type="hidden" name="id" value={cl.id} />
                    <button
                      aria-label="Elimina"
                      className="rounded-full border border-coral/60 bg-coral/30 p-2 text-coral-ink transition-colors hover:bg-coral/50"
                    >
                      <Trash size={14} />
                    </button>
                  </form>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
