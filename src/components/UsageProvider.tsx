'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import type { UsageReport } from '@/lib/types';
import { useProvider } from './ProviderScope';

interface UsageState {
  report: (UsageReport & { parseMs?: number }) | null;
  loading: boolean;
  /** True only for the very first load, so we can show skeletons vs. a spinner. */
  initialLoading: boolean;
  error: string | null;
  lastRefreshed: string | null;
  refresh: () => void;
  /** Bumps on every successful load; used to re-key animations. */
  version: number;
}

const UsageContext = createContext<UsageState | null>(null);

type LoadResult =
  | { kind: 'report'; report: UsageReport & { parseMs?: number } }
  | { kind: 'failed'; message: string }
  | { kind: 'signed-out' };

/**
 * One request for one agent's report. Touches no React state, so the component
 * can apply the result from a callback - which is what makes it plain to React
 * that nothing is set synchronously when the first load starts in an effect.
 */
async function fetchReport(providerId: string): Promise<LoadResult> {
  try {
    // cache: 'no-store' matters - a manual Refresh must actually re-read disk.
    const response = await fetch(`/api/usage/${providerId}`, { cache: 'no-store' });
    if (response.status === 401) return { kind: 'signed-out' };
    const payload = await response.json();
    if (!response.ok) {
      return {
        kind: 'failed',
        message: payload?.detail || payload?.error || `Request failed (${response.status})`,
      };
    }
    return { kind: 'report', report: payload as UsageReport & { parseMs?: number } };
  } catch (err) {
    return { kind: 'failed', message: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Holds one agent's report. Mounted inside <ProviderScope>, so it knows which
 * endpoint to read.
 *
 * **The layout keys this by agent, and that key is load-bearing.** Switching
 * agent remounts it with empty state, so the previous agent's report is gone
 * before the first render under the new one: rendering the old numbers under
 * the new agent's accent for the length of a parse is worse than showing the
 * skeleton, because it looks like data. The two reports have separate project
 * id spaces and must never be mixed. This used to be an effect clearing the
 * state, which left one render in between; the key leaves none.
 */
export function UsageProvider({ children }: { children: ReactNode }) {
  const provider = useProvider();
  const router = useRouter();
  const [report, setReport] = useState<(UsageReport & { parseMs?: number }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  /*
   * Which fetch is allowed to write to state.
   *
   * A plain in-flight boolean is not enough once there are two agents: a parse
   * takes a couple of seconds, and switching agent mid-parse is the obvious
   * thing to do. With a boolean the new agent's fetch is refused as "already
   * loading" and its dashboard never fills in, while the old agent's response
   * lands under the new agent's accent. Sequencing every request instead means
   * a superseded response is simply dropped.
   */
  const sequence = useRef(0);
  const inFlight = useRef(0);

  /*
   * Only ever sets state once the request settles. The loading flags a request
   * starts with are the initial state on mount, and `refresh` sets them itself,
   * so starting the first load from an effect does not render twice.
   */
  const load = useCallback(
    (providerId: string) => {
      const ticket = (sequence.current += 1);
      inFlight.current = ticket;

      void fetchReport(providerId).then((result) => {
        // A session that expired while the tab sat open should send the user
        // to the login screen, not surface a bare "Request failed (401)".
        //
        // It carries where they were, the same way `middleware.ts` does for a
        // request that never had a session - otherwise the one route that
        // throws people out mid-session is also the one that forgets what they
        // were looking at, and a deep link into a project becomes the
        // overview. The value is read off `location`, so it is same-origin by
        // construction, and the login page refuses anything that is not a
        // same-site path anyway.
        //
        // `replace`, like the gate's own redirect and the Sign out button:
        // pushing left a history entry that Back returned to only to be
        // bounced straight back to the login screen.
        if (result.kind === 'signed-out') {
          const here = `${window.location.pathname}${window.location.search}`;
          router.replace(`/login?next=${encodeURIComponent(here)}`);
          return;
        }
        if (ticket !== sequence.current) return; // superseded

        if (result.kind === 'report') {
          setReport(result.report);
          setLastRefreshed(new Date().toISOString());
          setVersion((v) => v + 1);
        } else {
          setError(result.message);
        }
        inFlight.current = 0;
        setLoading(false);
        setInitialLoading(false);
      });
    },
    [router],
  );

  const refresh = useCallback(() => {
    // The button is disabled while loading; this guards the programmatic path.
    if (inFlight.current) return;
    setLoading(true);
    setError(null);
    load(provider.id);
  }, [load, provider.id]);

  /*
   * The first load. There is nothing to clear first: see the key note above.
   *
   * No polling afterwards - refresh is manual only, so the transcripts on disk
   * are not re-scanned continuously.
   */
  useEffect(() => {
    load(provider.id);
  }, [load, provider.id]);

  const value = useMemo<UsageState>(
    () => ({ report, loading, initialLoading, error, lastRefreshed, refresh, version }),
    [report, loading, initialLoading, error, lastRefreshed, refresh, version],
  );

  return <UsageContext.Provider value={value}>{children}</UsageContext.Provider>;
}

export function useUsage(): UsageState {
  const context = useContext(UsageContext);
  if (!context) throw new Error('useUsage must be used inside <UsageProvider>');
  return context;
}
