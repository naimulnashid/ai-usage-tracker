import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import {
  CHART_LUMINANCE_MAX,
  CHART_LUMINANCE_MIN,
  FALLBACK_COLORS,
  assignProjectColors,
  contrastRatio,
  dominantColorFromPixels,
  fitForCharts,
  luminance,
  parseHexColor,
} from '../src/lib/project-colors';
import {
  loadProjectColors,
  projectColorsPath,
  saveProjectColor,
} from '../src/lib/project-colors-store';
import { tempDir } from './helpers';

/** A square RGBA image, painted by a function of (x, y). */
function image(size: number, paint: (x: number, y: number) => number[]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) data.set(paint(x, y), (y * size + x) * 4);
  }
  return data;
}

const inBox = (x: number, y: number, from: number, to: number) =>
  x >= from && x < to && y >= from && y < to;

describe('reading a colour typed by hand', () => {
  it('accepts the usual ways a colour is pasted', () => {
    assert.equal(parseHexColor('#3b82f6'), '#3B82F6');
    assert.equal(parseHexColor(' 3B82F6 '), '#3B82F6');
    assert.equal(parseHexColor('#abc'), '#AABBCC');
  });

  it('refuses anything that is not one', () => {
    for (const bad of ['', '#12345', 'red', '#GGGGGG', '#1234567']) {
      assert.equal(parseHexColor(bad), null, bad);
    }
  });
});

describe('colours fit for a chart in either theme', () => {
  it('moves a colour into the band that clears 3:1 on both panels', () => {
    for (const color of ['#000000', '#FFFFFF', '#0A0A40', '#FFF3B0', '#777777']) {
      const fitted = fitForCharts(color);
      const y = luminance(fitted);
      assert.ok(y >= CHART_LUMINANCE_MIN && y <= CHART_LUMINANCE_MAX, `${color} -> ${fitted}`);
      assert.ok(contrastRatio(fitted, '#0A0A0C') >= 3, `${fitted} on the dark panel`);
      assert.ok(contrastRatio(fitted, '#FFFFFF') >= 3, `${fitted} on the light panel`);
    }
  });

  it('leaves a colour already in the band alone', () => {
    assert.equal(fitForCharts('#3b82f6'), '#3B82F6');
  });

  it('ships fallbacks that already fit', () => {
    for (const color of FALLBACK_COLORS) assert.equal(fitForCharts(color), color);
  });
});

describe('which colour a project is drawn in', () => {
  const projects = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];

  it('prefers your colour, then the logo, then a fallback in rank order', () => {
    const assigned = assignProjectColors(projects, { b: '#123456' }, (id) =>
      id === 'c' ? '#3B82F6' : null,
    );
    assert.deepEqual(assigned.get('b'), { color: '#123456', source: 'custom' });
    assert.deepEqual(assigned.get('c'), { color: '#3B82F6', source: 'logo' });
    // Fallbacks go to a and d, in that order, so neighbours stay distinct.
    assert.deepEqual(assigned.get('a'), { color: FALLBACK_COLORS[0], source: 'auto' });
    assert.deepEqual(assigned.get('d'), { color: FALLBACK_COLORS[1], source: 'auto' });
  });

  it('takes a colour you typed exactly as typed, however dark', () => {
    const assigned = assignProjectColors(projects, { a: '#000000' }, () => null);
    assert.equal(assigned.get('a')?.color, '#000000');
  });
});

describe("a logo's dominant colour", () => {
  const ORANGE = [217, 119, 87, 255];
  const size = 64;

  it('has none when the image is empty', () => {
    assert.equal(
      dominantColorFromPixels(
        image(size, () => [0, 0, 0, 0]),
        size,
        size,
      ),
      null,
    );
  });

  it('skips a dark tile AND its 1px border to find the mark on it', () => {
    // The shape of an app-icon logo: a grey hairline, a black fill, and a
    // smaller orange mark in the middle. Reading only the outermost ring used
    // to call the border the background, and the black fill won.
    const data = image(size, (x, y) => {
      if (x === 0 || y === 0 || x === size - 1 || y === size - 1) return [30, 30, 36, 255];
      if (inBox(x, y, 22, 42)) return ORANGE;
      return [0, 0, 0, 255];
    });
    assert.equal(dominantColorFromPixels(data, size, size), '#D97757');
  });

  it('prefers the coloured part of a mark over its black lettering', () => {
    const data = image(size, (x, y) => {
      if (inBox(x, y, 10, 20)) return ORANGE;
      if (inBox(x, y, 10, 54)) return [0, 0, 0, 255];
      return [0, 0, 0, 0];
    });
    assert.equal(dominantColorFromPixels(data, size, size), '#D97757');
  });

  it("returns a coloured tile's colour when the glyph on it is plain white", () => {
    const data = image(size, (x, y) =>
      inBox(x, y, 24, 40) ? [255, 255, 255, 255] : [16, 163, 127, 255],
    );
    assert.equal(dominantColorFromPixels(data, size, size), '#10A37F');
  });

  it('answers in grey for a mark with no colour at all', () => {
    const data = image(size, (x, y) => (inBox(x, y, 16, 48) ? [60, 60, 60, 255] : [0, 0, 0, 0]));
    assert.equal(dominantColorFromPixels(data, size, size), '#3C3C3C');
  });
});

describe('the chosen colours on disk', () => {
  const root = tempDir();
  const previous = process.env.DASHBOARD_DATA_DIR;
  const APP = 'C--Users-you-Projects-my-app';

  beforeEach(() => {
    process.env.DASHBOARD_DATA_DIR = fs.mkdtempSync(path.join(root, 'case-'));
  });
  afterEach(() => {
    if (previous === undefined) delete process.env.DASHBOARD_DATA_DIR;
    else process.env.DASHBOARD_DATA_DIR = previous;
  });

  it('saves, reads back and clears one project, per agent', () => {
    assert.deepEqual(loadProjectColors('claude'), {});
    assert.deepEqual(saveProjectColor('claude', APP, '#3b82f6'), { [APP]: '#3B82F6' });
    assert.deepEqual(loadProjectColors('claude'), { [APP]: '#3B82F6' });
    assert.deepEqual(loadProjectColors('codex'), {}, 'the agents keep separate files');
    assert.deepEqual(saveProjectColor('claude', APP, null), {});
  });

  it('refuses what is not a colour or not an id', () => {
    assert.throws(() => saveProjectColor('claude', APP, 'red'));
    assert.throws(() => saveProjectColor('claude', '', '#123456'));
    assert.throws(() => saveProjectColor('claude', '__proto__', '#123456'));
  });

  it('fails soft on a file it cannot read, and drops bad entries', () => {
    const file = projectColorsPath('claude');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{ not json');
    assert.deepEqual(loadProjectColors('claude'), {});
    fs.writeFileSync(file, JSON.stringify({ colors: { [APP]: '#ABCDEF', other: 'blue' } }));
    assert.deepEqual(loadProjectColors('claude'), { [APP]: '#ABCDEF' });
  });
});
