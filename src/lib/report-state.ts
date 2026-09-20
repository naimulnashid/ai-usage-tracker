/**
 * Which of the four states a loaded report is in.
 *
 * Kept out of the components (and free of `node:` imports) so the rule is one
 * testable function rather than a condition written slightly differently on
 * each page. "Loading" and "failed" are handled by the pages themselves; this
 * distinguishes the two that look alike:
 *
 * - **empty**: the parse worked and found nothing. A first run, or the agent's
 *   transcripts living somewhere else. This deserves an explanation, not a
 *   page of zeroes.
 * - **has data**: anything else, including a report restored entirely from the
 *   local archive.
 */
import type { UsageReport } from './types';

export function isEmptyReport(report: UsageReport): boolean {
  return (
    report.projects.length === 0 &&
    report.activity.messages === 0 &&
    report.global.combined.totalTokens === 0 &&
    report.global.combined.runtimeSeconds === 0
  );
}

/**
 * True when a warning is just "there was nothing here".
 *
 * That is the normal state of a fresh install, and the empty state already
 * says it in full sentences - repeating it as a warning makes a working
 * install look broken.
 */
export function isNotFoundWarning(warning: string): boolean {
  return (
    warning.includes('Cannot read projects directory') ||
    warning.includes('No Codex rollout files found')
  );
}

/** The warnings worth showing next to a report that does have data. */
export function noteworthyWarnings(warnings: string[]): string[] {
  return warnings.filter((warning) => !isNotFoundWarning(warning));
}
