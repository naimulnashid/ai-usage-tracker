/**
 * Codex inspection script — the counterpart to `dump-usage.ts`.
 *
 *   npm run parse:codex            -> writes out/codex-usage-report.json + a summary
 *   npm run parse:codex -- --quiet -> writes the JSON only
 *
 * The JSON it writes is the exact structure `/api/usage/codex` serves, so
 * anything verified here is what the dashboard renders.
 *
 * Needs no password: it reads disk directly and never goes through the HTTP
 * layer.
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildCodexUsageReport } from '../src/lib/codex-parser';
import { withHistory } from '../src/lib/history';
import type { UsageCell } from '../src/lib/types';

const quiet = process.argv.includes('--quiet');

const usd = (n: number) => `$${n.toFixed(2)}`;
const millions = (n: number) => `${(n / 1_000_000).toFixed(2)}M`;
const duration = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};
const pad = (s: string, w: number) => s.padEnd(w);
const padStart = (s: string, w: number) => s.padStart(w);

function printModelTable(perModel: Record<string, UsageCell>) {
  console.log(
    pad('  model', 24) +
      padStart('reqs', 8) +
      padStart('input', 11) +
      padStart('cached', 11) +
      padStart('output', 10) +
      padStart('reason', 10) +
      padStart('cost', 12) +
      padStart('runtime', 10),
  );
  for (const [model, cell] of Object.entries(perModel)) {
    console.log(
      pad(`  ${model}${cell.unpriced ? ' *UNPRICED' : ''}`, 24) +
        padStart(cell.messages.toLocaleString(), 8) +
        padStart(millions(cell.input), 11) +
        padStart(millions(cell.cacheRead), 11) +
        padStart(millions(cell.output), 10) +
        padStart(millions(cell.reasoning ?? 0), 10) +
        padStart(usd(cell.costUsd), 12) +
        padStart(duration(cell.runtimeSeconds), 10),
    );
  }
}

async function main() {
  const startedAt = Date.now();
  const report = withHistory(await buildCodexUsageReport());

  const outDir = path.join(process.cwd(), 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'codex-usage-report.json');
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf8');

  if (quiet) {
    console.log(outFile);
    return;
  }

  const d = report.diagnostics;
  console.log('');
  console.log(`Source        : ${report.projectsDir}`);
  console.log(`Parsed in     : ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
  console.log('');
  console.log('--- PARSER DIAGNOSTICS -------------------------------------------');
  console.log(`  files scanned            : ${d.filesScanned}   (failed: ${d.filesFailed})`);
  console.log(`  lines read               : ${d.linesRead.toLocaleString()}`);
  console.log(`  unparseable lines        : ${d.linesUnparseable}`);
  console.log(`  token_count events       : ${d.assistantLines.toLocaleString()}`);
  console.log(`  billed turns counted     : ${d.uniqueMessages.toLocaleString()}`);
  console.log(`  repeated readings skipped: ${d.duplicateLinesSkipped.toLocaleString()}`);
  console.log(`  counter resets           : ${(d.counterResets ?? 0).toLocaleString()}`);
  console.log(
    `  files reconciled         : ${d.reconciledFiles ?? 0} ok / ${d.reconcileFailures ?? 0} mismatched`,
  );
  console.log(
    `  unpriced models          : ${d.unpricedModels.length ? d.unpricedModels.join(', ') : 'none'}`,
  );
  if (d.warnings.length) {
    console.log(`  warnings                 : ${d.warnings.length}`);
    d.warnings.slice(0, 5).forEach((w) => console.log(`      - ${w}`));
  }

  console.log('');
  console.log('--- GLOBAL, BY MODEL ---------------------------------------------');
  printModelTable(report.global.perModel);
  const g = report.global.combined;
  console.log(
    pad('  COMBINED', 24) +
      padStart(g.messages.toLocaleString(), 8) +
      padStart(millions(g.input), 11) +
      padStart(millions(g.cacheRead), 11) +
      padStart(millions(g.output), 10) +
      padStart(millions(g.reasoning ?? 0), 10) +
      padStart(usd(g.costUsd), 12) +
      padStart(duration(g.runtimeSeconds), 10),
  );
  console.log('');
  console.log(
    `  Total tokens: ${millions(g.totalTokens)}  (reasoning is inside output and is not added)`,
  );

  console.log('');
  console.log('--- PROJECTS BY COST ---------------------------------------------');
  for (const project of report.projects) {
    const auto = project.sessions.filter((s) => s.isSubagent).length;
    console.log(
      padStart(usd(project.combined.costUsd), 12) +
        padStart(millions(project.combined.totalTokens), 10) +
        padStart(duration(project.combined.runtimeSeconds), 10) +
        `  ${project.name}` +
        `  [${project.sessions.length - auto} thread(s), ${auto} auto-review]`,
    );
  }

  console.log('');
  console.log('--- DAILY COMBINED SPEND -----------------------------------------');
  for (const day of report.global.daily) {
    const bar = '#'.repeat(Math.min(50, Math.round(day.combined.costUsd / 5)));
    console.log(
      `  ${day.date}  ${padStart(usd(day.combined.costUsd), 10)}  ${padStart(
        duration(day.combined.runtimeSeconds),
        8,
      )}  ${bar}`,
    );
  }

  console.log('');
  console.log(`Full JSON written to: ${outFile}`);
  console.log('');
}

main().catch((err) => {
  console.error('Codex parser failed:', err);
  process.exit(1);
});
