'use client';

import { useModelColor } from './UsageProvider';
import type { DailyEntry } from '@/lib/types';
import {
  displayModel,
  formatCount,
  formatDateLong,
  formatDuration,
  formatTokens,
  formatUsd,
} from '@/lib/format';
import { useProvider } from './ProviderScope';
import { InfoTip } from './InfoTip';
import { RUNTIME_TOOLTIP } from './Notices';

/**
 * The per-model daily breakdown: one row per (day, model) pair, newest first.
 */
export function ModelDailyTable({ daily }: { daily: DailyEntry[] }) {
  const colorOf = useModelColor();
  const provider = useProvider();
  const rows = [...daily]
    .sort((a, b) => b.date.localeCompare(a.date))
    .flatMap((entry) =>
      Object.entries(entry.perModel)
        .filter(([, cell]) => cell.totalTokens > 0 || cell.runtimeSeconds > 0)
        .sort((a, b) => b[1].costUsd - a[1].costUsd)
        .map(([model, cell]) => ({ date: entry.date, model, cell })),
    );

  if (!rows.length) {
    return (
      <div style={{ color: 'var(--text-faint)', padding: '30px 0', textAlign: 'center' }}>
        No per-model activity to break down.
      </div>
    );
  }

  return (
    <div className="table-scroll">
      <table className="data">
        <thead>
          <tr>
            <th>Date</th>
            <th>Model</th>
            <th>{provider.messageNoun === 'requests' ? 'Requests' : 'Messages'}</th>
            <th>Input</th>
            <th>Output</th>
            {/* Same rule as ModelBreakdownTable: a column only appears where the
                agent actually reports it, rather than as permanent zeroes. */}
            {provider.hasCacheWrites && <th>Cache write</th>}
            <th>{provider.cacheReadLabel}</th>
            <th>
              Runtime <InfoTip label="About runtime" text={RUNTIME_TOOLTIP} />
            </th>
            <th>Cost</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ date, model, cell }, index) => {
            const isNewDay = index === 0 || rows[index - 1].date !== date;
            return (
              <tr
                key={`${date}-${model}`}
                style={
                  isNewDay && index > 0
                    ? { borderTop: '1px solid var(--border-bright)' }
                    : undefined
                }
              >
                <td style={{ color: isNewDay ? 'var(--text)' : 'var(--text-faint)' }}>
                  {isNewDay ? formatDateLong(date) : ''}
                </td>
                <td>
                  <span className="cell-model" style={{ justifyContent: 'flex-end' }}>
                    <span
                      className="model-swatch"
                      style={{ background: colorOf(model) }}
                      aria-hidden
                    />
                    {displayModel(model)}
                    {cell.unpriced && <span className="unpriced-pill">UNPRICED</span>}
                  </span>
                </td>
                <td className="num">{formatCount(cell.messages)}</td>
                <td className="num">{formatTokens(cell.input)}</td>
                <td className="num">{formatTokens(cell.output)}</td>
                {provider.hasCacheWrites && (
                  <td className="num">{formatTokens(cell.cacheWrite5m + cell.cacheWrite1h)}</td>
                )}
                <td className="num">{formatTokens(cell.cacheRead)}</td>
                <td className="num">{formatDuration(cell.runtimeSeconds)}</td>
                <td className="num cost-cell">{cell.unpriced ? '—' : formatUsd(cell.costUsd)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
