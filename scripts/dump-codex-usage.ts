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
 *
 * What is printed below is only the part that differs from Claude Code's
 * script: this agent's model columns and its own diagnostics — the ones worth
 * watching after a parser change, `reconcileFailures` above all. The shared
 * spine lives in `report-console.ts`.
 */
import { buildCodexUsageReport } from '../src/lib/codex-parser';
import { withHistory } from '../src/lib/history';
import type { UsageCell } from '../src/lib/types';
import {
  duration,
  isQuiet,
  millions,
  pad,
  padStart,
  printDailySpend,
  printDiagnosticsTail,
  printFooter,
  printHeader,
  printProjects,
  printSharedDiagnostics,
  run,
  usd,
  writeReport,
} from './report-console';

/** Codex reports cached input and reasoning, and never a cache write. */
function modelRow(label: string, cell: UsageCell): string {
  return (
    pad(label, 24) +
    padStart(cell.messages.toLocaleString(), 8) +
    padStart(millions(cell.input), 11) +
    padStart(millions(cell.cacheRead), 11) +
    padStart(millions(cell.output), 10) +
    padStart(millions(cell.reasoning ?? 0), 10) +
    padStart(usd(cell.costUsd), 12) +
    padStart(duration(cell.runtimeSeconds), 10)
  );
}

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
    console.log(modelRow(`  ${model}${cell.unpriced ? ' *UNPRICED' : ''}`, cell));
  }
}

async function main() {
  const startedAt = Date.now();
  const report = withHistory(await buildCodexUsageReport());
  const outFile = writeReport(report, 'codex-usage-report.json');

  if (isQuiet()) {
    console.log(outFile);
    return;
  }

  const d = report.diagnostics;
  printHeader(report, startedAt);
  printSharedDiagnostics(d);
  console.log(`  token_count events       : ${d.assistantLines.toLocaleString()}`);
  console.log(`  billed turns counted     : ${d.uniqueMessages.toLocaleString()}`);
  console.log(`  repeated readings skipped: ${d.duplicateLinesSkipped.toLocaleString()}`);
  console.log(`  counter resets           : ${(d.counterResets ?? 0).toLocaleString()}`);
  console.log(
    `  files reconciled         : ${d.reconciledFiles ?? 0} ok / ${d.reconcileFailures ?? 0} mismatched`,
  );
  printDiagnosticsTail(d);

  console.log('');
  console.log('--- GLOBAL, BY MODEL ---------------------------------------------');
  printModelTable(report.global.perModel);
  const g = report.global.combined;
  console.log(modelRow('  COMBINED', g));
  console.log('');
  console.log(
    `  Total tokens: ${millions(g.totalTokens)}  (reasoning is inside output and is not added)`,
  );

  printProjects(report, (project) => {
    const auto = project.sessions.filter((s) => s.isSubagent).length;
    return `  [${project.sessions.length - auto} thread(s), ${auto} auto-review]`;
  });

  printDailySpend(report, {
    title: '--- DAILY COMBINED SPEND -----------------------------------------',
    barUsdPerHash: 5,
  });

  printFooter(outFile);
}

run(main, 'Codex parser failed');
