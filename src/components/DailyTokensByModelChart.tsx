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
import type { DailyEntry } from '@/lib/types';
import { displayModel, formatDateLong, formatDateShort, formatTokens } from '@/lib/format';
import { byPriceDesc, modelColor } from '@/lib/model-colors';
import { daysInRange, isActiveDay, sumDays, type DayRange } from '@/lib/day-range';
import { ChartFigure } from './ChartFigure';
import { NoDaysInRange } from './DayRangeSelect';

type Row = { date: string } & Record<string, number | string>;

function ChartTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const entries = payload
    .filter((entry) => typeof entry.value === 'number' && entry.value > 0)
    .sort((a, b) => (b.value as number) - (a.value as number));
  const total = entries.reduce((sum, entry) => sum + (entry.value as number), 0);
  // A window has a column for every day, idle ones included.
  const idle = entries.length === 0;

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
          <span
            style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)' }}
          >
            <span
              className="model-swatch"
              style={{ background: modelColor(String(entry.dataKey)) }}
              aria-hidden
            />
            {displayModel(String(entry.dataKey))}
          </span>
          <span className="num" style={{ color: 'var(--text)', fontWeight: 550 }}>
            {formatTokens(entry.value as number)}
          </span>
        </div>
      ))}
      <div
        style={{
          borderTop: idle ? 'none' : '1px solid var(--border-bright)',
          marginTop: idle ? 0 : 9,
          paddingTop: idle ? 0 : 8,
          display: 'flex',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <span style={{ color: 'var(--text-muted)' }}>{idle ? 'No activity' : 'Total'}</span>
        {!idle && (
          <span className="num" style={{ color: 'var(--accent)', fontWeight: 650 }}>
            {formatTokens(total)}
          </span>
        )}
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
 *
 * `range` picks the days (see day-range.ts), and **the legend is summed over
 * exactly those days**, never the agent's all-time totals: a share printed
 * beside thirty columns has to be a share of those thirty columns.
 */
export function DailyTokensByModelChart({
  daily,
  range = 'all',
  today = null,
  replayKey,
  height = 300,
}: {
  daily: DailyEntry[];
  range?: DayRange;
  /** The report's "today", which ends a window. See `reportToday`. */
  today?: string | null;
  replayKey?: number;
  height?: number;
}) {
  const days = daysInRange(daily, range, today);
  const models = [...new Set(days.flatMap((entry) => Object.keys(entry.perModel)))].sort(
    byPriceDesc,
  );

  const data: Row[] = days.map((entry) => {
    const row: Row = { date: entry.date };
    for (const model of models) {
      row[model] = entry.perModel[model]?.totalTokens ?? 0;
    }
    return row;
  });

  // A window is never empty of DAYS - it is filled - so "no models" is the test.
  if (!models.length) return <NoDaysInRange daily={daily} range={range} />;

  const { perModel, combined } = sumDays(days);
  const legend = models
    .map((model) => ({ model, cell: perModel[model] }))
    .filter((row) => row.cell && row.cell.totalTokens > 0);

  // The table fallback lists active days only: a window's idle columns are
  // zeroes a screen reader would otherwise have to hear one row at a time.
  const tableRows = data.filter((_, index) => isActiveDay(days[index]));
  const activeCount = tableRows.length;

  return (
    <ChartFigure
      label="Daily token volume, stacked by model, most expensive band first."
      summary={
        range === 'all'
          ? `${data.length} day${data.length === 1 ? '' : 's'}, oldest first, one column per model.`
          : `The ${activeCount} active day${activeCount === 1 ? '' : 's'} of the last ${range}, oldest first, one column per model.`
      }
      columns={[
        { header: 'Date', cell: (row: Row) => formatDateLong(String(row.date)) },
        ...models.map((model) => ({
          header: displayModel(model),
          cell: (row: Row) => formatTokens(Number(row[model] ?? 0)),
        })),
        {
          header: 'Total',
          cell: (row: Row) =>
            formatTokens(models.reduce((sum, model) => sum + Number(row[model] ?? 0), 0)),
        },
      ]}
      rows={tableRows}
    >
      <div className="chart-wrap" style={{ minHeight: height }}>
        {/* Keyed by range too, so a new range grows in like a fresh load
            rather than morphing thirty columns into sixty. */}
        <ResponsiveContainer width="100%" height={height} key={`${replayKey ?? 0}:${range}`}>
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
              tickFormatter={(v: number) => formatTokens(v)}
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
    </ChartFigure>
  );
}
