'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useUsage } from '@/components/UsageProvider';
import { useProvider } from '@/components/ProviderScope';
import { CountUp } from '@/components/CountUp';
import { HeadlineValue } from '@/components/HeadlineValue';
import { DailySpendChart } from '@/components/DailySpendChart';
import { CostByModelChart } from '@/components/CostByModelChart';
import { ScoreCards } from '@/components/ScoreCards';
import { ActivityHeatmap } from '@/components/ActivityHeatmap';
import { ModelPricesTable } from '@/components/ModelPricesTable';
import { MODEL_PRICES_SUB, WeekTrend } from '@/components/PageParts';
import { DailyTokensByModelChart } from '@/components/DailyTokensByModelChart';
import { DailySpendByModelChart } from '@/components/DailySpendByModelChart';
import { DayRangeSelect } from '@/components/DayRangeSelect';
import { CombinedDailyTable, ModelDailyTable } from '@/components/DailyTables';
import { ModelBreakdownTable } from '@/components/ModelBreakdownTable';
import { SessionsTable } from '@/components/SessionsTable';
import { RUNTIME_TOOLTIP, UnpricedNotice } from '@/components/Notices';
import { ProjectLogo } from '@/components/ProjectLogo';
import { InfoTip } from '@/components/InfoTip';
import {
  decodeParam,
  formatCount,
  formatDateLong,
  formatDateStamp,
  formatDuration,
  formatTokens,
  formatUsd,
} from '@/lib/format';
import { DEFAULT_DAY_RANGE, reportToday, weekOverWeek, type DayRange } from '@/lib/day-range';

