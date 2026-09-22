'use client';

import Link from 'next/link';
import { useMemo, type ReactNode } from 'react';
import type { DailyEntry, WeekStart } from '@/lib/types';
import {
  formatDateLong,
  formatDateStamp,
  formatDuration,
  formatTokens,
  formatUsd,
} from '@/lib/format';
import { HEATMAP_RAMP, heatmapColor } from '@/lib/model-colors';
import {
  HEATMAP_WEEKS,
  fullHeatmap,
  hasHistoryBeforeWindow,
  heatmapToday,
  recentHeatmap,
  stripLabel,
  weekStartDay,
  type HeatmapCell,
  type HeatmapLayout,
  type HeatmapStrip,
} from '@/lib/heatmap';
import { ChartFigure } from './ChartFigure';

/** What one strip covers, in words. Keep in step with `HEATMAP_WEEKS`. */
const RANGE_LABEL = '6 months';

/** Indexed by `Date#getUTCDay()`: Sunday is 0. */
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface HeatmapProps {
  daily: DailyEntry[];
  /**
   * The report's `generatedAt`, which decides the last column. Not the clock:
   * reading it while rendering makes the render impure, and the report is the
   * moment the data describes anyway.
   */
  generatedAt: string;
  offsetHours: number;
  /** From settings.json; decides which weekday is row 0. */
  weekStartsOn?: WeekStart;
}

/**
 * Daily spend over the last `RANGE_LABEL`, GitHub-style, coloured with the
 * accent ramp.
 *
 * When there is history older than that, an Expand link at the bottom leads to
 * the full-history page (`FullActivityHeatmap`). It is absent otherwise: a
 * link to a page showing exactly what is already here would be a control that
 * does nothing.
 */
export function ActivityHeatmap({
  daily,
  generatedAt,
  offsetHours,
  weekStartsOn = 'monday',
  expandHref,
}: HeatmapProps & {
  /** The full-history page. */
  expandHref: string;
}) {
  const startDay = weekStartDay(weekStartsOn);
  const { heatmap, hasMore } = useMemo(() => {
    const today = heatmapToday(generatedAt, offsetHours);
    return {
      heatmap: recentHeatmap(daily, today, startDay),
      hasMore: hasHistoryBeforeWindow(daily, today, startDay),
    };
  }, [daily, generatedAt, offsetHours, startDay]);

  return (
    <HeatmapFigure
      heatmap={heatmap}
      startDay={startDay}
      span={`over the last ${RANGE_LABEL}`}
      legend={`in the last ${RANGE_LABEL}`}
    >
      {hasMore && (
        <Link href={expandHref} className="btn heatmap-expand">
          Expand
        </Link>
      )}
    </HeatmapFigure>
  );
}

/**
 * Every recorded day, from the first of the month the earliest one falls in,
 * as the overview's strip repeated downwards - same width, same cell size, so
 * a longer history makes the page taller instead of the cells smaller.
 *
 * Oldest strip first, read like text. Each strip is labelled with the months
 * it spans and their years, since the month labels inside it carry no year.
 */
export function FullActivityHeatmap({
  daily,
  generatedAt,
  offsetHours,
  weekStartsOn = 'monday',
  from,
}: HeatmapProps & {
  /** First day shown, `YYYY-MM-DD` - see `fullHistoryStart`. */
  from: string;
}) {
  const startDay = weekStartDay(weekStartsOn);
  const heatmap = useMemo(
    () => fullHeatmap(daily, from, heatmapToday(generatedAt, offsetHours), startDay),
    [daily, from, generatedAt, offsetHours, startDay],
  );

  const since = formatDateStamp(from);
  return (
    <HeatmapFigure
      heatmap={heatmap}
      startDay={startDay}
      span={`since ${since}`}
      legend={`since ${since}`}
      labelStrips
    />
  );
}

/**
 * The figure both layouts share: the strips, the legend, and the table that
 * carries the same numbers as text.
 *
 * The grid is decoration for assistive tech, and the table carries the data
 * instead. It used to be `role="img"` with a label, which hides every cell -
 * so the ~180 per-day `title`s went with it and a screen reader got the label
 * and nothing else. Active days only: an empty cell says nothing a total does
 * not, and 180 rows of "no usage" is worse than useless to page through.
 */
