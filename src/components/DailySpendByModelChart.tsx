'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import type { DailyEntry, UsageCell } from '@/lib/types';
import {
  displayModel,
  formatDateLong,
  formatDateShort,
  formatUsd,
} from '@/lib/format';
import { byPriceDesc, modelColor } from '@/lib/model-colors';
import { ChartFigure } from './ChartFigure';

type Row = { date: string } & Record<string, number | string>;

function ChartTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const entries = payload
    .filter((entry) => typeof entry.value === 'number' && entry.value > 0)
    .sort((a, b) => (b.value as number) - (a.value as number));
  const total = entries.reduce((sum, entry) => sum + (entry.value as number), 0);

  return (
    <div
      style={{
        background: 'var(--tooltip-bg)',
        border: '1px solid var(--border-bright)',
        borderRadius: 10,
        padding: '12px 15px',
        boxShadow: '0 12px 34px rgba(0,0,0,0.95)',
        fontSize: 14,
        minWidth: 220,
      }}
    >
      <div style={{ color: 'var(--text)', fontWeight: 600, marginBottom: 9 }}>
        {formatDateLong(String(label))}
      </div>
      {entries.map((entry) => (
        <div
          key={String(entry.dataKey)}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 16,
            marginBottom: 5,
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)' }}>
            <span
              className="model-swatch"
              style={{ background: modelColor(String(entry.dataKey)) }}
              aria-hidden
            />
            {displayModel(String(entry.dataKey))}
          </span>
          <span className="num" style={{ color: 'var(--text)', fontWeight: 550 }}>
            {formatUsd(entry.value as number)}
          </span>
        </div>
      ))}
      <div
        style={{
          borderTop: '1px solid var(--border-bright)',
          marginTop: 9,
          paddingTop: 8,
          display: 'flex',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <span style={{ color: 'var(--text-muted)' }}>Total</span>
        {/* The agent's accent, never a literal - this tooltip is rendered under
            [data-provider], so `var()` re-themes it for Codex for free. */}
        <span className="num" style={{ color: 'var(--accent)', fontWeight: 650 }}>
          {formatUsd(total)}
        </span>
      </div>
    </div>
  );
}

/**
 * Daily spend as stacked columns, one band per model — the money twin of
 * DailyTokensByModelChart, and deliberately the same shape so the two can be
 * read against each other: same band order (most expensive at the bottom), same
 * column geometry, same legend.
 *
 * Its legend carries dollars only. Token counts belong to the tokens chart, and
 * repeating them here would put two different denominators next to one share.
 */
export function DailySpendByModelChart({
  daily,
  perModel,
  combined,
  replayKey,
  height = 300,
}: {
  daily: DailyEntry[];
  perModel: Record<string, UsageCell>;
  combined: UsageCell;
  replayKey?: number;
  height?: number;
}) {
  const models = [...new Set(daily.flatMap((entry) => Object.keys(entry.perModel)))].sort(
    byPriceDesc,
  );

  const data: Row[] = daily.map((entry) => {
    const row: Row = { date: entry.date };
    for (const model of models) {
      row[model] = entry.perModel[model]?.costUsd ?? 0;
    }
    return row;
  });

  if (!data.length || !models.length) {
    return (
      <div style={{ color: 'var(--text-faint)', padding: '40px 0', textAlign: 'center' }}>
        No dated activity found.
      </div>
    );
  }

  const legend = models
    .map((model) => ({ model, cell: perModel[model] }))
    .filter((row) => row.cell && (row.cell.costUsd > 0 || row.cell.totalTokens > 0));

  return (
    <ChartFigure
      label="Daily spend, stacked by model, most expensive band first."
      summary={`${data.length} day${data.length === 1 ? '' : 's'}, oldest first, one column per model.`}
      columns={[
        { header: 'Date', cell: (row: Row) => formatDateLong(String(row.date)) },
        ...models.map((model) => ({
          header: displayModel(model),
          cell: (row: Row) => formatUsd(Number(row[model] ?? 0)),
        })),
        {
          header: 'Total',
          cell: (row: Row) =>
            formatUsd(models.reduce((sum, model) => sum + Number(row[model] ?? 0), 0)),
        },
      ]}
      rows={data}
    >
      <div className="chart-wrap" style={{ minHeight: height }}>
        <ResponsiveContainer width="100%" height={height} key={replayKey}>
          <BarChart data={data} margin={{ top: 10, right: 12, bottom: 4, left: 4 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatDateShort}
              tick={{ fill: 'var(--text-faint)', fontSize: 13 }}
              axisLine={{ stroke: 'var(--border)' }}
              tickLine={false}
              minTickGap={20}
              dy={6}
            />
            <YAxis
              tickFormatter={(v: number) => formatUsd(v, { compact: true })}
              tick={{ fill: 'var(--text-faint)', fontSize: 13 }}
              axisLine={false}
              tickLine={false}
              width={64}
            />
            <Tooltip content={ChartTooltip} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            {models.map((model) => (
              <Bar
                key={model}
                dataKey={model}
                stackId="cost"
                fill={modelColor(model)}
                animationDuration={850}
                animationEasing="ease-out"
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="model-legend model-legend-compact">
        {legend.map(({ model, cell }) => {
          const share = combined.costUsd > 0 ? (cell.costUsd / combined.costUsd) * 100 : 0;
          return (
            <div className="model-legend-row" key={model}>
              <span className="model-legend-name">
                <span
                  className="model-swatch"
                  style={{ background: modelColor(model) }}
                  aria-hidden
                />
                {displayModel(model)}
              </span>
              <span className="model-legend-cost num">
                {cell.unpriced ? '—' : formatUsd(cell.costUsd)}
              </span>
              <span className="model-legend-share num">
                {cell.unpriced ? '—' : `${share.toFixed(1)}%`}
              </span>
            </div>
          );
        })}
      </div>
    </ChartFigure>
  );
}
