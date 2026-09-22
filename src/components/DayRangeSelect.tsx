'use client';

import { DAY_RANGES, isDayRange, lastActiveDate, type DayRange } from '@/lib/day-range';
import type { DailyEntry } from '@/lib/types';
import { formatDateStamp } from '@/lib/format';

/**
 * The range picker in a daily chart's panel head.
 *
 * A native `<select>`, deliberately. Its list is drawn by the browser, so it
 * cannot be clipped by a panel, raise a scrollbar or sit under the next card -
 * every one of which a hand-built popover in this layout has done at least
 * once (see the overflow notes in CLAUDE.md). It is also the one dropdown a
 * phone already knows how to present.
 */
export function DayRangeSelect({
  value,
  onChange,
  label,
}: {
  value: DayRange;
  onChange: (range: DayRange) => void;
  /** Names the control for assistive tech - it has no visible label. */
  label: string;
}) {
  return (
    <select
      className="range-select"
      value={value}
      aria-label={label}
      onChange={(event) => {
        const next = event.target.value;
        if (isDayRange(next)) onChange(next);
      }}
    >
      {DAY_RANGES.map((range) => (
        <option key={range.value} value={range.value}>
          {range.label}
        </option>
      ))}
    </select>
  );
}

/**
 * What a daily chart says when its range holds nothing.
 *
 * For a window it also says when the last activity was, because the obvious
 * next question - "so when did I last use it?" - is otherwise one more click
 * away, and a project nobody has touched this month is common.
 */
export function NoDaysInRange({ daily, range }: { daily: DailyEntry[]; range: DayRange }) {
  const last = range === 'all' ? null : lastActiveDate(daily);
  return (
    <div style={{ color: 'var(--text-faint)', padding: '40px 0', textAlign: 'center' }}>
      {range === 'all' ? (
        'No dated activity found.'
      ) : (
        <>
          No activity in the last {range} days.
          {last && <> The most recent was on {formatDateStamp(last)}.</>}
        </>
      )}
    </div>
  );
}
