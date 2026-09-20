'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useUsage } from './UsageProvider';
import { useProvider } from './ProviderScope';
import { formatClockTime } from '@/lib/format';

/**
 * Page navigation, status, and the two actions.
 *
 * The split with the rail is deliberate: the rail answers "which agent", the
 * top bar answers "which page within it". Both live at the top of their own
 * axis, and the agent's name sits at the left of the bar so a screenshot always
 * says which dashboard it came from.
 */
export function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const provider = useProvider();
  const { refresh, loading, lastRefreshed, report } = useUsage();

  const links = [
    { href: provider.basePath, label: 'Overview', exact: true },
    { href: `${provider.basePath}/projects`, label: 'Projects', exact: false },
  ];

  return (
    <header className="topbar">
      <div className="topbar-inner">
        {/* Not an <h1>: this is chrome that repeats on every page, and the pages
            below have their own headings. Two competing h1s is worse than none. */}
        <div className="topbar-heading">{provider.label}</div>

        <nav className="nav">
          {links.map((link) => {
            const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);
            return (
              <Link key={link.href} href={link.href} className="nav-link" data-active={active}>
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="topbar-spacer" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span className="refresh-meta">
            {loading
              ? 'Reading transcripts…'
              : lastRefreshed
                ? `Last refreshed ${formatClockTime(lastRefreshed)}${
                    report?.parseMs ? ` · ${(report.parseMs / 1000).toFixed(1)}s` : ''
                  }`
                : '—'}
          </span>
          <button
            type="button"
            className="signout"
            onClick={async () => {
              await fetch('/api/login', { method: 'DELETE' });
              router.replace('/login');
              router.refresh();
            }}
          >
            Sign out
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void refresh()}
            disabled={loading}
            aria-label={`Re-read all ${provider.label} transcripts from disk and recompute`}
          >
            {loading ? (
              <>
                <span className="spinner" aria-hidden />
                Refreshing
              </>
            ) : (
              <>
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M21 12a9 9 0 1 1-3.5-7.1" />
                  <path d="M21 3v6h-6" />
                </svg>
                Refresh
              </>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
