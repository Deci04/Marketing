"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { ArrowsClockwise } from "@phosphor-icons/react";
import { refreshKpiAction } from "@/app/(app)/kpi/actions";

/** Bottone admin "Aggiorna dati": tira i dati da Zernio via `refreshKpiAction`.
 *  Il gate admin è ridondato nell'action (server-side). */
export function RefreshKpiButton({ isAdmin }: { isAdmin: boolean }) {
  const [pending, startTransition] = useTransition();
  if (!isAdmin) return null;

  return (
    <button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await refreshKpiAction();
          if (res.ok) {
            const s = res.summary;
            toast.success(
              s
                ? `Aggiornato: ${s.measurements} misure, ${s.segments} segmenti, ${s.postsMatched} post`
                : "Dati aggiornati"
            );
          } else {
            toast.error(res.error ?? "Errore nell'aggiornamento");
          }
        })
      }
      className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
    >
      <ArrowsClockwise
        size={16}
        weight="bold"
        className={pending ? "animate-spin" : undefined}
      />
      {pending ? "Aggiornamento…" : "Aggiorna dati"}
    </button>
  );
}
