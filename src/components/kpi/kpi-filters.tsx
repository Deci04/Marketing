"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";
import { CalendarBlank, FunnelSimple } from "@phosphor-icons/react";

const PERIODS = [
  { value: "7", label: "7 giorni" },
  { value: "30", label: "30 giorni" },
  { value: "90", label: "90 giorni" },
];

const CHANNELS = [
  { value: "ALL", label: "Tutti" },
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "YOUTUBE", label: "YouTube" },
  { value: "TIKTOK", label: "TikTok", disabled: true },
];

export function KpiFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const period = params.get("period") ?? "30";
  const channel = params.get("channel") ?? "ALL";

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      if (value === "" || (key === "channel" && value === "ALL")) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      router.push(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router]
  );

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/40 p-0.5 text-xs">
        <CalendarBlank size={14} className="ml-2 text-muted-foreground" />
        {PERIODS.map((p) => (
          <button
            key={p.value}
            onClick={() => setParam("period", p.value)}
            className={`rounded-full px-3 py-1.5 font-medium transition-colors ${
              period === p.value ? "bg-ink text-paper" : "text-muted-foreground hover:text-ink"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/40 p-0.5 text-xs">
        <FunnelSimple size={14} className="ml-2 text-muted-foreground" />
        {CHANNELS.map((c) => (
          <button
            key={c.value}
            disabled={c.disabled}
            onClick={() => setParam("channel", c.value)}
            title={c.disabled ? "Dati TikTok non ancora disponibili" : undefined}
            className={`rounded-full px-3 py-1.5 font-medium transition-colors ${
              channel === c.value ? "bg-ink text-paper" : "text-muted-foreground hover:text-ink"
            } ${c.disabled ? "cursor-not-allowed opacity-40 hover:text-muted-foreground" : ""}`}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}
