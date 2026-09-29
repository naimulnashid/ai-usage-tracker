import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { ACCENT_PALETTES, modelColor } from '../src/lib/model-colors';
import {
  describeRates,
  isValidModelName,
  loadModelSettings,
  modelSettingsPath,
  saveModelSetting,
  toModelRate,
  withCustomRates,
} from '../src/lib/model-settings';
import { getRate } from '../src/lib/pricing';
import { tempDir, testPricing } from './helpers';

const RATE = { input: 3, cacheWrite5m: 3.75, cacheWrite1h: 6, cacheRead: 0.3, output: 15 };
const SHADE = ACCENT_PALETTES.claude[2];

const root = tempDir();
const previous = process.env.DASHBOARD_DATA_DIR;

// A fresh data folder per test, so no test sees another's settings - and
// none of them can touch the real `data/` folder.
beforeEach(() => {
  process.env.DASHBOARD_DATA_DIR = fs.mkdtempSync(path.join(root, 'case-'));
});

afterEach(() => {
  if (previous === undefined) delete process.env.DASHBOARD_DATA_DIR;
  else process.env.DASHBOARD_DATA_DIR = previous;
});

describe('model settings', () => {
  it('starts empty, with no file', () => {
    assert.deepEqual(loadModelSettings('claude'), { pricing: {}, colors: {} });
    assert.equal(fs.existsSync(modelSettingsPath('claude')), false);
  });

  it('saves a rate and a colour, reads them back, and clears them with null', () => {
    saveModelSetting('claude', 'claude-new-model', { rate: RATE });
    saveModelSetting('claude', 'claude-new-model', { color: SHADE });
    assert.deepEqual(loadModelSettings('claude'), {
      pricing: { 'claude-new-model': RATE },
      colors: { 'claude-new-model': SHADE },
    });

    // Leaving a field out leaves it alone; null removes it.
    saveModelSetting('claude', 'claude-new-model', { rate: null });
    assert.deepEqual(loadModelSettings('claude'), {
      pricing: {},
      colors: { 'claude-new-model': SHADE },
    });
  });

  it('keeps the two agents apart', () => {
    saveModelSetting('claude', 'claude-new-model', { rate: RATE });
    assert.deepEqual(loadModelSettings('codex').pricing, {});
  });

  it('refuses a colour from outside the agent’s own shades', () => {
    assert.throws(() => saveModelSetting('claude', 'm', { color: '#FF0000' }));
    // Codex's teal is not a Claude Code shade either.
    assert.throws(() => saveModelSetting('claude', 'm', { color: ACCENT_PALETTES.codex[0] }));
  });

  it('refuses a negative, missing or absurd rate', () => {
    assert.equal(toModelRate({ ...RATE, output: -1 }), null);
    assert.equal(toModelRate({ input: 1 }), null);
    assert.equal(toModelRate({ ...RATE, input: 1e9 }), null);
    assert.equal(toModelRate({ ...RATE, input: Number.NaN }), null);
    assert.deepEqual(toModelRate(RATE), RATE);
  });

  it('refuses names that could not be a model', () => {
    for (const bad of ['', '_comment', '__proto__', 'constructor', ' padded ', 'x'.repeat(201)]) {
      assert.equal(isValidModelName(bad), false, JSON.stringify(bad));
    }
    assert.equal(isValidModelName('claude-opus-5'), true);
  });

  it('fails soft on a corrupt file', () => {
    fs.mkdirSync(path.dirname(modelSettingsPath('claude')), { recursive: true });
    fs.writeFileSync(modelSettingsPath('claude'), '{ not json');
    assert.deepEqual(loadModelSettings('claude'), { pricing: {}, colors: {} });
  });

  it('drops a stored colour that is no longer a palette shade', () => {
    fs.mkdirSync(path.dirname(modelSettingsPath('claude')), { recursive: true });
    fs.writeFileSync(
      modelSettingsPath('claude'),
      JSON.stringify({ version: 1, pricing: {}, colors: { a: '#123456', b: SHADE } }),
    );
    assert.deepEqual(loadModelSettings('claude').colors, { b: SHADE });
  });
});

describe('custom rates over the rate card', () => {
  const card = testPricing({ aliases: { 'review-bot': 'cheap-model' } });

  it('prices an unknown model, and wins over the card', () => {
    const pricing = withCustomRates(card, { 'brand-new': RATE, 'test-model': RATE });
    assert.deepEqual(getRate(pricing, 'brand-new'), RATE);
    assert.deepEqual(getRate(pricing, 'test-model'), RATE);
    assert.deepEqual(pricing.customModels, ['brand-new', 'test-model']);
    // The card itself is untouched.
    assert.equal(card.models['brand-new'], undefined);
  });

  it('says where each rate came from, and whether a reset leaves one behind', () => {
    const rates = describeRates(card, { 'brand-new': RATE, 'test-model': RATE }, [
      'brand-new',
      'test-model',
      'cheap-model',
      'review-bot',
      'nobody-knows',
    ]);
    assert.equal(rates['brand-new'].source, 'custom');
    assert.equal(rates['brand-new'].onCard, false);
    assert.equal(rates['test-model'].source, 'custom');
    assert.equal(rates['test-model'].onCard, true);
    assert.equal(rates['cheap-model'].source, 'card');
    assert.equal(rates['review-bot'].source, 'alias');
    assert.equal(rates['review-bot'].aliasOf, 'cheap-model');
    assert.equal(rates['nobody-knows'].source, 'none');
    assert.equal(rates['nobody-knows'].rate, null);
  });
});

describe('model colours', () => {
  it('uses a chosen shade, and the ramp otherwise', () => {
    assert.equal(modelColor('claude-opus-5', { 'claude-opus-5': SHADE }), SHADE);
    assert.notEqual(modelColor('claude-opus-5'), SHADE);
  });
});
