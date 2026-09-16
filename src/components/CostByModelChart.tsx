'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  // Recharts v3: `payload` lives on TooltipContentProps, not TooltipProps.
  type TooltipContentProps,
} from 'recharts';
import type { UsageCell } from '@/lib/types';
import { displayModel, formatDuration, formatTokens, formatUsd } from '@/lib/format';
import { modelColor } from '@/lib/model-colors';

interface Row {
  model: string;
  label: string;
  cost: number;
  tokens: number;
  runtime: number;
  unpriced: boolean;
  /** Percent of all priced spend in this chart. Precomputed, so the tooltip
      never has to reach outside the one row Recharts hands it. */
  share: number;
}

function ChartTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as Row;
  return (
    <div
      style={{
        background: '#131317',
        border: '1px solid #2e2e37',
        borderRadius: 10,
        padding: '12px 15px',
        boxShadow: '0 12px 34px rgba(0,0,0,0.95)',
        fontSize: 14,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          color: '#fafafa',
          fontWeight: 600,
          marginBottom: 8,
        }}
      >
        <span
          className="model-swatch"
          style={{ background: modelColor(row.model) }}
          aria-hidden
        />
        {row.label}
      </div>
      <div
        className="num"
        style={{ color: modelColor(row.model), fontSize: 21, fontWeight: 650 }}
      >
        {row.unpriced ? 'unpriced' : formatUsd(row.cost)}
      </div>
      {!row.unpriced && (
        <div className="num" style={{ color: '#9a9aa4', marginTop: 4, fontSize: 13.5 }}>
          {row.share.toFixed(1)}% of total cost
        </div>
      )}
      <div className="num" style={{ color: '#9a9aa4', marginTop: 6 }}>
        {formatTokens(row.tokens)} tokens · {formatDuration(row.runtime)}
      </div>
    </div>
  );
}

export function CostByModelChart({
  perModel,
  replayKey,
  height = 260,
}: {
  perModel: Record<string, UsageCell>;
  replayKey?: number;
  height?: number;
}) {
  // Share is against the spend this chart actually draws, so the percentages
  // add up to 100 on screen. Unpriced models contribute no cost and get no
  // share rather than a misleading 0.0%.
  const total = Object.values(perModel).reduce(
    (sum, cell) => sum + (cell.unpriced ? 0 : cell.costUsd),
    0,
  );

  const data: Row[] = Object.entries(perModel)
    .map(([model, cell]) => ({
      model,
      label: displayModel(model),
      cost: cell.costUsd,
      tokens: cell.totalTokens,
      runtime: cell.runtimeSeconds,
      unpriced: cell.unpriced,
      share: total > 0 ? (cell.costUsd / total) * 100 : 0,
    }))
    .filter((row) => row.cost > 0 || row.tokens > 0)
    .sort((a, b) => b.cost - a.cost);

  if (!data.length) {
    return (
      <div style={{ color: 'var(--text-faint)', padding: '40px 0', textAlign: 'center' }}>
        No model usage found.
      </div>
    );
  }

  return (
    <div className="chart-wrap" style={{ minHeight: height }}>
      <ResponsiveContainer width="100%" height={height} key={replayKey}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 26, bottom: 4, left: 4 }}
        >
          <CartesianGrid stroke="#1e1e24" horizontal={false} />
          <XAxis
            type="number"
            tickFormatter={(v: number) => formatUsd(v, { compact: true })}
            tick={{ fill: '#6b6b75', fontSize: 13 }}
            axisLine={{ stroke: '#1e1e24' }}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            tick={{ fill: '#9a9aa4', fontSize: 14 }}
            axisLine={false}
            tickLine={false}
            width={116}
          />
          <Tooltip content={ChartTooltip} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
          <Bar dataKey="cost" radius={[0, 6, 6, 0]} animationDuration={850} barSize={30}>
            {data.map((row) => (
              <Cell key={row.model} fill={modelColor(row.model)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
