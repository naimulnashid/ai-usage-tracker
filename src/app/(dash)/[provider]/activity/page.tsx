'use client';

import Link from 'next/link';
import { useUsage } from '@/components/UsageProvider';
import { useProvider } from '@/components/ProviderScope';
import { FullActivityHeatmap } from '@/components/ActivityHeatmap';
import { EmptyState } from '@/components/EmptyState';
import { isEmptyReport } from '@/lib/report-state';
import { fullHistoryStart } from '@/lib/heatmap';
import { formatDateStamp } from '@/lib/format';

/**
 * The heat map alone, over every recorded day - what the overview's Expand
 * link opens. The overview's strip is six months; this is that strip repeated
 * downwards, so the width and cell size stay the same and the page grows
 * taller as history accumulates.
 *
 * Reachable at any time by URL, but only linked once there is history the
 * overview's six months cannot show.
 */
export default function ActivityPage() {
  const provider = useProvider();
  const { report, initialLoading, error } = useUsage();

  const back = (
    <Link
      href={provider.basePath}
      style={{ fontSize: 14.5, color: 'var(--text-muted)', display: 'inline-block' }}
    >
      ← Overview
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

  const from = fullHistoryStart(report.global.daily);

  return (
    <div className="page-enter" style={{ paddingTop: 26 }}>
      {back}

      <section className="card panel rise" style={{ marginTop: 16 }}>
        <div className="panel-head">
          <div>
            {/* The page is this one panel, so its title is the page's title. */}
            <h1 className="panel-title">Daily activity</h1>
            <p className="panel-sub">
              {from
                ? `Spend per day since ${formatDateStamp(from)}, six months to a row. Darker means a more expensive day.`
                : 'Spend per day. Darker means a more expensive day.'}
            </p>
          </div>
        </div>
        {from ? (
          <FullActivityHeatmap
            daily={report.global.daily}
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