export default function ProjectDetailPage() {
  const provider = useProvider();
  // Every skeleton height on this page is a `detail` one: the panels it shares
  // with the overview are genuinely shorter here, because a project uses fewer
  // models than the agent does. See SkeletonMetrics.detail.
  const detail = provider.skeleton.detail;
  const params = useParams<{ id: string }>();
  // `useParams` already decodes, so decoding again is both unnecessary and a
  // way to throw URIError on a literal `%` in the URL - which used to blank
  // the page. Decode only if it is still encoded, and never throw.
  const projectId = decodeParam(String(params?.id ?? ''));
  const { report, initialLoading, error, version } = useUsage();
  // The overview's two range pickers, for this project's copies of the charts.
  const [tokensRange, setTokensRange] = useState<DayRange>(DEFAULT_DAY_RANGE);
  const [spendRange, setSpendRange] = useState<DayRange>(DEFAULT_DAY_RANGE);

  if (initialLoading) {
    return (
      /*
       * Mirrors the loaded page section by section, like the other two
       * skeletons. It used to be three grey boxes for a nine-section page, so
       * everything jumped when the data landed.
       *
       * The heights come from `provider.skeleton.detail`. Read the caveat
       * there before trusting them: unlike the overview's, they are derived
       * rather than measured, and the two long tables are deliberately capped.
       */
      <div style={{ paddingTop: 26 }} role="status" aria-busy="true">
        <span className="sr-only">Loading this project…</span>

        {/* "← All projects" - 24px is the real link's height at every width.
            It was 17px, which quietly shifted the whole page up by ~10px. */}
        <div className="skeleton" style={{ height: 24, width: 110, marginBottom: 16 }} />

        {/* Headline card: logo, name, path, then the three totals. */}
        <div className="skeleton" style={{ height: detail.headline, marginBottom: 22 }} />

        {/* The overview's sections, in the overview's order - see the page
            below - then this page's own three tables. */}
        <div className="skeleton" style={{ height: detail.dailySpend, marginBottom: 22 }} />
        <div className="skeleton" style={{ height: detail.costByModel, marginBottom: 22 }} />

        {/* "Activity" heading. */}
        <div
          style={{
            height: 21,
            marginTop: 40,
            marginBottom: 18,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <div className="skeleton" style={{ height: 13, width: 110 }} />
        </div>

        {/* The same twelve cards as the overview, in the same container. */}
        <div className="score-grid-wrap">
          <div className="score-grid">
            {Array.from({ length: 12 }, (_, i) => (
              <div key={i} className="skeleton" style={{ height: provider.skeleton.scoreCard }} />
            ))}
          </div>
        </div>

        <div className="skeleton" style={{ height: detail.heatmap, marginBottom: 22 }} />
        <div className="skeleton" style={{ height: detail.dailyTokens, marginBottom: 22 }} />
        <div className="skeleton" style={{ height: detail.dailySpendByModel, marginBottom: 22 }} />
        <div className="skeleton" style={{ height: detail.tokenTable, marginBottom: 22 }} />
        <div className="skeleton" style={{ height: detail.modelPrices, marginBottom: 22 }} />

        {/* This page's own tables. The first two are capped: their height
            follows the number of days, which the skeleton cannot know. */}
        <div className="skeleton" style={{ height: detail.combinedTable, marginBottom: 22 }} />
        <div className="skeleton" style={{ height: detail.modelDailyTable, marginBottom: 22 }} />
        <div className="skeleton" style={{ height: detail.sessionsTable }} />
      </div>
    );
  }

  if (error || !report) {
    return (
      <div style={{ paddingTop: 34 }}>
        {/* The project's name lives in the report, which is what failed - so
            the title names the agent instead of guessing. */}
        <h1 className="sr-only">{provider.label} project</h1>
        <div className="notice notice-warn">
          <div>{error ?? 'No data.'}</div>
        </div>
      </div>
    );
  }

  const project = report.projects.find((candidate) => candidate.id === projectId);

  if (!project) {
    return (
      <div style={{ paddingTop: 34 }}>
        <div className="notice notice-warn">
          <div>
            <strong>Project not found.</strong>
            <div style={{ marginTop: 6 }}>
              No project with id <code>{projectId}</code> in the current scan.
            </div>
          </div>
        </div>
        <Link href={`${provider.basePath}/projects`} className="btn" style={{ marginTop: 8 }}>
          ← Back to projects
        </Link>
      </div>
    );
  }

  const { combined, perModel, daily, sessions } = project;
  const peakDay = daily.reduce(
    (best, entry) => (entry.combined.costUsd > (best?.combined.costUsd ?? 0) ? entry : best),
    daily[0],
  );
  const activeDays = daily.filter((entry) => entry.combined.costUsd > 0).length;
  const avgPerDay = activeDays > 0 ? combined.costUsd / activeDays : 0;
  const shareOfTotal =
    report.global.combined.costUsd > 0
      ? (combined.costUsd / report.global.combined.costUsd) * 100
      : 0;
  const unpricedHere = [
    ...new Set(
      Object.entries(perModel)
        .filter(([, cell]) => cell.unpriced)
        .map(([model]) => model),
    ),
  ];
  const today = reportToday(report.generatedAt, report.settings.localUtcOffsetHours);
  const trendPct = weekOverWeek(daily);

  return (
    <div className="page-enter" style={{ paddingTop: 26 }}>
      <Link
        href={`${provider.basePath}/projects`}
        style={{ fontSize: 14.5, color: 'var(--text-muted)', display: 'inline-block' }}
      >
        ← All projects
      </Link>

      {/* ---- Combined-models totals for this project --------------------- */}
      <section className="card headline-card rise" style={{ marginTop: 16 }}>
        <div style={{ marginBottom: 26 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <ProjectLogo name={project.name} size={52} />
            <h1
              style={{
                fontSize: 'clamp(26px, 3vw, 34px)',
                fontWeight: 640,
                letterSpacing: '-0.025em',
                margin: 0,
              }}
            >
              {project.name}
            </h1>
          </div>
          <div
            style={{ fontSize: 14, color: 'var(--text-faint)', marginTop: 6 }}
            title={project.cwd ?? project.id}
          >
            {project.cwd ?? project.id}
          </div>
          {project.mergedFrom.length > 0 && (
            <div style={{ fontSize: 13.5, color: 'var(--text-muted)', marginTop: 8 }}>
              Includes usage merged from{' '}
              {project.mergedFrom.map((source, i) => (
                <span key={source}>
                  {i > 0 && ', '}
                  <code style={{ color: 'var(--accent)' }}>{source}</code>
                </span>
              ))}{' '}
              <InfoTip
                label="About merged projects"
                text={`${provider.label} keys projects by working directory, so renaming or moving a folder starts a new project and splits its history. These directories are stitched back together by ${provider.projectsFile}.`}
              />
            </div>
          )}
        </div>

        <div className="headline-grid">
          <div>
            {/* The agent's own label: on Codex this figure is API-equivalent,
                not a bill, and the label is the only place the page says so. */}
            <div className="headline-label">{provider.costLabel}</div>
            <HeadlineValue value={combined.costUsd} replayKey={version} />
            <div className="headline-meta">
              {shareOfTotal.toFixed(1)}% of all spend · {formatUsd(avgPerDay)} avg / active day
            </div>
          </div>

          <div>
            <div className="headline-side-label">Total tokens</div>
            <div className="headline-side-value num">
              <CountUp value={combined.totalTokens} format={formatTokens} replayKey={version} />
            </div>
            <div className="headline-side-sub">
              {formatCount(combined.messages)} {provider.messageNoun} ·{' '}
              {formatCount(sessions.length)} sessions
            </div>
          </div>

          <div>
            <div className="headline-side-label">
              Total runtime <InfoTip label="About runtime" text={RUNTIME_TOOLTIP} />
            </div>
            <div className="headline-side-value num">
              <CountUp
                value={combined.runtimeSeconds}
                format={formatDuration}
                replayKey={version}
              />
            </div>
            <div className="headline-side-sub">across {formatCount(activeDays)} active days</div>
          </div>
        </div>
      </section>

      <div className="rise" style={{ animationDelay: '60ms' }}>
        <UnpricedNotice models={unpricedHere} />
      </div>

      {/*
       * ---- The overview's sections, in the overview's order ------------------
       *
       * Same panels, same names, same components, with this project's data -
       * so the two pages read as one page at two scopes. What only a project
       * page has (the per-day tables and the sessions) comes after, at the
       * bottom.
       */}
      <section className="card panel rise" style={{ animationDelay: '100ms' }}>
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Daily combined spend</h2>
            <p className="panel-sub">
              All models, this project. Days marked in red sit well above trend.
            </p>
          </div>
          {peakDay && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>Peak day</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>
                {formatDateLong(peakDay.date)}{' '}
                <span className="num" style={{ color: 'var(--accent)' }}>
                  {formatUsd(peakDay.combined.costUsd)}
                </span>
              </div>
            </div>
          )}
        </div>
        <DailySpendChart daily={daily} replayKey={version} />
      </section>

      <section className="card panel rise" style={{ animationDelay: '140ms' }}>
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Cost by model</h2>
            <p className="panel-sub">
              Estimated spend per model in this project.
              {report.pricingLastVerified && (
                <>
                  {' '}
                  Rates from <code>{provider.pricingFile}</code>, last verified{' '}
                  {formatDateStamp(report.pricingLastVerified)}.
                </>
              )}
            </p>
          </div>
        </div>
        <CostByModelChart perModel={perModel} replayKey={version} />
      </section>

      {/* ---- Activity: score cards, the heat map, then the daily charts --- */}
      {project.activity && (
        <>
          <h2 className="section-title" style={{ marginTop: 40 }}>
            Activity
          </h2>
          <ScoreCards activity={project.activity} combined={combined} replayKey={version} />
        </>
      )}

      <section className="card panel rise" style={{ animationDelay: '60ms' }}>
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Daily activity</h2>
            <p className="panel-sub">
              Spend per day over the last 6 months. Darker means a more expensive day.
            </p>
          </div>
          <WeekTrend pct={trendPct} />
        </div>
        <ActivityHeatmap
          daily={daily}
          generatedAt={report.generatedAt}
          offsetHours={report.settings.localUtcOffsetHours}
          weekStartsOn={report.settings.weekStartsOn}
          expandHref={`${provider.basePath}/projects/${encodeURIComponent(project.id)}/activity`}
        />
      </section>

      <section className="card panel rise" style={{ animationDelay: '70ms' }}>
        <div className="panel-head">
          <div className="panel-head-main">
            <h2 className="panel-title">Daily tokens by model</h2>
            <p className="panel-sub">
              Stacked by model, most expensive at the bottom — so the darker the base of a column,
              the more of that day went on premium tokens.
            </p>
          </div>
          <DayRangeSelect
            value={tokensRange}
            onChange={setTokensRange}
            label="Days shown in Daily tokens by model"
          />
        </div>
        <DailyTokensByModelChart
          daily={daily}
          range={tokensRange}
          today={today}
          replayKey={version}
        />
      </section>

      <section className="card panel rise" style={{ animationDelay: '80ms' }}>
        <div className="panel-head">
          <div className="panel-head-main">
            <h2 className="panel-title">Daily spend by model</h2>
            <p className="panel-sub">
              The same columns priced instead of counted — so a day that looks modest above and tall
              here went on the expensive models.
            </p>
          </div>
          <DayRangeSelect
            value={spendRange}
            onChange={setSpendRange}
            label="Days shown in Daily spend by model"
          />
        </div>
        <DailySpendByModelChart
          daily={daily}
          range={spendRange}
          today={today}
          replayKey={version}
        />
      </section>

      <section className="card panel rise" style={{ animationDelay: '90ms' }}>
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Token detail by model</h2>
            <p className="panel-sub">
              {provider.hasCacheWrites
                ? 'Cache writes are split by TTL internally and priced separately; the column below shows their sum.'
                : 'Input counts only the uncached remainder of each prompt — the cached part is billed at a tenth of the rate and has its own column.'}
            </p>
          </div>
        </div>
        <ModelBreakdownTable perModel={perModel} combined={combined} />
      </section>

      <section className="card panel rise" style={{ animationDelay: '100ms' }}>
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Model prices</h2>
            <p className="panel-sub">{MODEL_PRICES_SUB}</p>
          </div>
        </div>
        <ModelPricesTable perModel={perModel} rates={report.modelRates} />
      </section>

      {/* ---- This project's own tables ------------------------------------ */}
      <section className="card panel rise" style={{ animationDelay: '110ms' }}>
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Daily totals, combined</h2>
            <p className="panel-sub">Newest first. The bar shows each day against the peak.</p>
          </div>
        </div>
        <CombinedDailyTable daily={daily} peakCost={peakDay?.combined.costUsd ?? 0} />
      </section>

      <section className="card panel rise" style={{ animationDelay: '120ms' }}>
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Daily breakdown by model</h2>
            <p className="panel-sub">One row per day and model, newest first.</p>
          </div>
        </div>
        <ModelDailyTable daily={daily} />
      </section>

      <section className="card panel rise" style={{ animationDelay: '130ms' }}>
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Sessions</h2>
            <p className="panel-sub">Every transcript file in this project, ranked by cost.</p>
          </div>
        </div>
        <SessionsTable sessions={sessions} />
      </section>
    </div>
  );
}
