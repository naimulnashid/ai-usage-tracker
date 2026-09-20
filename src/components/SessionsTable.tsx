'use client';

import { useState } from 'react';
import type { SessionSummary } from '@/lib/types';
import { displayModel, formatCount, formatDuration, formatTokens, formatUsd } from '@/lib/format';
import { modelColor } from '@/lib/model-colors';
import { useProvider } from './ProviderScope';
import { InfoTip } from './InfoTip';
import { RUNTIME_TOOLTIP } from './Notices';

const INITIAL_ROWS = 12;

export function SessionsTable({ sessions }: { sessions: SessionSummary[] }) {
  const provider = useProvider();
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? sessions : sessions.slice(0, INITIAL_ROWS);

  if (!sessions.length) {
    return (
      <div style={{ color: 'var(--text-faint)', padding: '30px 0', textAlign: 'center' }}>
        No sessions recorded.
      </div>
    );
  }

  return (
    <>
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Session</th>
              <th>Models</th>
              <th>{provider.messageNoun === 'requests' ? 'Requests' : 'Messages'}</th>
              <th>Tokens</th>
              <th>
                Runtime <InfoTip label="About runtime" text={RUNTIME_TOOLTIP} />
              </th>
              <th>
                Open span{' '}
                <InfoTip
                  label="About open span"
                  text="First-to-last timestamp of the session file. Includes idle time, so it is always at least the runtime figure - shown for comparison only."
                />
              </th>
              <th>Cost</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((session) => (
              <tr key={session.file}>
                <td>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                    {/*
                     * Codex keeps a human-readable name per thread; Claude Code
                     * does not. Where there is one it is the more useful label,
                     * with the id kept alongside so a row can still be traced
                     * back to its file.
                     */}
                    {session.title && (
                      <span
                        style={{
                          fontWeight: 550,
                          maxWidth: 260,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={session.title}
                      >
                        {session.title}
                      </span>
                    )}
                    <code style={{ fontSize: 13.5, color: 'var(--text-muted)' }}>
                      {session.sessionId.slice(0, 8)}
                    </code>
                    {session.isSubagent && (
                      <span
                        style={{
                          fontSize: 11.5,
                          fontWeight: 700,
                          letterSpacing: '0.05em',
                          color: 'var(--text-faint)',
                          border: '1px solid var(--border-bright)',
                          borderRadius: 999,
                          padding: '2px 8px',
                          whiteSpace: 'nowrap',
                        }}
                        title={
                          session.subagentKind
                            ? `Spawned by ${provider.label} as a "${session.subagentKind}" subagent. Billed separately, and counted in these totals.`
                            : undefined
                        }
                      >
                        {provider.subagentNoun.toUpperCase()}
                      </span>
                    )}
                  </span>
                </td>
                <td>
                  <span style={{ display: 'inline-flex', gap: 5, justifyContent: 'flex-end' }}>
                    {session.models.map((model) => (
                      <span
                        key={model}
                        className="model-swatch"
                        title={displayModel(model)}
                        style={{ background: modelColor(model) }}
                        aria-hidden
                      />
                    ))}
                    {/* The swatches are colour only; this cell would otherwise
                        be empty to a screen reader. */}
                    <span className="sr-only">
                      {session.models.map((model) => displayModel(model)).join(', ')}
                    </span>
                  </span>
                </td>
                <td className="num">{formatCount(session.messages)}</td>
                <td className="num">{formatTokens(session.totalTokens)}</td>
                <td className="num">{formatDuration(session.runtimeSeconds)}</td>
                <td className="num" style={{ color: 'var(--text-faint)' }}>
                  {formatDuration(session.spanSeconds)}
                </td>
                <td className="num cost-cell">{formatUsd(session.costUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sessions.length > INITIAL_ROWS && (
        <button
          type="button"
          className="btn"
          style={{ marginTop: 16 }}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Show fewer' : `Show all ${formatCount(sessions.length)} sessions`}
        </button>
      )}
    </>
  );
}
