'use client';

import { useState } from 'react';
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
} from 'recharts';
import type { ProjectSummary } from '@/lib/types';
import { formatTokens, formatUsd } from '@/lib/format';
import { ProjectLogo } from '@/components/ProjectLogo';
import { ChartFigure } from './ChartFigure';

interface Slice {
  id: string;
  name: string;
  cost: number;
  tokens: number;
  share: number;
  fill: string;
  /** How many projects this slice stands for. 1 for a real project, N for the
      "Others" remainder, which is the only slice that is not one project. */
  projects: number;
}

/**
 * How many projects get a slice of their own before the tail is collapsed.
 *
 * Nine, because past that the ring is mostly slivers a degree or two wide —
 * unreadable, unhoverable, and they crowd the legend without adding anything a
 * 0.6% share was going to tell you. The ranked list below still enumerates
 * every project; this panel is the summary, not the record.
 */
const MAX_SLICES = 9;

/**
 * Projects have no intrinsic colour the way models do — a model's shade encodes
 * its price, and there is no equivalent fact about a project. So the ramp
 * encodes RANK: the largest project takes the agent's accent at full strength
 * and each one below it is mixed further back toward the panel, which makes the
 * ring read in the same order as the list underneath it.
 *
 * `color-mix` against `var(--accent)` rather than literals, so the whole ring
 * re-themes with the agent — see the accent rule in globals.css.
 */
function rampColor(index: number, count: number): string {
  const t = count > 1 ? index / (count - 1) : 0;
  const strength = Math.round(100 - t * 68); // 100% down to 32%
  return `color-mix(in srgb, var(--accent) ${strength}%, var(--surface))`;
}

/**
 * "Others" is deliberately OUTSIDE the ramp, in a neutral grey.
 *
 * The ramp means rank, and a remainder has no rank — its summed cost can even
 * exceed the slice above it, which would make a faint colour read as a lie. A
 * neutral says what it is: everything not ranked above.
 */
const OTHERS_FILL = 'color-mix(in srgb, var(--text-faint) 55%, var(--surface))';

function ChartTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const slice = payload[0].payload as Slice;
  return (
    <div
      style={{
        background: 'var(--tooltip-bg)',
        border: '1px solid var(--border-bright)',
        borderRadius: 10,
        padding: '12px 15px',
        boxShadow: '0 12px 34px rgba(0,0,0,0.95)',
        fontSize: 14,
        minWidth: 180,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          color: 'var(--text)',
          fontWeight: 600,
          marginBottom: 8,
        }}
      >
        <span className="model-swatch" style={{ background: slice.fill }} aria-hidden />
        {slice.name}
      </div>
      <div className="num" style={{ color: 'var(--accent)', fontSize: 21, fontWeight: 650 }}>
        {slice.share.toFixed(1)}%
      </div>
      <div className="num" style={{ color: 'var(--text-muted)', marginTop: 6 }}>
        {formatUsd(slice.cost)} · {formatTokens(slice.tokens)} tokens
      </div>
      {slice.projects > 1 && (
        <div style={{ color: 'var(--text-faint)', marginTop: 4, fontSize: 13 }}>
          the {slice.projects} smallest projects, combined
        </div>
      )}
    </div>
  );
}

/**
 * Share of spend by project, as a donut with its legend alongside.
 *
 * The ring answers "is this one project or twelve" in a glance, which the
 * ranked list below cannot — a list of twelve rows looks the same whether the
 * top one is 61% of spend or 15%.
 *
 * Only the top MAX_SLICES get a slice; the tail is summed into a neutral
 * "Others". Shares are still taken against the WHOLE total, so the slices add
 * up to 100% and no spend is dropped on the floor.
 */
