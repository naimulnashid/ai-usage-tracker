'use client';

import type { UsageCell } from '@/lib/types';
import {
  displayModel,
  formatCount,
  formatDuration,
  formatTokens,
  formatUsd,
} from '@/lib/format';
import { modelColor } from '@/lib/model-colors';
import { useProvider } from './ProviderScope';
import { InfoTip } from './InfoTip';
import { RUNTIME_TOOLTIP } from './Notices';

const REASONING_TIP =
  'Reasoning tokens are already counted inside Output and billed at the output rate — they are shown separately, not added on top. That is why the columns do not sum to the total.';

/**
 * Per-model token detail.
 *
 * The columns follow the agent: Claude Code splits cache writes by TTL and
 * prices them, Codex reports none and instead breaks out reasoning tokens. A
 * column of permanent zeroes reads as "we measured nothing" rather than "this
 * does not exist here", so each is shown only where it means something.
 */
export function ModelBreakdownTable({
  perModel,
  combined,
}: {
  perModel: Record<string, UsageCell>;
  combined: UsageCell;
}) {
  const provider = useProvider();
  const rows = Object.entries(perModel).sort((a, b) => b[1].costUsd - a[1].costUsd);

  return (
    <div className="table-scroll">
      <table className="data">
        <thead>
          <tr>
            <th>Model</th>
            <th>{provider.messageNoun === 'requests' ? 'Requests' : 'Messages'}</th>
            <th>Input</th>
            <th>Output</th>
            {provider.hasReasoningTokens && (
              <th>
                Reasoning{' '}
                <InfoTip label="About reasoning tokens" text={REASONING_TIP} />
              </th>
            )}
            {provider.hasCacheWrites && <th>Cache write</th>}
            <th>{provider.cacheReadLabel}</th>
            <th>Total tokens</th>
            <th>
              Runtime{' '}
              <InfoTip label="About runtime" text={RUNTIME_TOOLTIP} />
            </th>
            <th>Cost</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([model, cell]) => (
            <tr key={model}>
              <td>
                <span className="cell-model">
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
              {provider.hasReasoningTokens && (
                <td className="num">{formatTokens(cell.reasoning ?? 0)}</td>
              )}
              {provider.hasCacheWrites && (
                <td className="num">{formatTokens(cell.cacheWrite5m + cell.cacheWrite1h)}</td>
              )}
              <td className="num">{formatTokens(cell.cacheRead)}</td>
              <td className="num">{formatTokens(cell.totalTokens)}</td>
              <td className="num">{formatDuration(cell.runtimeSeconds)}</td>
              <td className="num cost-cell">
                {cell.unpriced ? '—' : formatUsd(cell.costUsd)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>All models</td>
            <td className="num">{formatCount(combined.messages)}</td>
            <td className="num">{formatTokens(combined.input)}</td>
            <td className="num">{formatTokens(combined.output)}</td>
            {provider.hasReasoningTokens && (
              <td className="num">{formatTokens(combined.reasoning ?? 0)}</td>
            )}
            {provider.hasCacheWrites && (
              <td className="num">
                {formatTokens(combined.cacheWrite5m + combined.cacheWrite1h)}
              </td>
            )}
            <td className="num">{formatTokens(combined.cacheRead)}</td>
            <td className="num">{formatTokens(combined.totalTokens)}</td>
            <td className="num">{formatDuration(combined.runtimeSeconds)}</td>
            <td className="num cost-cell">{formatUsd(combined.costUsd)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
