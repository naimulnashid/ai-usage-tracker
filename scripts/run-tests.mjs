/**
 * Runs the test suite with Node's built-in runner.
 *
 * The file list is built here rather than passed as a glob: glob support in
 * `node --test` depends on the Node version, and `cmd.exe` does not expand one
 * at all, so a glob in the npm script would work on this machine and fail on
 * CI (or the other way round). Discovering the files is version- and
 * shell-proof.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const testsDir = path.join(root, 'tests');

const files = readdirSync(testsDir)
  .filter((name) => name.endsWith('.test.ts') || name.endsWith('.test.tsx'))
  .sort()
  .map((name) => path.join(testsDir, name));

if (!files.length) {
  console.error('No test files found in tests/.');
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...files], {
  cwd: root,
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
