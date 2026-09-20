'use client';

import { useEffect } from 'react';

/**
 * Catches a render error anywhere in a dashboard page.
 *
 * Without this, one exception leaves a blank page with the chrome still around
 * it and nothing to act on - a `%` in a project URL was enough to do it. The
 * sidebar and top bar survive, because this boundary sits inside their layout,
 * so Refresh and agent switching still work.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The server console is where a local tool's errors belong.
    console.error('Dashboard render failed:', error);
  }, [error]);

  return (
    <div style={{ paddingTop: 34 }}>
      <section className="card panel empty-state">
        <h2 className="panel-title">This page stopped rather than showing something wrong</h2>
        <p className="panel-sub empty-state-lead">
          Your transcripts and the local archive are untouched — this is a display
          problem, not a data one.
        </p>
        <p className="empty-state-error">
          <code>{error.message || 'Unknown error'}</code>
          {error.digest && <span className="empty-state-digest"> ({error.digest})</span>}
        </p>
        <div className="empty-state-actions">
          <button type="button" className="btn btn-primary" onClick={reset}>
            Try again
          </button>
        </div>
      </section>
    </div>
  );
}
