'use client';

import { useProvider } from './ProviderScope';

const InfoIcon = () => (
  <svg
    className="notice-icon"
    width="17"
    height="17"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    aria-hidden
  >
    <circle cx="12" cy="12" r="9.5" />
    <path d="M12 11v5.5M12 7.6v.1" />
  </svg>
);

/** Only rendered when a model string has no rate card entry. */
export function UnpricedNotice({ models }: { models: string[] }) {
  const provider = useProvider();
  if (!models.length) return null;
  return (
    <div className="notice notice-warn">
      <InfoIcon />
      <div>
        <strong>Unpriced model{models.length === 1 ? '' : 's'}:</strong>{' '}
        {models.map((m) => (
          <code key={m} style={{ marginRight: 8 }}>
            {m}
          </code>
        ))}
        <br />
        Tokens are counted but excluded from cost. Add {models.length === 1 ? 'it' : 'them'}{' '}
        to <code>{provider.pricingFile}</code> to include {models.length === 1 ? 'it' : 'them'}.
      </div>
    </div>
  );
}

export function ParseWarnings({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null;
  return (
    <div className="notice notice-warn">
      <InfoIcon />
      <div>
        <strong>
          {warnings.length} file{warnings.length === 1 ? '' : 's'} could not be read
        </strong>{' '}
        and {warnings.length === 1 ? 'was' : 'were'} skipped. Totals below exclude{' '}
        {warnings.length === 1 ? 'it' : 'them'}.
        <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
          {warnings.slice(0, 4).map((warning) => (
            <li key={warning} style={{ fontSize: 13.5 }}>
              {warning}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export const RUNTIME_TOOLTIP =
  'Runtime = the sum of gaps between consecutive messages in a session, excluding any gap longer than the idle cutoff (maxIdleGapMinutes in config/settings.json, 30 minutes by default). It measures active session time, not inference time, so it includes your own reading and typing and drops long idle stretches.';
