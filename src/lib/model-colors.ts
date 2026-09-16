/**
 * Model colours: shades of the owning agent's accent, ordered by price.
 *
 * The shade *is* the encoding — a deeper, more saturated tone means a more
 * expensive model, so the palette carries meaning rather than just separating
 * series. Reading a chart top to bottom, dark bands are the expensive tokens.
 *
 * ONE table covers both agents, because their model strings cannot collide:
 * Claude Code writes `claude-*`, Codex writes `gpt-*` and `codex-*`. That is
 * what lets every chart call `modelColor(model)` with no idea which dashboard
 * it is rendering. Claude models take shades of the terracotta accent, Codex
 * models shades of the ChatGPT teal-green.
 *
 * IMPORTANT: each agent's block must stay ordered by price. If you add a model,
 * or a rate card changes materially, re-check that a pricier model still gets a
 * darker shade — nothing enforces that automatically. Prices are only ever
 * compared *within* an agent, so the two blocks do not need to interleave.
 *
 * Trade-off worth knowing: a single-hue ramp is less instantly separable than
 * mixed hues. The shades below are therefore spaced widely rather than evenly,
 * with the biggest gaps between the models that actually show up in volume.
 */

interface ModelShade {
  color: string;
  /** Output price per MTok, for reference. Drives the ordering above. */
  outputPrice: number;
}

const SHADES: Record<string, ModelShade> = {
  // $50 output — deepest
  'claude-fable-5': { color: '#6E2409', outputPrice: 50 },
  'claude-mythos-5': { color: '#7E2E12', outputPrice: 50 },

  // $25 output — the Opus family
  'claude-opus-5': { color: '#A03F17', outputPrice: 25 },
  'claude-opus-4-7': { color: '#BC5535', outputPrice: 25 },
  'claude-opus-4-8': { color: '#D97757', outputPrice: 25 }, // the accent itself
  'claude-opus-4-6': { color: '#E5947A', outputPrice: 25 },

  // $15 / $10 output — Sonnet
  'claude-sonnet-4-6': { color: '#E8A184', outputPrice: 15 },
  'claude-sonnet-5': { color: '#F0AE90', outputPrice: 10 },

  // $5 output — lightest
  'claude-haiku-4-5': { color: '#F9DCCB', outputPrice: 5 },

  /* ---- Codex: shades of the ChatGPT teal-green -------------------------- */

  // $30 output — deepest
  'gpt-5.6-sol': { color: '#0A6B54', outputPrice: 30 },

  // $14 output — GPT-5.3-Codex. `codex-auto-review` is the same model wearing
  // a job title (see config/codex-pricing.json aliases); it gets its own,
  // lighter tone so the spend Codex incurs reviewing itself stays legible as a
  // separate band rather than merging into deliberate usage.
  'gpt-5.3-codex': { color: '#10A37F', outputPrice: 14 },
  'codex-auto-review': { color: '#3FC4A0', outputPrice: 14 },
};

/**
 * Friendlier labels for model strings that are not already readable.
 *
 * Only where the raw string is genuinely obscure — this is not a place to
 * rename models for taste, because the raw string is what appears in the
 * transcripts and in the rate card.
 */
const DISPLAY_NAMES: Record<string, string> = {
  'gpt-5.6-sol': 'GPT-5.6 Sol',
  'gpt-5.3-codex': 'GPT-5.3 Codex',
  'codex-auto-review': 'auto-review (5.3 Codex)',
};

export function modelDisplayName(model: string): string | null {
  return DISPLAY_NAMES[model] ?? null;
}

/** No API call, no cost — deliberately outside the accent family. */
const SYNTHETIC = '#4E4E57';

/** Unrecognised models: mid-tone, visibly desaturated so they read as "unknown". */
const UNKNOWN = '#9C7A6C';

/**
 * The combined/headline series colour.
 *
 * A CSS variable rather than a literal, so switching agents in the sidebar
 * re-themes the charts with no React state and no re-render: `--accent` is
 * redefined under `[data-provider]` in globals.css. Recharts writes these
 * straight into SVG `stroke` / `fill` / `stopColor` attributes, where a
 * `var()` resolves normally.
 */
export const COMBINED_COLOR = 'var(--accent)';
export const WARN_COLOR = 'var(--warn)';

export function modelColor(model: string): string {
  if (model === '<synthetic>') return SYNTHETIC;
  return SHADES[model]?.color ?? UNKNOWN;
}

/**
 * Sort helper: most expensive first, so legends and stack bands read
 * deep → light.
 *
 * Same-priced models (the whole Opus family shares $25) would otherwise tie
 * and fall back to whatever order they were encountered in, which puts a
 * lighter shade above a darker one. Ties break on the table's own order, which
 * is the shade ramp — so the visual order always matches the colour order.
 */
const SHADE_ORDER = Object.keys(SHADES);

export function byPriceDesc(a: string, b: string): number {
  const pa = SHADES[a]?.outputPrice ?? -1;
  const pb = SHADES[b]?.outputPrice ?? -1;
  if (pa !== pb) return pb - pa;
  const ia = SHADE_ORDER.indexOf(a);
  const ib = SHADE_ORDER.indexOf(b);
  return (ia === -1 ? Number.MAX_SAFE_INTEGER : ia) - (ib === -1 ? Number.MAX_SAFE_INTEGER : ib);
}

/**
 * Intensity ramp for the activity heat map: same accent family, five steps
 * from "barely used" to "heaviest day", plus an empty-cell tone.
 *
 * CSS variables for the same reason as COMBINED_COLOR — the ramp is redefined
 * per agent in globals.css, so the heat map re-themes without the component
 * knowing which dashboard it is on.
 */
export const HEATMAP_RAMP = [
  'var(--hm-0)', // no activity
  'var(--hm-1)',
  'var(--hm-2)',
  'var(--hm-3)',
  'var(--hm-4)',
  'var(--hm-5)',
] as const;

export function heatmapColor(value: number, max: number): string {
  if (value <= 0 || max <= 0) return HEATMAP_RAMP[0];
  const ratio = value / max;
  if (ratio <= 0.2) return HEATMAP_RAMP[1];
  if (ratio <= 0.4) return HEATMAP_RAMP[2];
  if (ratio <= 0.65) return HEATMAP_RAMP[3];
  if (ratio <= 0.85) return HEATMAP_RAMP[4];
  return HEATMAP_RAMP[5];
}
