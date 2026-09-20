'use client';

import type { DailyEntry } from '@/lib/types';
import {
  displayModel,
  formatCount,
  formatDateLong,
  formatDuration,
  formatTokens,
  formatUsd,
} from '@/lib/format';
import { modelColor } from '@/lib/model-colors';
import { useProvider } from './ProviderScope';
import { InfoTip } from './InfoTip';
import { RUNTIME_TOOLTIP } from './Notices';

/**
 * The combined-models daily total: one row per day, all models summed.
 * This is the "what did this project cost me each day" table.
 */
export function CombinedDailyTable({
  daily,
  peakCost,
}: {
  daily: DailyEntry[];
  peakCost: number;
}) {
  const provider = useProvider();
  const rows = [...daily].sort((a, b) => b.date.localeCompare(a.date));
  const totals = rows.reduce(
    (acc, row) => ({
      cost: acc.cost + row.combined.costUsd,
      tokens: acc.tokens + row.combined.totalTokens,
      runtime: acc.runtime + row.combined.runtimeSeconds,
      messages: acc.messages + row.combined.messages,
    }),
    { cost: 0, tokens: 0, runtime: 0, messages: 0 },
  );

  return (
    <div className="table-scroll">
      <table className="data">
        <thead>
          <tr>
            <th>Date</th>
            <th>Models</th>
            <th>{provider.messageNoun === 'requests' ? 'Requests' : 'Messages'}</th>
            <th>Tokens</th>
            <th>
              Runtime{' '}
              <InfoTip label="About runtime" text={RUNTIME_TOOLTIP} />
            </th>
            <th>Cost</th>
            <th style={{ width: 150 }}>Share of peak day</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const share = peakCost > 0 ? (row.combined.costUsd / peakCost) * 100 : 0;
            const models = Object.keys(row.perModel).filter(
              (m) => row.perModel[m].totalTokens > 0,
            );
            return (
              <tr key={row.date}>
                <td style={{ fontWeight: 550 }}>{formatDateLong(row.date)}</td>
                <td>
                  <span style={{ display: 'inline-flex', gap: 5, justifyContent: 'flex-end' }}>
                    {models.map((model) => (
                      <span
                        key={model}
                        className="model-swatch"
                        title={displayModel(model)}
                        style={{ background: modelColor(model) }}
                        aria-hidden
                      />
                    ))}
                    {/* Colour-only otherwise: this cell would read as empty. */}
                    <span className="sr-only">
                      {models.map((model) => displayModel(model)).join(', ')}
                    </span>
                  </span>
                </td>
                <td className="num">{formatCount(row.combined.messages)}</td>
                <td className="num">{formatTokens(row.combined.totalTokens)}</td>
                <td className="num">{formatDuration(row.combined.runtimeSeconds)}</td>
                <td className="num cost-cell">{formatUsd(row.combined.costUsd)}</td>
                <td>
                  <span
                    style={{
                      display: 'block',
                      height: 7,
                      borderRadius: 999,
                      background: '#141418',
                      overflow: 'hidden',
                    }}
                  >
                    <span
                      style={{
                        display: 'block',
                        height: '100%',
                        width: `${share}%`,
                        background: 'var(--accent)',
                        transition: 'width 500ms var(--ease)',
                      }}
                    />
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td>{rows.length} days</td>
            <td />
            <td className="num">{formatCount(totals.messages)}</td>
            <td className="num">{formatTokens(totals.tokens)}</td>
            <td className="num">{formatDuration(totals.runtime)}</td>
            <td className="num cost-cell">{formatUsd(totals.cost)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/**
 * The per-model daily breakdown: one row per (day, model) pair, newest first.
 */
export function ModelDailyTable({ daily }: { daily: DailyEntry[] }) {
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
              Runtime{' '}
              <InfoTip label="About runtime" text={RUNTIME_TOOLTIP} />
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
                      style={{ background: modelColor(model) }}
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
                  <td className="num">
                    {formatTokens(cell.cacheWrite5m + cell.cacheWrite1h)}
                  </td>
                )}
                <td className="num">{formatTokens(cell.cacheRead)}</td>
                <td className="num">{formatDuration(cell.runtimeSeconds)}</td>
                <td className="num cost-cell">
                  {cell.unpriced ? '—' : formatUsd(cell.costUsd)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
