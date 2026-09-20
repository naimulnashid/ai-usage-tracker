'use client';

import Link from 'next/link';
import { useUsage } from '@/components/UsageProvider';
import { useProvider } from '@/components/ProviderScope';
import { CountUp } from '@/components/CountUp';
import { RUNTIME_TOOLTIP } from '@/components/Notices';
import { ProjectLogo } from '@/components/ProjectLogo';
import { EmptyState } from '@/components/EmptyState';
import { InfoTip } from '@/components/InfoTip';
import { isEmptyReport } from '@/lib/report-state';
import { ProjectShareChart } from '@/components/ProjectShareChart';
import {
  displayModel,
  formatCount,
  formatDuration,
  formatTokens,
  formatUsd,
} from '@/lib/format';
import { modelColor } from '@/lib/model-colors';

export default function ProjectsPage() {
  const provider = useProvider();
  const { report, initialLoading, error, version } = useUsage();

  if (initialLoading) {
    /*
     * The page opens straight on the donut - no heading, so no heading
     * placeholder either. Row height matches the real card (22px/26px padding
     * lands it at 177px, with the 14px margin below); rows were 96px, which
     * was 81px short each.
     */
    return (
      <div style={{ paddingTop: 34 }} role="status" aria-busy="true">
        {/* The skeleton is silent otherwise: a screen reader hears nothing
            between navigation and the data landing. */}
        <span className="sr-only">Loading your projects…</span>
        {/* Share-of-spend donut. Measured per agent: the ring is a fixed
            260px, but at a narrow shell the legend drops to one column and
            Claude Code's twelve projects make it much the taller of the two.
            See ProviderMeta.skeleton.projectDonut. */}
        <div
          className="skeleton"
          style={{ height: provider.skeleton.projectDonut, marginBottom: 22 }}
        />

        {/* Six rows fill a typical viewport; the real count is unknown until the
            data arrives, so anything past the fold is a guess either way. */}
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="skeleton" style={{ height: 177, marginBottom: 14 }} />
        ))}
      </div>
    );
  }

  if (error || !report) {
    return (
      <div style={{ paddingTop: 34 }} className="notice notice-warn">
        <div>{error ?? 'No data.'}</div>
      </div>
    );
  }

  if (isEmptyReport(report)) {
    return (
      <div className="page-enter" style={{ paddingTop: 34 }}>
        <EmptyState warnings={report.diagnostics.warnings} />
      </div>
    );
  }

  // Usage with no project is possible: a transcript whose working directory
  // never appeared. The donut and the list would both be blank, so say so.
  if (report.projects.length === 0) {
    return (
      <div className="page-enter" style={{ paddingTop: 34 }}>
        <section className="card panel empty-state rise">
          <h2 className="panel-title">No projects to show</h2>
          <p className="panel-sub empty-state-lead">
            This agent recorded usage, but none of it could be attributed to a
            working directory. The Overview still has the totals.
          </p>
        </section>
      </div>
    );
  }

  const grandTotal = report.global.combined.costUsd;

  return (
    <div className="page-enter" style={{ paddingTop: 34 }}>
      {/* The ring answers a question the ranked list below cannot: twelve rows
          look the same whether the top one is 61% of spend or 15%. */}
      <section className="card panel rise">
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Share of spend</h2>
            <p className="panel-sub">
              The largest projects as slices of the total, shaded by rank — so the ring
              reads in the same order as the list below. Anything past the top nine is
              summed into Others.
            </p>
          </div>
        </div>
        <ProjectShareChart projects={report.projects} totalCost={grandTotal} />
      </section>

      {report.projects.map((project, index) => {
        const share = grandTotal > 0 ? (project.combined.costUsd / grandTotal) * 100 : 0;

        return (
          <Link
            key={project.id}
            href={`${provider.basePath}/projects/${encodeURIComponent(project.id)}`}
            className="card card-hover rise"
            style={{
              display: 'block',
              color: 'inherit',
              padding: '22px 26px',
              marginBottom: 14,
              animationDelay: `${index * 40}ms`,
            }}
          >
            {/*
              * `center`, not `baseline`. A flex container takes its baseline
              * from its first item, and the logo's first item is an <img>,
              * whose baseline is its bottom edge - so baseline alignment
              * dropped the whole name block 13px and grew every card with a
              * logo to 190px while the monogram ones stayed at 177. Centring
              * makes the two cases identical again, which is also what keeps
              * the measured 177px skeleton row honest.
              */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 20,
                flexWrap: 'wrap',
              }}
            >
              {/* The mark sits at 38px, which is shorter than the two lines it
                  stands beside - so it cannot grow the row, and the measured
                  177px skeleton stays right. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                <ProjectLogo name={project.name} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 20, fontWeight: 620, letterSpacing: '-0.015em' }}>
                    {project.name}
                  </div>
                  <div
                    style={{
                      fontSize: 13.5,
                      color: 'var(--text-faint)',
                      marginTop: 4,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={project.cwd ?? project.id}
                  >
                    {project.cwd ?? project.id}
                  </div>
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div
                  className="num"
                  style={{ fontSize: 30, fontWeight: 640, color: 'var(--accent)' }}
                >
                  <CountUp
                    value={project.combined.costUsd}
                    format={(n) => formatUsd(n)}
                    replayKey={version}
                  />
                </div>
                <div className="num" style={{ fontSize: 13.5, color: 'var(--text-faint)' }}>
                  {share.toFixed(1)}% of total
                </div>
              </div>
            </div>

            {/* Share-of-spend bar, segmented by model */}
            <div
              style={{
                display: 'flex',
                height: 7,
                borderRadius: 999,
                overflow: 'hidden',
                background: '#141418',
                margin: '16px 0 13px',
              }}
            >
              {Object.entries(project.perModel)
                .sort((a, b) => b[1].totalTokens - a[1].totalTokens)
                .map(([model, cell]) => {
                  const pct =
                    project.combined.totalTokens > 0
                      ? (cell.totalTokens / project.combined.totalTokens) * 100
                      : 0;
                  if (pct <= 0) return null;
                  return (
                    <div
                      key={model}
                      title={`${displayModel(model)} · ${pct.toFixed(1)}%`}
                      style={{
                        width: `${pct}%`,
                        background: modelColor(model),
                        transition: 'opacity 180ms var(--ease)',
                      }}
                    />
                  );
                })}
            </div>

            <div
              className="num"
              style={{
                display: 'flex',
                gap: 22,
                flexWrap: 'wrap',
                fontSize: 14.5,
                color: 'var(--text-muted)',
              }}
            >
              <span>{formatTokens(project.combined.totalTokens)} tokens</span>
              <span>
                {formatDuration(project.combined.runtimeSeconds)}{' '}
                <InfoTip label="About runtime" text={RUNTIME_TOOLTIP} />
              </span>
              <span>{formatCount(project.sessions.length)} sessions</span>
              <span>{formatCount(project.daily.length)} active days</span>
              <span style={{ marginLeft: 'auto', color: 'var(--accent)', fontWeight: 550 }}>
                View breakdown →
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
