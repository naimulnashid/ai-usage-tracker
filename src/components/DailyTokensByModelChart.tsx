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
  formatTokens,
} from '@/lib/format';
import { byPriceDesc, modelColor } from '@/lib/model-colors';

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
        background: '#131317',
        border: '1px solid #2e2e37',
        borderRadius: 10,
        padding: '12px 15px',
        boxShadow: '0 12px 34px rgba(0,0,0,0.95)',
        fontSize: 14,
        minWidth: 220,
      }}
    >
      <div style={{ color: '#fafafa', fontWeight: 600, marginBottom: 9 }}>
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
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#9a9aa4' }}>
            <span
              className="model-swatch"
              style={{ background: modelColor(String(entry.dataKey)) }}
              aria-hidden
            />
            {displayModel(String(entry.dataKey))}
          </span>
          <span className="num" style={{ color: '#fafafa', fontWeight: 550 }}>
            {formatTokens(entry.value as number)}
          </span>
        </div>
      ))}
      <div
        style={{
          borderTop: '1px solid #2e2e37',
          marginTop: 9,
          paddingTop: 8,
          display: 'flex',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <span style={{ color: '#9a9aa4' }}>Total</span>
        <span className="num" style={{ color: 'var(--accent)', fontWeight: 650 }}>
          {formatTokens(total)}
        </span>
      </div>
    </div>
  );
}

/**
 * Daily token volume as stacked columns, one band per model, plus a legend
 * carrying each model's input/output split, its token total, and its share of
 * all tokens. Every figure in that legend is a token count on purpose: a cost
 * sitting beside a token share reads as a cost share.
 *
 * Bands are ordered most-expensive-first so the darkest shades stack at the
 * bottom, which makes the expensive share of a day readable at a glance.
 */
export function DailyTokensByModelChart({
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
      row[model] = entry.perModel[model]?.totalTokens ?? 0;
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
    .filter((row) => row.cell && row.cell.totalTokens > 0);

  return (
    <>
      <div className="chart-wrap" style={{ minHeight: height }}>
        <ResponsiveContainer width="100%" height={height} key={replayKey}>
          <BarChart data={data} margin={{ top: 10, right: 12, bottom: 4, left: 4 }}>
            <CartesianGrid stroke="#1e1e24" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatDateShort}
              tick={{ fill: '#6b6b75', fontSize: 13 }}
              axisLine={{ stroke: '#1e1e24' }}
              tickLine={false}
              minTickGap={20}
              dy={6}
            />
            <YAxis
              tickFormatter={(v: number) => formatTokens(v)}
              tick={{ fill: '#6b6b75', fontSize: 13 }}
              axisLine={false}
              tickLine={false}
              width={64}
            />
            <Tooltip content={ChartTooltip} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            {models.map((model) => (
              <Bar
                key={model}
                dataKey={model}
                stackId="tokens"
                fill={modelColor(model)}
                animationDuration={850}
                animationEasing="ease-out"
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="model-legend">
        {legend.map(({ model, cell }) => {
          const share =
            combined.totalTokens > 0 ? (cell.totalTokens / combined.totalTokens) * 100 : 0;
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
              <span className="model-legend-detail num">
                {formatTokens(cell.input)} in · {formatTokens(cell.output)} out ·{' '}
                {formatTokens(cell.cacheRead)} cached
              </span>
              <span className="model-legend-total num">{formatTokens(cell.totalTokens)}</span>
              <span className="model-legend-share num">{share.toFixed(1)}%</span>
            </div>
          );
        })}
      </div>
    </>
  );
}
