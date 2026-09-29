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

  it('drops <synthetic> from an archive written before the parser did', () => {
    const cell = (messages: number, runtimeSeconds: number) => ({
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite5m: 0,
      cacheWrite1h: 0,
      messages,
      runtimeSeconds,
      totalTokens: 0,
      costUsd: 0,
      unpriced: false,
    });
    const days = sanitizeDays(
      {
        '2026-08-01': {
          perModel: { 'test-model': cell(5, 100), '<synthetic>': cell(2, 30) },
          combined: cell(7, 130),
          projects: {
            [DIR]: {
              perModel: { 'test-model': cell(5, 100), '<synthetic>': cell(2, 30) },
              combined: cell(7, 130),
            },
          },
        },
      },
      'history.json',
    );
    const day = days['2026-08-01'];
    assert.deepEqual(Object.keys(day.perModel), ['test-model']);
    // Messages come out, so the day compares like for like with a fresh parse;
    // the runtime was spent, so the combined figure keeps it.
    assert.equal(day.combined.messages, 5);
    assert.equal(day.combined.runtimeSeconds, 130);
    assert.deepEqual(Object.keys(day.projects[DIR].perModel), ['test-model']);
  });

  it('prices archived days at today’s rates, so a new rate reaches them too', async () => {
    // Recorded while the model had no rate: counted, but at $0.
    const unpriced = await (async () => {
      const root = tempDir();
      writeLines(path.join(root, DIR, 's1.jsonl'), [
        assistantLine({
          ts: '2026-08-01T10:00:00Z',
          id: 'msg_new',
          model: 'brand-new',
          output: 1_000_000,
          cwd: CWD,
        }),
      ]);
      return buildUsageReport({
        projectsDir: root,
        pricing: testPricing(),
        settings: testSettings(),
      });
    })();
    assert.equal(unpriced.global.combined.costUsd, 0);
    const history = mergeReportIntoHistory(emptyHistory(), unpriced);

    // The transcript is gone; the model now has a rate.
    const later = await reportFor([{ date: '2026-08-02', output: 1_000_000 }]);
    const merged = mergeReportIntoHistory(history, later);
    const pricing = testPricing();
    pricing.models['brand-new'] = { ...pricing.models['test-model'], output: 7 };
    const restored = applyHistoryToReport(later, merged, pricing);

    const archived = restored.global.daily.find((d) => d.date === '2026-08-01')!;
    assert.equal(archived.perModel['brand-new'].costUsd, 7);
    assert.equal(archived.perModel['brand-new'].unpriced, false);
    assert.equal(archived.combined.costUsd, 7);
    assert.equal(restored.global.combined.costUsd, 7 + 50);
    assert.equal(restored.projects[0].combined.costUsd, 7 + 50);
    // The file on disk still says what it said.
    assert.equal(merged.days['2026-08-01'].combined.costUsd, 0);
  });

  it('refreshes a project’s day-derived activity from the archive', async () => {
    const full = await reportFor([
      { date: '2026-08-01', output: 1 },
      { date: '2026-08-02', output: 1 },
    ]);
    const history = mergeReportIntoHistory(emptyHistory(), full);
    const thinned = await reportFor([{ date: '2026-08-02', output: 1 }]);
    const restored = applyHistoryToReport(thinned, mergeReportIntoHistory(history, thinned));
    assert.equal(restored.projects[0].activity?.activeDays, 2);
    assert.equal(restored.projects[0].activity?.messages, 2);
    // Sessions are not archived, so those still describe what is on disk.
    assert.equal(restored.projects[0].activity?.sessions, 1);
  });
});
