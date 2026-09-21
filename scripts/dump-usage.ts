/**
 * Claude Code inspection script — the counterpart to `dump-codex-usage.ts`.
 *
 *   npm run parse            -> writes out/usage-report.json + prints a summary
 *   npm run parse -- --quiet -> writes the JSON only
 *
 * The JSON it writes is the exact structure `/api/usage/claude` serves, so
 * anything verified here is what the UI renders — and this needs no password,
 * because it reads disk directly rather than going through the HTTP layer.
 * That makes it the fastest way to check a parser change.
 *
 * What is printed below is only the part that differs from Codex's script:
 * this agent's model columns and its own diagnostics. The shared spine lives
 * in `report-console.ts`.
 */
import { buildUsageReport } from '../src/lib/parser';
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

/** Claude Code reports cache writes split by TTL, and no reasoning tokens. */
function modelRow(label: string, cell: UsageCell): string {
  return (
    pad(label, 22) +
    padStart(cell.messages.toLocaleString(), 8) +
    padStart(millions(cell.input), 10) +
    padStart(millions(cell.output), 10) +
    padStart(millions(cell.cacheWrite5m + cell.cacheWrite1h), 10) +
    padStart(millions(cell.cacheRead), 11) +
    padStart(usd(cell.costUsd), 12) +
    padStart(duration(cell.runtimeSeconds), 10)
  );
}

function printModelTable(perModel: Record<string, UsageCell>) {
  console.log(
    pad('  model', 22) +
      padStart('msgs', 8) +
      padStart('input', 10) +
      padStart('output', 10) +
      padStart('cacheW', 10) +
      padStart('cacheR', 11) +
      padStart('cost', 12) +
      padStart('runtime', 10),
  );
  for (const [model, cell] of Object.entries(perModel)) {
    console.log(modelRow(`  ${model}${cell.unpriced ? ' *UNPRICED' : ''}`, cell));
  }
}

async function main() {
  const startedAt = Date.now();
  // Same archive the dashboard uses: record today, restore deleted days.
  const report = withHistory(await buildUsageReport());
  const outFile = writeReport(report, 'usage-report.json');

  if (isQuiet()) {
    console.log(outFile);
    return;
  }

  const d = report.diagnostics;
  printHeader(report, startedAt);
  printSharedDiagnostics(d);
  console.log(`  assistant lines          : ${d.assistantLines.toLocaleString()}`);
  console.log(`  unique messages counted  : ${d.uniqueMessages.toLocaleString()}`);
  console.log(`  duplicate lines skipped  : ${d.duplicateLinesSkipped.toLocaleString()}`);
  console.log(`  output_tokens recovered  : ${d.outputTokensRecovered.toLocaleString()}`);
  printDiagnosticsTail(d);
  console.log(
    `  empty projects hidden    : ${
      d.emptyProjectsHidden.length ? d.emptyProjectsHidden.join(', ') : 'none'
    }`,
  );

  console.log('');
  console.log('--- GLOBAL, BY MODEL ---------------------------------------------');
  printModelTable(report.global.perModel);
  console.log(modelRow('  COMBINED', report.global.combined));

  printProjects(report, (project) => {
    const flagged = project.sessions.filter((s) => s.possiblyInaccurateOutput).length;
    return flagged ? `  [${flagged} session(s) flagged]` : '';
  });

  printDailySpend(report, {
    title: '--- DAILY COMBINED SPEND (all projects, all models) ---------------',
    barUsdPerHash: 10,
  });

  const flaggedSessions = report.projects
    .flatMap((p) => p.sessions)
    .filter((s) => s.possiblyInaccurateOutput);
  console.log('');
  console.log('--- SESSIONS FLAGGED "POSSIBLY INACCURATE OUTPUT" -----------------');
  if (!flaggedSessions.length) {
    console.log('  none');
  } else {
    for (const s of flaggedSessions.slice(0, 15)) {
      console.log(`  ${s.suspiciousMessageCount}x  ${s.file}`);
    }
    if (flaggedSessions.length > 15) {
      console.log(`  ...and ${flaggedSessions.length - 15} more`);
    }
  }

  printFooter(outFile);
}

run(main, 'Parser failed');
