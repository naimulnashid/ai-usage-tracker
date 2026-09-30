/**
 * A colour per project, for the charts that are stacked or sliced by project
 * (the share-of-spend donut, Daily spend by project).
 *
 * Models have a colour that MEANS something - a shade of the agent's accent,
 * darker for dearer (model-colors.ts). A project has no such fact, so its
 * colour is about identity instead: where the project has a logo, the logo's
 * own dominant colour, so the chart reads the way the project's mark does.
 * In order:
 *
 * 1. **The user's own colour**, set from the project's ⋯ menu. Stored in
 *    `data/` (project-colors-store.ts), taken exactly as entered.
 * 2. **The logo's dominant colour**, extracted in the browser from the file in
 *    the agent's logo folder. The logo's BACKGROUND is excluded - see
 *    `dominantColorFromPixels`.
 * 3. **A fallback from a fixed palette**, handed out in rank order so the
 *    largest projects without a logo get the most distinct hues.
 *
 * (2) and (3) are then fitted into a luminance band that clears 3:1 against
 * BOTH themes' panels (`fitForCharts`) - a logo that is mostly black would
 * otherwise draw an invisible band on the dark theme, and a pale one would on
 * the light theme. (1) is not: a colour typed in by hand is the user's call,
 * the same way a model's chosen shade overrides the price ordering.
 *
 * Client-safe: no `node:` imports, and no DOM either - the canvas work lives
 * in ProjectColors.tsx, so the arithmetic here can be tested under node.
 */

export type ProjectColorSource = 'custom' | 'logo' | 'auto';

/** `#RRGGBB`, any case. The only form a stored colour may take. */
export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

/**
 * What a user typed, as `#RRGGBB`, or null when it is not a colour. Accepts
 * `#abc`, `abc123` and surrounding spaces, because that is how colours get
 * pasted.
 */
export function parseHexColor(input: string): string | null {
  let value = input.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(value)) value = [...value].map((c) => c + c).join('');
  return /^[0-9a-fA-F]{6}$/.test(value) ? `#${value.toUpperCase()}` : null;
}

type Rgb = [number, number, number];

function toRgb(hex: string): Rgb {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
}

function toHex(rgb: Rgb): string {
  return (
    '#' +
    rgb
      .map((v) =>
        Math.round(Math.max(0, Math.min(255, v)))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
      .toUpperCase()
  );
}

const lin = (c: number) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function rgbToHsl([r, g, b]: Rgb): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h /= 6;
  return [h, s, l];
}

function hslToRgb([h, s, l]: [number, number, number]): Rgb {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

/**
 * The luminance band a chart colour must sit in to clear 3:1 against both
 * panels: the dark theme's `--surface` (#0a0a0c, luminance ~0.003) needs at
 * least ~0.113, the light theme's white needs at most 0.30. Mid-tones pass on
 * both, which is why one fitted colour can serve either theme.
 */
export const CHART_LUMINANCE_MIN = 0.12;
export const CHART_LUMINANCE_MAX = 0.29;

/**
 * `hex` with its hue and saturation kept and its lightness moved just far
 * enough to land in the band above. A colour already inside is unchanged.
 */
export function fitForCharts(hex: string): string {
  const y = luminance(hex);
  if (y >= CHART_LUMINANCE_MIN && y <= CHART_LUMINANCE_MAX) return hex.toUpperCase();
  const target =
    y < CHART_LUMINANCE_MIN ? CHART_LUMINANCE_MIN + 0.005 : CHART_LUMINANCE_MAX - 0.005;
  const [h, s] = rgbToHsl(toRgb(hex));
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 30; i += 1) {
    const mid = (lo + hi) / 2;
    if (luminance(toHex(hslToRgb([h, s, mid]))) < target) lo = mid;
    else hi = mid;
  }
  return toHex(hslToRgb([h, s, (lo + hi) / 2]));
}

/**
 * Fallback colours for projects with neither a chosen colour nor a logo.
 *
 * Vivid and mutually distinct, ordered so NEIGHBOURS contrast - neighbouring
 * ranks are what end up side by side in a stacked band or a ring. Every entry
 * already sits in the chart band. None is terracotta or ChatGPT green, so a
 * fallback never reads as the agent's accent.
 */
export const FALLBACK_COLORS: readonly string[] = [
  '#3B82F6', // blue
  '#D946EF', // fuchsia
  '#0D9488', // teal
  '#D97706', // amber
  '#8B5CF6', // violet
  '#DB2777', // pink
  '#0891B2', // cyan
  '#65A30D', // lime
  '#6366F1', // indigo
  '#E11D48', // rose
  '#C38504', // yellow
  '#7C3AED', // purple
];

/**
 * The neutral for "everything else" (Others, Other). Outside every palette on
 * purpose: a remainder has no identity, and its summed value can exceed the
 * slice beside it. A CSS mix, so it follows the theme.
 */
export const OTHER_PROJECTS_COLOR = 'color-mix(in srgb, var(--text-faint) 55%, var(--surface))';

