'use client';

import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { ProviderMeta } from '@/lib/providers';
import { RAIL_STORAGE_KEY } from '@/lib/rail';

/*
 * The rail's state lives in one place: `data-rail` on <html>, where
 * RAIL_INIT_SCRIPT sets it before first paint and where the CSS reads it.
 * React subscribes to that attribute rather than keeping a copy of it, because
 * a copy has to be synced after hydration - and that sync was an effect setting
 * state on mount, which costs a second render.
 */
function subscribeRail(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-rail'] });
  return () => observer.disconnect();
}

function isRailCollapsed(): boolean {
  return document.documentElement.dataset.rail === 'collapsed';
}

// The server cannot see the attribute, so it renders the default - collapsed,
// see RAIL_INIT_SCRIPT - and the first client render then reads the real value.
// Only the burger's label depends on this; the rail's width is pure CSS.
function isRailCollapsedOnServer(): boolean {
  return true;
}

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
  // Reads whatever RAIL_INIT_SCRIPT already put on <html>. Initialising from
  // localStorage here instead would not match what the server rendered.
  const railCollapsed = useSyncExternalStore(
    subscribeRail,
    isRailCollapsed,
    isRailCollapsedOnServer,
  );

  // Only writes the attribute; the subscription above re-renders from it.
  const toggleRail = useCallback(() => {
    const next = !isRailCollapsed();
    const root = document.documentElement;
    if (next) root.dataset.rail = 'collapsed';
    else delete root.dataset.rail;
    try {
      localStorage.setItem(RAIL_STORAGE_KEY, next ? 'collapsed' : 'expanded');
    } catch {
      // Private mode, or storage disabled. The rail still works for this
      // session; it just will not be remembered.
    }
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
