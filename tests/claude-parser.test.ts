import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';

import { buildUsageReport, encodeProjectDir } from '../src/lib/parser';
import {
  assistantLine,
  plainLine,
  tempDir,
  testPricing,
  testSettings,
  writeLines,
} from './helpers';

const CWD = 'C:\\Users\\you\\Projects\\My App';
const DIR = encodeProjectDir(CWD); // C--Users-you-Projects-My-App

const parse = (projectsDir: string) =>
  buildUsageReport({ projectsDir, pricing: testPricing(), settings: testSettings() });

describe('Claude Code parser', () => {
  it('Trap 1: counts a message once, however many lines carry it', async () => {
    const root = tempDir();
    // The same message in two projects (a resumed session replays history) and
    // twice within one file (streaming partials).
    const line = assistantLine({
      ts: '2026-08-01T10:00:00Z',
      id: 'msg_a',
      input: 100,
      output: 20,
      cwd: CWD,
    });
    writeLines(path.join(root, DIR, 's1.jsonl'), [line, line]);
    writeLines(path.join(root, `${DIR}-copy`, 's2.jsonl'), [line]);

    const report = await parse(root);
    assert.equal(report.diagnostics.uniqueMessages, 1);
    assert.equal(report.diagnostics.duplicateLinesSkipped, 2);
    assert.equal(report.global.combined.messages, 1);
    assert.equal(report.global.combined.totalTokens, 120);
    // The copy contributed nothing, so it is hidden rather than shown as zeroes.
    assert.deepEqual(report.diagnostics.emptyProjectsHidden, [`${DIR}-copy`]);
    assert.equal(report.projects.length, 1);
  });

  it('Trap 2: keeps the largest output_tokens seen for a message', async () => {
    const root = tempDir();
    writeLines(path.join(root, DIR, 's1.jsonl'), [
      assistantLine({ ts: '2026-08-01T10:00:00Z', id: 'msg_a', input: 1000, output: 2 }),
      assistantLine({ ts: '2026-08-01T10:00:01Z', id: 'msg_a', input: 1000, output: 500 }),
    ]);

    const report = await parse(root);
    assert.equal(report.global.combined.output, 500);
    assert.equal(report.diagnostics.outputTokensRecovered, 1);
  });

  it('Trap 3: finds subagent transcripts nested under a session', async () => {
    const root = tempDir();
    writeLines(path.join(root, DIR, 'parent.jsonl'), [
      assistantLine({ ts: '2026-08-01T10:00:00Z', id: 'msg_parent', output: 10, cwd: CWD }),
    ]);
    writeLines(path.join(root, DIR, 'parent', 'subagents', 'agent-1.jsonl'), [
      assistantLine({ ts: '2026-08-01T10:01:00Z', id: 'msg_child', output: 7, cwd: CWD }),
    ]);

    const report = await parse(root);
    assert.equal(report.diagnostics.filesScanned, 2);
    assert.equal(report.activity.sessions, 2);
    assert.equal(report.activity.subagentSessions, 1);
    assert.equal(report.global.combined.output, 17);

    const child = report.projects[0].sessions.find((s) => s.isSubagent);
    assert.equal(child?.parentSessionId, 'parent');
  });

  it('Trap 4: prices cache writes by TTL, falling back to the 5m rate', async () => {
    const root = tempDir();
    writeLines(path.join(root, DIR, 'split.jsonl'), [
      assistantLine({
        ts: '2026-08-01T10:00:00Z',
        id: 'msg_a',
        cacheWrite5m: 1_000_000,
        cacheWrite1h: 1_000_000,
      }),
    ]);
    writeLines(path.join(root, `${DIR}-flat`, 'flat.jsonl'), [
      assistantLine({ ts: '2026-08-01T10:00:00Z', id: 'msg_b', flatCacheWrite: 1_000_000 }),
    ]);

    const report = await parse(root);
    const cell = report.global.combined;
    assert.equal(cell.cacheWrite5m, 2_000_000); // 1M split + 1M flat
    assert.equal(cell.cacheWrite1h, 1_000_000);
    // 12.50 + 20.00 for the split file, 12.50 for the flat one.
    assert.equal(Number(cell.costUsd.toFixed(2)), 45);
  });

  it('survives a JSON line that is not an object, and keeps reading the file', async () => {
    const root = tempDir();
    writeLines(path.join(root, DIR, 's1.jsonl'), [
      assistantLine({ ts: '2026-08-01T10:00:00Z', id: 'msg_a', output: 10 }),
      'null',
      '42',
      '[1,2,3]',
      '{"truncated":',
      assistantLine({ ts: '2026-08-01T10:00:05Z', id: 'msg_b', output: 5 }),
    ]);

    const report = await parse(root);
    assert.equal(report.diagnostics.linesUnparseable, 4);
    assert.equal(report.diagnostics.filesFailed, 0, 'a bad line must not fail the file');
    assert.equal(report.global.combined.messages, 2, 'the line after the bad ones still counts');
    assert.equal(report.global.combined.output, 15);
    assert.deepEqual(report.diagnostics.warnings, []);
  });

  it('does not throw on an absurd timestamp, and buckets it as undated', async () => {
    const root = tempDir();
    writeLines(path.join(root, DIR, 's1.jsonl'), [
      assistantLine({ ts: '2026-08-01T10:00:00Z', id: 'msg_a', output: 10 }),
      assistantLine({ ts: '+275760-09-13T00:00:00Z', id: 'msg_future', output: 3 }),
      assistantLine({ ts: '1969-01-01T00:00:00Z', id: 'msg_ancient', output: 1 }),
    ]);

    const report = await parse(root);
    assert.equal(report.diagnostics.implausibleTimestamps, 2);
    assert.equal(report.global.combined.output, 14, 'their tokens still count');
    const undated = report.global.daily.find((d) => d.date === '(unknown date)');
    assert.equal(undated?.combined.output, 4);
    assert.equal(report.activity.activeDays, 1, 'undated usage is not an active day');
  });

  it('refuses negative and fractional token counts', async () => {
    const root = tempDir();
    writeLines(path.join(root, DIR, 's1.jsonl'), [
      assistantLine({
        ts: '2026-08-01T10:00:00Z',
        id: 'msg_a',
        input: -5_000_000_000,
        output: 10.7,
      }),
    ]);

    const report = await parse(root);
    assert.equal(report.global.combined.input, 0);
    assert.equal(report.global.combined.output, 10);
    assert.ok(report.global.combined.costUsd > 0, 'cost can never go negative');
  });

  it('sums runtime between lines but drops gaps past the idle cutoff', async () => {
    const root = tempDir();
    writeLines(path.join(root, DIR, 's1.jsonl'), [
      assistantLine({ ts: '2026-08-01T10:00:00Z', id: 'msg_a', output: 1 }),
      plainLine('2026-08-01T10:00:30Z'), // +30s, counted
      plainLine('2026-08-01T12:00:00Z'), // ~2h gap, dropped
      plainLine('2026-08-01T12:00:10Z'), // +10s, counted
    ]);

    const report = await parse(root);
    assert.equal(report.global.combined.runtimeSeconds, 40);
    const session = report.projects[0].sessions[0];
    assert.equal(session.runtimeSeconds, 40);
    assert.equal(session.spanSeconds, 7210, 'the raw span is kept for comparison');
  });

  it('names a project after its own directory, not a replayed path', async () => {
    const root = tempDir();
    const other = 'C:\\Users\\you\\Projects\\Project A';
    // The replayed lines come first and are the majority - the old bug took
    // the first cwd it saw and labelled this project "Project A".
    writeLines(path.join(root, DIR, 's1.jsonl'), [
      assistantLine({ ts: '2026-08-01T10:00:00Z', id: 'msg_a', output: 1, cwd: other }),
      assistantLine({ ts: '2026-08-01T10:00:01Z', id: 'msg_b', output: 1, cwd: other }),
      assistantLine({ ts: '2026-08-01T10:00:02Z', id: 'msg_c', output: 1, cwd: CWD }),
    ]);

    const report = await parse(root);
    assert.equal(report.projects[0].name, 'My App');
    assert.equal(report.projects[0].cwd, CWD);
  });

  it('reports a model with no rate card entry as unpriced', async () => {
    const root = tempDir();
    writeLines(path.join(root, DIR, 's1.jsonl'), [
      assistantLine({
        ts: '2026-08-01T10:00:00Z',
        id: 'msg_a',
        model: 'brand-new-model',
        output: 1_000_000,
      }),
    ]);

    const report = await parse(root);
    assert.deepEqual(report.diagnostics.unpricedModels, ['brand-new-model']);
    assert.equal(report.global.combined.costUsd, 0);
    assert.equal(report.global.perModel['brand-new-model'].unpriced, true);
  });

  it('records the peak chat over a chat and its subagents, but not their runtime twice', async () => {
    const root = tempDir();
    writeLines(path.join(root, DIR, 'parent.jsonl'), [
      assistantLine({ ts: '2026-08-01T10:00:00Z', id: 'msg_p', output: 100, cwd: CWD }),
      plainLine('2026-08-01T10:01:00Z', CWD), // 60s of parent runtime
    ]);
    writeLines(path.join(root, DIR, 'parent', 'subagents', 'agent-1.jsonl'), [
      assistantLine({ ts: '2026-08-01T10:00:10Z', id: 'msg_c', output: 50, cwd: CWD }),
      plainLine('2026-08-01T10:00:50Z', CWD), // 40s, inside the parent's clock
    ]);

    const report = await parse(root);
    const peak = report.activity.peakSession;
    assert.equal(peak?.sessionId, 'parent');
    assert.equal(peak?.totalTokens, 150, 'tokens are summed across the chat');
    assert.equal(peak?.subagentThreads, 1);
    assert.equal(peak?.isSubagent, false);
    assert.equal(report.activity.longestSession?.runtimeSeconds, 60, 'runtime is the parent’s own');
  });

  it('skips an unreadable directory without failing the run', async () => {
    const report = await parse(path.join(tempDir(), 'does-not-exist'));
    assert.equal(report.projects.length, 0);
    assert.equal(report.global.combined.costUsd, 0);
    assert.equal(report.diagnostics.warnings.length, 1);
    assert.match(report.diagnostics.warnings[0], /Cannot read projects directory/);
  });
});
