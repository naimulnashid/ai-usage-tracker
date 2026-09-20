import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';

import { buildCodexUsageReport } from '../src/lib/codex-parser';
import { buildUsageReport, encodeProjectDir } from '../src/lib/parser';
import { isEmptyReport, isNotFoundWarning, noteworthyWarnings } from '../src/lib/report-state';
import { assistantLine, tempDir, testPricing, testSettings, writeLines } from './helpers';

const CWD = 'C:\\Users\\you\\Projects\\My App';
const DIR = encodeProjectDir(CWD);

describe('empty vs has-data', () => {
  it('a parse that found nothing is empty', async () => {
    const report = await buildUsageReport({
      projectsDir: path.join(tempDir(), 'nothing-here'),
      pricing: testPricing(),
      settings: testSettings(),
    });
    assert.equal(isEmptyReport(report), true);
  });

  it('an agent with no rollout files is empty', async () => {
    const report = await buildCodexUsageReport({
      codexHome: tempDir(),
      pricing: testPricing(),
      settings: testSettings(),
    });
    assert.equal(isEmptyReport(report), true);
  });

  it('one message is enough to not be empty', async () => {
    const root = tempDir();
    writeLines(path.join(root, DIR, 's1.jsonl'), [
      assistantLine({ ts: '2026-08-01T10:00:00Z', id: 'msg_a', output: 1, cwd: CWD }),
    ]);
    const report = await buildUsageReport({
      projectsDir: root,
      pricing: testPricing(),
      settings: testSettings(),
    });
    assert.equal(isEmptyReport(report), false);
  });
});

describe('which warnings are worth showing', () => {
  it('treats "nothing found" as the empty state, not a problem', () => {
    assert.equal(isNotFoundWarning('Cannot read projects directory C:\\x: ENOENT'), true);
    assert.equal(isNotFoundWarning('No Codex rollout files found under C:\\y.'), true);
    assert.equal(isNotFoundWarning('Skipped unreadable directory C:\\z: EPERM'), false);
  });

  it('keeps every other warning', () => {
    const warnings = [
      'No Codex rollout files found under C:\\y.',
      'Ignored a cycle in config/projects.json merge rules involving "a".',
      'Could not write the history archive at data/history.json: EACCES',
    ];
    assert.deepEqual(noteworthyWarnings(warnings), [warnings[1], warnings[2]]);
  });

  it('a missing transcript directory produces exactly one warning, and it is that one', async () => {
    const report = await buildUsageReport({
      projectsDir: path.join(tempDir(), 'nothing-here'),
      pricing: testPricing(),
      settings: testSettings(),
    });
    assert.equal(report.diagnostics.warnings.length, 1);
    assert.deepEqual(noteworthyWarnings(report.diagnostics.warnings), []);
  });
});
