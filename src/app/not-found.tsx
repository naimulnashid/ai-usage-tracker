import Link from 'next/link';
import { PROVIDER_IDS } from '@/lib/providers';

/**
 * Unknown routes, including an unknown agent segment.
 *
 * `[provider]/layout.tsx` calls `notFound()` rather than falling back to the
 * first agent, because showing one agent's numbers under another's name is the
 * one failure that matters. This is what that lands on.
 *
 * It sits outside the `(dash)` group, so it renders bare: no sidebar, and no
 * `UsageProvider` firing a fetch behind it.
 */
export default function NotFound() {
  return (
    <main className="login-shell">
      <div className="login-card">
        <h1 className="login-title">Nothing here</h1>
        <p className="login-sub">
          That page does not exist. If you were after an agent, the dashboard
          covers these:
        </p>
        <div className="empty-state-actions">
          {PROVIDER_IDS.map((id) => (
            <Link key={id} href={`/${id}`} className="btn">
              /{id}
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
