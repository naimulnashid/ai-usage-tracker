import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  daysInRange,
  lastActiveDate,
  reportToday,
  sumDays,
  type DayRange,
} from '../src/lib/day-range';
import type { DailyEntry, UsageCell } from '../src/lib/types';
import { UNKNOWN_DATE } from '../src/lib/usage-math';

function cell(tokens: number, cost: number, extra: Partial<UsageCell> = {}): UsageCell {
  return {
    input: tokens / 2,
    output: tokens / 2,
    cacheRead: 0,
    cacheWrite5m: 0,
    cacheWrite1h: 0,
    messages: 1,
    runtimeSeconds: 60,
    totalTokens: tokens,
    costUsd: cost,
    unpriced: false,
    ...extra,
  };
}

function day(date: string, perModel: Record<string, UsageCell>): DailyEntry {
  const cells = Object.values(perModel);
  const tokens = cells.reduce((sum, c) => sum + c.totalTokens, 0);
  const cost = cells.reduce((sum, c) => sum + c.costUsd, 0);
  return { date, perModel, combined: cell(tokens, cost, { messages: cells.length }) };
}

const daily: DailyEntry[] = [
  day(UNKNOWN_DATE, { 'model-a': cell(5, 0.5) }),
  day('2026-06-01', { 'model-a': cell(100, 1) }),
  day('2026-09-01', { 'model-a': cell(200, 2), 'model-b': cell(50, 5) }),
  day('2026-09-20', { 'model-b': cell(10, 1) }),
];

describe('reportToday', () => {
  it('takes the calendar day at the offset days were bucketed with', () => {
    // 20:00 UTC is already the next day at UTC+6.
    assert.equal(reportToday('2026-09-21T20:00:00.000Z', 6), '2026-09-22');
    assert.equal(reportToday('2026-09-21T20:00:00.000Z', 0), '2026-09-21');
    assert.equal(reportToday('2026-09-22T02:00:00.000Z', -5), '2026-09-21');
  });

  it('gives up rather than throwing on a stamp it cannot read', () => {
    assert.equal(reportToday('not a date', 0), null);
  });
});

describe('daysInRange', () => {
  const today = '2026-09-22';

  it('is exactly N calendar days ending today, idle days included', () => {
    const days = daysInRange(daily, '30', today);
    assert.equal(days.length, 30);
    assert.equal(days[0].date, '2026-08-24');
    assert.equal(days.at(-1)?.date, today);
    // Every day in between, with no gap and no repeat.
    for (let i = 1; i < days.length; i += 1) {
      const step = Date.parse(days[i].date) - Date.parse(days[i - 1].date);
      assert.equal(step, 86_400_000);
    }
  });

  it('carries the recorded day where there is one, and an empty day where not', () => {
    const days = daysInRange(daily, '30', today);
    const recorded = days.find((d) => d.date === '2026-09-01');
    assert.equal(recorded?.perModel['model-b']?.costUsd, 5);
    const idle = days.find((d) => d.date === '2026-09-10');
    assert.deepEqual(idle?.perModel, {});
    assert.equal(idle?.combined.totalTokens, 0);
  });

  it('reaches back further for a longer window', () => {
    const days = daysInRange(daily, '60', today);
    assert.equal(days.length, 60);
    assert.equal(days[0].date, '2026-07-25');
  });

  it('crosses a month end and a year end without skipping a day', () => {
    const days = daysInRange([], '30', '2027-01-10');
    assert.equal(days[0].date, '2026-12-12');
    assert.ok(days.some((d) => d.date === '2026-12-31'));
    assert.ok(days.some((d) => d.date === '2027-01-01'));
  });

  it('leaves the undated bucket out of a window, and in "All days"', () => {
    assert.ok(!daysInRange(daily, '60', today).some((d) => d.date === UNKNOWN_DATE));
    assert.equal(daysInRange(daily, 'all', today), daily);
  });

  it('shows everything when there is no "today" to end a window on', () => {
    for (const range of ['30', '60', 'all'] as DayRange[]) {
      assert.equal(daysInRange(daily, range, null), daily);
    }
  });
});

describe('sumDays', () => {
  it('totals each model over exactly the days given', () => {
    const { perModel, combined } = sumDays(daysInRange(daily, '30', '2026-09-22'));
    // The June day is outside the window and must not leak into the legend.
    assert.equal(perModel['model-a'].totalTokens, 200);
    assert.equal(perModel['model-b'].totalTokens, 60);
    assert.equal(perModel['model-b'].costUsd, 6);
    assert.equal(combined.costUsd, 8);
  });

  it('marks a model unpriced if any day it appears on was', () => {
    const { perModel } = sumDays([
      day('2026-09-01', { x: cell(10, 0, { unpriced: true }) }),
      day('2026-09-02', { x: cell(10, 0) }),
    ]);
    assert.equal(perModel.x.unpriced, true);
  });

  it('keeps reasoning absent for an agent that does not report it', () => {
    const claude = sumDays([day('2026-09-01', { x: cell(10, 1) })]);
    assert.equal('reasoning' in claude.perModel.x, false);
    const codex = sumDays([
      day('2026-09-01', { x: cell(10, 1, { reasoning: 3 }) }),
      day('2026-09-02', { x: cell(10, 1, { reasoning: 4 }) }),
    ]);
    assert.equal(codex.perModel.x.reasoning, 7);
  });
});

describe('lastActiveDate', () => {
  it('finds the most recent dated day with activity', () => {
    assert.equal(lastActiveDate(daily), '2026-09-20');
  });

  it('never answers with the undated bucket', () => {
    assert.equal(lastActiveDate([daily[0]]), null);
  });
});
