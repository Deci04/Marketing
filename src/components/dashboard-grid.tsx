"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GridLayout, {
  verticalCompactor,
  type Layout,
  type LayoutItem,
} from "react-grid-layout";
import { toast } from "sonner";
import {
  Plus,
  ArrowCounterClockwise,
  EyeSlash,
  DotsSixVertical,
  X,
} from "@phosphor-icons/react";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import type { KpiData } from "@/lib/kpi";
import {
  BOX_CATALOG,
  normalizeLayout,
  defaultLayout,
  type BoxId,
  type StoredLayout,
} from "@/lib/dashboard-config";
import { KpiBox } from "./kpi/kpi-boxes";
import { KpiEditors, type EditorKind } from "./kpi/kpi-editors";
import {
  saveDashboardLayoutAction,
  resetDashboardLayoutAction,
} from "@/app/(app)/kpi/actions";

const ROW_HEIGHT = 56;
const COLS = 12;
const MARGIN: [number, number] = [14, 14];

export function DashboardGrid({
  data,
  initialLayout,
}: {
  data: KpiData;
  initialLayout: unknown;
}) {
  const [layout, setLayout] = useState<StoredLayout>(() =>
    normalizeLayout(initialLayout)
  );
  const [width, setWidth] = useState(0);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [editor, setEditor] = useState<EditorKind>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Measure container width client-side (react-grid-layout v2 needs explicit width).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    const ro = new ResizeObserver(update);
    ro.observe(el);
    update();
    return () => ro.disconnect();
  }, []);

  const persist = useCallback((next: StoredLayout) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void saveDashboardLayoutAction(next);
    }, 700);
  }, []);

  const visibleItems = useMemo(
    () => layout.items.filter((it) => !layout.hidden.includes(it.i as BoxId)),
    [layout]
  );

  const onLayoutChange = useCallback(
    (next: Layout) => {
      setLayout((prev) => {
        const merged: StoredLayout = {
          hidden: prev.hidden,
          items: next.map((n: LayoutItem) => {
            const old = prev.items.find((p) => p.i === n.i);
            return {
              i: n.i,
              x: n.x,
              y: n.y,
              w: n.w,
              h: n.h,
              minW: old?.minW ?? 2,
              minH: old?.minH ?? 2,
            };
          }),
        };
        persist(merged);
        return merged;
      });
    },
    [persist]
  );

  const hideBox = useCallback(
    (id: BoxId) => {
      setLayout((prev) => {
        const next: StoredLayout = {
          ...prev,
          hidden: [...new Set([...prev.hidden, id])],
        };
        persist(next);
        return next;
      });
      toast.success("Box nascosto");
    },
    [persist]
  );

  const addBox = useCallback(
    (id: BoxId) => {
      setLayout((prev) => {
        const meta = BOX_CATALOG.find((b) => b.id === id)!;
        const exists = prev.items.find((it) => it.i === id);
        const maxY = prev.items.reduce((m, it) => Math.max(m, it.y + it.h), 0);
        const items = exists
          ? prev.items
          : [...prev.items, { i: id, ...meta.default, y: maxY }];
        const next: StoredLayout = {
          items,
          hidden: prev.hidden.filter((h) => h !== id),
        };
        persist(next);
        return next;
      });
      toast.success("Box aggiunto");
    },
    [persist]
  );

  const resetLayout = useCallback(async () => {
    setLayout(defaultLayout());
    await resetDashboardLayoutAction();
    toast.success("Layout ripristinato");
  }, []);

  const hiddenBoxes = BOX_CATALOG.filter((b) => layout.hidden.includes(b.id));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
        <button
          onClick={() => setCatalogOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-paper px-3.5 py-2 text-sm text-ink transition-colors hover:bg-secondary active:scale-[0.98]"
        >
          <Plus size={15} weight="bold" /> Aggiungi box
        </button>
        <button
          onClick={resetLayout}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-paper px-3.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-ink active:scale-[0.98]"
        >
          <ArrowCounterClockwise size={15} /> Reset
        </button>
      </div>

      <div ref={containerRef}>
        {width > 0 && (
          <GridLayout
            className="layout"
            layout={visibleItems}
            width={width}
            gridConfig={{ cols: COLS, rowHeight: ROW_HEIGHT, margin: MARGIN }}
            dragConfig={{ cancel: ".kpi-no-drag" }}
            compactor={verticalCompactor}
            onLayoutChange={onLayoutChange}
          >
            {visibleItems.map((it) => (
              <div key={it.i} className="group/box relative">
                <div className="absolute -top-1 right-1 z-20 flex translate-y-1 items-center gap-1 opacity-0 transition-opacity group-hover/box:opacity-100">
                  <span className="kpi-drag-handle cursor-grab rounded-full bg-ink/80 p-1 text-cream active:cursor-grabbing">
                    <DotsSixVertical size={13} />
                  </span>
                  <button
                    onClick={() => hideBox(it.i as BoxId)}
                    onMouseDown={(e) => e.stopPropagation()}
                    aria-label="Nascondi box"
                    className="kpi-no-drag rounded-full bg-ink/80 p-1 text-cream hover:bg-ink"
                  >
                    <EyeSlash size={13} />
                  </button>
                </div>
                <div className="h-full overflow-hidden">
                  <KpiBox id={it.i as BoxId} data={data} onManage={setEditor} />
                </div>
              </div>
            ))}
          </GridLayout>
        )}
        {width === 0 && (
          <div className="grid h-64 place-items-center rounded-2xl border border-dashed border-border text-sm text-muted-foreground">
            Carico la dashboard…
          </div>
        )}
      </div>

      {catalogOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={() => setCatalogOpen(false)} />
          <div className="relative z-10 w-full max-w-lg rounded-3xl border border-border bg-paper p-6 shadow-[0_24px_60px_rgba(26,24,19,0.22)]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-heading text-2xl text-ink">Catalogo box</h2>
              <button onClick={() => setCatalogOpen(false)} aria-label="Chiudi" className="rounded-full border border-border bg-paper p-2 text-ink/55 hover:bg-secondary hover:text-ink">
                <X size={16} />
              </button>
            </div>
            {hiddenBoxes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Tutti i box sono già visibili.</p>
            ) : (
              <div className="space-y-2">
                {hiddenBoxes.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => {
                      addBox(b.id);
                      setCatalogOpen(false);
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3 text-left transition-colors hover:bg-secondary"
                  >
                    <div>
                      <div className="text-sm font-medium text-ink">{b.title}</div>
                      <div className="text-xs text-muted-foreground">{b.description}</div>
                    </div>
                    <Plus size={16} weight="bold" className="shrink-0 text-ink" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <KpiEditors
        kind={editor}
        onClose={() => setEditor(null)}
        valueConversations={data.valueConversations}
        measurements={data.measurements}
        benchmarks={data.benchmarks}
        audienceSegments={data.audienceSegments}
      />
    </div>
  );
}
