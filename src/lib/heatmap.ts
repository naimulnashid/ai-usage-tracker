/**
 * Where every day of the activity heat map goes.
 *
 * Two layouts share this. The overview draws ONE strip, the last
 * `HEATMAP_WEEKS` weeks ending on the report's "today". The full-history page
 * draws the same strip repeated downwards, oldest first, starting on the first
 * of the month the earliest recorded day falls in - so every strip is the
 * overview's width and cell size, and more history makes the page taller
 * rather than the cells smaller.
 *
 * Day keys are bare `YYYY-MM-DD` strings, handled as midnight UTC throughout,
 * the same as the parser buckets them.
 *
 * Client-safe: no `node:` imports.
 */
import { isActiveDay } from './day-range';
import type { DailyEntry, WeekStart } from './types';

/**
 * Weeks in one strip: six months. The overview draws exactly one, and it drives
 * the grid template inline, so the CSS never hard-codes it.
 */
export const HEATMAP_WEEKS = 26;

const WEEK_START_DAY: Record<WeekStart, number> = { sunday: 0, monday: 1, saturday: 6 };
const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const DAY_MS = 86_400_000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export interface HeatmapCell {
  date: string;
  entry: DailyEntry | undefined;
  /**
   * Outside the span being drawn: after "today", or before the full page's
   * first day. Kept in the grid so every strip has the same columns, but not
   * shown and not counted.
   */
  outside: boolean;
  column: number;
  row: number;
}

export interface HeatmapStrip {
  cells: HeatmapCell[];
  months: Array<{ label: string; column: number }>;
  /** First and last day this strip actually shows. */
  firstDate: string;
  lastDate: string;
}

export interface HeatmapLayout {
  strips: HeatmapStrip[];
  /** The dearest day shown, which the colour ramp is scaled against. */
  max: number;
  total: number;
  activeDays: number;
}

/** Index of the configured first weekday in `Date#getUTCDay()` terms. */
export function weekStartDay(weekStartsOn: WeekStart | undefined): number {
  return WEEK_START_DAY[weekStartsOn ?? 'monday'] ?? WEEK_START_DAY.monday;
}

/**
 * "Today" as midnight UTC of the user's calendar day - from the report's
 * `generatedAt`, never the clock, in the offset the parser bucketed days with.
 */
export function heatmapToday(generatedAt: string, offsetHours: number): Date {
  const today = new Date(Date.parse(generatedAt) + offsetHours * 3_600_000);
  today.setUTCHours(0, 0, 0, 0);
  return today;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** The first day of the week `date` falls in. */
function weekOf(date: Date, startDay: number): Date {
  return addDays(date, -((date.getUTCDay() - startDay + 7) % 7));
}

/** The first day of the overview's window: the oldest cell it draws. */
export function windowStart(today: Date, startDay: number): Date {
  return addDays(weekOf(today, startDay), -(HEATMAP_WEEKS - 1) * 7);
}

/** The earliest dated day that recorded anything, or null. */
export function earliestActiveDate(daily: DailyEntry[]): string | null {
  let earliest: string | null = null;
  for (const entry of daily) {
    if (!ISO_DAY.test(entry.date) || !isActiveDay(entry)) continue;
    if (earliest === null || entry.date < earliest) earliest = entry.date;
  }
  return earliest;
}

/**
 * True when some recorded day is older than the overview's window - which is
 * exactly when the overview is not showing everything, and so when it offers
 * the full-history page.
 */
export function hasHistoryBeforeWindow(
  daily: DailyEntry[],
  today: Date,
  startDay: number,
): boolean {
  const earliest = earliestActiveDate(daily);
  return earliest !== null && earliest < isoDay(windowStart(today, startDay));
}

/**
 * Where the full-history page starts: the first of the month holding the
 * earliest recorded day. A month boundary rather than the day itself, so the
 * first strip opens on a whole month instead of a stray week of blanks.
 * Null when nothing dated was recorded.
 */
export function fullHistoryStart(daily: DailyEntry[]): string | null {
  const earliest = earliestActiveDate(daily);
  return earliest === null ? null : `${earliest.slice(0, 7)}-01`;
}

/**
 * Lays out `stripCount` strips of `HEATMAP_WEEKS` weeks from `firstWeek`,
 * showing only the days from `from` (inclusive, or everything when null) to
 * `today`.
 */
function layout(
  daily: DailyEntry[],
  firstWeek: Date,
  stripCount: number,
  from: Date | null,
  today: Date,
): HeatmapLayout {
  const byDate = new Map(daily.map((entry) => [entry.date, entry]));
  const strips: HeatmapStrip[] = [];
  let max = 0;
  let total = 0;
  let activeDays = 0;

  for (let s = 0; s < stripCount; s += 1) {
    const cells: HeatmapCell[] = [];
    const months: HeatmapStrip['months'] = [];
    let lastMonth = -1;
    let firstDate = '';
    let lastDate = '';

    for (let column = 0; column < HEATMAP_WEEKS; column += 1) {
      const weekStart = addDays(firstWeek, (s * HEATMAP_WEEKS + column) * 7);
      let labelled = false;

      for (let row = 0; row < 7; row += 1) {
        const day = addDays(weekStart, row);
        const date = isoDay(day);
        const outside =
          day.getTime() > today.getTime() || (from !== null && day.getTime() < from.getTime());
        const entry = byDate.get(date);

        if (!outside) {
          // A column is named after the month of its first SHOWN day, so a
          // strip opening mid-week on the 1st does not say the month before.
          // Each strip names its own first column, since it is read alone.
          if (!labelled) {
            labelled = true;
            const month = day.getUTCMonth();
            if (month !== lastMonth) {
              months.push({ label: MONTH_NAMES[month], column });
              lastMonth = month;
            }
          }
          firstDate ||= date;
          lastDate = date;
          if (entry) {
            max = Math.max(max, entry.combined.costUsd);
            total += entry.combined.costUsd;
            if (entry.combined.costUsd > 0) activeDays += 1;
          }
        }

        cells.push({ date, entry, outside, column, row });
      }
    }

    strips.push({ cells, months, firstDate, lastDate });
  }

  return { strips, max, total, activeDays };
}

/**
 * What a strip spans, with years - "Jul 2026 – Dec 2026", or one month alone.
 * The month labels inside a strip carry no year, so on a page of several this
 * is what says which year each one is.
 */
export function stripLabel(strip: HeatmapStrip): string {
  const month = (iso: string) => `${MONTH_NAMES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
  const first = month(strip.firstDate);
  const last = month(strip.lastDate);
  return first === last ? first : `${first} – ${last}`;
}

/** The overview's single strip: the last `HEATMAP_WEEKS` weeks. */
export function recentHeatmap(daily: DailyEntry[], today: Date, startDay: number): HeatmapLayout {
  return layout(daily, windowStart(today, startDay), 1, null, today);
}

/**
 * Every day from `from` to `today`, as as many strips as that takes. The last
 * strip runs on past today with blank columns, so it keeps the others' width.
 */
export function fullHeatmap(
  daily: DailyEntry[],
  from: string,
  today: Date,
  startDay: number,
): HeatmapLayout {
  const start = new Date(`${from}T00:00:00Z`);
  const firstWeek = weekOf(start, startDay);
  const weeks =
    Math.floor((weekOf(today, startDay).getTime() - firstWeek.getTime()) / DAY_MS / 7) + 1;
  const stripCount = Math.max(1, Math.ceil(weeks / HEATMAP_WEEKS));
  return layout(daily, firstWeek, stripCount, start, today);
}
