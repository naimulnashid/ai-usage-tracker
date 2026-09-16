'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { ProviderMeta } from '@/lib/providers';
import { RAIL_STORAGE_KEY } from '@/lib/rail';

/**
 * Which agent the page below is showing, plus the rail's expand/collapse state.
 *
 * Every component that needs agent-specific wording reads this rather than
 * taking a prop, so the charts and tables stay reusable without a chain of
 * props running through them.
 */
interface ProviderScopeValue {
  provider: ProviderMeta;
  railCollapsed: boolean;
  toggleRail: () => void;
}

const ScopeContext = createContext<ProviderScopeValue | null>(null);

export function ProviderScope({
  provider,
  children,
}: {
  provider: ProviderMeta;
  children: ReactNode;
}) {
  // Mirrors whatever RAIL_INIT_SCRIPT already put on <html>. Initialising from
  // localStorage here instead would not match what the server rendered.
  const [railCollapsed, setRailCollapsed] = useState(false);

  useEffect(() => {
    setRailCollapsed(document.documentElement.dataset.rail === 'collapsed');
  }, []);

  const toggleRail = useCallback(() => {
    setRailCollapsed((collapsed) => {
      const next = !collapsed;
      const root = document.documentElement;
      if (next) root.dataset.rail = 'collapsed';
      else delete root.dataset.rail;
      try {
        localStorage.setItem(RAIL_STORAGE_KEY, next ? 'collapsed' : 'expanded');
      } catch {
        // Private mode, or storage disabled. The rail still works for this
        // session; it just will not be remembered.
      }
      return next;
    });
  }, []);

  return (
    <ScopeContext.Provider value={{ provider, railCollapsed, toggleRail }}>
      {/* `data-provider` re-themes everything below it - accent, heat-map ramp,
          buttons, focus rings - with no component needing to know about it. */}
      <div className="app" data-provider={provider.id}>
        {children}
      </div>
    </ScopeContext.Provider>
  );
}

export function useProviderScope(): ProviderScopeValue {
  const context = useContext(ScopeContext);
  if (!context) throw new Error('useProviderScope must be used inside <ProviderScope>');
  return context;
}

/** Shorthand for the common case of only needing the agent's metadata. */
export function useProvider(): ProviderMeta {
  return useProviderScope().provider;
}