/**
 * The colour each project is drawn in, in the order above. `projects` must be
 * in a stable order (the report's, largest spend first), because that order is
 * what hands out the fallbacks: the same project gets the same colour on every
 * chart that asks.
 */
export function assignProjectColors(
  projects: ReadonlyArray<{ id: string }>,
  custom: Readonly<Record<string, string>>,
  fromLogo: (id: string) => string | null | undefined,
): Map<string, { color: string; source: ProjectColorSource }> {
  const out = new Map<string, { color: string; source: ProjectColorSource }>();
  let next = 0;
  for (const { id } of projects) {
    const chosen = custom[id];
    if (isHexColor(chosen)) {
      out.set(id, { color: chosen.toUpperCase(), source: 'custom' });
      continue;
    }
    const logo = fromLogo(id);
    if (logo) {
      out.set(id, { color: fitForCharts(logo), source: 'logo' });
      continue;
    }
    out.set(id, {
      color: FALLBACK_COLORS[next % FALLBACK_COLORS.length],
      source: 'auto',
    });
    next += 1;
  }
  return out;
}

/**
 * The dominant colour of a logo, from its RGBA pixels - or null when it has
 * none worth using (fully transparent, say).
 *
 * **The background is found and left out**, since a logo is usually a mark on
 * a field and the field is not what identifies it:
 *
 * - transparent pixels are never counted;
 * - the colours that fill the image's outer BAND - a few pixels deep, not just
 *   the outermost ring, because an app-icon tile has a 1px border around a
 *   fill of another colour and both are background - are the background, and
 *   every pixel of those colours is left out.
 *
 * Of what is left, colourful pixels win: when a meaningful share of the mark
 * is coloured, the heaviest coloured bin is the answer (an orange mark with
 * white lettering is orange), and only a mark that is all black, white and
 * grey is answered in grey. One exception, so that "avoid the background"
 * does not throw away the only colour there is: a plain white or black glyph
 * on a COLOURED tile returns the tile's colour, since that tile is the
 * identity.
 */
export function dominantColorFromPixels(
  data: ArrayLike<number>,
  width: number,
  height: number,
): string | null {
  if (width <= 0 || height <= 0 || data.length < width * height * 4) return null;

  const band = Math.max(1, Math.round(Math.min(width, height) * 0.06));
  const binOf = (o: number) =>
    ((data[o] >> 5) << 6) | ((data[o + 1] >> 5) << 3) | (data[o + 2] >> 5);

  // The background: every colour holding a fifth of the edge band's opaque
  // pixels, provided the band is mostly opaque (a mark on nothing has none).
  const edge = new Map<number, Bin>();
  let bandTotal = 0;
  let bandOpaque = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x >= band && y >= band && x < width - band && y < height - band) continue;
      bandTotal += 1;
      const o = (y * width + x) * 4;
      if (data[o + 3] < 128) continue;
      bandOpaque += 1;
      add(edge, binOf(o), data, o);
    }
  }
  const background = new Set<number>();
  if (bandOpaque >= bandTotal * 0.5) {
    for (const [key, bin] of edge) if (bin.n >= bandOpaque * 0.2) background.add(key);
  }

  const fg = new Map<number, Bin>();
  let fgTotal = 0;
  for (let i = 0; i < width * height; i += 1) {
    const o = i * 4;
    if (data[o + 3] < 128) continue;
    const key = binOf(o);
    if (background.has(key)) continue;
    fgTotal += 1;
    add(fg, key, data, o);
  }

  const chromatic = [...fg.values()].filter((bin) => chromaOf(bin) >= 0.18);
  const chromaticTotal = chromatic.reduce((sum, bin) => sum + bin.n, 0);
  if (chromatic.length && chromaticTotal >= fgTotal * 0.04) {
    return meanHex(heaviest(chromatic, (bin) => bin.n * (0.5 + chromaOf(bin))));
  }

  const tile = [...background].map((key) => edge.get(key)!).filter((bin) => chromaOf(bin) >= 0.18);
  if (tile.length) return meanHex(heaviest(tile, (bin) => bin.n));

  if (!fgTotal) return null;
  return meanHex(heaviest([...fg.values()], (bin) => bin.n));
}

interface Bin {
  n: number;
  r: number;
  g: number;
  b: number;
}

function add(bins: Map<number, Bin>, key: number, data: ArrayLike<number>, o: number): void {
  const bin = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
  bin.n += 1;
  bin.r += data[o];
  bin.g += data[o + 1];
  bin.b += data[o + 2];
  bins.set(key, bin);
}

/** 0 for a grey, up to 1 for a fully saturated primary. */
function chromaOf(bin: Bin): number {
  const r = bin.r / bin.n;
  const g = bin.g / bin.n;
  const b = bin.b / bin.n;
  return (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
}

function heaviest(bins: Bin[], weight: (bin: Bin) => number): Bin {
  return bins.reduce((best, bin) => (weight(bin) > weight(best) ? bin : best));
}

function meanHex(bin: Bin): string {
  return toHex([bin.r / bin.n, bin.g / bin.n, bin.b / bin.n]);
}
