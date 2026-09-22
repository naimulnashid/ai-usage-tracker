import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  HEATMAP_WEEKS,
  fullHeatmap,
  fullHistoryStart,
  hasHistoryBeforeWindow,
  heatmapToday,
  recentHeatmap,
  stripLabel,
  weekStartDay,
  windowStart,
} from '../src/lib/heatmap';
import type { DailyEntry } from '../src/lib/types';
import { UNKNOWN_DATE } from '../src/lib/usage-math';

function day(date: string, cost: number): DailyEntry {
  return {
    date,
    perModel: {},
    combined: {
      input: 10,
      output: 10,
      cacheRead: 0,
      cacheWrite5m: 0,
      cacheWrite1h: 0,
      messages: cost > 0 ? 1 : 0,
      runtimeSeconds: 60,
      totalTokens: cost > 0 ? 20 : 0,
      costUsd: cost,
      unpriced: false,
    },
  };
}

const saturday = weekStartDay('saturday');
const today = heatmapToday('2027-03-10T12:00:00Z', 0); // a Wednesday
const iso = (date: Date) => date.toISOString().slice(0, 10);

describe('the overview strip', () => {
  const heatmap = recentHeatmap([day('2027-03-10', 3), day('2026-01-01', 9)], today, saturday);

  it('is one strip of six months of weeks', () => {
    assert.equal(heatmap.strips.length, 1);
    assert.equal(heatmap.strips[0].cells.length, HEATMAP_WEEKS * 7);
  });

  it('ends on today, with the rest of this week blank', () => {
    const shown = heatmap.strips[0].cells.filter((cell) => !cell.outside);
    assert.equal(shown.at(-1)?.date, '2027-03-10');
    assert.equal(heatmap.strips[0].cells.at(-1)?.outside, true);
  });

  it('starts its weeks on the configured weekday', () => {
    assert.equal(new Date(`${heatmap.strips[0].cells[0].date}T00:00:00Z`).getUTCDay(), 6);
  });

  it('counts only what it shows', () => {
    assert.equal(heatmap.total, 3);
    assert.equal(heatmap.activeDays, 1);
  });
});

describe('when the overview offers the full history', () => {
  const firstShown = iso(windowStart(today, saturday));

  it('does not while everything fits in six months', () => {
    assert.equal(hasHistoryBeforeWindow([day(firstShown, 1)], today, saturday), false);
  });

  it('does once a recorded day is older than the strip', () => {
    assert.equal(hasHistoryBeforeWindow([day('2026-07-04', 1)], today, saturday), true);
  });

  it('ignores the undated bucket and days that recorded nothing', () => {
    const daily = [day(UNKNOWN_DATE, 5), day('2026-07-04', 0), day('2027-03-01', 1)];
    assert.equal(hasHistoryBeforeWindow(daily, today, saturday), false);
  });
});

describe('the full history', () => {
  const daily = [
    day(UNKNOWN_DATE, 5),
    day('2026-06-20', 0),
    day('2026-07-04', 2),
    day('2027-03-10', 1),
  ];

  it('starts on the first of the earliest recorded month', () => {
    assert.equal(fullHistoryStart(daily), '2026-07-01');
    assert.equal(fullHistoryStart([day(UNKNOWN_DATE, 5)]), null);
  });

  const heatmap = fullHeatmap(daily, '2026-07-01', today, saturday);

  it('repeats the overview strip downwards, same width each time', () => {
    assert.equal(heatmap.strips.length, 2);
    for (const strip of heatmap.strips) assert.equal(strip.cells.length, HEATMAP_WEEKS * 7);
  });

  it('shows every day from the start to today exactly once, in order', () => {
    const shown = heatmap.strips.flatMap((strip) =>
      strip.cells.filter((cell) => !cell.outside).map((cell) => cell.date),
    );
    assert.equal(shown[0], '2026-07-01');
    assert.equal(shown.at(-1), '2027-03-10');
    // Jul 1 2026 to Mar 10 2027 inclusive.
    assert.equal(shown.length, 253);
    assert.equal(new Set(shown).size, shown.length);
    assert.deepEqual([...shown].sort(), shown);
  });

  it('blanks the days of the first week before the start', () => {
    const first = heatmap.strips[0].cells.slice(0, 7);
    assert.deepEqual(
      first.map((cell) => [cell.date, cell.outside]),
      [
        ['2026-06-27', true],
        ['2026-06-28', true],
        ['2026-06-29', true],
        ['2026-06-30', true],
        ['2026-07-01', false],
        ['2026-07-02', false],
        ['2026-07-03', false],
      ],
    );
  });

  it('names a column after its first shown day, not the month before', () => {
    assert.deepEqual(heatmap.strips[0].months[0], { label: 'Jul', column: 0 });
  });

  it('labels each strip with its span and year', () => {
    assert.equal(stripLabel(heatmap.strips[0]), 'Jul 2026 – Dec 2026');
    assert.equal(stripLabel(heatmap.strips[1]), 'Dec 2026 – Mar 2027');
  });

  it('scales and totals over the whole history', () => {
    assert.equal(heatmap.max, 2);
    assert.equal(heatmap.total, 3);
    assert.equal(heatmap.activeDays, 2);
  });

  it('is one strip when the history is short', () => {
    assert.equal(fullHeatmap(daily, '2027-02-01', today, saturday).strips.length, 1);
  });
});
