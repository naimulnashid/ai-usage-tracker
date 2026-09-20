'use client';

import { useUsage } from '@/components/UsageProvider';
import { useProvider } from '@/components/ProviderScope';
import { CountUp } from '@/components/CountUp';
import { DailySpendChart } from '@/components/DailySpendChart';
import { CostByModelChart } from '@/components/CostByModelChart';
import { ModelBreakdownTable } from '@/components/ModelBreakdownTable';
import { ScoreCards } from '@/components/ScoreCards';
import { ActivityHeatmap } from '@/components/ActivityHeatmap';
import { EmptyState } from '@/components/EmptyState';
import { InfoTip } from '@/components/InfoTip';
import { isEmptyReport, noteworthyWarnings } from '@/lib/report-state';
import { DailyTokensByModelChart } from '@/components/DailyTokensByModelChart';
import { DailySpendByModelChart } from '@/components/DailySpendByModelChart';
import { ParseWarnings, RUNTIME_TOOLTIP, UnpricedNotice } from '@/components/Notices';
import {
  displayModel,
  formatCount,
  formatDateShort,
  formatDuration,
  formatTokens,
  formatUsd,
} from '@/lib/format';
import { modelColor } from '@/lib/model-colors';

export default function OverviewPage() {
  const provider = useProvider();
  const { report, initialLoading, error, version } = useUsage();

  if (initialLoading) {
    /*
     * Mirrors the loaded page section for section, in order, at measured
     * heights - so nothing moves when the data lands.
     *
     * The numbers come from `provider.skeleton`, per agent, because the two
     * pages are genuinely different shapes: Codex has two models where Claude
     * Code has five (a one-row stat grid against a three-row one at 997px), a
     * token table ~150px shorter, and a standing cost-basis notice that Claude
     * Code has no equivalent of. One shared set of numbers would be wrong for
     * one agent by a couple of hundred pixels - the exact failure this skeleton
     * was rewritten to fix.
     *
     * Spacing below comes from the real rules (.headline-card and .panel
     * margin-bottom 22, .section-title margin 0 0 18 with a 40 top, .stat-grid
     * margin-bottom 34, .score-grid margin-bottom 26). See
     * OverviewSkeletonMetrics for how to re-measure.
     */
    const sk = provider.skeleton;
    return (
      <div style={{ paddingTop: 34 }} role="status" aria-busy="true">
        {/* The skeleton is silent otherwise: a screen reader hears nothing
            between navigation and the data landing. */}
        <span className="sr-only">Loading the dashboard…</span>
        {/* Headline card. */}
        <div className="skeleton" style={{ height: sk.headline, marginBottom: 22 }} />

        {/* Daily combined spend. */}
        <div className="skeleton" style={{ height: sk.dailySpend, marginBottom: 22 }} />

        {/* "Breakdown by model" heading. */}
        <div
          style={{
            height: 21,
            marginTop: 40,
            marginBottom: 18,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <div className="skeleton" style={{ height: 13, width: 170 }} />
        </div>

        {/*
         * Same grid class and the same number of cells as the real thing, so
         * auto-fit wraps them identically at every width - one row on a wide
         * screen, three on a narrow one. A fixed cell count would match at one
         * width and be wrong at every other.
         */}
        <div className="stat-grid">
          {Array.from({ length: sk.modelCards }, (_, i) => (
            <div key={i} className="skeleton" style={{ height: 149 }} />
          ))}
        </div>

        {/* Cost by model, then the token detail table. */}
        <div className="skeleton" style={{ height: sk.costByModel, marginBottom: 22 }} />
        <div className="skeleton" style={{ height: sk.tokenTable, marginBottom: 22 }} />

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

        {/* Twelve score cards - the same twelve for both agents. The wrapper
            is not decoration: .score-grid steps 4 -> 2 -> 1 columns on a
            CONTAINER query, so without it the placeholder would sit at four
            columns however narrow the shell got. */}
        <div className="score-grid-wrap">
          <div className="score-grid">
            {Array.from({ length: 12 }, (_, i) => (
              <div key={i} className="skeleton" style={{ height: sk.scoreCard }} />
            ))}
          </div>
        </div>

        {/* Daily tokens by model, its spend twin, then the activity heat map. */}
        <div className="skeleton" style={{ height: sk.dailyTokens, marginBottom: 22 }} />
        <div className="skeleton" style={{ height: sk.dailySpendByModel, marginBottom: 22 }} />
        <div className="skeleton" style={{ height: sk.heatmap }} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ paddingTop: 34 }}>
        <h1 className="sr-only">{provider.label} usage overview</h1>
        <div className="notice notice-warn">
          <div>
            <strong>Could not read your {provider.label} transcripts.</strong>
            <div style={{ marginTop: 8 }}>{error}</div>
            <div style={{ marginTop: 10, color: 'var(--text-faint)' }}>
              Expected them under <code>{provider.transcriptHint}</code>.
              {provider.transcriptEnvVar && (
                <>
                  {' '}
                  Set <code>{provider.transcriptEnvVar}</code> if yours live elsewhere, then hit
                  Refresh.
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!report) return null;

  // A parse that worked and found nothing is its own state, not a page of
  // zeroes with a warning box on top.
  if (isEmptyReport(report)) {
    return (
      <div className="page-enter" style={{ paddingTop: 34 }}>
        <EmptyState warnings={report.diagnostics.warnings} />
      </div>
    );
  }

  const { combined, perModel, daily } = report.global;
  const coverage = report.coverage;
  const modelCount = Object.keys(perModel).length;
  const activeDays = daily.filter((d) => d.combined.costUsd > 0).length;
  const avgPerDay = activeDays > 0 ? combined.costUsd / activeDays : 0;

  // Trend: compare the most recent 7 active days against the 7 before them.
  const recent = daily.slice(-7);
  const previous = daily.slice(-14, -7);
  const sum = (rows: typeof daily) => rows.reduce((a, r) => a + r.combined.costUsd, 0);
  const recentSum = sum(recent);
  const previousSum = sum(previous);
  const trendPct = previousSum > 0 ? ((recentSum - previousSum) / previousSum) * 100 : null;

  const topProject = report.projects[0];

  return (
    <div className="page-enter" style={{ paddingTop: 34 }}>
      {/* The page's own title. It is hidden because the design has no visible
          one - the top bar names the agent, and that is chrome repeated on
          every page rather than a heading (see TopBar). Without this the
          document outline started at h2, so there was nothing to land on. */}
      <h1 className="sr-only">{provider.label} usage overview</h1>

      {/* ---- Combined-models headline: the number to check first ---------- */}
      <section className="card headline-card rise">
        <div className="headline-grid">
          <div>
            <div className="headline-label">{provider.costLabel}</div>
            <div className="headline-value num">
              <CountUp value={combined.costUsd} format={(n) => formatUsd(n)} replayKey={version} />
            </div>
            <div className="headline-meta">
              across {formatCount(report.projects.length)}{' '}
              {report.projects.length === 1 ? 'project' : 'projects'} · {formatCount(modelCount)}{' '}
              {modelCount === 1 ? 'model' : 'models'} · {formatCount(activeDays)} active{' '}
              {activeDays === 1 ? 'day' : 'days'}
            </div>
            {coverage?.earliestDate && coverage.latestDate && (
              /*
               * Say what span these totals cover. Claude Code deletes its own
               * transcripts past its retention window, so "total" is a window,
               * not all time - and a shrinking total should never look like
               * reduced spend.
               */
              <div className="headline-coverage">
                {formatDateShort(coverage.earliestDate)} – {formatDateShort(coverage.latestDate)}
                {coverage.restored && (
                  <span
                    className="coverage-badge"
                    title={
                      `${coverage.archivedOnlyDays} earlier ${
                        coverage.archivedOnlyDays === 1 ? 'day is' : 'days are'
                      } kept from this dashboard's own archive. ` +
                      `${provider.label} has already deleted those transcripts, so the ` +
                      'numbers come from what was recorded before they went.'
                    }
                  >
                    {formatCount(coverage.archivedOnlyDays)} archived
                  </span>
                )}
              </div>
            )}
          </div>

          <div>
            <div className="headline-side-label">Total tokens</div>
            <div className="headline-side-value num">
              <CountUp value={combined.totalTokens} format={formatTokens} replayKey={version} />
            </div>
            <div className="headline-side-sub">
              {formatCount(combined.messages)} {provider.messageNoun}
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
            <div className="headline-side-sub">{formatUsd(avgPerDay)} avg / active day</div>
          </div>
        </div>
      </section>

      <div className="rise" style={{ animationDelay: '60ms' }}>
        <UnpricedNotice models={report.diagnostics.unpricedModels} />
        {/* "Nothing found" belongs to the empty state above, not here. */}
        <ParseWarnings warnings={noteworthyWarnings(report.diagnostics.warnings)} />
      </div>

      {/* ---- Daily combined spend trend ---------------------------------- */}
      <section className="card panel rise" style={{ animationDelay: '100ms' }}>
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Daily combined spend</h2>
            <p className="panel-sub">
              All models, all projects. Days marked in red sit well above trend.
            </p>
          </div>
          {topProject && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>Largest project</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>
                {topProject.name}{' '}
                <span className="num" style={{ color: 'var(--accent)' }}>
                  {formatUsd(topProject.combined.costUsd)}
                </span>
              </div>
            </div>
          )}
        </div>
        <DailySpendChart daily={daily} replayKey={version} />
      </section>

      {/* ---- Per-model breakdown ----------------------------------------- */}
      <h2 className="section-title" style={{ marginTop: 40 }}>
        Breakdown by model
      </h2>

      <div className="stat-grid">
        {Object.entries(perModel)
          .sort((a, b) => b[1].costUsd - a[1].costUsd)
          .map(([model, cell], index) => (
            <div
              key={model}
              className="card card-hover stat-card rise"
              style={{ animationDelay: `${index * 55}ms` }}
            >
              <div className="stat-label">
                <span
                  className="model-swatch"
                  style={{ background: modelColor(model) }}
                  aria-hidden
                />
                {displayModel(model)}
                {cell.unpriced && <span className="unpriced-pill">UNPRICED</span>}
              </div>
              <div className="stat-value num" style={{ color: modelColor(model) }}>
                {cell.unpriced ? (
                  '—'
                ) : (
                  <CountUp value={cell.costUsd} format={(n) => formatUsd(n)} replayKey={version} />
                )}
              </div>
              <div className="stat-sub num">
                {formatTokens(cell.totalTokens)} tokens · {formatDuration(cell.runtimeSeconds)}
              </div>
            </div>
          ))}
      </div>

      <section className="card panel rise" style={{ animationDelay: '140ms' }}>
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Cost by model</h2>
            <p className="panel-sub">Estimated spend per model across every project.</p>
          </div>
        </div>
        <CostByModelChart perModel={perModel} replayKey={version} />
      </section>

      <section className="card panel rise" style={{ animationDelay: '180ms' }}>
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

      {/* ---- Activity: score cards, then tokens, then the heat map -------- */}
      <h2 className="section-title" style={{ marginTop: 40 }}>
        Activity
      </h2>
      <ScoreCards activity={report.activity} combined={combined} replayKey={version} />

      <section className="card panel rise" style={{ animationDelay: '60ms' }}>
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Daily tokens by model</h2>
            <p className="panel-sub">
              Stacked by model, most expensive at the bottom — so the darker the base of a column,
              the more of that day went on premium tokens.
            </p>
          </div>
        </div>
        <DailyTokensByModelChart
          daily={daily}
          perModel={perModel}
          combined={combined}
          replayKey={version}
        />
      </section>

      <section className="card panel rise" style={{ animationDelay: '70ms' }}>
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Daily spend by model</h2>
            <p className="panel-sub">
              The same columns priced instead of counted — so a day that looks modest above and tall
              here went on the expensive models.
            </p>
          </div>
        </div>
        <DailySpendByModelChart
          daily={daily}
          perModel={perModel}
          combined={combined}
          replayKey={version}
        />
      </section>

      <section className="card panel rise" style={{ animationDelay: '80ms' }}>
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Daily activity</h2>
            <p className="panel-sub">
              Spend per day over the last 6 months. Darker means a more expensive day.
            </p>
          </div>
          {trendPct !== null && (
            <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
              <span
                className="num"
                style={{
                  fontSize: 19,
                  fontWeight: 640,
                  color: trendPct > 0 ? 'var(--warn)' : '#4ADE80',
                }}
              >
                {trendPct > 0 ? '↑' : '↓'} {Math.abs(trendPct).toFixed(0)}%
              </span>{' '}
              <span style={{ fontSize: 14, color: 'var(--text-faint)' }}>vs previous 7 days</span>
            </div>
          )}
        </div>
        <ActivityHeatmap
          daily={daily}
          offsetHours={report.settings.localUtcOffsetHours}
          weekStartsOn={report.settings.weekStartsOn}
        />
      </section>
    </div>
  );
}
