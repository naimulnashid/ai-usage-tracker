'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useUsage } from '@/components/UsageProvider';
import { useProvider } from '@/components/ProviderScope';
import { CountUp } from '@/components/CountUp';
import { DailySpendChart } from '@/components/DailySpendChart';
import { DailyTokensByModelChart } from '@/components/DailyTokensByModelChart';
import { DailySpendByModelChart } from '@/components/DailySpendByModelChart';
import { CombinedDailyTable, ModelDailyTable } from '@/components/DailyTables';
import { ModelBreakdownTable } from '@/components/ModelBreakdownTable';
import { SessionsTable } from '@/components/SessionsTable';
import { RUNTIME_TOOLTIP, UnpricedNotice } from '@/components/Notices';
import { ProjectLogo } from '@/components/ProjectLogo';
import {
  displayModel,
  formatCount,
  formatDateLong,
  formatDuration,
  formatTokens,
  formatUsd,
} from '@/lib/format';
import { modelColor } from '@/lib/model-colors';

export default function ProjectDetailPage() {
  const provider = useProvider();
  const params = useParams<{ id: string }>();
  const projectId = decodeURIComponent(String(params?.id ?? ''));
  const { report, initialLoading, error, version } = useUsage();

  if (initialLoading) {
    return (
      <div style={{ paddingTop: 34 }}>
        <div className="skeleton" style={{ height: 190, marginBottom: 22 }} />
        <div className="skeleton" style={{ height: 340, marginBottom: 22 }} />
        <div className="skeleton" style={{ height: 300 }} />
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="notice notice-warn" style={{ marginTop: 34 }}>
        <div>{error ?? 'No data.'}</div>
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
              <span
                className="info-tip"
                data-tip={`${provider.label} keys projects by working directory, so renaming or moving a folder starts a new project and splits its history. These directories are stitched back together by ${provider.projectsFile}.`}
                tabIndex={0}
                aria-label="About merged projects"
              >
                i
              </span>
            </div>
          )}
        </div>

        <div className="headline-grid">
          <div>
            {/* The agent's own label: on Codex this figure is API-equivalent,
                not a bill, and the label is the only place the page says so. */}
            <div className="headline-label">{provider.costLabel}</div>
            <div className="headline-value num">
              <CountUp
                value={combined.costUsd}
                format={(n) => formatUsd(n)}
                replayKey={version}
              />
            </div>
            <div className="headline-meta">
              {shareOfTotal.toFixed(1)}% of all spend · {formatUsd(avgPerDay)} avg / active
              day
            </div>
          </div>

          <div>
            <div className="headline-side-label">Total tokens</div>
            <div className="headline-side-value num">
              <CountUp
                value={combined.totalTokens}
                format={formatTokens}
                replayKey={version}
              />
            </div>
            <div className="headline-side-sub">
              {formatCount(combined.messages)} {provider.messageNoun} ·{' '}
              {formatCount(sessions.length)} sessions
            </div>
          </div>

          <div>
            <div className="headline-side-label">
              Total runtime{' '}
              <span className="info-tip" data-tip={RUNTIME_TOOLTIP} aria-label="About runtime">
                i
              </span>
            </div>
            <div className="headline-side-value num">
              <CountUp
                value={combined.runtimeSeconds}
                format={formatDuration}
                replayKey={version}
              />
            </div>
            <div className="headline-side-sub">
              across {formatCount(activeDays)} active days
            </div>
          </div>
        </div>
      </section>

      <div className="rise" style={{ animationDelay: '60ms' }}>
        <UnpricedNotice models={unpricedHere} />
      </div>

      {/* ---- Combined daily total: chart then table ---------------------- */}
      <section className="card panel rise" style={{ animationDelay: '100ms' }}>
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Daily total spend</h2>
            <p className="panel-sub">
              All models combined for this project. Days marked in red sit well above
              trend.
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
        <DailySpendChart daily={daily} replayKey={version} height={280} />
      </section>

      <section className="card panel rise" style={{ animationDelay: '140ms' }}>
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Daily totals, combined</h2>
            <p className="panel-sub">Newest first. The bar shows each day against the peak.</p>
          </div>
        </div>
        <CombinedDailyTable daily={daily} peakCost={peakDay?.combined.costUsd ?? 0} />
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
                  <CountUp
                    value={cell.costUsd}
                    format={(n) => formatUsd(n)}
                    replayKey={version}
                  />
                )}
              </div>
              <div className="stat-sub num">
                {formatTokens(cell.totalTokens)} tokens ·{' '}
                {formatDuration(cell.runtimeSeconds)}
              </div>
            </div>
          ))}
      </div>

      <section className="card panel rise" style={{ animationDelay: '150ms' }}>
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Daily tokens by model</h2>
            <p className="panel-sub">
              Stacked by model, most expensive at the bottom — so the darker the base of
              a column, the more of that day went on premium tokens.
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

      <section className="card panel rise" style={{ animationDelay: '160ms' }}>
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Daily spend by model</h2>
            <p className="panel-sub">
              Stacked, so the height of each column is that day&apos;s combined total.
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

      <section className="card panel rise" style={{ animationDelay: '180ms' }}>
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Totals by model</h2>
          </div>
        </div>
        <ModelBreakdownTable perModel={perModel} combined={combined} />
      </section>

      <section className="card panel rise" style={{ animationDelay: '200ms' }}>
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Daily breakdown by model</h2>
            <p className="panel-sub">One row per day and model, newest first.</p>
          </div>
        </div>
        <ModelDailyTable daily={daily} />
      </section>

      {/* ---- Sessions ---------------------------------------------------- */}
      <section className="card panel rise" style={{ animationDelay: '220ms' }}>
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Sessions</h2>
            <p className="panel-sub">
              Every transcript file in this project, ranked by cost.
            </p>
          </div>
        </div>
        <SessionsTable sessions={sessions} />
      </section>
    </div>
  );
}
