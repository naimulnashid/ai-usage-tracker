'use client';

import { useProvider } from './ProviderScope';

/**
 * Shown when the parse worked and found nothing.
 *
 * Without it the page renders $0.00 across a dozen cards, every chart says
 * "No dated activity found.", and the only hint that anything is wrong is a
 * warning box claiming a file could not be read. That reads as broken software
 * rather than "you have not used this agent yet, or its transcripts are
 * somewhere else".
 *
 * The two things a reader needs are where it looked and how to point it
 * elsewhere, so both are on screen rather than in the README.
 */
export function EmptyState({ warnings = [] }: { warnings?: string[] }) {
  const provider = useProvider();
  return (
    <section className="card panel empty-state rise">
      {/* h1, not h2: in this state it is the only thing on the page, so it is
          the page's title rather than a section within one. */}
      <h1 className="panel-title">No {provider.label} usage found yet</h1>
      <p className="panel-sub empty-state-lead">
        Nothing was found to read, so there is nothing to show. That is the expected state before
        you have used {provider.label} — or if its transcripts live somewhere this dashboard did not
        look.
      </p>

      <dl className="empty-state-facts">
        <dt>Looked in</dt>
        <dd>
          <code>{provider.transcriptHint}</code>
        </dd>
        {provider.transcriptEnvVar && (
          <>
            <dt>Somewhere else?</dt>
            <dd>
              Set <code>{provider.transcriptEnvVar}</code> and restart the server.
            </dd>
          </>
        )}
        <dt>Already used it?</dt>
        <dd>Hit Refresh — transcripts are only read when you ask for them.</dd>
      </dl>

      {warnings.length > 0 && (
        <details className="empty-state-details">
          <summary>What the parser reported ({warnings.length})</summary>
          <ul>
            {warnings.slice(0, 5).map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
