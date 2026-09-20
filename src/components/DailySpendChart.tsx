'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  // Recharts v3 splits the Tooltip component's own props from the props a
  // custom content renderer receives; `payload` lives on the latter.
  type TooltipContentProps,
} from 'recharts';
import type { DailyEntry } from '@/lib/types';
import {
  formatDateLong,
  formatDateShort,
  formatDuration,
  formatTokens,
  formatUsd,
} from '@/lib/format';
import { COMBINED_COLOR, WARN_COLOR } from '@/lib/model-colors';
import { ChartFigure } from './ChartFigure';

interface Point {
  date: string;
  cost: number;
  tokens: number;
  runtime: number;
  spike: boolean;
}

/**
 * Flags days whose spend sits well above the run of the series, so the warning
 * colour marks a real anomaly rather than decorating the chart.
 */
function markSpikes(values: number[]): boolean[] {
  if (values.length < 4) return values.map(() => false);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  const threshold = mean + 1.6 * Math.sqrt(variance);
  return values.map((v) => v > threshold && v > mean * 1.5);
}

function ChartTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as Point;
  return (
    <div
      style={{
        background: 'var(--tooltip-bg)',
        border: `1px solid ${point.spike ? WARN_COLOR : 'var(--border-bright)'}`,
        borderRadius: 10,
        padding: '12px 15px',
        boxShadow: '0 12px 34px rgba(0,0,0,0.95)',
        fontSize: 14,
      }}
    >
      <div style={{ color: 'var(--text)', fontWeight: 600, marginBottom: 8 }}>
        {formatDateLong(point.date)}
      </div>
      <div className="num" style={{ color: COMBINED_COLOR, fontSize: 21, fontWeight: 650 }}>
        {formatUsd(point.cost)}
      </div>
      <div className="num" style={{ color: 'var(--text-muted)', marginTop: 6 }}>
        {formatTokens(point.tokens)} tokens · {formatDuration(point.runtime)}
      </div>
      {point.spike && (
        <div style={{ color: WARN_COLOR, marginTop: 8, fontSize: 13, fontWeight: 600 }}>
          Well above trend
        </div>
      )}
    </div>
  );
}

export function DailySpendChart({
  daily,
  replayKey,
  height = 300,
}: {
  daily: DailyEntry[];
  replayKey?: number;
  height?: number;
}) {
  const spikes = markSpikes(daily.map((d) => d.combined.costUsd));
  const data: Point[] = daily.map((entry, index) => ({
    date: entry.date,
    cost: entry.combined.costUsd,
    tokens: entry.combined.totalTokens,
    runtime: entry.combined.runtimeSeconds,
    spike: spikes[index],
  }));

  if (!data.length) {
    return (
      <div style={{ color: 'var(--text-faint)', padding: '40px 0', textAlign: 'center' }}>
        No dated activity found.
      </div>
    );
  }

  return (
    <ChartFigure
      label="Daily combined spend, all models and projects."
      summary={`${data.length} day${data.length === 1 ? '' : 's'}, oldest first.`}
      columns={[
        { header: 'Date', cell: (row: Point) => formatDateLong(row.date) },
        { header: 'Spend', cell: (row: Point) => formatUsd(row.cost) },
        { header: 'Tokens', cell: (row: Point) => formatTokens(row.tokens) },
        { header: 'Runtime', cell: (row: Point) => formatDuration(row.runtime) },
        { header: 'Above trend', cell: (row: Point) => (row.spike ? 'yes' : 'no') },
      ]}
      rows={data}
    >
      <div className="chart-wrap" style={{ minHeight: height }}>
        <ResponsiveContainer width="100%" height={height} key={replayKey}>
          <AreaChart data={data} margin={{ top: 10, right: 12, bottom: 4, left: 4 }}>
            <defs>
              <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COMBINED_COLOR} stopOpacity={0.42} />
                <stop offset="100%" stopColor={COMBINED_COLOR} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatDateShort}
              tick={{ fill: 'var(--text-faint)', fontSize: 13 }}
              axisLine={{ stroke: 'var(--border)' }}
              tickLine={false}
              minTickGap={22}
              dy={6}
            />
            <YAxis
              tickFormatter={(v: number) => formatUsd(v, { compact: true })}
              tick={{ fill: 'var(--text-faint)', fontSize: 13 }}
              axisLine={false}
              tickLine={false}
              width={62}
            />
            <Tooltip
              content={ChartTooltip}
              cursor={{ stroke: COMBINED_COLOR, strokeWidth: 1, strokeDasharray: '4 4' }}
            />
            <Area
              type="monotone"
              dataKey="cost"
              stroke={COMBINED_COLOR}
              strokeWidth={2.4}
              fill="url(#spendFill)"
              animationDuration={900}
              animationEasing="ease-out"
              activeDot={{ r: 5, fill: COMBINED_COLOR, stroke: '#000', strokeWidth: 2 }}
              dot={(props) => {
                const { cx, cy, index } = props as { cx: number; cy: number; index: number };
                if (!data[index]?.spike) {
                  return <g key={`dot-${index}`} />;
                }
                return (
                  <circle
                    key={`dot-${index}`}
                    cx={cx}
                    cy={cy}
                    r={4.5}
                    fill={WARN_COLOR}
                    stroke="#000"
                    strokeWidth={2}
                  />
                );
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartFigure>
  );
}
