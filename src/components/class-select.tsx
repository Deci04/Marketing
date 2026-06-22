"use client";

import { useState } from "react";
import { classChip } from "@/lib/classes";

export type SelectableClass = { id: string; name: string; color: string | null };

/** Multi-select chip group. Renders one hidden input named `classIds` per
 *  selected class so it can be submitted inside any <form>. */
export function ClassSelect({
  classes,
  defaultSelected = [],
  label = "Classi",
}: {
  classes: SelectableClass[];
  defaultSelected?: string[];
  label?: string;
}) {
  const [selected, setSelected] = useState<string[]>(defaultSelected);

  if (classes.length === 0) return null;

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <div className="space-y-1.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      {/* Always emit the field name so the server can distinguish
          "no classes selected" from "field absent". */}
      <input type="hidden" name="classIds" value="" />
      {selected.map((id) => (
        <input key={id} type="hidden" name="classIds" value={id} />
      ))}
      <div className="flex flex-wrap gap-1.5">
        {classes.map((cl) => {
          const active = selected.includes(cl.id);
          return (
            <button
              key={cl.id}
              type="button"
              onClick={() => toggle(cl.id)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                active
                  ? classChip(cl.color)
                  : "bg-secondary text-muted-foreground hover:text-ink"
              } ${active ? "ring-1 ring-ink/20" : ""}`}
            >
              {cl.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
