import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { costOf, getRate, resolveProjectId } from '../src/lib/pricing';
import { parseTimestampMs, toTokenCount } from '../src/lib/parser';
import { testPricing } from './helpers';

describe('pricing', () => {
  const pricing = testPricing({ aliases: { 'codex-auto-review': 'cheap-model' } });

  it('prices each bucket at its own rate, per million tokens', () => {
    const cost = costOf(
      {
        input: 1_000_000,
        output: 1_000_000,
        cacheRead: 1_000_000,
        cacheWrite5m: 1_000_000,
        cacheWrite1h: 1_000_000,
      },
      getRate(pricing, 'test-model'),
    );
    // 10 + 50 + 1 + 12.50 + 20
    assert.equal(Number(cost.toFixed(2)), 93.5);
  });

  it('never bills reasoning tokens, which are already inside output', () => {
    const rate = getRate(pricing, 'test-model');
    const withReasoning = costOf(
      {
        input: 0,
        output: 1_000_000,
        cacheRead: 0,
        cacheWrite5m: 0,
        cacheWrite1h: 0,
        reasoning: 900_000,
      },
      rate,
    );
    assert.equal(Number(withReasoning.toFixed(2)), 50);
  });

  it('follows one alias hop, and returns null for an unknown model', () => {
    assert.equal(getRate(pricing, 'codex-auto-review')?.input, 1);
    assert.equal(getRate(pricing, 'brand-new-model'), null);
    assert.equal(
      costOf({ input: 1_000_000, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 }, null),
      0,
    );
  });
});

describe('project merge rules', () => {
  it('follows a chain to its end', () => {
    const warnings: string[] = [];
    const merge = { a: 'b', b: 'c' };
    assert.equal(resolveProjectId('a', merge, warnings), 'c');
    assert.equal(resolveProjectId('c', merge, warnings), 'c');
    assert.deepEqual(warnings, []);
  });

  it('ignores a cycle with a warning instead of hanging', () => {
    const warnings: string[] = [];
    assert.equal(resolveProjectId('a', { a: 'b', b: 'a' }, warnings), 'a');
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /cycle/i);
  });
});

describe('field guards', () => {
  it('accepts only non-negative integer token counts', () => {
    assert.equal(toTokenCount(10), 10);
    assert.equal(toTokenCount(10.9), 10);
    assert.equal(toTokenCount(-1), 0);
    assert.equal(toTokenCount(Number.NaN), 0);
    assert.equal(toTokenCount(Infinity), 0);
    assert.equal(toTokenCount('100'), 0);
    assert.equal(toTokenCount(null), 0);
    assert.equal(toTokenCount(undefined), 0);
  });

  it('accepts only plausible timestamps', () => {
    assert.equal(parseTimestampMs('2026-08-01T10:00:00Z'), Date.parse('2026-08-01T10:00:00Z'));
    assert.equal(parseTimestampMs('+275760-09-13T00:00:00Z'), null, 'the Date range limit');
    assert.equal(parseTimestampMs('1999-12-31T23:59:59Z'), null, 'before either agent existed');
    assert.equal(parseTimestampMs('not a date'), null);
    assert.equal(parseTimestampMs(''), null);
    assert.equal(parseTimestampMs(12345), null);
    assert.equal(parseTimestampMs(null), null);

    const farFuture = new Date(Date.now() + 400 * 86_400_000).toISOString();
    assert.equal(parseTimestampMs(farFuture), null, 'more than a year of clock skew');
    const nearFuture = new Date(Date.now() + 86_400_000).toISOString();
    assert.ok(parseTimestampMs(nearFuture), 'a day of skew is fine');
  });
});
