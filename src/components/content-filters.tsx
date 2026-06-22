"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { X } from "@phosphor-icons/react";

type Option = { value: string; label: string };

export function ContentFilters({
  formatOptions,
  classOptions,
}: {
  formatOptions: Option[];
  classOptions: Option[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selectedFormats = searchParams.getAll("format");
  const selectedClasses = searchParams.getAll("class");

  const toggle = useCallback(
    (key: "format" | "class", value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      const current = params.getAll(key);
      params.delete(key);
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      next.forEach((v) => params.append(key, v));
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  const clearAll = useCallback(() => {
    router.replace(pathname, { scroll: false });
  }, [router, pathname]);

  const hasActive = selectedFormats.length > 0 || selectedClasses.length > 0;

  const chip = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
      active
        ? "bg-ink text-paper"
        : "bg-secondary text-muted-foreground hover:bg-secondary/70 hover:text-ink"
    }`;

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-medium text-muted-foreground">Tipologia</span>
        {formatOptions.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => toggle("format", o.value)}
            className={chip(selectedFormats.includes(o.value))}
          >
            {o.label}
          </button>
        ))}
      </div>

      {classOptions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-medium text-muted-foreground">Classe</span>
          {classOptions.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => toggle("class", o.value)}
              className={chip(selectedClasses.includes(o.value))}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      {hasActive && (
        <button
          type="button"
          onClick={clearAll}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-ink"
        >
          <X size={12} weight="bold" /> Azzera filtri
        </button>
      )}
    </div>
  );
}
