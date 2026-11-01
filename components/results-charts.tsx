"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface ChartRow {
  year: string;
  baseline: number | null;
  scenario: number | null;
  cumulative: number | null;
}

// Scenario is the focus (categorical slot 1); the baseline is a neutral reference.
const SCENARIO = "#2a78d6";
const BASELINE = "#a3a29c";
const GRID = "#e7e5e4";
const INK_MUTED = "#6b6a66";

const cad = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", notation: "compact", maximumFractionDigits: 1 });
const tooltipValue = (v: unknown) => (typeof v === "number" ? cad.format(v) : "Unknown");

const axisProps = {
  tick: { fill: INK_MUTED, fontSize: 12 },
  tickLine: false,
  axisLine: { stroke: GRID },
};

export function AnnualCostChart({ rows }: { rows: ChartRow[] }) {
  return (
    <figure>
      <figcaption className="mb-2 text-sm font-medium text-stone-700">Annual occupancy cost, including one-time costs (CAD)</figcaption>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} barGap={2} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="year" {...axisProps} />
            <YAxis {...axisProps} tickFormatter={(v: number) => compact.format(v)} width={72} />
            <Tooltip formatter={tooltipValue} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
            <Legend iconType="square" wrapperStyle={{ fontSize: 12, color: INK_MUTED }} />
            <Bar dataKey="baseline" name="Baseline (do nothing)" fill={BASELINE} radius={[4, 4, 0, 0]} maxBarSize={28} />
            <Bar dataKey="scenario" name="Scenario" fill={SCENARIO} radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

export function CumulativeChart({ rows }: { rows: ChartRow[] }) {
  return (
    <figure>
      <figcaption className="mb-2 text-sm font-medium text-stone-700">Cumulative saving against the baseline (CAD, undiscounted)</figcaption>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="year" {...axisProps} />
            <YAxis {...axisProps} tickFormatter={(v: number) => compact.format(v)} width={72} />
            <ReferenceLine y={0} stroke={INK_MUTED} strokeDasharray="4 4" label={{ value: "Break-even", fill: INK_MUTED, fontSize: 11, position: "insideBottomRight" }} />
            <Tooltip formatter={tooltipValue} />
            <Line
              type="linear"
              dataKey="cumulative"
              name="Cumulative saving"
              stroke={SCENARIO}
              strokeWidth={2}
              dot={{ r: 4, fill: SCENARIO, stroke: "#fff", strokeWidth: 2 }}
              activeDot={{ r: 6 }}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
