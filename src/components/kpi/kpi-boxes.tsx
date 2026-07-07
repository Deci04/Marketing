"use client";

import {
  ChatCircleDots,
  Heart,
  BookmarkSimple,
  ShareNetwork,
  Eye,
  TrendUp,
  PaperPlaneTilt,
  PencilSimple,
} from "@phosphor-icons/react";
import { Sparkline } from "@/components/sparkline";
import { KpiChart } from "@/components/kpi-chart";
import type { KpiData } from "@/lib/kpi";
import type { BoxId } from "@/lib/dashboard-config";
import type { EditorKind } from "./kpi-editors";
import { pct, pctFromPercent, int, ratio } from "./kpi-format";

function ManageButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      onMouseDown={(e) => e.stopPropagation()}
      aria-label={label}
      className="kpi-no-drag inline-flex items-center gap-1 rounded-full border border-border bg-paper px-2 py-1 text-[11px] text-ink/70 transition-colors hover:bg-secondary hover:text-ink"
    >
      <PencilSimple size={12} /> Gestisci
    </button>
  );
}

function StatShell({
  label,
  icon,
  value,
  hint,
  spark,
  sparkColor,
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  hint?: string;
  spark?: number[];
  sparkColor?: string;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <div className="mt-1 flex items-end justify-between gap-2">
        <div className="text-3xl font-semibold text-ink">{value}</div>
        {spark && spark.length > 1 && (
          <div style={{ color: sparkColor }}>
            <Sparkline values={spark} color={sparkColor} />
          </div>
        )}
      </div>
      {hint && <div className="mt-2 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function lucaValues(data: KpiData, metric: string): number[] {
  return (data.series[metric] ?? [])
    .map((p) => p.Luca)
    .filter((v): v is number => v != null);
}

export function KpiBox({
  id,
  data,
  onManage,
}: {
  id: BoxId;
  data: KpiData;
  onManage: (kind: EditorKind) => void;
}) {
  switch (id) {
    case "northStar":
      return (
        <div className="flex h-full flex-col rounded-2xl bg-ink p-5 text-cream">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-cream/70">
              <ChatCircleDots size={18} weight="fill" />
              North Star · Conversazioni di valore
            </div>
            <button
              onClick={() => onManage("valueConversations")}
              onMouseDown={(e) => e.stopPropagation()}
              className="kpi-no-drag rounded-full border border-cream/25 px-2 py-1 text-[11px] text-cream/80 hover:bg-cream/10"
            >
              Gestisci
            </button>
          </div>
          <div className="mt-2 flex items-end gap-3">
            <span className="font-heading text-5xl">{data.valueConversations.length}</span>
            <span className="mb-1.5 text-sm text-cream/60">questo periodo</span>
          </div>
          <div className="mt-4 flex-1 space-y-2 overflow-y-auto border-t border-cream/15 pt-4">
            {data.valueConversations.length === 0 && (
              <p className="text-sm text-cream/50">Nessuna ancora — aggiungine una.</p>
            )}
            {data.valueConversations.slice(0, 6).map((c) => (
              <div key={c.id} className="flex items-baseline justify-between gap-3 text-sm">
                <span>
                  <span className="font-medium">{c.who}</span>{" "}
                  <span className="text-cream/60">— {c.what}</span>
                </span>
                {c.channel && <span className="shrink-0 text-xs text-cream/50">{c.channel}</span>}
              </div>
            ))}
          </div>
        </div>
      );

    case "conversionToConversation":
      return (
        <div className="h-full rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(26,24,19,0.04)]">
          <StatShell
            label="Conversion to conversation"
            icon={<ChatCircleDots size={18} weight="fill" />}
            value={pct(data.conversionToConversation, 3)}
            hint="conversazioni / reach"
          />
        </div>
      );

    case "engagementRate":
      return (
        <div className="h-full rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(26,24,19,0.04)]">
          <StatShell
            label="Engagement rate"
            icon={<Heart size={18} weight="fill" />}
            value={pct(data.perf.engagementRate)}
            hint="by reach, periodo selezionato"
            spark={lucaValues(data, "engagement_rate")}
            sparkColor="#3F3680"
          />
        </div>
      );

    case "saveRate":
      return (
        <div className="h-full rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(26,24,19,0.04)]">
          <StatShell
            label="Save rate"
            icon={<BookmarkSimple size={18} weight="fill" />}
            value={pct(data.perf.saveRate ?? data.accountSaveRate, 2)}
            hint="saves / reach"
          />
        </div>
      );

    case "shareRate":
      return (
        <div className="h-full rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(26,24,19,0.04)]">
          <StatShell
            label="Share rate"
            icon={<ShareNetwork size={18} weight="fill" />}
            value={pct(data.perf.shareRate ?? data.accountShareRate, 2)}
            hint="shares / reach"
          />
        </div>
      );

    case "reachNonFollower":
      return (
        <div className="h-full rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(26,24,19,0.04)]">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Reach + % non-follower</span>
            <span className="text-muted-foreground"><Eye size={18} weight="fill" /></span>
          </div>
          <div className="mt-1 text-3xl font-semibold text-ink">
            {int(data.perf.totalReach || data.accountReach)}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>{pctFromPercent(data.nonFollowerPct)} non-follower</span>
            {data.reachRate != null && <span>reach rate {ratio(data.reachRate)}</span>}
          </div>
        </div>
      );

    case "followerGrowth":
      return (
        <div className="h-full rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(26,24,19,0.04)]">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Follower growth rate</span>
            <ManageButton onClick={() => onManage("measurements")} label="Gestisci misurazioni" />
          </div>
          <div className="mt-1 flex items-end gap-2">
            <span className="text-3xl font-semibold text-ink">{pct(data.followerGrowth)}</span>
            <TrendUp size={18} className="mb-1.5 text-sage-ink" weight="fill" />
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            {data.followerLatest != null ? `${int(data.followerLatest)} follower` : "serie followers"}
          </div>
        </div>
      );

    case "publishedCount":
      return (
        <div className="h-full rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(26,24,19,0.04)]">
          <StatShell
            label="Contenuti pubblicati"
            icon={<PaperPlaneTilt size={18} weight="fill" />}
            value={String(data.publishedCount)}
            hint="costanza di uscita"
          />
        </div>
      );

    case "vsBenchmark":
      return (
        <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(26,24,19,0.04)]">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-lg">Andamento vs benchmark</h2>
            <div className="flex gap-1.5">
              <ManageButton onClick={() => onManage("measurements")} label="Misurazioni" />
              <ManageButton onClick={() => onManage("benchmarks")} label="Benchmark" />
            </div>
          </div>
          <div className="kpi-no-drag min-h-0 flex-1">
            <KpiChart
              er={data.series["engagement_rate"] ?? []}
              nf={data.series["non_follower_pct"] ?? []}
            />
          </div>
        </div>
      );

    case "funnel":
      return <FunnelBox data={data} />;

    case "audienceType":
      return <AudienceTypeBox data={data} onManage={onManage} />;

    case "audienceUsage":
      return <AudienceUsageBox data={data} onManage={onManage} />;

    default:
      return null;
  }
}

const FUNNEL_TONES = [
  "bg-blush text-blush-ink",
  "bg-coral text-coral-ink",
  "bg-butter text-butter-ink",
  "bg-lavender text-lavender-ink",
  "bg-secondary text-muted-foreground",
  "bg-sage text-sage-ink",
];

function FunnelBox({ data }: { data: KpiData }) {
  const max = Math.max(1, ...data.funnel.map((s) => s.value));
  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(26,24,19,0.04)]">
      <h2 className="mb-3 text-lg">L&apos;imbuto</h2>
      <div className="flex flex-1 flex-col justify-center gap-1.5">
        {data.funnel.map((s, i) => {
          const w = Math.max(12, Math.round((s.value / max) * 100));
          return (
            <div key={s.label} className="flex items-center gap-2">
              <div
                className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium ${FUNNEL_TONES[i]}`}
                style={{ width: `${w}%` }}
              >
                <span>{s.label}</span>
                <span className="tabular-nums">{int(s.value)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const PALETTE = ["#3F3680", "#7A2E4E", "#6E5410", "#3E5E2A", "#8A3E22", "#8C8578"];

function Bars({ buckets }: { buckets: { label: string; value: number }[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.value));
  return (
    <div className="space-y-1.5">
      {buckets.map((b, i) => (
        <div key={b.label} className="flex items-center gap-2 text-xs">
          <span className="w-20 shrink-0 truncate text-muted-foreground">{b.label}</span>
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-secondary/60">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.round((b.value / max) * 100)}%`, background: PALETTE[i % PALETTE.length] }}
            />
          </div>
          <span className="w-10 shrink-0 text-right tabular-nums text-ink">{b.value}%</span>
        </div>
      ))}
    </div>
  );
}

