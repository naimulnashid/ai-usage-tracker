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
 *
 * **The user can override a model's shade** from the Model prices table, and a
 * model the table below has never heard of - a new release, found in the
 * transcripts before anyone edited this file - can be given one there. The
 * choice is limited to `ACCENT_PALETTES`, the agent's own ramp, so an
 * overridden band still clears 3:1 and still reads as this agent's colour. The
 * price ordering is then the user's to keep: nothing stops them giving a cheap
 * model the darkest shade.
 */

import type { ProviderId } from './providers';

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
 * The shades a model's colour can be set to, per agent, deepest first.
 *
 * Every one is a lightness step of that agent's accent and clears 3:1 against
 * the panel - `tests/contrast.test.ts` checks each - so a user's choice can
 * never produce a band that disappears into the background. The ramp above is
 * a subset of these, so every model's default shade is also one of the
 * choices.
 */
export const ACCENT_PALETTES: Record<ProviderId, readonly string[]> = {
  claude: [
    '#A14324',
    '#AE4827',
    '#BA4D2A',
    '#C5512C',
    '#D0562F',
    '#D56743',
    '#D97757',
    '#DF8B70',
    '#E19278',
    '#E39981',
    '#E7A893',
    '#EDC0B1',
  ],
  codex: [
    '#0B6D55',
    '#0C7A5F',
    '#0E8A6C',
    '#0F9674',
    '#10A37F',
    '#12B48C',
    '#13C69A',
    '#3FD2AC',
    '#6CDDBF',
    '#98E8D3',
  ],
};

/**
 * The same palettes for the light theme, index for index.
 *
 * A model's shade is stored as a hex from `ACCENT_PALETTES` (it is data - it
 * goes in `data/model-settings.json`), so it cannot simply be a CSS variable
 * that the theme redefines. Instead each dark shade has a light twin at the
 * same index, and `themedColor` swaps one for the other at render time. The
 * stored value never changes with the theme.
 *
 * The dark ramp gets LIGHTER toward the cheap end, because light is what stands
 * out on near-black. On white that is backwards - the palest shades would fade
 * into the panel - so each light ramp runs from a deep tone to the agent's own
 * accent, every step above 3:1 against white (tests/contrast.test.ts). Darker
 * still means dearer, in both themes.
 */
export const LIGHT_PALETTES: Record<ProviderId, readonly string[]> = {
  claude: [
    '#712E19',
    '#79321B',
    '#82361D',
    '#8C3A1F',
    '#963E21',
    '#A14224',
    '#AD4727',
    '#B94C29',
    '#C6512C',
    '#D25A33',
    '#D56845',
    '#D97657',
  ],
  codex: [
    '#074B3B',
    '#085340',
    '#095B47',
    '#0A624D',
    '#0B6C54',
    '#0C755C',
    '#0D8164',
    '#0E8C6D',
    '#0F9876',
    '#10A580',
  ],
};

/** Dark shade (upper case) -> its light twin. Built once; the palettes are disjoint. */
const LIGHT_TWIN = new Map<string, string>();
for (const id of Object.keys(ACCENT_PALETTES) as ProviderId[]) {
  ACCENT_PALETTES[id].forEach((shade, index) => {
    LIGHT_TWIN.set(shade.toUpperCase(), LIGHT_PALETTES[id][index]);
  });
}

/**
 * A model colour as it should be drawn in `theme`. Anything that is not a
 * palette shade - the synthetic and unknown tones, a CSS variable - is
 * returned as it is; both of those clear 3:1 on either ground already.
 */
export function themedColor(color: string, theme: 'dark' | 'light'): string {
  if (theme === 'dark') return color;
  if (color === SYNTHETIC) return SYNTHETIC_LIGHT;
  return LIGHT_TWIN.get(color.toUpperCase()) ?? color;
}

/** True when `color` is one of the agent's palette shades (any case). */
export function isPaletteColor(provider: ProviderId, color: string): boolean {
  const wanted = color.toUpperCase();
  return (ACCENT_PALETTES[provider] ?? []).some((shade) => shade.toUpperCase() === wanted);
}

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
/** Its light-theme twin: 3.19:1 on white. */
const SYNTHETIC_LIGHT = '#8C909B';

/**
 * Unrecognised models: mid-tone, visibly desaturated so they read as "unknown".
 * 5.1:1 on the dark panel and 3.9:1 on white, so one value serves both themes.
 */
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

/**
 * A model's colour: the user's chosen shade when there is one, else its place
 * in the ramp above. Components call this through `useModelColor()`, which
 * supplies the user's choices; called bare it gives the defaults.
 */
export function modelColor(model: string, overrides?: Record<string, string>): string {
  const chosen = overrides?.[model];
  if (chosen) return chosen;
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
