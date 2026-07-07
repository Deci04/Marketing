"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { MagnifyingGlass, X } from "@phosphor-icons/react";

/** Text search + "also search the archive" toggle for /contenuti.
 *  Mirrors ContentFilters: state lives in the URL (?q, ?archivio) so the
 *  server component can filter. Filtering itself is client-side over the
 *  already-loaded list (spec S: fine up to a few hundred contents). */
export function ContentSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const urlQ = searchParams.get("q") ?? "";
  const includeArchived = searchParams.get("archivio") === "1";
  const [value, setValue] = useState(urlQ);

  // Keep the input in sync if the URL changes from elsewhere (e.g. clear).
  useEffect(() => {
    setValue(urlQ);
  }, [urlQ]);

  const push = useCallback(
    (next: URLSearchParams) => {
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname]
  );

  // Debounce query writes so every keystroke doesn't re-render the server tree.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChange = useCallback(
    (raw: string) => {
      setValue(raw);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const params = new URLSearchParams(searchParams.toString());
        const q = raw.trim();
        if (q) params.set("q", q);
        else params.delete("q");
        push(params);
      }, 250);
    },
    [searchParams, push]
  );

  const clear = useCallback(() => {
    setValue("");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("q");
    push(params);
  }, [searchParams, push]);

  const toggleArchive = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (includeArchived) params.delete("archivio");
    else params.set("archivio", "1");
    push(params);
  }, [searchParams, push, includeArchived]);

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="relative">
        <MagnifyingGlass
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Cerca per titolo, hook o note…"
          aria-label="Cerca contenuti"
          className="w-full rounded-full border border-border bg-paper py-2.5 pl-9 pr-9 text-sm outline-none transition-colors focus:border-ink/40"
        />
        {value && (
          <button
            type="button"
            onClick={clear}
            aria-label="Azzera ricerca"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-ink"
          >
            <X size={14} weight="bold" />
          </button>
        )}
      </div>
      <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={includeArchived}
          onChange={toggleArchive}
          className="h-3.5 w-3.5 accent-ink"
        />
        Cerca anche nell&apos;archivio
      </label>
    </div>
  );
}
