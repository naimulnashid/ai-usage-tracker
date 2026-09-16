'use client';

import type { ActivityStats, SessionRecord, UsageCell } from '@/lib/types';
import { CountUp } from './CountUp';
import { ScoreIcon, type ScoreIconName } from './ScoreIcon';
import {
  displayModel,
  formatCount,
  formatDateShort,
  formatDuration,
  formatHour,
  formatTokens,
  formatUsd,
} from '@/lib/format';
import { modelColor } from '@/lib/model-colors';
import { useProvider } from './ProviderScope';

/**
 * Activity at a glance: twelve cards, read as three rows of four.
 *
 * Each row answers one question, which is why the order is not the order the
 * fields happen to sit in on `ActivityStats`:
 *
 * 1. **What was run** - sessions, messages, the longest single one, and the
 *    model that did most of it.
 * 2. **What it consumed** - the three token buckets, then the heaviest single
 *    session, which is the same arithmetic restricted to one transcript.
 * 3. **When** - days, streaks, and the busiest hour.
 *
 * Unlike the dashboard's other grids this one is **four fixed columns** rather
 * than `auto-fit`, because those rows are the point: a column count that drifts
 * with the window would scramble the grouping. `.score-grid` keeps the rows
 * intact at every width by stepping 4 -> 2 -> 1, and the steps are container
 * queries on the shell rather than viewport media queries - the rail takes
 * 252px out of the page when expanded and 70px when collapsed, so the viewport
 * does not know how much room these cards actually have.
 *
 * Every card holds a flat height at every width, which is what lets the loading
 * skeleton mirror this grid from one constant per agent. Hence `.score-sub-clip`
 * on the record cards: a project name long enough to wrap would put that card a
 * line taller than its row, so it is clipped to one line and the full text goes
 * on the tooltip instead.
 */