function AudienceTypeBox({ data, onManage }: { data: KpiData; onManage: (k: EditorKind) => void }) {
  const dims: { key: string; title: string }[] = [
    { key: "age", title: "Età" },
    { key: "gender", title: "Genere" },
    { key: "geo", title: "Geografia" },
    { key: "followerType", title: "Follower vs non" },
  ];
  const present = dims.filter((d) => (data.audience[d.key] ?? []).length > 0);
  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(26,24,19,0.04)]">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg">Tipologia di utente</h2>
        <ManageButton onClick={() => onManage("audience")} label="Gestisci audience" />
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
        {present.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nessun dato demografico ancora. Aggiungilo da &ldquo;Gestisci&rdquo;.
          </p>
        )}
        {present.map((d) => (
          <div key={d.key}>
            <div className="mb-1.5 text-xs font-medium text-ink">{d.title}</div>
            <Bars buckets={data.audience[d.key]} />
          </div>
        ))}
      </div>
    </div>
  );
}

function AudienceUsageBox({ data, onManage }: { data: KpiData; onManage: (k: EditorKind) => void }) {
  const activity = data.audience["activity"] ?? [];
  const returning = data.audience["returning"] ?? [];
  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(26,24,19,0.04)]">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg">Utilizzo medio audience</h2>
        <ManageButton onClick={() => onManage("audience")} label="Gestisci audience" />
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
        {activity.length === 0 && returning.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nessun dato di attività ancora. Aggiungi orari/giorni e new vs returning.
          </p>
        )}
        {activity.length > 0 && (
          <div>
            <div className="mb-1.5 text-xs font-medium text-ink">Orari / giorni di attività</div>
            <Bars buckets={activity} />
          </div>
        )}
        {returning.length > 0 && (
          <div>
            <div className="mb-1.5 text-xs font-medium text-ink">New vs returning</div>
            <Bars buckets={returning} />
          </div>
        )}
      </div>
    </div>
  );
}
