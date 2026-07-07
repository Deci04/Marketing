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
  Trophy,
  Clock,
  CalendarCheck,
  HourglassMedium,
  PlayCircle,
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

    case "postRanking":
      return <PostRankingBox data={data} />;

    case "bestTime":
      return <BestTimeBox data={data} />;

    case "postingFrequency":
      return <PostingFrequencyBox data={data} />;

    case "contentDecay":
      return <ContentDecayBox data={data} />;

    default:
      return null;
  }
}

function BoxShell({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(26,24,19,0.04)]">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        <h2 className="text-lg">{title}</h2>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>;
}

const DAY_LABELS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

/** ER per-post calcolato da noi (Zernio nel list endpoint dà valori inaffidabili). */
function postEr(p: KpiData["snapshot"]["posts"][number]): number | null {
  if (!p.reach || p.reach <= 0) return null;
  return (((p.likes ?? 0) + (p.comments ?? 0) + (p.saves ?? 0) + (p.shares ?? 0)) / p.reach) * 100;
}

function PostRankingBox({ data }: { data: KpiData }) {
  const posts = [...data.snapshot.posts]
    .sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0))
    .slice(0, 8);
  return (
    <BoxShell title="Classifica post" icon={<Trophy size={18} weight="fill" />}>
      {posts.length === 0 ? (
        <EmptyHint text="Nessun post ancora. Premi “Aggiorna dati”." />
      ) : (
        <div className="h-full space-y-1 overflow-y-auto pr-1">
          {posts.map((p, i) => {
            const watch = p.avgWatchTimeMs != null ? `${(p.avgWatchTimeMs / 1000).toFixed(1)}s` : null;
            const er = postEr(p);
            const inner = (
              <>
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-muted-foreground">
                  {i + 1}
                </span>
                <span className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-secondary">
                  {p.thumbnailUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.thumbnailUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink">{p.caption || p.mediaType || "Post"}</span>
                  <span className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Eye size={12} weight="fill" className="shrink-0" />
                    <span className="tabular-nums">{int(p.reach)}</span>
                    {er != null && (
                      <>
                        <span className="opacity-30">·</span>
                        <span className="tabular-nums">{er.toFixed(1)}% ER</span>
                      </>
                    )}
                    {watch && (
                      <>
                        <span className="opacity-30">·</span>
                        <PlayCircle size={12} weight="fill" className="shrink-0" />
                        <span className="tabular-nums">{watch}</span>
                      </>
                    )}
                  </span>
                </span>
              </>
            );
            return p.postUrl ? (
              <a
                key={p.id}
                href={p.postUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="kpi-no-drag flex items-center gap-3 rounded-xl p-1.5 transition-colors hover:bg-secondary"
              >
                {inner}
              </a>
            ) : (
              <div key={p.id} className="flex items-center gap-3 rounded-xl p-1.5">
                {inner}
              </div>
            );
          })}
        </div>
      )}
    </BoxShell>
  );
}

function BestTimeBox({ data }: { data: KpiData }) {
  const slots = data.snapshot.bestTime;
  const hours = [...new Set(slots.map((s) => s.hour))].sort((a, b) => a - b);
  const max = Math.max(1, ...slots.map((s) => s.avgEngagement));
  const byCell = new Map(slots.map((s) => [`${s.dayOfWeek}:${s.hour}`, s.avgEngagement]));
  const top = slots.reduce<(typeof slots)[number] | null>(
    (m, s) => (m == null || s.avgEngagement > m.avgEngagement ? s : m),
    null
  );
  return (
    <BoxShell title="Orari migliori" icon={<Clock size={18} weight="fill" />}>
      {slots.length === 0 ? (
        <EmptyHint text="Nessun dato sugli orari ancora." />
      ) : (
        <div className="flex h-full flex-col justify-center gap-3">
          <div className="overflow-x-auto">
            <table className="mx-auto border-separate border-spacing-1 text-[11px]">
              <thead>
                <tr>
                  <th />
                  {hours.map((h) => (
                    <th key={h} className="pb-0.5 font-medium tabular-nums text-muted-foreground">
                      {String(h).padStart(2, "0")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DAY_LABELS.map((label, day) => (
                  <tr key={label}>
                    <td className="pr-1.5 text-right text-muted-foreground">{label}</td>
                    {hours.map((h) => {
                      const v = byCell.get(`${day}:${h}`);
                      const alpha = v != null ? 0.18 + 0.82 * (v / max) : 0;
                      return (
                        <td key={h} className="p-0">
                          <div
                            title={v != null ? `${label} ${h}:00 · engagement ${Math.round(v)}` : undefined}
                            className="h-6 w-6 rounded-md"
                            style={{ background: v != null ? `rgba(63,54,128,${alpha})` : "var(--secondary)" }}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-1 text-[11px] text-muted-foreground">
            {top && (
              <span className="text-ink">
                Migliore: <span className="font-medium">{DAY_LABELS[top.dayOfWeek]} {String(top.hour).padStart(2, "0")}:00</span>
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              meno
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "rgba(63,54,128,0.18)" }} />
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "rgba(63,54,128,0.55)" }} />
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "rgba(63,54,128,1)" }} />
              più
            </span>
          </div>
        </div>
      )}
    </BoxShell>
  );
}

function PostingFrequencyBox({ data }: { data: KpiData }) {
  const rows = [...data.snapshot.postingFrequency].sort((a, b) => a.postsPerWeek - b.postsPerWeek);
  const max = Math.max(0.01, ...rows.map((r) => r.avgEngagementRate));
  const best = rows.reduce<number | null>((m, r) => (m == null || r.avgEngagementRate > m ? r.avgEngagementRate : m), null);
  return (
    <BoxShell title="Frequenza vs engagement" icon={<CalendarCheck size={18} weight="fill" />}>
      {rows.length === 0 ? (
        <EmptyHint text="Nessun dato di frequenza ancora." />
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const top = r.avgEngagementRate === best;
            return (
              <div key={r.postsPerWeek} className="flex items-center gap-2 text-xs">
                <span className="w-14 shrink-0 text-muted-foreground">{r.postsPerWeek}/sett</span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-secondary/60">
                  <div className="h-full rounded-full" style={{ width: `${Math.round((r.avgEngagementRate / max) * 100)}%`, background: top ? "#3E5E2A" : "#3F3680" }} />
                </div>
                <span className={`w-12 shrink-0 text-right tabular-nums ${top ? "font-semibold text-sage-ink" : "text-ink"}`}>{r.avgEngagementRate.toFixed(2)}%</span>
              </div>
            );
          })}
          <p className="pt-1 text-[11px] text-muted-foreground">In verde la cadenza con engagement migliore.</p>
        </div>
      )}
    </BoxShell>
  );
}

function ContentDecayBox({ data }: { data: KpiData }) {
  const buckets = data.snapshot.contentDecay;
  return (
    <BoxShell title="Decadimento contenuti" icon={<HourglassMedium size={18} weight="fill" />}>
      {buckets.length === 0 ? (
        <EmptyHint text="Nessun dato di decadimento ancora." />
      ) : (
        <div className="space-y-2">
          {buckets.map((b) => (
            <div key={b.label} className="flex items-center gap-2 text-xs">
              <span className="w-16 shrink-0 text-muted-foreground">{b.label}</span>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-secondary/60">
                <div className="h-full rounded-full" style={{ width: `${Math.round(b.avgPctOfFinal)}%`, background: "#6E5410" }} />
              </div>
              <span className="w-10 shrink-0 text-right tabular-nums text-ink">{Math.round(b.avgPctOfFinal)}%</span>
            </div>
          ))}
          <p className="pt-1 text-[11px] text-muted-foreground">% dell&apos;engagement finale già raggiunto nella finestra.</p>
        </div>
      )}
    </BoxShell>
  );
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
