import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';

import { buildCodexUsageReport, projectIdFromCwd } from '../src/lib/codex-parser';
import {
  rolloutName,
  sessionMeta,
  tempDir,
  testPricing,
  testSettings,
  tokenCount,
  turnContext,
  writeLines,
} from './helpers';

const CWD = '/home/you/projects/my-app';
const OTHER_CWD = '/home/you/projects/other-app';
const THREAD = '00000000-0000-0000-0000-00000000000a';
const GUARDIAN = '00000000-0000-0000-0000-00000000000b';
const DAY = ['sessions', '2026', '08', '01'];

const pricing = testPricing({ aliases: { 'codex-auto-review': 'cheap-model' } });
const parse = (codexHome: string) =>
  buildCodexUsageReport({ codexHome, pricing, settings: testSettings() });

/** A thread whose running totals step from `from` to `to`. */
function thread(home: string, name: string, lines: unknown[]): void {
  writeLines(path.join(home, ...DAY, name), lines);
}

describe('Codex parser', () => {
  it('Trap 1: takes per-turn usage as the delta, and ignores a repeated reading', async () => {
    const home = tempDir();
    const first = { ts: '2026-08-01T10:00:00Z', input: 400, cached: 300, output: 50 };
    const second = { ts: '2026-08-01T10:01:00Z', input: 1000, cached: 800, output: 100 };
    thread(home, rolloutName(THREAD), [
      sessionMeta('2026-08-01T10:00:00Z', CWD),
      turnContext('2026-08-01T10:00:00Z', 'test-model'),
      tokenCount(first),
      tokenCount(second, first),
      // Codex sometimes emits the same reading twice, with a non-zero
      // last_token_usage. Summing that would double-count the turn.
      tokenCount({ ...second, ts: '2026-08-01T10:01:30Z' }, first),
    ]);

    const report = await parse(home);
    assert.equal(report.diagnostics.duplicateLinesSkipped, 1);
    assert.equal(report.global.combined.messages, 2, 'two billed turns, not three');
    // Final running totals win: 1000 input of which 800 cached, 100 output.
    assert.equal(report.global.combined.input, 200);
    assert.equal(report.global.combined.cacheRead, 800);
    assert.equal(report.global.combined.output, 100);
  });

  it('Trap 2: bills only the uncached part of the prompt', async () => {
    const home = tempDir();
    thread(home, rolloutName(THREAD), [
      sessionMeta('2026-08-01T10:00:00Z', CWD),
      turnContext('2026-08-01T10:00:00Z', 'test-model'),
      tokenCount({
        ts: '2026-08-01T10:00:10Z',
        input: 1_000_000,
        cached: 800_000,
        output: 100_000,
      }),
    ]);

    const report = await parse(home);
    const cell = report.global.combined;
    assert.equal(cell.input, 200_000, 'input carries the uncached remainder only');
    assert.equal(cell.cacheRead, 800_000);
    assert.equal(cell.totalTokens, 1_100_000);
    // 200k @ $10/M + 800k @ $1/M + 100k @ $50/M
    assert.equal(Number(cell.costUsd.toFixed(2)), 7.8);
  });

  it('Trap 3: carries reasoning tokens without adding them to totals or cost', async () => {
    const home = tempDir();
    thread(home, rolloutName(THREAD), [
      sessionMeta('2026-08-01T10:00:00Z', CWD),
      turnContext('2026-08-01T10:00:00Z', 'test-model'),
      tokenCount({
        ts: '2026-08-01T10:00:10Z',
        input: 1_000_000,
        cached: 800_000,
        output: 100_000,
        reasoning: 50_000,
      }),
    ]);

    const report = await parse(home);
    const cell = report.global.combined;
    assert.equal(cell.reasoning, 50_000);
    assert.equal(cell.totalTokens, 1_100_000, 'reasoning is already inside output');
    assert.equal(Number(cell.costUsd.toFixed(2)), 7.8, 'and is not billed twice');
  });

  it('Trap 4: counts auto-review threads as their own band, priced by alias', async () => {
    const home = tempDir();
    thread(home, rolloutName(THREAD), [
      sessionMeta('2026-08-01T10:00:00Z', CWD),
      turnContext('2026-08-01T10:00:00Z', 'test-model'),
      tokenCount({ ts: '2026-08-01T10:00:10Z', input: 100, cached: 0, output: 10 }),
    ]);
    thread(home, rolloutName(GUARDIAN), [
      sessionMeta('2026-08-01T10:00:20Z', CWD, {
        thread_source: 'subagent',
        parent_thread_id: THREAD,
        source: { subagent: { other: 'guardian' } },
      }),
      turnContext('2026-08-01T10:00:20Z', 'codex-auto-review'),
      tokenCount({ ts: '2026-08-01T10:00:30Z', input: 1_000_000, cached: 0, output: 0 }),
    ]);

    const report = await parse(home);
    assert.equal(report.activity.sessions, 2);
    assert.equal(report.activity.subagentSessions, 1);
    assert.ok(report.global.perModel['codex-auto-review'], 'keeps its own identity in the charts');
    // Priced through the alias at the cheap rate: 1M @ $1/M.
    assert.equal(Number(report.global.perModel['codex-auto-review'].costUsd.toFixed(2)), 1);
    assert.deepEqual(report.diagnostics.unpricedModels, []);

    const guardian = report.projects[0].sessions.find((s) => s.isSubagent);
    assert.equal(guardian?.parentSessionId, THREAD);
    assert.equal(guardian?.subagentKind, 'guardian');
  });

  it('Trap 5: tracks the model as state across the file', async () => {
    const home = tempDir();
    thread(home, rolloutName(THREAD), [
      sessionMeta('2026-08-01T10:00:00Z', CWD),
      turnContext('2026-08-01T10:00:00Z', 'test-model'),
      tokenCount({ ts: '2026-08-01T10:00:10Z', input: 100, cached: 0, output: 10 }),
      tokenCount(
        { ts: '2026-08-01T10:00:20Z', input: 200, cached: 0, output: 20 },
        { ts: '', input: 100, cached: 0, output: 10 },
      ),
      turnContext('2026-08-01T10:00:30Z', 'cheap-model'),
      tokenCount(
        { ts: '2026-08-01T10:00:40Z', input: 300, cached: 0, output: 30 },
        { ts: '', input: 200, cached: 0, output: 20 },
      ),
    ]);

    const report = await parse(home);
    assert.equal(report.global.perModel['test-model'].messages, 2);
    assert.equal(report.global.perModel['cheap-model'].messages, 1);
    assert.ok(!report.global.perModel['(unknown)'], 'nothing falls into (unknown)');
  });

  it('treats a mid-file counter reset as a new baseline, not negative usage', async () => {
    const home = tempDir();
    const before = { ts: '2026-08-01T10:00:10Z', input: 1000, cached: 0, output: 100 };
    thread(home, rolloutName(THREAD), [
      sessionMeta('2026-08-01T10:00:00Z', CWD),
      turnContext('2026-08-01T10:00:00Z', 'test-model'),
      tokenCount(before),
      // Context compaction: the running total starts again from a lower value.
      tokenCount({ ts: '2026-08-01T10:05:00Z', input: 200, cached: 0, output: 20 }, before),
    ]);

    const report = await parse(home);
    assert.equal(report.diagnostics.counterResets, 1);
    assert.equal(report.global.combined.input, 1200, 'usage before the reset is kept');
    assert.equal(report.global.combined.output, 120);
  });

  it('flags a file whose own per-turn figure disagrees with the delta', async () => {
    const home = tempDir();
    thread(home, rolloutName(THREAD), [
      sessionMeta('2026-08-01T10:00:00Z', CWD),
      turnContext('2026-08-01T10:00:00Z', 'test-model'),
      tokenCount({ ts: '2026-08-01T10:00:10Z', input: 100, cached: 0, output: 10, lastTotal: 999 }),
    ]);

    const report = await parse(home);
    assert.equal(report.diagnostics.reconcileFailures, 1);
    assert.equal(report.diagnostics.reconciledFiles, 0);
  });

  it('survives a JSON line that is not an object, and keeps reading the file', async () => {
    const home = tempDir();
    thread(home, rolloutName(THREAD), [
      sessionMeta('2026-08-01T10:00:00Z', CWD),
      'null',
      turnContext('2026-08-01T10:00:00Z', 'test-model'),
      '[]',
      tokenCount({ ts: '2026-08-01T10:00:10Z', input: 100, cached: 0, output: 10 }),
    ]);

    const report = await parse(home);
    assert.equal(report.diagnostics.linesUnparseable, 2);
    assert.equal(report.diagnostics.filesFailed, 0);
    assert.equal(report.global.combined.messages, 1, 'the turn after the bad lines still counts');
    assert.equal(report.global.perModel['test-model'].output, 10);
  });

  it('does not throw on an absurd timestamp', async () => {
    const home = tempDir();
    thread(home, rolloutName(THREAD), [
      sessionMeta('2026-08-01T10:00:00Z', CWD),
      turnContext('2026-08-01T10:00:00Z', 'test-model'),
      tokenCount({ ts: '+275760-09-13T00:00:00Z', input: 100, cached: 0, output: 10 }),
    ]);

    const report = await parse(home);
    assert.equal(report.diagnostics.implausibleTimestamps, 1);
    assert.equal(report.global.combined.output, 10);
    assert.equal(report.global.daily[0].date, '(unknown date)');
  });

  it('keys projects by the working directory slug', async () => {
    const home = tempDir();
    thread(home, rolloutName(THREAD), [
      sessionMeta('2026-08-01T10:00:00Z', CWD),
      turnContext('2026-08-01T10:00:00Z', 'test-model'),
      tokenCount({ ts: '2026-08-01T10:00:10Z', input: 100, cached: 0, output: 10 }),
    ]);

    const report = await parse(home);
    assert.equal(report.projects[0].id, projectIdFromCwd(CWD));
    assert.equal(report.projects[0].name, 'my-app');
    assert.equal(report.provider, 'codex');
  });

  it('warns, rather than failing, when there are no rollout files', async () => {
    const report = await parse(tempDir());
    assert.equal(report.projects.length, 0);
    assert.equal(report.diagnostics.filesScanned, 0);
    assert.match(report.diagnostics.warnings.join(' '), /No Codex rollout files found/);
  });
  it('says a merge-rule cycle once, not once per event', async () => {
    // The warning is pushed from inside project resolution, which runs per
    // tick AND per event - so a single bad rule used to produce one warning
    // per token_count line, thousands of them, which the UI then summarised as
    // a pile of unreadable files. Resolution is memoised per working directory
    // now, and the warning itself is de-duplicated.
    const home = tempDir();
    const a = projectIdFromCwd(CWD);
    const b = projectIdFromCwd(OTHER_CWD);
    const events = Array.from({ length: 40 }, (_, i) =>
      tokenCount({
        ts: `2026-08-01T10:${String(i).padStart(2, '0')}:00Z`,
        input: 100 * (i + 1),
        cached: 0,
        output: 10 * (i + 1),
      }),
    );
    thread(home, rolloutName(THREAD), [
      sessionMeta('2026-08-01T10:00:00Z', CWD),
      turnContext('2026-08-01T10:00:00Z', 'test-model'),
      ...events,
    ]);
    thread(home, rolloutName(GUARDIAN), [
      sessionMeta('2026-08-01T11:00:00Z', OTHER_CWD),
      turnContext('2026-08-01T11:00:00Z', 'test-model'),
      ...events,
    ]);

    const report = await buildCodexUsageReport({
      codexHome: home,
      pricing,
      settings: testSettings(),
      projectConfig: { merge: { [a]: b, [b]: a }, displayNames: {} },
    });

    const cycles = report.diagnostics.warnings.filter((w) => /cycle/i.test(w));
    assert.equal(cycles.length, 1, `expected one cycle warning, got ${cycles.length}`);
    // And the parse still produced numbers rather than giving up.
    assert.ok(report.global.combined.totalTokens > 0);
  });
});
