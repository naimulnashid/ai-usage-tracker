'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { PROVIDERS, PROVIDER_IDS, type ProviderId } from '@/lib/providers';
import { initialsOf } from '@/lib/project-logos';
import { useProviderScope } from './ProviderScope';

/**
 * Each agent's brand mark, as a file in public/agent-marks/.
 *
 * Files rather than inlined JSX, so the artwork is a pure file replacement with
 * no code change. They must be the vendors' own published assets, used exactly
 * as provided - never redrawn, recoloured or cropped. The marks belong to their
 * owners; this project is not affiliated with either vendor.
 *
 * An <img> does not pass currentColor through, and that is deliberate: a mark
 * that recolours with UI state stops doing its one job, which is saying which
 * agent this is when the rail is collapsed to icons.
 */
const MARKS: Record<ProviderId, string> = {
  claude: '/agent-marks/claude-code.svg',
  codex: '/agent-marks/codex.svg',
};

/**
 * The mark, or the agent's initials when the file is missing.
 *
 * A missing file is a real state, not only a broken install: the marks are
 * third-party artwork, so a fork may remove them. The check runs after mount as
 * well as on `error`, because an image that fails before hydration fires its
 * error event before React has attached the handler.
 */
function AgentMark({ id, label }: { id: ProviderId; label: string }) {
  const [missing, setMissing] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setMissing(true);
  }, []);

  if (missing) {
    return (
      <span className="rail-mark rail-mark-fallback" aria-hidden>
        {initialsOf(label)}
      </span>
    );
  }
  return (
    <img
      ref={ref}
      src={MARKS[id]}
      alt=""
      className="rail-mark"
      width={24}
      height={24}
      onError={() => setMissing(true)}
    />
  );
}

const MenuIcon = () => (
  <svg
    width="19"
    height="19"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.1"
    strokeLinecap="round"
    aria-hidden
  >
    <path d="M3.5 6.5h17M3.5 12h17M3.5 17.5h17" />
  </svg>
);

/**
 * The agent rail.
 *
 * It answers exactly one question - which agent's numbers am I looking at -
 * and the top bar answers the other, which page. Page links used to live here
 * too; mixing them made switching agent look like changing page.
 *
 * Collapsed, only the marks remain. Every item therefore carries a `title` so
 * hovering still names it, and the label stays in the DOM (removed from
 * layout, not from the accessibility tree) so a collapsed rail is not a column
 * of unnamed links to a screen reader.
 */
export function Sidebar() {
  const { provider, railCollapsed, toggleRail } = useProviderScope();

  return (
    <aside className="rail">
      <div className="rail-top">
        <button
          type="button"
          className="rail-burger"
          onClick={toggleRail}
          title={railCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={railCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!railCollapsed}
        >
          <MenuIcon />
        </button>
        <span className="rail-brand-text">AI Usage</span>
      </div>

      <div className="rail-group">
        <div className="rail-group-title">Agent</div>
        {PROVIDER_IDS.map((id) => {
          const meta = PROVIDERS[id];
          return (
            <Link
              key={id}
              href={meta.basePath}
              className="rail-item"
              data-active={id === provider.id}
              title={meta.label}
              aria-current={id === provider.id ? 'page' : undefined}
            >
              <AgentMark id={id} label={meta.label} />
              <span className="rail-label">{meta.label}</span>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