export function ScoreCards({
  activity,
  combined,
  replayKey,
}: {
  activity: ActivityStats;
  combined: UsageCell;
  replayKey?: number;
}) {
  const provider = useProvider();
  const cacheWritten = combined.cacheWrite5m + combined.cacheWrite1h;
  const cachedTotal = combined.cacheRead + cacheWritten;
  const capitalisedMessages =
    provider.messageNoun.charAt(0).toUpperCase() + provider.messageNoun.slice(1);

  /**
   * "Aug 11 · My App", naming the kind when it isn't a chat.
   *
   * Date first because this line is clipped rather than wrapped: a project name
   * long enough to overflow loses only its tail, where leading with it would
   * push the date off the card entirely.
   */
  const recordSub = (record: SessionRecord | null): string => {
    if (!record) return 'nothing recorded yet';
    const parts = record.date ? [formatDateShort(record.date)] : [];
    parts.push(record.projectName);
    if (record.isSubagent) parts.push(provider.subagentNoun);
    return parts.join(' · ');
  };

  const cards: Array<{
    label: string;
    icon: ScoreIconName;
    value: React.ReactNode;
    sub?: string;
    /** Hold the sub-label to one line, so the card keeps a flat height. */
    clipSub?: boolean;
    tip?: string;
  }> = [
    // ---- Row 1: what was run ----------------------------------------------
    {
      label: 'Sessions',
      icon: 'sessions',
      value: <CountUp value={activity.sessions} format={formatCount} replayKey={replayKey} />,
      sub: `${formatCount(activity.sessions - activity.subagentSessions)} top-level · ${formatCount(
        activity.subagentSessions,
      )} ${provider.subagentNoun}`,
      tip: provider.sessionTip,
    },
    {
      label: capitalisedMessages,
      icon: 'messages',
      value: <CountUp value={activity.messages} format={formatCount} replayKey={replayKey} />,
      sub: 'de-duplicated API calls',
      tip: provider.messageTip,
    },
    {
      // Reads the live transcripts only: session lists cannot be rebuilt from
      // the daily archive, so a record whose transcript the agent has deleted
      // passes to whatever is left - the window peak hour already lives in.
      label: 'Longest chat',
      icon: 'hourglass',
      value: activity.longestSession ? (
        <CountUp
          value={activity.longestSession.runtimeSeconds}
          format={formatDuration}
          replayKey={replayKey}
        />
      ) : (
        '—'
      ),
      sub: recordSub(activity.longestSession),
      clipSub: true,
      tip:
        'The most active runtime in a single chat, measured the same way as total runtime: ' +
        'gaps between consecutive log lines, dropping any longer than the idle cutoff. Not ' +
        'first-to-last wall clock, which mostly measures leaving a session open. ' +
        `Time spent by ${provider.subagentNoun} threads is not added on top — they run inside ` +
        'this chat’s wall clock, so it is already counted.',
    },
    {
      label: 'Top model',
      icon: 'model',
      value: activity.favoriteModel ? (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            color: modelColor(activity.favoriteModel),
          }}
        >
          <span
            className="model-swatch"
            style={{ background: modelColor(activity.favoriteModel) }}
            aria-hidden
          />
          {displayModel(activity.favoriteModel)}
        </span>
      ) : (
        '—'
      ),
      sub: 'by total tokens',
    },

    // ---- Row 2: what it consumed ------------------------------------------
    {
      label: 'Input tokens',
      icon: 'input',
      value: <CountUp value={combined.input} format={formatTokens} replayKey={replayKey} />,
      sub: 'uncached prompt',
      tip: 'Prompt tokens charged at the full input rate. Anything served from cache is counted under Cached tokens instead, which is why this figure looks small next to it.',
    },
    {
      label: 'Output tokens',
      icon: 'output',
      value: <CountUp value={combined.output} format={formatTokens} replayKey={replayKey} />,
      sub: provider.hasReasoningTokens
        ? `incl. ${formatTokens(combined.reasoning ?? 0)} reasoning`
        : 'generated',
      tip: provider.hasReasoningTokens
        ? 'Tokens generated by the model — the most expensive bucket per token. Reasoning tokens are already inside this figure and billed at the same rate, so they are not added on top.'
        : 'Tokens generated by the model — the most expensive bucket per token. Some sessions may understate this; see the note above.',
    },
    {
      label: 'Cached tokens',
      icon: 'cache',
      value: <CountUp value={cachedTotal} format={formatTokens} replayKey={replayKey} />,
      sub: provider.hasCacheWrites
        ? `${formatTokens(combined.cacheRead)} read · ${formatTokens(cacheWritten)} written`
        : 'prompt served from cache',
      tip: provider.hasCacheWrites
        ? 'Cache reads plus cache writes. Reads are billed at roughly a tenth of the input rate and writes at a premium, but the sheer volume of reads makes this the largest driver of total cost.'
        : 'Prompt tokens served from cache, billed at a tenth of the input rate. Codex resends the whole conversation every turn, so this is nearly all of the prompt — and, despite the discount, where most of the cost sits.',
    },
    {
      // Live transcripts only, for the same reason as Longest chat above.
      label: 'Peak tokens',
      icon: 'peak',
      value: activity.peakSession ? (
        <CountUp
          value={activity.peakSession.totalTokens}
          format={formatTokens}
          replayKey={replayKey}
        />
      ) : (
        '—'
      ),
      sub: recordSub(activity.peakSession),
      clipSub: true,
      tip: activity.peakSession
        ? `The heaviest single chat: ${formatTokens(activity.peakSession.totalTokens)} tokens ` +
          `costing ${formatUsd(activity.peakSession.costUsd)}, in ${activity.peakSession.projectName}` +
          (activity.peakSession.subagentThreads > 0
            ? `, including the ${formatCount(activity.peakSession.subagentThreads)} ` +
              `${provider.subagentNoun} thread(s) it spawned`
            : '') +
          '. Every bucket, after de-duplication. Read from the transcripts still on disk, so ' +
          'unlike the totals above it is not restored from the archive.'
        : 'The heaviest single chat, once there is one.',
    },

    // ---- Row 3: when ------------------------------------------------------
    {
      label: 'Active days',
      icon: 'calendar',
      value: <CountUp value={activity.activeDays} format={formatCount} replayKey={replayKey} />,
      sub: 'days with any usage',
    },
    {
      label: 'Current streak',
      icon: 'flame',
      value: (
        <CountUp
          value={activity.currentStreakDays}
          format={(n) => `${Math.round(n)}d`}
          replayKey={replayKey}
        />
      ),
      sub: 'consecutive days',
      tip: 'Consecutive active days ending today. Resets to zero once a full day passes with no usage.',
    },
    {
      label: 'Longest streak',
      icon: 'trophy',
      value: (
        <CountUp
          value={activity.longestStreakDays}
          format={(n) => `${Math.round(n)}d`}
          replayKey={replayKey}
        />
      ),
      sub: 'consecutive days',
    },
    {
      label: 'Peak hour',
      icon: 'clock',
      value: <span className="num">{formatHour(activity.peakHour)}</span>,
      sub: `most ${provider.messageNoun}`,
      tip: 'Busiest hour of the day by message count, in your configured local offset (settings.json).',
    },
  ];

  return (
    <div className="score-grid-wrap">
      <div className="score-grid">
        {cards.map((card, index) => (
          <div
            key={card.label}
            className="card card-hover score-card rise"
            style={{ animationDelay: `${index * 35}ms` }}
          >
            <div className="score-label">
              <ScoreIcon name={card.icon} />
              {card.label}
              {card.tip && (
                <span className="info-tip" data-tip={card.tip} tabIndex={0} aria-label={card.tip}>
                  i
                </span>
              )}
            </div>
            <div className="score-value">{card.value}</div>
            {card.sub && (
              <div
                className={card.clipSub ? 'score-sub score-sub-clip' : 'score-sub'}
                title={card.clipSub ? card.sub : undefined}
              >
                {card.sub}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
