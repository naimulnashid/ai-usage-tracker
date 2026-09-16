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

/**
 * Holds one agent's report. Mounted inside <ProviderScope>, so it knows which
 * endpoint to read and re-fetches from scratch when you switch agents - the two
 * reports have separate project id spaces and must never be mixed.
 */
export function UsageProvider({ children }: { children: ReactNode }) {
  const provider = useProvider();
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

  const load = useCallback(
    async (providerId: string) => {
      const ticket = (sequence.current += 1);
      inFlight.current = ticket;
      setLoading(true);
      setError(null);
      try {
        // cache: 'no-store' matters - a manual Refresh must actually re-read disk.
        const response = await fetch(`/api/usage/${providerId}`, { cache: 'no-store' });
        // A session that expired while the tab sat open should send the user to
        // the login screen, not surface a bare "Request failed (401)".
        if (response.status === 401) {
          window.location.href = '/login';
          return;
        }
        const payload = await response.json();
        if (ticket !== sequence.current) return; // superseded
        if (!response.ok) {
          throw new Error(
            payload?.detail || payload?.error || `Request failed (${response.status})`,
          );
        }
        setReport(payload as UsageReport & { parseMs?: number });
        setLastRefreshed(new Date().toISOString());
        setVersion((v) => v + 1);
      } catch (err) {
        if (ticket !== sequence.current) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (ticket === sequence.current) {
          inFlight.current = 0;
          setLoading(false);
          setInitialLoading(false);
        }
      }
    },
    [],
  );

  const refresh = useCallback(() => {
    // The button is disabled while loading; this guards the programmatic path.
    if (inFlight.current) return;
    void load(provider.id);
  }, [load, provider.id]);

  /*
   * One effect per agent. Switching clears the previous report first: rendering
   * the old agent's numbers under the new agent's accent for the length of a
   * parse is worse than showing the skeleton, because it looks like data.
   *
   * No polling afterwards - refresh is manual only, so the transcripts on disk
   * are not re-scanned continuously.
   */
  useEffect(() => {
    setReport(null);
    setError(null);
    setInitialLoading(true);
    void load(provider.id);
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
