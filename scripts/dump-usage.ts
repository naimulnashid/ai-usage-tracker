/**
 * Phase 1 inspection script.
 *
 *   npm run parse            -> writes out/usage-report.json + prints a summary
 *   npm run parse -- --quiet -> writes the JSON only
 *
 * The JSON it writes is the exact structure the Next.js API route will serve,
 * so anything verified here is what the UI will render.
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildUsageReport } from '../src/lib/parser';
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
    console.log(
      pad(`  ${model}${cell.unpriced ? ' *UNPRICED' : ''}`, 22) +
        padStart(cell.messages.toLocaleString(), 8) +
        padStart(millions(cell.input), 10) +
        padStart(millions(cell.output), 10) +
        padStart(millions(cell.cacheWrite5m + cell.cacheWrite1h), 10) +
        padStart(millions(cell.cacheRead), 11) +
        padStart(usd(cell.costUsd), 12) +
        padStart(duration(cell.runtimeSeconds), 10),
    );
  }
}

async function main() {
  const startedAt = Date.now();
  // Same archive the dashboard uses: record today, restore deleted days.
  const report = withHistory(await buildUsageReport());

  const outDir = path.join(process.cwd(), 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'usage-report.json');
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
  console.log(`  implausible timestamps   : ${d.implausibleTimestamps ?? 0}`);
  console.log(`  assistant lines          : ${d.assistantLines.toLocaleString()}`);
  console.log(`  unique messages counted  : ${d.uniqueMessages.toLocaleString()}`);
  console.log(`  duplicate lines skipped  : ${d.duplicateLinesSkipped.toLocaleString()}`);
  console.log(`  output_tokens recovered  : ${d.outputTokensRecovered.toLocaleString()}`);
  console.log(`  unpriced models          : ${d.unpricedModels.length ? d.unpricedModels.join(', ') : 'none'}`);
  console.log(
    `  empty projects hidden    : ${
      d.emptyProjectsHidden.length ? d.emptyProjectsHidden.join(', ') : 'none'
    }`,
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
    pad('  COMBINED', 22) +
      padStart(g.messages.toLocaleString(), 8) +
      padStart(millions(g.input), 10) +
      padStart(millions(g.output), 10) +
      padStart(millions(g.cacheWrite5m + g.cacheWrite1h), 10) +
      padStart(millions(g.cacheRead), 11) +
      padStart(usd(g.costUsd), 12) +
      padStart(duration(g.runtimeSeconds), 10),
  );

  console.log('');
  console.log('--- PROJECTS BY COST ---------------------------------------------');
  for (const project of report.projects) {
    const flagged = project.sessions.filter((s) => s.possiblyInaccurateOutput).length;
    console.log(
      padStart(usd(project.combined.costUsd), 12) +
        padStart(millions(project.combined.totalTokens), 10) +
        padStart(duration(project.combined.runtimeSeconds), 10) +
        `  ${project.name}` +
        (flagged ? `  [${flagged} session(s) flagged]` : ''),
    );
  }

  console.log('');
  console.log('--- DAILY COMBINED SPEND (all projects, all models) ---------------');
  for (const day of report.global.daily) {
    const bar = '#'.repeat(Math.min(50, Math.round(day.combined.costUsd / 10)));
    console.log(
      `  ${day.date}  ${padStart(usd(day.combined.costUsd), 10)}  ${padStart(
        duration(day.combined.runtimeSeconds),
        8,
      )}  ${bar}`,
    );
  }

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

  console.log('');
  console.log(`Full JSON written to: ${outFile}`);
  console.log('');
}

main().catch((err) => {
  console.error('Parser failed:', err);
  process.exit(1);
});
