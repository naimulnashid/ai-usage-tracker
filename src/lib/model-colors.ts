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
 * mixed hues, and holding every band above 3:1 against the panel compresses it
 * further - see the note on the table below. Colour is therefore never the only
 * way a band can be read.
 */

interface ModelShade {
  color: string;
  /** Output price per MTok, for reference. Drives the ordering above. */
  outputPrice: number;
}

/*
 * Every shade clears **3:1 against the panel** (WCAG 1.4.11, non-text
 * contrast), and luminance still rises as price falls, so the encoding is
 * unchanged. The ramp used to start at 1.8:1 and 2.2:1 - bands that were
 * effectively invisible against near-black to anyone with low vision.
 *
 * Meeting that floor compresses the ramp: neighbouring bands now differ by
 * only 1.13-1.25:1, so **colour alone cannot be the way a band is read**.
 * Every chart carries a legend, a tooltip and a `.sr-only` table fallback for
 * exactly that reason - see ChartFigure.
 *
 * Each ramp is one hue (its agent's accent), varying only in lightness. The
 * ratios in the comments are against `--surface`; re-check them with the
 * formula in CLAUDE.md if you touch a value.
 */
export const MODEL_SHADES: Record<string, ModelShade> = {
  // $50 output — deepest
  'claude-fable-5': { color: '#A14324', outputPrice: 50 }, // 3.15:1
  'claude-mythos-5': { color: '#BA4D2A', outputPrice: 50 }, // 3.94:1

  // $25 output — the Opus family
  'claude-opus-5': { color: '#D0562F', outputPrice: 25 }, // 4.76:1
  'claude-opus-4-7': { color: '#D56743', outputPrice: 25 }, // 5.51:1
  'claude-opus-4-8': { color: '#D97757', outputPrice: 25 }, // 6.34:1 - the accent itself
  'claude-opus-4-6': { color: '#DF8B70', outputPrice: 25 }, // 7.60:1

  // $20 output — Opus 5.5, between the Opus family and Sonnet
  'claude-opus-5-5': { color: '#E19278', outputPrice: 20 }, // 8.09:1

  // $15 / $10 output — Sonnet
  'claude-sonnet-4-6': { color: '#E39981', outputPrice: 15 }, // 8.61:1
  'claude-sonnet-5': { color: '#E7A893', outputPrice: 10 }, // 9.82:1

  // $5 output — lightest
  'claude-haiku-4-5': { color: '#EDC0B1', outputPrice: 5 }, // 12.03:1

  /* ---- Codex: shades of the ChatGPT teal-green -------------------------- */

  // $30 output — deepest
  'gpt-5.6-sol': { color: '#0B6D55', outputPrice: 30 }, // 3.14:1

  // $14 output — GPT-5.3-Codex. `codex-auto-review` is the same model wearing
  // a job title (see config/codex-pricing.json aliases); it gets its own,
  // lighter tone so the spend Codex incurs reviewing itself stays legible as a
  // separate band rather than merging into deliberate usage.
  'gpt-5.3-codex': { color: '#10A37F', outputPrice: 14 }, // 6.19:1
  'codex-auto-review': { color: '#13C69A', outputPrice: 14 }, // 9.02:1
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

/** No API call, no cost — deliberately outside the accent family. 3.04:1. */
const SYNTHETIC = '#5D5D68';

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
  return MODEL_SHADES[model]?.color ?? UNKNOWN;
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
const SHADE_ORDER = Object.keys(MODEL_SHADES);

export function byPriceDesc(a: string, b: string): number {
  const pa = MODEL_SHADES[a]?.outputPrice ?? -1;
  const pb = MODEL_SHADES[b]?.outputPrice ?? -1;
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