export function ProjectShareChart({
  projects,
  totalCost,
  height = 260,
}: {
  projects: ProjectSummary[];
  totalCost: number;
  height?: number;
}) {
  /*
   * Which slice the pointer is on, so everything else can recede.
   *
   * Declared above the early return because it is a hook and the empty case
   * bails out below it. Recharts' own `activeIndex` is not enough here: the
   * legend has to dim in step with the ring, and that is React state, not
   * something the chart can reach.
   */
  const [active, setActive] = useState<string | null>(null);

  const ranked = projects
    .filter((project) => project.combined.costUsd > 0)
    .sort((a, b) => b.combined.costUsd - a.combined.costUsd);

  if (!ranked.length || totalCost <= 0) return null;

  /*
   * Collapse only when the tail is worth collapsing. At exactly MAX_SLICES + 1
   * projects an "Others" slice would stand for a single project — hiding its
   * name behind a euphemism and saving no room at all — so that case shows
   * them all. The legend is therefore never more than MAX_SLICES + 1 rows,
   * which is what `skeleton.projectDonut` is measured against.
   */
  const collapse = ranked.length > MAX_SLICES + 1;
  const shown = collapse ? ranked.slice(0, MAX_SLICES) : ranked;
  const rest = collapse ? ranked.slice(MAX_SLICES) : [];

  const data: Slice[] = shown.map((project, index) => ({
    id: project.id,
    name: project.name,
    cost: project.combined.costUsd,
    tokens: project.combined.totalTokens,
    share: (project.combined.costUsd / totalCost) * 100,
    fill: rampColor(index, shown.length),
    projects: 1,
  }));

  if (rest.length) {
    const cost = rest.reduce((sum, project) => sum + project.combined.costUsd, 0);
    data.push({
      id: '__others__',
      name: 'Others',
      cost,
      tokens: rest.reduce((sum, project) => sum + project.combined.totalTokens, 0),
      share: (cost / totalCost) * 100,
      fill: OTHERS_FILL,
      projects: rest.length,
    });
  }

  /*
   * Plain functions, not useCallback: they close over `data`, which is built
   * after the early return above, so a hook here would change hook order
   * between renders. Ten sectors do not care about the identity churn.
   */
  const onSliceEnter = (_entry: unknown, index: number) =>
    setActive(data[index]?.id ?? null);
  const onSliceLeave = () => setActive(null);

  return (
    <ChartFigure
      label="Share of spend by project."
      summary={
        collapse
          ? `Top ${MAX_SLICES} projects, with the remaining ${rest.length} summed as Others.`
          : `All ${ranked.length} project${ranked.length === 1 ? '' : 's'}.`
      }
      columns={[
        { header: 'Project', cell: (slice: Slice) => slice.name },
        { header: 'Spend', cell: (slice: Slice) => formatUsd(slice.cost) },
        { header: 'Share', cell: (slice: Slice) => `${slice.share.toFixed(1)}%` },
        { header: 'Tokens', cell: (slice: Slice) => formatTokens(slice.tokens) },
      ]}
      rows={data}
    >
    <div className="donut-layout">
      <div className="donut-ring" style={{ height }}>
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie
              data={data}
              dataKey="cost"
              nameKey="name"
              innerRadius="62%"
              outerRadius="94%"
              paddingAngle={1.2}
              stroke="var(--surface)"
              strokeWidth={2}
              animationDuration={850}
              animationEasing="ease-out"
              onMouseEnter={onSliceEnter}
              onMouseLeave={onSliceLeave}
            >
              {data.map((slice) => (
                <Cell
                  key={slice.id}
                  fill={slice.fill}
                  /*
                   * Fading toward the panel rather than filtering: the panel is
                   * near-black, so a lower fill-opacity IS "darker", and it
                   * costs nothing next to an SVG filter on ten sectors. The
                   * fade itself is a CSS transition on .recharts-sector — see
                   * the .donut-ring rules in globals.css.
                   */
                  fillOpacity={active === null || active === slice.id ? 1 : 0.28}
                />
              ))}
            </Pie>
            <Tooltip content={ChartTooltip} />
          </PieChart>
        </ResponsiveContainer>

        {/* Sits in the hole rather than as a Recharts label, so it can use the
            real type scale and never fights the ring for space. */}
        <div className="donut-center" aria-hidden>
          <div className="donut-center-value num">{formatUsd(totalCost)}</div>
          {/* `ranked`, not `data` - the slice count stops at ten once the tail
              is collapsed, and "across 10 projects" under a total covering
              twelve of them would be plainly wrong. */}
          <div className="donut-center-label">
            across {ranked.length} {ranked.length === 1 ? 'project' : 'projects'}
          </div>
        </div>
      </div>

      <ul className="donut-legend">
        {data.map((slice) => (
          <li
            className={
              'donut-legend-row' +
              (active === slice.id ? ' is-active' : '') +
              (active !== null && active !== slice.id ? ' is-dim' : '')
            }
            key={slice.id}
          >
            <span className="donut-legend-swatch" style={{ background: slice.fill }} aria-hidden />
            {/* A monogram here would draw "O" and read as a project called
                Others. The remainder gets a count instead. */}
            {slice.projects > 1 ? (
              <span className="donut-legend-more num" aria-hidden>
                +{slice.projects}
              </span>
            ) : (
              <ProjectLogo name={slice.name} size={22} />
            )}
            <span className="donut-legend-name" title={slice.name}>
              {slice.name}
            </span>
            <span className="donut-legend-cost num">{formatUsd(slice.cost)}</span>
            <span className="donut-legend-share num">{slice.share.toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
    </ChartFigure>
  );
}
