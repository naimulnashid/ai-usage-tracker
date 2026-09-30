/**
 * Contrast is a number, so it gets a test rather than an opinion.
 *
 * These lock in the WCAG ratios the accessibility pass established. If a token
 * or a shade is edited to something prettier but dimmer, this fails before it
 * reaches anyone.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  ACCENT_PALETTES,
  LIGHT_PALETTES,
  MODEL_SHADES,
  themedColor,
} from '../src/lib/model-colors';

const css = fs.readFileSync(path.join(process.cwd(), 'src/app/globals.css'), 'utf8');

/** Token values from a block, e.g. `:root {` or `[data-provider='codex'] {`. */
function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  assert.ok(start >= 0, `selector not found: ${selector}`);
  const block = css.slice(start, css.indexOf('\n}', start));
  const found: Record<string, string> = {};
  for (const [, name, value] of block.matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    found[name] = value;
  }
  return found;
}

const lin = (c: number) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const luminance = (hex: string) => {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const root = tokens(':root {');
const codex = tokens("[data-provider='codex'] {");

/** Every background small text sits on. */
const BACKDROPS = [
  ['--bg', root['--bg']],
  ['--surface', root['--surface']],
  ['--surface-hover', root['--surface-hover']],
  ['--tooltip-bg', root['--tooltip-bg']],
] as const;

describe('text contrast (WCAG AA, 4.5:1)', () => {
  for (const [name, backdrop] of BACKDROPS) {
    it(`--text-faint on ${name}`, () => {
      const ratio = contrast(root['--text-faint'], backdrop);
      assert.ok(ratio >= 4.5, `${ratio.toFixed(2)}:1 - small text needs 4.5:1`);
    });

    it(`--text-muted on ${name}`, () => {
      assert.ok(contrast(root['--text-muted'], backdrop) >= 4.5);
    });
  }

  it('both accents carry text at AA on the panel', () => {
    assert.ok(contrast(root['--accent'], root['--surface']) >= 4.5);
    assert.ok(contrast(codex['--accent'], root['--surface']) >= 4.5);
  });
});

describe('non-text contrast (WCAG 1.4.11, 3:1)', () => {
  it('every model shade stands out from the panel', () => {
    for (const [model, shade] of Object.entries(MODEL_SHADES)) {
      const ratio = contrast(shade.color, root['--surface']);
      assert.ok(ratio >= 3, `${model} is ${ratio.toFixed(2)}:1 against the panel`);
    }
  });

  for (const [theme, block] of [
    ['Claude Code', root],
    ['Codex', codex],
  ] as const) {
    it(`${theme}'s heat map steps stand out from the panel`, () => {
      // --hm-0 is the absence of data, so it is exempt.
      for (const step of [1, 2, 3, 4, 5]) {
        const value = block[`--hm-${step}`];
        assert.ok(value, `${theme} is missing --hm-${step}`);
        const ratio = contrast(value, root['--surface']);
        assert.ok(ratio >= 3, `${theme} --hm-${step} is ${ratio.toFixed(2)}:1`);
      }
    });

    it(`${theme}'s heat map gets lighter as usage rises`, () => {
      const steps = [1, 2, 3, 4, 5].map((n) => luminance(block[`--hm-${n}`]));
      for (let i = 1; i < steps.length; i++) {
        assert.ok(steps[i] > steps[i - 1], `--hm-${i + 1} is not lighter than --hm-${i}`);
      }
    });
  }
});

describe('the ramp still encodes price', () => {
  for (const [agent, prefix] of [
    ['Claude Code', 'claude-'],
    ['Codex', /^(gpt|codex)-/],
  ] as const) {
    it(`${agent}: a dearer model is never lighter than a cheaper one`, () => {
      const shades = Object.entries(MODEL_SHADES).filter(([model]) =>
        typeof prefix === 'string' ? model.startsWith(prefix) : prefix.test(model),
      );
      assert.ok(shades.length > 1);
      const byPrice = [...shades].sort((a, b) => b[1].outputPrice - a[1].outputPrice);
      for (let i = 1; i < byPrice.length; i++) {
        const dearer = byPrice[i - 1];
        const cheaper = byPrice[i];
        if (dearer[1].outputPrice === cheaper[1].outputPrice) continue;
        assert.ok(
          luminance(dearer[1].color) < luminance(cheaper[1].color),
          `${dearer[0]} ($${dearer[1].outputPrice}) should be darker than ${cheaper[0]} ($${cheaper[1].outputPrice})`,
        );
      }
    });
  }
});

describe('charts use tokens, not their own colours', () => {
  it('no chart component hard-codes a hex colour', () => {
    const dir = path.join(process.cwd(), 'src/components');
    const offenders: string[] = [];
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('Chart.tsx'))) {
      const source = fs.readFileSync(path.join(dir, file), 'utf8');
      for (const [hex] of source.matchAll(/#[0-9a-fA-F]{6}\b/g)) offenders.push(`${file}: ${hex}`);
    }
    assert.deepEqual(offenders, [], 'use a CSS variable so both agents re-theme');
  });
});

describe('the shades a user can pick', () => {
  it('every palette shade stands out from the panel', () => {
    for (const [agent, palette] of Object.entries(ACCENT_PALETTES)) {
      for (const shade of palette) {
        const ratio = contrast(shade, root['--surface']);
        assert.ok(ratio >= 3, `${agent} ${shade} is ${ratio.toFixed(2)}:1 against the panel`);
      }
    }
  });

  it('runs deepest to lightest, so its order means what the ramp means', () => {
    for (const [agent, palette] of Object.entries(ACCENT_PALETTES)) {
      for (let i = 1; i < palette.length; i++) {
        assert.ok(
          luminance(palette[i]) > luminance(palette[i - 1]),
          `${agent}: ${palette[i]} is not lighter than ${palette[i - 1]}`,
        );
      }
    }
  });

  it("offers every model's default shade, so picking can always go back", () => {
    const all = Object.values(ACCENT_PALETTES).flat();
    for (const [model, shade] of Object.entries(MODEL_SHADES)) {
      assert.ok(all.includes(shade.color), `${model}'s ${shade.color} is not a palette choice`);
    }
  });
});

/*
 * The light theme gets the same scrutiny. Its tokens live in their own blocks,
 * and a light theme that looked fine on a bright monitor is exactly the kind
 * that fails 4.5:1 on a dim one.
 */
const light = tokens(":root[data-theme='light'] {");
const lightCodex = tokens("[data-theme='light'] [data-provider='codex'] {");

describe('the light theme: text contrast (WCAG AA, 4.5:1)', () => {
  for (const name of ['--bg', '--surface', '--surface-hover', '--tooltip-bg'] as const) {
    it(`--text-faint and --text-muted on ${name}`, () => {
      for (const text of ['--text-faint', '--text-muted'] as const) {
        const ratio = contrast(light[text], light[name]);
        assert.ok(ratio >= 4.5, `${text} is ${ratio.toFixed(2)}:1 on ${name}`);
      }
    });
  }

  it('both accents, and their hover shades, carry text on the page and the panel', () => {
    for (const block of [light, lightCodex]) {
      for (const accent of ['--accent', '--accent-bright'] as const) {
        assert.ok(contrast(block[accent], light['--surface']) >= 4.5);
        assert.ok(contrast(block[accent], light['--bg']) >= 4.5);
      }
    }
  });

  it('warnings and good news are readable', () => {
    assert.ok(contrast(light['--warn'], light['--surface']) >= 4.5);
    assert.ok(contrast(light['--good'], light['--surface']) >= 4.5);
  });
});

describe('the light theme: non-text contrast (3:1)', () => {
  for (const [theme, block] of [
    ['Claude Code', light],
    ['Codex', lightCodex],
  ] as const) {
    it(`${theme}'s heat map steps stand out from white, and DARKEN as usage rises`, () => {
      const steps = [1, 2, 3, 4, 5].map((n) => block[`--hm-${n}`]);
      for (const [i, value] of steps.entries()) {
        assert.ok(value, `${theme} is missing --hm-${i + 1}`);
        assert.ok(contrast(value, light['--surface']) >= 3, `--hm-${i + 1} ${value}`);
        if (i > 0) assert.ok(luminance(value) < luminance(steps[i - 1]), `--hm-${i + 1}`);
      }
    });
  }

  it('every light palette shade stands out from white, deepest first', () => {
    for (const [agent, palette] of Object.entries(LIGHT_PALETTES)) {
      for (const [i, shade] of palette.entries()) {
        const ratio = contrast(shade, light['--surface']);
        assert.ok(ratio >= 3, `${agent} ${shade} is ${ratio.toFixed(2)}:1 on white`);
        if (i > 0) assert.ok(luminance(shade) > luminance(palette[i - 1]));
      }
    }
  });

  it('pairs every dark shade with a light twin, index for index', () => {
    for (const agent of Object.keys(ACCENT_PALETTES) as Array<keyof typeof ACCENT_PALETTES>) {
      assert.equal(LIGHT_PALETTES[agent].length, ACCENT_PALETTES[agent].length);
    }
    for (const [model, shade] of Object.entries(MODEL_SHADES)) {
      const twin = themedColor(shade.color, 'light');
      assert.notEqual(twin, shade.color, `${model} has no light twin`);
      assert.ok(contrast(twin, light['--surface']) >= 3);
    }
  });
});
