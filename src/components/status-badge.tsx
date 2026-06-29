"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setContentStatusAction } from "@/app/(app)/contenuti/actions";
import { STATUS_VALUES, type DerivedStatus } from "@/lib/status";

const TONE: Record<DerivedStatus, string> = {
  "Da consegnare": "bg-secondary text-muted-foreground",
  Consegnato: "bg-butter text-butter-ink",
  Revisionato: "bg-lavender text-lavender-ink",
  Pubblicato: "bg-sage text-sage-ink",
};

/** Status pill that opens a small menu to force the status manually (or back to
 *  auto). Designed to sit above a full-card link overlay, so it stops click
 *  propagation/navigation. */
export function StatusBadge({
  contentId,
  status,
  isOverride = false,
  className = "",
}: {
  contentId: string;
  status: DerivedStatus;
  isOverride?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const set = async (value: string) => {
    setOpen(false);
    const fd = new FormData();
    fd.set("contentId", contentId);
    fd.set("status", value); // "" → back to auto
    await setContentStatusAction(fd);
    toast.success(value ? `Stato: ${value}` : "Stato automatico");
    router.refresh();
  };

  const stop = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <span className={`relative ${className}`}>
      <button
        type="button"
        onClick={(e) => {
          stop(e);
          setOpen((o) => !o);
        }}
        title={isOverride ? "Stato forzato a mano — clicca per cambiare" : "Clicca per impostare lo stato"}
        className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${TONE[status]} ${
          isOverride ? "ring-1 ring-ink/25" : ""
        }`}
      >
        {status}
      </button>
      {open && (
        <div
          onClick={stop}
          className="absolute right-0 z-40 mt-1 w-44 rounded-xl border border-border bg-paper p-1 text-left shadow-[0_12px_30px_rgba(26,24,19,0.18)]"
        >
          {STATUS_VALUES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={(e) => {
                stop(e);
                set(s);
              }}
              className={`block w-full rounded-lg px-2.5 py-1.5 text-left text-xs ${
                s === status && isOverride ? "bg-secondary font-medium" : "hover:bg-secondary"
              }`}
            >
              {s}
            </button>
          ))}
          <button
            type="button"
            onClick={(e) => {
              stop(e);
              set("");
            }}
            className="mt-0.5 block w-full border-t border-border px-2.5 py-1.5 text-left text-xs text-muted-foreground hover:bg-secondary"
          >
            Automatico {!isOverride && "✓"}
          </button>
        </div>
      )}
    </span>
  );
}
