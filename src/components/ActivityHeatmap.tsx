'use client';

import { useMemo } from 'react';
import type { DailyEntry, WeekStart } from '@/lib/types';
import { formatDateLong, formatDuration, formatTokens, formatUsd } from '@/lib/format';
import { HEATMAP_RAMP, heatmapColor } from '@/lib/model-colors';
import { ChartFigure } from './ChartFigure';

/**
 * Six months of history. `WEEKS` is the single source of truth for the column
 * count — it drives the grid template inline, so the CSS never hard-codes it.
 * Keep `RANGE_LABEL` in step if you change it.
 */
const WEEKS = 26;
const RANGE_LABEL = '6 months';

/** Indexed by `Date#getUTCDay()`: Sunday is 0. */
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
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

interface Cell {
  date: string;
  entry: DailyEntry | undefined;
  future: boolean;
  column: number;
  row: number;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Daily spend over `RANGE_LABEL`, GitHub-style, coloured with the accent ramp.
 *
 * Month labels, weekday labels and cells all live in ONE grid with explicit
 * placement. That is what keeps the three registered with each other: the
 * cells size themselves from the shared column tracks, and the weekday labels
 * inherit the same row heights, so nothing can drift out of alignment.
 *
 * Cells are fluid (`1fr` columns plus `aspect-ratio: 1`) rather than a fixed
 * pixel size, so the grid fills whatever width the panel has and stays square
 * at any width. Note this means fewer weeks produce *larger* cells.
 *
 * Cells use native `title` tooltips deliberately. A styled absolutely
 * positioned tooltip inside this grid would contribute layout width to the
 * scroll container even while hidden — the phantom-scrollbar bug in CLAUDE.md.
 */
export function ActivityHeatmap({
  daily,
  offsetHours,
  weekStartsOn = 'monday',
}: {
  daily: DailyEntry[];
  offsetHours: number;
  /** From settings.json; decides which weekday is row 0. */
  weekStartsOn?: WeekStart;
}) {
  const startDay = WEEK_START_DAY[weekStartsOn] ?? WEEK_START_DAY.monday;
  const dayLabels = useMemo(
    () => Array.from({ length: 7 }, (_, row) => WEEKDAY_NAMES[(startDay + row) % 7]),
    [startDay],
  );

  const { cells, months, max, total, activeDays } = useMemo(() => {
    const byDate = new Map(daily.map((entry) => [entry.date, entry]));

    // "Today" in the same local offset the parser bucketed days with, so the
    // last column lines up with the user's calendar day.
    const today = new Date(Date.now() + offsetHours * 3_600_000);
    today.setUTCHours(0, 0, 0, 0);

    // Row 0 is the configured first day of the week: shift getUTCDay() so that
    // day lands on 0 and the day before it on 6.
    const rowOf = (date: Date) => (date.getUTCDay() - startDay + 7) % 7;

    const currentWeekStart = new Date(today);
    currentWeekStart.setUTCDate(today.getUTCDate() - rowOf(today));

    const flat: Cell[] = [];
    const monthMarks: Array<{ label: string; column: number }> = [];
    let peak = 0;
    let sum = 0;
    let active = 0;
    let lastMonth = -1;

    for (let w = WEEKS - 1; w >= 0; w -= 1) {
      const column = WEEKS - 1 - w;
      const weekStart = new Date(currentWeekStart);
      weekStart.setUTCDate(currentWeekStart.getUTCDate() - w * 7);

      const month = weekStart.getUTCMonth();
      if (month !== lastMonth) {
        monthMarks.push({ label: MONTH_NAMES[month], column });
        lastMonth = month;
      }

      for (let d = 0; d < 7; d += 1) {
        const cellDate = new Date(weekStart);
        cellDate.setUTCDate(weekStart.getUTCDate() + d);
        const key = isoDay(cellDate);
        const entry = byDate.get(key);
        if (entry) {
          peak = Math.max(peak, entry.combined.costUsd);
          sum += entry.combined.costUsd;
          if (entry.combined.costUsd > 0) active += 1;
        }
        flat.push({
          date: key,
          entry,
          future: cellDate.getTime() > today.getTime(),
          column,
          row: d,
        });
      }
    }

    return { cells: flat, months: monthMarks, max: peak, total: sum, activeDays: active };
  }, [daily, offsetHours, startDay]);

  /*
   * The grid is decoration for assistive tech, and the table below carries the
   * data instead.
   *
   * It used to be `role="img"` with a label, which hides every cell - so the
   * ~180 per-day `title`s went with it and a screen reader got the label and
   * nothing else. Active days only: an empty cell says nothing a total does
   * not, and 180 rows of "no usage" is worse than useless to page through.
   */
  const activeCells = cells.filter(
    (cell) => !cell.future && (cell.entry?.combined.costUsd ?? 0) > 0,
  );

  return (
    <ChartFigure
      label={`Daily spend over the last ${RANGE_LABEL}, as a heat map.`}
      summary={`${activeCells.length} day${activeCells.length === 1 ? '' : 's'} with usage.`}
      columns={[
        { header: 'Date', cell: (cell: Cell) => formatDateLong(cell.date) },
        { header: 'Spend', cell: (cell: Cell) => formatUsd(cell.entry?.combined.costUsd ?? 0) },
        {
          header: 'Tokens',
          cell: (cell: Cell) => formatTokens(cell.entry?.combined.totalTokens ?? 0),
        },
        {
          header: 'Runtime',
          cell: (cell: Cell) => formatDuration(cell.entry?.combined.runtimeSeconds ?? 0),
        },
      ]}
      rows={activeCells}
    >
      <div>
        <div className="heatmap-scroll">
          <div
            className="heatmap-plot"
            aria-hidden="true"
            style={{
              gridTemplateColumns: `var(--hm-daycol) repeat(${WEEKS}, minmax(var(--hm-min), 1fr))`,
            }}
          >
            {months.map((mark) => (
              <span
                key={`${mark.label}-${mark.column}`}
                className="heatmap-month"
                style={{ gridColumn: mark.column + 2, gridRow: 1 }}
                aria-hidden
              >
                {mark.label}
              </span>
            ))}

            {dayLabels.map((label, i) => (
              <span
                key={label}
                className="heatmap-day"
                style={{ gridColumn: 1, gridRow: i + 2 }}
                aria-hidden
              >
                {label}
              </span>
            ))}

            {cells.map((cell) => {
              const cost = cell.entry?.combined.costUsd ?? 0;
              const title = cell.future
                ? ''
                : cell.entry
                  ? `${formatDateLong(cell.date)} — ${formatUsd(cost)} · ${formatTokens(
                      cell.entry.combined.totalTokens,
                    )} tokens · ${formatDuration(cell.entry.combined.runtimeSeconds)}`
                  : `${formatDateLong(cell.date)} — no usage`;
              return (
                <span
                  key={cell.date}
                  className="heatmap-cell"
                  title={title}
                  style={{
                    gridColumn: cell.column + 2,
                    gridRow: cell.row + 2,
                    background: cell.future ? 'transparent' : heatmapColor(cost, max),
                    visibility: cell.future ? 'hidden' : 'visible',
                  }}
                />
              );
            })}
          </div>
        </div>

        <div className="heatmap-legend">
          <span>
            {formatUsd(total)} across {activeDays} active {activeDays === 1 ? 'day' : 'days'} in the
            last {RANGE_LABEL}
          </span>
          <span className="heatmap-scale">
            Less
            {HEATMAP_RAMP.map((color) => (
              <span key={color} className="heatmap-swatch" style={{ background: color }} />
            ))}
            More
          </span>
        </div>
      </div>
    </ChartFigure>
  );
}
