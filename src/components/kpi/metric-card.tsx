"use client";

import { useState } from "react";
import {
  Eye, ChartLineUp, UsersThree, Pulse, Heart, ChatCircleDots, BookmarkSimple,
  ShareNetwork, ArrowBendUpLeft, Repeat, UserPlus, LinkSimple, Users, ImageSquare, Clock,
  DotsThree, ArrowsInSimple, ArrowsOutSimple, Trash,
} from "@phosphor-icons/react";
import type { KpiData } from "@/lib/kpi";
import type { MetricKey, DirectMetric } from "@/lib/metric-keys";
import { int, deltaFmt } from "./kpi-format";

// Metriche la cui serie si popola col tempo (snapshotter Zernio collegato di recente):
// quando il valore manca mostriamo "in raccolta" invece di un "—" muto.
const COLLECTING: ReadonlySet<MetricKey> = new Set(["followers_direct"]);

export const METRIC_META: Record<MetricKey, { label: string; icon: React.ReactNode; unit: "int" | "days" }> = {
  reach: { label: "Reach", icon: <Eye size={16} weight="fill" />, unit: "int" },
  views: { label: "Views", icon: <ChartLineUp size={16} weight="fill" />, unit: "int" },
  accounts_engaged: { label: "Accounts engaged", icon: <UsersThree size={16} weight="fill" />, unit: "int" },
  total_interactions: { label: "Interazioni totali", icon: <Pulse size={16} weight="fill" />, unit: "int" },
  likes: { label: "Like", icon: <Heart size={16} weight="fill" />, unit: "int" },
  comments: { label: "Commenti", icon: <ChatCircleDots size={16} weight="fill" />, unit: "int" },
  saves: { label: "Salvataggi", icon: <BookmarkSimple size={16} weight="fill" />, unit: "int" },
  shares: { label: "Condivisioni", icon: <ShareNetwork size={16} weight="fill" />, unit: "int" },
  replies: { label: "Risposte", icon: <ArrowBendUpLeft size={16} weight="fill" />, unit: "int" },
  reposts: { label: "Repost", icon: <Repeat size={16} weight="fill" />, unit: "int" },
  follows_and_unfollows: { label: "Follow netti", icon: <UserPlus size={16} weight="fill" />, unit: "int" },
  profile_links_taps: { label: "Tap sui link", icon: <LinkSimple size={16} weight="fill" />, unit: "int" },
  followers_direct: { label: "Follower", icon: <Users size={16} weight="fill" />, unit: "int" },
  following: { label: "Seguiti", icon: <Users size={16} weight="fill" />, unit: "int" },
  media: { label: "Post pubblicati", icon: <ImageSquare size={16} weight="fill" />, unit: "int" },
  token_days: { label: "Token (giorni)", icon: <Clock size={16} weight="fill" />, unit: "days" },
};

const TONE_CLASS = { up: "text-sage-ink", down: "text-coral-ink", flat: "text-muted-foreground" } as const;

/** Badge delta significativo, o null quando non c'è confronto (finestra prec. assente). */
function deltaBadge(dm: DirectMetric): { text: string; tone: "up" | "down" | "flat" } | null {
  if (dm.deltaPct != null) return deltaFmt(dm.deltaPct);
  // prev = 0 e valore attuale > 0 → "nuovo" (crescita da zero, pct non calcolabile)
  if (dm.deltaAbs != null && dm.deltaAbs > 0 && (dm.value ?? 0) > 0) return { text: "nuovo", tone: "up" };
  return null;
}

function DeltaBadge({ dm }: { dm: DirectMetric }) {
  const b = deltaBadge(dm);
  if (!b) return null;
  return <span className={`text-xs font-medium ${TONE_CLASS[b.tone]}`}>{b.text}</span>;
}

function fmtVal(key: MetricKey, value: number | null): string {
  if (value == null) return COLLECTING.has(key) ? "in raccolta" : "—";
  if (METRIC_META[key].unit === "days") return `${Math.round(value)}g`;
  return int(value);
}

export function MetricCard({
  cardId, metrics, data, title, onSplit, onRemove, onMergeInto, otherCards,
}: {
  cardId: string;
  metrics: MetricKey[];
  data: KpiData;
  title?: string;
  onSplit: (id: string) => void;
  onRemove: (id: string) => void;
  onMergeInto: (srcId: string, dstId: string) => void;
  otherCards: { i: string; label: string }[];
}) {
  const [menu, setMenu] = useState(false);
  const single = metrics.length === 1;
  const dm = (m: MetricKey) => data.directMetrics?.[m] ?? { value: null, deltaAbs: null, deltaPct: null };

  return (
    <div className="relative flex h-full flex-col rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(26,24,19,0.04)]">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {title ?? (single ? METRIC_META[metrics[0]].label : "Metriche")}
        </span>
        <button
          onClick={() => setMenu((v) => !v)}
          onMouseDown={(e) => e.stopPropagation()}
          aria-label="Gestisci card"
          className="kpi-no-drag rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-ink"
        >
          <DotsThree size={16} weight="bold" />
        </button>
      </div>

      {single ? (
        (() => {
          const m = metrics[0];
          const d = dm(m);
          const collecting = d.value == null && COLLECTING.has(m);
          const badge = deltaBadge(d);
          return (
            <div className="mt-1 flex flex-1 flex-col justify-center">
              <div className="flex items-end justify-between gap-2">
                <span className={`font-semibold text-ink ${collecting ? "text-lg" : "text-3xl"}`}>
                  {fmtVal(m, d.value)}
                </span>
                <span className="text-muted-foreground">{METRIC_META[m].icon}</span>
              </div>
              {badge && (
                <div className="mt-2">
                  <DeltaBadge dm={d} />{" "}
                  <span className="text-xs text-muted-foreground">vs periodo prec.</span>
                </div>
              )}
            </div>
          );
        })()
      ) : (
        <div className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto">
          {metrics.map((m) => {
            const d = dm(m);
            const collecting = d.value == null && COLLECTING.has(m);
            return (
              <div key={m} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  {METRIC_META[m].icon}
                  {METRIC_META[m].label}
                </span>
                <span className="flex items-center gap-2">
                  <span className={collecting ? "text-xs text-muted-foreground" : "tabular-nums text-ink"}>
                    {fmtVal(m, d.value)}
                  </span>
                  <DeltaBadge dm={d} />
                </span>
              </div>
            );
          })}
        </div>
      )}

      {menu && (
        <div
          className="kpi-no-drag absolute right-2 top-9 z-30 w-48 rounded-xl border border-border bg-paper p-1 shadow-[0_12px_32px_rgba(26,24,19,0.18)]"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {!single && (
            <button
              onClick={() => { onSplit(cardId); setMenu(false); }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-secondary"
            >
              <ArrowsOutSimple size={14} /> Dividi in singoli
            </button>
          )}
          {otherCards.length > 0 && (
            <div className="px-2 py-1 text-[11px] text-muted-foreground">Unisci a…</div>
          )}
          {otherCards.map((c) => (
            <button
              key={c.i}
              onClick={() => { onMergeInto(cardId, c.i); setMenu(false); }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-secondary"
            >
              <ArrowsInSimple size={14} /> <span className="truncate">{c.label}</span>
            </button>
          ))}
          <button
            onClick={() => { onRemove(cardId); setMenu(false); }}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-coral-ink hover:bg-secondary"
          >
            <Trash size={14} /> Rimuovi
          </button>
        </div>
      )}
    </div>
  );
}
