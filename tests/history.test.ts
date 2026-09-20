import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  applyHistoryToReport,
  mergeReportIntoHistory,
  sanitizeDays,
  type HistoryFile,
} from '../src/lib/history';
import { buildUsageReport, encodeProjectDir } from '../src/lib/parser';
import type { UsageReport } from '../src/lib/types';
import { assistantLine, tempDir, testPricing, testSettings, writeLines } from './helpers';

const CWD = 'C:\\Users\\you\\Projects\\My App';
const DIR = encodeProjectDir(CWD);

const emptyHistory = (): HistoryFile => ({
  version: 1,
  updatedAt: '',
  projectMeta: {},
  days: {},
});

/** A report covering the given days, one message each. */
async function reportFor(days: Array<{ date: string; output: number }>): Promise<UsageReport> {
  const root = tempDir();
  writeLines(
    path.join(root, DIR, 's1.jsonl'),
    days.map((day, i) =>
      assistantLine({
        ts: `${day.date}T10:0${i}:00Z`,
        id: `msg_${i}_${day.date}`,
        output: day.output,
        cwd: CWD,
      }),
    ),
  );
  return buildUsageReport({ projectsDir: root, pricing: testPricing(), settings: testSettings() });
}

describe('history archive', () => {
  it('restores days whose transcripts are gone, and says how many', async () => {
    const full = await reportFor([
      { date: '2026-08-01', output: 1_000_000 },
      { date: '2026-08-02', output: 2_000_000 },
    ]);
    const history = mergeReportIntoHistory(emptyHistory(), full);
    assert.equal(Object.keys(history.days).length, 2);

    // The first day's transcript is deleted; only the second is still on disk.
    const thinned = await reportFor([{ date: '2026-08-02', output: 2_000_000 }]);
    const merged = mergeReportIntoHistory(history, thinned);
    const restored = applyHistoryToReport(thinned, merged);

    assert.equal(restored.global.daily.length, 2);
    assert.equal(restored.global.combined.costUsd, full.global.combined.costUsd);
    assert.equal(restored.global.combined.totalTokens, full.global.combined.totalTokens);
    assert.equal(restored.coverage?.archivedOnlyDays, 1);
    assert.equal(restored.coverage?.restored, true);
    assert.equal(restored.coverage?.earliestDate, '2026-08-01');
    assert.equal(
      restored.projects.length,
      1,
      'a project surviving only in the archive still shows',
    );
  });

  it('never lets a thinner parse overwrite a fuller day', async () => {
    const full = await reportFor([{ date: '2026-08-01', output: 2_000_000 }]);
    const history = mergeReportIntoHistory(emptyHistory(), full);
    const storedBefore = history.days['2026-08-01'].combined.costUsd;

    // Same day, but half the transcript is gone: fewer messages, less cost.
    const partial = await reportFor([{ date: '2026-08-01', output: 1 }]);
    partial.global.daily[0].combined.messages = 0;
    mergeReportIntoHistory(history, partial);

    assert.equal(history.days['2026-08-01'].combined.costUsd, storedBefore);
  });

  it('keeps today growing: an equal or larger parse does overwrite', async () => {
    const first = await reportFor([{ date: '2026-08-01', output: 1_000_000 }]);
    const history = mergeReportIntoHistory(emptyHistory(), first);

    const later = await reportFor([
      { date: '2026-08-01', output: 1_000_000 },
      { date: '2026-08-01', output: 3_000_000 },
    ]);
    mergeReportIntoHistory(history, later);

    assert.equal(history.days['2026-08-01'].combined.output, 4_000_000);
  });

  it('drops unreadable days instead of throwing, and coerces missing numbers', () => {
    const warnings: string[] = [];
    const days = sanitizeDays(
      {
        '2026-08-01': {
          combined: { messages: 2, totalTokens: 10, costUsd: 1.5 },
          perModel: { 'test-model': { messages: 2, totalTokens: 10, costUsd: 1.5 } },
          projects: { 'my-app': { combined: { totalTokens: 10 }, perModel: {} } },
        },
        '2026-08-02': { perModel: {} }, // no combined cell - unreadable
        '2026-08-03': 'nonsense',
        '2026-08-04': null,
      },
      'history.json',
      warnings,
    );

    assert.deepEqual(Object.keys(days), ['2026-08-01']);
    assert.equal(days['2026-08-01'].combined.messages, 2);
    assert.equal(days['2026-08-01'].combined.runtimeSeconds, 0, 'missing numbers become 0');
    assert.equal(days['2026-08-01'].combined.unpriced, false);
    assert.equal(days['2026-08-01'].projects['my-app'].combined.totalTokens, 10);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Skipped 3 unreadable days/);
  });

  it('accepts an empty or missing archive without complaint', () => {
    const warnings: string[] = [];
    assert.deepEqual(sanitizeDays(undefined, 'history.json', warnings), {});
    assert.deepEqual(sanitizeDays({}, 'history.json', warnings), {});
    assert.deepEqual(warnings, []);
  });
});
