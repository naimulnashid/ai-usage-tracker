/**
 * The half of `dump-usage.ts` and `dump-codex-usage.ts` that is the same.
 *
 * The two scripts were about two-thirds identical line for line: the
 * formatters, writing the JSON, the header, the first four diagnostics, the
 * projects table, the daily bar chart and the footer. What actually differs is
 * small and specific, and worth keeping apart rather than flattening:
 *
 *   - the model table's COLUMNS (Claude Code shows cache writes and reads,
 *     Codex shows cached input and reasoning), so each script keeps its own;
 *   - the middle of the diagnostics block, because the counters genuinely
 *     differ - de-duplication and recovered output tokens on one side,
 *     repeated readings and file reconciliation on the other;
 *   - a per-project suffix, and the scale of the daily bar.
 *
 * **This output is a regression baseline**, not decoration. CLAUDE.md tells you
 * to watch these numbers after a parser change, so a refactor here has to keep
 * the printed characters identical - which was verified by diffing the output
 * of both scripts before and after this module existed.
 */
import fs from 'node:fs';
import path from 'node:path';

import type { ParseDiagnostics, ProjectSummary, UsageReport } from '../src/lib/types';

/* --------------------------------------------------------------- Format -- */

export const usd = (n: number) => `$${n.toFixed(2)}`;
export const millions = (n: number) => `${(n / 1_000_000).toFixed(2)}M`;
export const duration = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};
export const pad = (s: string, w: number) => s.padEnd(w);
export const padStart = (s: string, w: number) => s.padStart(w);

/** `--quiet` writes the JSON and prints only its path. */
export const isQuiet = () => process.argv.includes('--quiet');

/* ---------------------------------------------------------------- Parts -- */

/** Writes the report to `out/<name>` and returns the path. */
export function writeReport(report: UsageReport, name: string): string {
  const outDir = path.join(process.cwd(), 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, name);
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf8');
  return outFile;
}

export function printHeader(report: UsageReport, startedAt: number): void {
  console.log('');
  console.log(`Source        : ${report.projectsDir}`);
  console.log(`Parsed in     : ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
  console.log('');
  console.log('--- PARSER DIAGNOSTICS -------------------------------------------');
}

/** The four counters both parsers report, in the same order and width. */
export function printSharedDiagnostics(d: ParseDiagnostics): void {
  console.log(`  files scanned            : ${d.filesScanned}   (failed: ${d.filesFailed})`);
  console.log(`  lines read               : ${d.linesRead.toLocaleString()}`);
  console.log(`  unparseable lines        : ${d.linesUnparseable}`);
  console.log(`  implausible timestamps   : ${d.implausibleTimestamps ?? 0}`);
}

/** Unpriced models, then warnings. Closes the diagnostics block. */
export function printDiagnosticsTail(d: ParseDiagnostics): void {
  console.log(
    `  unpriced models          : ${d.unpricedModels.length ? d.unpricedModels.join(', ') : 'none'}`,
  );
  if (d.warnings.length) {
    console.log(`  warnings                 : ${d.warnings.length}`);
    d.warnings.slice(0, 5).forEach((w) => console.log(`      - ${w}`));
  }
}

/**
 * Projects ranked by cost. `suffix` is what each agent adds after the name -
 * flagged sessions for Claude Code, the thread/auto-review split for Codex.
 */
export function printProjects(
  report: UsageReport,
  suffix: (project: ProjectSummary) => string,
): void {
  console.log('');
  console.log('--- PROJECTS BY COST ---------------------------------------------');
  for (const project of report.projects) {
    console.log(
      padStart(usd(project.combined.costUsd), 12) +
        padStart(millions(project.combined.totalTokens), 10) +
        padStart(duration(project.combined.runtimeSeconds), 10) +
        `  ${project.name}` +
        suffix(project),
    );
  }
}

/**
 * The daily bar chart. `barUsdPerHash` differs per agent only because their
 * daily spends differ by roughly that factor, so one scale would give one of
 * them a wall of hashes and the other a blank column.
 */
export function printDailySpend(
  report: UsageReport,
  options: { title: string; barUsdPerHash: number },
): void {
  console.log('');
  console.log(options.title);
  for (const day of report.global.daily) {
    const bar = '#'.repeat(Math.min(50, Math.round(day.combined.costUsd / options.barUsdPerHash)));
    console.log(
      `  ${day.date}  ${padStart(usd(day.combined.costUsd), 10)}  ${padStart(
        duration(day.combined.runtimeSeconds),
        8,
      )}  ${bar}`,
    );
  }
}

export function printFooter(outFile: string): void {
  console.log('');
  console.log(`Full JSON written to: ${outFile}`);
  console.log('');
}

/** Runs a script's `main`, failing loudly with a non-zero exit. */
export function run(main: () => Promise<void>, label: string): void {
  main().catch((err) => {
    console.error(`${label}:`, err);
    process.exit(1);
  });
}
