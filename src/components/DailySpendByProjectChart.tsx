'use client';

import Link from 'next/link';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import type { DailyEntry, ProjectSummary } from '@/lib/types';
import { formatDateLong, formatDateShort, formatUsd } from '@/lib/format';
import { daysInRange, isActiveDay, type DayRange } from '@/lib/day-range';
import { OTHER_PROJECTS_COLOR } from '@/lib/project-colors';
import { ChartFigure } from './ChartFigure';
import { NoDaysInRange } from './DayRangeSelect';
import { ProjectLogo } from './ProjectLogo';
import { useProjectColors } from './ProjectColors';
import { useProvider } from './ProviderScope';

/**
 * How many projects get a band of their own. The rest - and every project you
 * have hidden - are summed into one "Other" band, so the chart stays readable
 * and still adds up to the day's whole spend.
 */
const MAX_BANDS = 8;

const OTHER_KEY = 'other';

interface Series {
  /** Recharts reads a dotted dataKey as a path, so series are keyed `p0`, `p1`... */
  key: string;
  id: string | null;
  name: string;
  color: string;
  cost: number;
  /** For "Other": how many projects it stands for. */
  projects: number;
}

type Row = { date: string } & Record<string, number | string>;

function ChartTooltip({
  active,
  payload,
  label,
  series,
}: TooltipContentProps & { series: Series[] }) {
  if (!active || !payload?.length) return null;
  const byKey = new Map(series.map((s) => [s.key, s]));
  // Largest first, and no zero rows: a stack of nine projects at "$0.00"
  // buries the one that mattered that day.
  const entries = payload
    .filter((entry) => typeof entry.value === 'number' && entry.value > 0)
    .sort((a, b) => (b.value as number) - (a.value as number));
  const total = entries.reduce((sum, entry) => sum + (entry.value as number), 0);
  const idle = entries.length === 0;

  return (
    <div
      style={{
        background: 'var(--tooltip-bg)',
        border: '1px solid var(--border-bright)',
        borderRadius: 10,
        padding: '12px 15px',
        boxShadow: 'var(--shadow-pop)',
        fontSize: 14,
        minWidth: 230,
      }}
    >
      <div style={{ color: 'var(--text)', fontWeight: 600, marginBottom: 9 }}>
        {formatDateLong(String(label))}
      </div>
      {entries.map((entry) => {
        const s = byKey.get(String(entry.dataKey));
        return (
          <div
            key={String(entry.dataKey)}
            style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 5 }}
          >
            <span
              style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)' }}
            >
              <span className="model-swatch" style={{ background: s?.color }} aria-hidden />
              {s?.name ?? String(entry.dataKey)}
            </span>
            <span className="num" style={{ color: 'var(--text)', fontWeight: 550 }}>
              {formatUsd(entry.value as number)}
            </span>
          </div>
        );
      })}
      <div
        style={{
          borderTop: idle ? 'none' : '1px solid var(--border-bright)',
          marginTop: idle ? 0 : 9,
          paddingTop: idle ? 0 : 8,
          display: 'flex',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <span style={{ color: 'var(--text-muted)' }}>{idle ? 'No activity' : 'Total'}</span>
        {!idle && (
          <span className="num" style={{ color: 'var(--accent)', fontWeight: 650 }}>
            {formatUsd(total)}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Daily spend, stacked by project - which project the money went on, day by
 * day. The project twin of Daily spend by model, drawn as areas rather than
 * columns because what it shows is work moving from one project to the next.
 *
 * Every project is drawn in its own colour (useProjectColors), the same one it
 * has in the Projects page's donut. The largest project over the days shown
 * sits at the bottom of the stack, and the legend runs in the same order.
 *
 * Like the model charts, **the ranking is over the days in `range`**: it
 * decides which projects get a band and the order of the stack. A project
 * that was the biggest all-time but idle this month has no band in "Last 30
 * days".
 */
export function DailySpendByProjectChart({
  daily,
  projects,
  hiddenIds,
  range,
  today,
  replayKey,
  height = 300,
}: {
  /** The agent-wide days - they set the axis, so no project can add a column. */
  daily: DailyEntry[];
  projects: ProjectSummary[];
  /** Projects hidden from the list: summed into Other, never named. */
  hiddenIds: ReadonlySet<string>;
  range: DayRange;
  today: string | null;
  replayKey?: number;
  height?: number;
}) {
  const provider = useProvider();
  const { colorOf } = useProjectColors();
  const days = daysInRange(daily, range, today);
  const dates = new Set(days.map((day) => day.date));

  // Each project's spend per day, over the days shown only.
  const costs = projects.map((project) => {
    const byDate = new Map<string, number>();
    let cost = 0;
    for (const day of project.daily) {
      if (!dates.has(day.date) || day.combined.costUsd <= 0) continue;
      byDate.set(day.date, day.combined.costUsd);
      cost += day.combined.costUsd;
    }
    return { project, byDate, cost };
  });
  const ranked = costs
    .filter((entry) => entry.cost > 0 && !hiddenIds.has(entry.project.id))
    .sort((a, b) => b.cost - a.cost);
  const hidden = costs.filter((entry) => entry.cost > 0 && hiddenIds.has(entry.project.id));

  // As the donut does: at exactly one more than the cap, "Other" would stand
  // for a single project, so name it instead.
  const collapse = hidden.length > 0 || ranked.length > MAX_BANDS + 1;
  const banded = collapse ? ranked.slice(0, MAX_BANDS) : ranked;
  const rest = collapse ? [...ranked.slice(MAX_BANDS), ...hidden] : [];

  const series: Series[] = banded.map((entry, index) => ({
    key: `p${index}`,
    id: entry.project.id,
    name: entry.project.name,
    color: colorOf(entry.project.id),
    cost: entry.cost,
    projects: 1,
  }));
  if (rest.length) {
    series.push({
      key: OTHER_KEY,
      id: null,
      name: hidden.length === rest.length ? 'Hidden' : 'Other',
      color: OTHER_PROJECTS_COLOR,
      cost: rest.reduce((sum, entry) => sum + entry.cost, 0),
      projects: rest.length,
    });
  }

  if (!series.length) return <NoDaysInRange daily={daily} range={range} />;

  const data: Row[] = days.map((day) => {
    const row: Row = { date: day.date };
    banded.forEach((entry, index) => {
      row[`p${index}`] = entry.byDate.get(day.date) ?? 0;
    });
    if (rest.length) {
      row[OTHER_KEY] = rest.reduce((sum, entry) => sum + (entry.byDate.get(day.date) ?? 0), 0);
    }
    return row;
  });

  const tableRows = data.filter((_, index) => isActiveDay(days[index]));
  const hrefOf = (id: string) => `${provider.basePath}/projects/${encodeURIComponent(id)}`;

  return (
    <ChartFigure
      label="Daily spend, stacked by project, largest project first."
      summary={
        range === 'all'
          ? `${data.length} day${data.length === 1 ? '' : 's'}, oldest first, one column per project.`
          : `The ${tableRows.length} active day${tableRows.length === 1 ? '' : 's'} of the last ${range}, oldest first, one column per project.`
      }
      columns={[
        { header: 'Date', cell: (row: Row) => formatDateLong(String(row.date)) },
        ...series.map((s) => ({
          header: s.name,
          cell: (row: Row) => formatUsd(Number(row[s.key] ?? 0)),
        })),
        {
          header: 'Total',
          cell: (row: Row) =>
            formatUsd(series.reduce((sum, s) => sum + Number(row[s.key] ?? 0), 0)),
        },
      ]}
      rows={tableRows}
    >
      <div className="chart-wrap" style={{ minHeight: height }}>
        <ResponsiveContainer width="100%" height={height} key={`${replayKey ?? 0}:${range}`}>
          <AreaChart data={data} margin={{ top: 10, right: 12, bottom: 4, left: 4 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatDateShort}
              tick={{ fill: 'var(--text-faint)', fontSize: 13 }}
              axisLine={{ stroke: 'var(--border)' }}
              tickLine={false}
              minTickGap={20}
              dy={6}
            />
            <YAxis
              tickFormatter={(v: number) => formatUsd(v, { compact: true })}
              tick={{ fill: 'var(--text-faint)', fontSize: 13 }}
              axisLine={false}
              tickLine={false}
              width={64}
            />
            <Tooltip
              content={(props) => <ChartTooltip {...props} series={series} />}
              cursor={{ stroke: 'var(--accent)', strokeWidth: 1, strokeDasharray: '4 4' }}
            />
            {series.map((s, index) => (
              <Area
                key={s.key}
                // Smooth between dates, but MONOTONE: unlike a plain spline it
                // never overshoots, so a run of idle days stays flat at zero
                // and no curve dips below a day's real value between points.
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stackId="projects"
                stroke={s.color}
                fill={s.color}
                fillOpacity={0.72}
                strokeWidth={1.2}
                animationDuration={750}
                animationBegin={index * 45}
                animationEasing="ease-out"
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Chips, in stack order: the colour, the logo where there is one, and
          the name - nothing else, by the owner's choice. The figures are in the
          tooltip and the table fallback. A project chip opens it. */}
      <ul className="project-legend">
        {series.map((s) => {
          const content = (
            <>
              <span className="model-swatch" style={{ background: s.color }} aria-hidden />
              {s.id ? (
                <ProjectLogo name={s.name} size={18} />
              ) : (
                <span className="project-legend-more num" aria-hidden>
                  +{s.projects}
                </span>
              )}
              <span className="project-legend-name">{s.name}</span>
            </>
          );
          return (
            <li key={s.key}>
              {s.id ? (
                <Link className="project-legend-chip" href={hrefOf(s.id)}>
                  {content}
                </Link>
              ) : (
                <span
                  className="project-legend-chip"
                  title={`${s.projects} ${s.projects === 1 ? 'project' : 'projects'}, combined`}
                >
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </ChartFigure>
  );
}