function HeatmapFigure({
  heatmap,
  startDay,
  span,
  legend,
  labelStrips = false,
  children,
}: {
  heatmap: HeatmapLayout;
  startDay: number;
  /** Completes "Daily spend …" in the caption. */
  span: string;
  /** Completes "$X across N active days …" under the grid. */
  legend: string;
  labelStrips?: boolean;
  /** Centred in the legend row, between the total and the scale. */
  children?: ReactNode;
}) {
  const { strips, max, total, activeDays } = heatmap;
  const dayLabels = useMemo(
    () => Array.from({ length: 7 }, (_, row) => WEEKDAY_NAMES[(startDay + row) % 7]),
    [startDay],
  );
  const activeCells = strips.flatMap((strip) =>
    strip.cells.filter((cell) => !cell.outside && (cell.entry?.combined.costUsd ?? 0) > 0),
  );

  return (
    <ChartFigure
      label={`Daily spend ${span}, as a heat map.`}
      summary={`${activeCells.length} day${activeCells.length === 1 ? '' : 's'} with usage.`}
      columns={[
        { header: 'Date', cell: (cell: HeatmapCell) => formatDateLong(cell.date) },
        {
          header: 'Spend',
          cell: (cell: HeatmapCell) => formatUsd(cell.entry?.combined.costUsd ?? 0),
        },
        {
          header: 'Tokens',
          cell: (cell: HeatmapCell) => formatTokens(cell.entry?.combined.totalTokens ?? 0),
        },
        {
          header: 'Runtime',
          cell: (cell: HeatmapCell) => formatDuration(cell.entry?.combined.runtimeSeconds ?? 0),
        },
      ]}
      rows={activeCells}
    >
      <div>
        {strips.map((strip) => (
          <div key={strip.cells[0]?.date} className="heatmap-strip">
            {labelStrips && (
              <div className="heatmap-strip-label" aria-hidden>
                {stripLabel(strip)}
              </div>
            )}
            <HeatmapGrid strip={strip} dayLabels={dayLabels} max={max} />
          </div>
        ))}

        <div className={`heatmap-legend${children ? ' has-action' : ''}`}>
          <span>
            {formatUsd(total)} across {activeDays} active {activeDays === 1 ? 'day' : 'days'}{' '}
            {legend}
          </span>
          {children}
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

/**
 * One strip of `HEATMAP_WEEKS` columns.
 *
 * Month labels, weekday labels and cells all live in ONE grid with explicit
 * placement. That is what keeps the three registered with each other: the
 * cells size themselves from the shared column tracks, and the weekday labels
 * inherit the same row heights, so nothing can drift out of alignment.
 *
 * Cells are fluid (`1fr` columns plus `aspect-ratio: 1`) rather than a fixed
 * pixel size, so the grid fills whatever width the panel has and stays square
 * at any width. Every strip has the same column count, which is what keeps
 * stacked strips' cells the same size.
 *
 * Cells use native `title` tooltips deliberately. A styled absolutely
 * positioned tooltip inside this grid would contribute layout width to the
 * scroll container even while hidden — the phantom-scrollbar bug in CLAUDE.md.
 */
function HeatmapGrid({
  strip,
  dayLabels,
  max,
}: {
  strip: HeatmapStrip;
  dayLabels: string[];
  max: number;
}) {
  return (
    <div className="heatmap-scroll">
      <div
        className="heatmap-plot"
        aria-hidden="true"
        style={{
          gridTemplateColumns: `var(--hm-daycol) repeat(${HEATMAP_WEEKS}, minmax(var(--hm-min), 1fr))`,
        }}
      >
        {strip.months.map((mark) => (
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

        {strip.cells.map((cell) => {
          const cost = cell.entry?.combined.costUsd ?? 0;
          const title = cell.outside
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
                background: cell.outside ? 'transparent' : heatmapColor(cost, max),
                visibility: cell.outside ? 'hidden' : 'visible',
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
