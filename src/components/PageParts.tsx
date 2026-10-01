'use client';

import { useTheme } from './ThemeToggle';

/*
 * Small pieces the overview and a project page share, so the two stay the same
 * page with different data: project pages mirror the overview.
 */

/** The Model prices panel's subtitle, shared with the project page. */
export const MODEL_PRICES_SUB =
  'USD per million tokens. Set a price for a model the rate card does not know yet — it is saved on this machine and wins over the card — or pick the colour a model is drawn in.';

/**
 * What the heat map's shade means, which depends on the theme: the dark ramp
 * gets BRIGHTER as spend rises (light stands out on black), the light ramp
 * DARKER. The sentence used to say "Darker" in both, true in neither until
 * the light theme existed.
 */
export function useHeatNote(): string {
  return `${useTheme() === 'light' ? 'Darker' : 'Brighter'} means a more expensive day.`;
}

/** The heat map's week-on-week figure, beside its title. */
export function WeekTrend({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  return (
    <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
      <span
        className="num"
        style={{
          fontSize: 19,
          fontWeight: 640,
          color: pct > 0 ? 'var(--warn)' : 'var(--good)',
        }}
      >
        {pct > 0 ? '↑' : '↓'} {Math.abs(pct).toFixed(0)}%
      </span>{' '}
      <span style={{ fontSize: 14, color: 'var(--text-faint)' }}>vs previous 7 days</span>
    </div>
  );
}
