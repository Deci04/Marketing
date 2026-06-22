"use client";

import { useState } from "react";
import Link from "next/link";
import {
  InstagramLogo,
  YoutubeLogo,
  ArrowsDownUp,
} from "@phosphor-icons/react";
import type { ContentFormat } from "@prisma/client";
import { FORMAT_CHIP, FORMAT_LABELS } from "@/lib/format";
import { classChip } from "@/lib/classes";

export type ArchiveRow = {
  id: string;
  title: string;
  channel: "INSTAGRAM" | "YOUTUBE";
  format: ContentFormat | null;
  classes: { id: string; name: string; color: string | null }[];
  status: string;
  publishAt: string | null;
  views: number | null;
  er: number | null;
};

const COLS = [
  { key: "title", label: "Contenuto" },
  { key: "channel", label: "Canale" },
  { key: "format", label: "Tipologia" },
  { key: "classes", label: "Classi" },
  { key: "status", label: "Stato" },
  { key: "publishAt", label: "Pubblicazione" },
  { key: "views", label: "Views" },
  { key: "er", label: "ER" },
] as const;
type SortKey = (typeof COLS)[number]["key"];

const STATUS: Record<string, string> = {
  "Da consegnare": "bg-secondary text-muted-foreground",
  Consegnato: "bg-butter text-butter-ink",
  Revisionato: "bg-lavender text-lavender-ink",
  Pubblicato: "bg-sage text-sage-ink",
};

export function ArchiveTable({ rows }: { rows: ArchiveRow[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({
    key: "publishAt",
    dir: -1,
  });

  const sortValue = (r: ArchiveRow): string | number | null => {
    if (sort.key === "format") return r.format ? FORMAT_LABELS[r.format] : null;
    if (sort.key === "classes")
      return r.classes.length
        ? r.classes.map((c) => c.name).join(", ")
        : null;
    return r[sort.key];
  };

  const sorted = [...rows].sort((a, b) => {
    const va = sortValue(a);
    const vb = sortValue(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (va < vb) return -1 * sort.dir;
    if (va > vb) return 1 * sort.dir;
    return 0;
  });

  const toggle = (k: SortKey) =>
    setSort((s) => (s.key === k ? { key: k, dir: s.dir === 1 ? -1 : 1 } : { key: k, dir: 1 }));

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(26,24,19,0.04)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-secondary/50 text-left text-xs text-muted-foreground">
            {COLS.map((c) => (
              <th key={c.key} className="px-4 py-2.5 font-medium">
                <button
                  onClick={() => toggle(c.key)}
                  className={`inline-flex items-center gap-1 transition-colors hover:text-ink ${sort.key === c.key ? "text-ink" : ""}`}
                >
                  {c.label}
                  <ArrowsDownUp size={12} />
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id} className="border-t border-border transition-colors hover:bg-secondary/30">
              <td className="px-4 py-3">
                <Link href={`/contenuti/${r.id}`} className="font-medium text-ink hover:underline">
                  {r.title}
                </Link>
              </td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  {r.channel === "YOUTUBE" ? (
                    <YoutubeLogo size={13} weight="fill" />
                  ) : (
                    <InstagramLogo size={13} weight="fill" />
                  )}
                  {r.channel === "YOUTUBE" ? "YouTube" : "Instagram"}
                </span>
              </td>
              <td className="px-4 py-3">
                {r.format ? (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${FORMAT_CHIP[r.format]}`}
                  >
                    {FORMAT_LABELS[r.format]}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-4 py-3">
                {r.classes.length ? (
                  <div className="flex flex-wrap gap-1">
                    {r.classes.map((cl) => (
                      <span
                        key={cl.id}
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${classChip(cl.color)}`}
                      >
                        {cl.name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-4 py-3">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[r.status] ?? "bg-secondary text-muted-foreground"}`}>
                  {r.status}
                </span>
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {r.publishAt
                  ? new Date(r.publishAt).toLocaleDateString("it-IT", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })
                  : "—"}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {r.views != null ? r.views.toLocaleString("it-IT") : "—"}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {r.er != null ? `${r.er}%` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <div className="p-8 text-center text-sm text-muted-foreground">
          Nessun contenuto in archivio.
        </div>
      )}
    </div>
  );
}
