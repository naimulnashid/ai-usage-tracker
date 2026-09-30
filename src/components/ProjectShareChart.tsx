'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import { OTHER_PROJECTS_COLOR } from '@/lib/project-colors';
import { ChartFigure } from './ChartFigure';
import { useProjectColors } from './ProjectColors';
import { useProvider } from './ProviderScope';

interface Slice {
  id: string;
  name: string;
  cost: number;
  tokens: number;
  share: number;
  fill: string;
  /** True for the remainder slice, the only one that is not one project. */
  remainder: boolean;
  /** How many projects this slice stands for: 1, or the remainder's count. */
  projects: number;
  /** How many of those are projects you have hidden. */
  hidden: number;
}

/** "the 3 smallest projects and 2 hidden, combined" - what a remainder is. */
function remainderNote(slice: Slice): string {
  const small = slice.projects - slice.hidden;
  const smallest = small === 1 ? 'the smallest project' : `the ${small} smallest projects`;
  if (!slice.hidden) return `${smallest}, combined`;
  if (!small)
    return slice.hidden === 1 ? '1 hidden project' : `${slice.hidden} hidden projects, combined`;
  return `${smallest} and ${slice.hidden} hidden, combined`;
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
 * Each project is drawn in its own colour - the one you chose, else its logo's
 * dominant colour, else a fallback (src/lib/project-colors.ts) - so a slice
 * here and a band in Daily spend by project are the same project at a glance.
 *
 * It used to be a single-hue ramp by RANK, because a project had no colour of
 * its own to borrow. The ring still reads in rank order - it starts at twelve
 * o'clock with the largest - but the colour now says WHICH project, which is
 * what the legend beside it was having to do alone.
 *
 * "Others" stays outside every palette, in a neutral grey: a remainder has no
 * identity, and its summed cost can exceed the slice above it.
 */
const OTHERS_FILL = OTHER_PROJECTS_COLOR;

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
        boxShadow: 'var(--shadow-pop)',
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
      {slice.remainder && (
        <div style={{ color: 'var(--text-faint)', marginTop: 4, fontSize: 13 }}>
          {remainderNote(slice)}
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
 *
 * **Projects you have hidden are summed into that remainder too**, never named
 * and never dropped. Naming one would undo hiding it; dropping it would make
 * the ring disagree with the total in its own centre. When the remainder is
 * nothing but hidden projects it is called "Hidden" rather than "Others".
 */
export function ProjectShareChart({
  projects,
  totalCost,
  hiddenIds,
  height = 260,
}: {
  projects: ProjectSummary[];
  totalCost: number;
  /** Projects hidden from the list; see hidden-projects.ts. */
  hiddenIds?: ReadonlySet<string>;
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
  const router = useRouter();
  const provider = useProvider();
  const { colorOf } = useProjectColors();
  const hrefOf = (id: string) => `${provider.basePath}/projects/${encodeURIComponent(id)}`;

  const ranked = projects
    .filter((project) => project.combined.costUsd > 0)
    .sort((a, b) => b.combined.costUsd - a.combined.costUsd);

  if (!ranked.length || totalCost <= 0) return null;

  const listed = hiddenIds?.size ? ranked.filter((p) => !hiddenIds.has(p.id)) : ranked;
  const hidden = hiddenIds?.size ? ranked.filter((p) => hiddenIds.has(p.id)) : [];

  /*
   * Collapse only when the tail is worth collapsing. At exactly MAX_SLICES + 1
   * projects an "Others" slice would stand for a single project — hiding its
   * name behind a euphemism and saving no room at all — so that case shows
   * them all. The legend is therefore never more than MAX_SLICES + 1 rows,
   * which is what `skeleton.projectDonut` is measured against.
   *
   * A hidden project forces the remainder slice to exist, and that slot comes
   * out of the named ones, so the ten-row cap holds either way.
   */
  const collapse = hidden.length > 0 || listed.length > MAX_SLICES + 1;
  const shown = collapse ? listed.slice(0, MAX_SLICES) : listed;
  const rest = collapse ? [...listed.slice(MAX_SLICES), ...hidden] : [];

  const data: Slice[] = shown.map((project) => ({
    id: project.id,
    name: project.name,
    cost: project.combined.costUsd,
    tokens: project.combined.totalTokens,
    share: (project.combined.costUsd / totalCost) * 100,
    fill: colorOf(project.id),
    remainder: false,
    projects: 1,
    hidden: 0,
  }));

  if (rest.length) {
    const cost = rest.reduce((sum, project) => sum + project.combined.costUsd, 0);
    data.push({
      id: '__others__',
      name: hidden.length === rest.length ? 'Hidden' : 'Others',
      cost,
      tokens: rest.reduce((sum, project) => sum + project.combined.totalTokens, 0),
      share: (cost / totalCost) * 100,
      fill: OTHERS_FILL,
      remainder: true,
      projects: rest.length,
      hidden: hidden.length,
    });
  }
  const remainder = data.find((slice) => slice.remainder);

  /*
   * Plain functions, not useCallback: they close over `data`, which is built
   * after the early return above, so a hook here would change hook order
   * between renders. Ten sectors do not care about the identity churn.
   */
  const onSliceEnter = (_entry: unknown, index: number) => setActive(data[index]?.id ?? null);
  const onSliceLeave = () => setActive(null);
  /*
   * A slice is a way into its project, like the card below it. "Others" is
   * not one project, so it goes nowhere. The legend's links are the keyboard
   * route to the same pages - SVG sectors are not focusable one by one.
   */
  const onSliceClick = (_entry: unknown, index: number) => {
    const slice = data[index];
    if (slice && !slice.remainder) router.push(hrefOf(slice.id));
  };

  return (
    <ChartFigure
      label="Share of spend by project."
      summary={
        remainder
          ? `${shown.length ? `The top ${shown.length === 1 ? 'project' : `${shown.length} projects`}, then ` : ''}${remainder.name}: ${remainderNote(remainder)}.`
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
                onClick={onSliceClick}
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
                    cursor={slice.remainder ? 'default' : 'pointer'}
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
          {data.map((slice) => {
            const content = (
              <>
                <span
                  className="donut-legend-swatch"
                  style={{ background: slice.fill }}
                  aria-hidden
                />
                {/* A monogram here would draw "O" and read as a project called
                  Others. The remainder gets a count instead - even a remainder
                  of one, which a hidden project can make. */}
                {slice.remainder ? (
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
              </>
            );
            return (
              <li
                className={
                  'donut-legend-row' +
                  (active === slice.id ? ' is-active' : '') +
                  (active !== null && active !== slice.id ? ' is-dim' : '')
                }
                key={slice.id}
                // Pointing at a row picks its slice out of the ring, as
                // pointing at the slice picks out the row.
                onMouseEnter={() => setActive(slice.id)}
                onMouseLeave={onSliceLeave}
              >
                {slice.remainder ? (
                  <div className="donut-legend-entry">{content}</div>
                ) : (
                  <Link className="donut-legend-entry" href={hrefOf(slice.id)}>
                    {content}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </ChartFigure>
  );
}
