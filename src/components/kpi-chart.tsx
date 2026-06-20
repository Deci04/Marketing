"use client";

import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { SeriesPoint } from "@/lib/kpi";

export function KpiChart({ er, nf }: { er: SeriesPoint[]; nf: SeriesPoint[] }) {
  const [metric, setMetric] = useState<"er" | "nf">("er");
  const data = metric === "er" ? er : nf;

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString("it-IT", { day: "numeric", month: "short" });

  return (
    <div>
      <div className="mb-4 inline-flex rounded-full border border-border bg-secondary/50 p-0.5 text-xs">
        <button
          onClick={() => setMetric("er")}
          className={`rounded-full px-3 py-1.5 font-medium transition-colors ${
            metric === "er" ? "bg-ink text-paper" : "text-muted-foreground"
          }`}
        >
          Engagement rate
        </button>
        <button
          onClick={() => setMetric("nf")}
          className={`rounded-full px-3 py-1.5 font-medium transition-colors ${
            metric === "nf" ? "bg-ink text-paper" : "text-muted-foreground"
          }`}
        >
          Reach non-follower
        </button>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
            <CartesianGrid stroke="#E6DCCB" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={fmtDate}
              tick={{ fontSize: 11, fill: "#8C8578" }}
              axisLine={{ stroke: "#E6DCCB" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#8C8578" }}
              axisLine={false}
              tickLine={false}
              width={42}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 12,
                border: "1px solid #E6DCCB",
                background: "#FFFDF8",
                fontSize: 12,
              }}
              labelFormatter={(d) => fmtDate(String(d))}
              formatter={(value) => [`${value}%`, ""]}
            />
            <Line
              type="monotone"
              dataKey="Luca"
              stroke="#3F3680"
              strokeWidth={2.5}
              dot={{ r: 3, fill: "#3F3680" }}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="Benchmark"
              stroke="#A39E92"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-full" style={{ background: "#3F3680" }} /> Luca
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full border-t-2 border-dashed" style={{ borderColor: "#A39E92" }} /> Benchmark
        </span>
      </div>
    </div>
  );
}
