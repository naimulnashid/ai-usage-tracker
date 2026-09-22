/**
 * How many days a daily chart shows.
 *
 * The two stacked charts carry a range picker: the last 30 days (the default),
 * the last 60, or every day on record. With a long archive the full history is
 * hundreds of columns a pixel or two wide, which is the reason the picker
 * exists.
 *
 * **A window is calendar days ending on the report's own "today"**, not the
 * last N days that happen to have data. So "Last 30 days" is always exactly 30
 * columns, and a day with no work is an empty column rather than a gap the axis
 * silently closes up - over a fixed window, the idle days are part of the
 * answer. "All days" keeps the old behaviour: every day on record, as recorded.
 *
 * That also means a project nobody has touched this month shows an empty
 * window rather than borrowing the label for some older stretch. "Last 30
 * days" over a window that ended in July would be the kind of label this
 * dashboard does not allow itself.
 *
 * Client-safe: no `node:` imports.
 */
import type { DailyEntry, UsageCell } from './types';

export type DayRange = '30' | '60' | 'all';

export const DAY_RANGES: ReadonlyArray<{ value: DayRange; label: string }> = [
  { value: '30', label: 'Last 30 days' },
  { value: '60', label: 'Last 60 days' },
  { value: 'all', label: 'All days' },
];

export const DEFAULT_DAY_RANGE: DayRange = '30';

export function isDayRange(value: string): value is DayRange {
  return DAY_RANGES.some((range) => range.value === value);
}

export function dayRangeLabel(range: DayRange): string {
  return DAY_RANGES.find((option) => option.value === range)?.label ?? range;
}

const DAY_MS = 86_400_000;

/**
 * The report's "today" as `YYYY-MM-DD`, in the offset the parser bucketed days
 * with - the same derivation as the heat map's last column.
 *
 * From `generatedAt`, never the clock: the report is the moment the data
 * describes, and reading the clock while rendering makes the render impure.
 * Null when the stamp cannot be read, which callers treat as "show everything".
 */
export function reportToday(generatedAt: string, offsetHours: number): string | null {
  const shifted = Date.parse(generatedAt) + offsetHours * 3_600_000;
  if (!Number.isFinite(shifted) || Math.abs(shifted) > 8.64e15) return null;
  return new Date(shifted).toISOString().slice(0, 10);
}

/**
 * The days a chart shows for `range`, oldest first.
 *
 * A window is filled: every calendar day in it gets an entry, with an empty one
 * standing in for a day nothing was recorded. The `(unknown date)` bucket is
 * not a day, so it has no place in a window; "All days" still carries it, as
 * before.
 */
export function daysInRange(
  daily: DailyEntry[],
  range: DayRange,
  today: string | null,
): DailyEntry[] {
  if (range === 'all' || !today) return daily;
  const end = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(end)) return daily;

  const byDate = new Map(daily.map((entry) => [entry.date, entry]));
  const count = Number(range);
  const days: DailyEntry[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const date = new Date(end - i * DAY_MS).toISOString().slice(0, 10);
    days.push(byDate.get(date) ?? { date, perModel: {}, combined: emptyCell() });
  }
  return days;
}

/** True when a day recorded anything at all - tokens, spend or messages. */
export function isActiveDay(entry: DailyEntry): boolean {
  const { combined } = entry;
  return combined.totalTokens > 0 || combined.costUsd > 0 || combined.messages > 0;
}

/** The most recent dated day with any activity, for "nothing in this window". */
export function lastActiveDate(daily: DailyEntry[]): string | null {
  for (let i = daily.length - 1; i >= 0; i -= 1) {
    const entry = daily[i];
    if (/^\d{4}-\d{2}-\d{2}$/.test(entry.date) && isActiveDay(entry)) return entry.date;
  }
  return null;
}

/**
 * Per-model and combined totals over a run of days.
 *
 * This is what a legend beside those days has to describe. With a window
 * applied, the agent's all-time totals would sit next to thirty columns and
 * claim shares of a total the chart is not showing - the same mismatch as a
 * cost beside a token share (see "A legend's figures must share the share's
 * denominator" in CLAUDE.md), one level up.
 */
export function sumDays(days: DailyEntry[]): {
  perModel: Record<string, UsageCell>;
  combined: UsageCell;
} {
  const perModel: Record<string, UsageCell> = {};
  const combined = emptyCell();
  for (const day of days) {
    addCell(combined, day.combined);
    for (const [model, cell] of Object.entries(day.perModel)) {
      perModel[model] ??= emptyCell();
      addCell(perModel[model], cell);
    }
  }
  return { perModel, combined };
}

function emptyCell(): UsageCell {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite5m: 0,
    cacheWrite1h: 0,
    messages: 0,
    runtimeSeconds: 0,
    totalTokens: 0,
    costUsd: 0,
    unpriced: false,
  };
}

function addCell(into: UsageCell, cell: UsageCell): void {
  into.input += cell.input;
  into.output += cell.output;
  into.cacheRead += cell.cacheRead;
  into.cacheWrite5m += cell.cacheWrite5m;
  into.cacheWrite1h += cell.cacheWrite1h;
  // Only an agent that reports reasoning has the key; keep it absent for the
  // one that does not, rather than claiming a measured zero. See usage-math.ts.
  if (cell.reasoning !== undefined) into.reasoning = (into.reasoning ?? 0) + cell.reasoning;
  into.messages += cell.messages;
  into.runtimeSeconds += cell.runtimeSeconds;
  into.totalTokens += cell.totalTokens;
  into.costUsd += cell.costUsd;
  into.unpriced ||= cell.unpriced;
}
