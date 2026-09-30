'use client';

import Link from 'next/link';
import { useUsage } from '@/components/UsageProvider';
import { useProvider } from '@/components/ProviderScope';
import { FullActivityHeatmap } from '@/components/ActivityHeatmap';
import { EmptyState } from '@/components/EmptyState';
import { isEmptyReport } from '@/lib/report-state';
import { fullHistoryStart } from '@/lib/heatmap';
import { formatDateStamp } from '@/lib/format';
import { useHeatNote } from './PageParts';

/**
 * The heat map alone, over every recorded day - what a heat map's Expand link
 * opens. A heat map's strip is six months; this is that strip repeated
 * downwards, so the width and cell size stay the same and the page grows
 * taller as history accumulates.
 *
 * One component for both scopes: the agent (`/<agent>/activity`, from the
 * overview) and one project (`/<agent>/projects/<id>/activity`, from a
 * project page). Reachable at any time by URL, but only linked once there is
 * history the six-month strip cannot show.
 */
export function ActivityHistoryPage({ projectId }: { projectId?: string }) {
  const provider = useProvider();
  const { report, initialLoading, error } = useUsage();
  const heatNote = useHeatNote();

  const backHref = projectId
    ? `${provider.basePath}/projects/${encodeURIComponent(projectId)}`
    : provider.basePath;
  const project = projectId ? report?.projects.find((p) => p.id === projectId) : undefined;

  const back = (
    <Link
      href={backHref}
      style={{ fontSize: 14.5, color: 'var(--text-muted)', display: 'inline-block' }}
    >
      ← {projectId ? (project?.name ?? 'Project') : 'Overview'}
    </Link>
  );

  if (initialLoading) {
    /*
     * The back link, then the panel. Its height follows the number of strips,
     * which depends on the data, so this is sized for one strip - the
     * overview's heat map panel - and a longer history grows below it.
     */
    return (
      <div style={{ paddingTop: 26 }} role="status" aria-busy="true">
        <span className="sr-only">Loading the activity history…</span>
        <div className="skeleton" style={{ height: 24, width: 100, marginBottom: 16 }} />
        <div className="skeleton" style={{ height: provider.skeleton.heatmap }} />
      </div>
    );
  }

  if (error || !report) {
    return (
      <div style={{ paddingTop: 34 }}>
        <h1 className="sr-only">{provider.label} daily activity</h1>
        <div className="notice notice-warn">
          <div>{error ?? 'No data.'}</div>
        </div>
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

  if (projectId && !project) {
    return (
      <div style={{ paddingTop: 34 }}>
        <h1 className="sr-only">{provider.label} daily activity</h1>
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

  const daily = project ? project.daily : report.global.daily;
  const from = fullHistoryStart(daily);

  return (
    <div className="page-enter" style={{ paddingTop: 26 }}>
      {back}

      <section className="card panel rise" style={{ marginTop: 16 }}>
        <div className="panel-head">
          <div>
            {/* The page is this one panel, so its title is the page's title. */}
            <h1 className="panel-title">Daily activity{project ? ` — ${project.name}` : ''}</h1>
            <p className="panel-sub">
              {from
                ? `Spend per day since ${formatDateStamp(from)}, six months to a row. ${heatNote}`
                : `Spend per day. ${heatNote}`}
            </p>
          </div>
        </div>
        {from ? (
          <FullActivityHeatmap
            daily={daily}
            generatedAt={report.generatedAt}
            offsetHours={report.settings.localUtcOffsetHours}
            weekStartsOn={report.settings.weekStartsOn}
            from={from}
          />
        ) : (
          // Usage recorded, but none of it on a known date.
          <p className="panel-sub">No dated activity found.</p>
        )}
      </section>
    </div>
  );
}
