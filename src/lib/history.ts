/**
 * Durable daily history, so the dashboard outlives the transcripts it reads.
 *
 * Claude Code deletes its own session transcripts once they pass
 * `cleanupPeriodDays`. Because this app derives everything from those files, a
 * deleted transcript silently removes a day from the charts and shrinks the
 * all-time totals - and nothing distinguishes "you did not work that day" from
 * "that transcript is gone".
 *
 * The same applies to Codex, which prunes its own `sessions/` tree. Each agent
 * gets its OWN archive file - `history.json` and `codex-history.json` - keyed
 * by the provider on the report. Merging them would be actively wrong: the two
 * have separate project id spaces and separate rate cards.
 *
 * This module keeps a local archive of the *aggregates* for every day ever
 * seen. Once a day is recorded it survives its transcript being deleted.
 *
 * **Numbers only.** The archive stores token counts, costs, runtime, project
 * ids and display names - never message content, and nothing read out of a
 * transcript body. That keeps it on the right side of the rule that nothing is
 * ever copied out of `.claude/projects`.
 *
 * Not archived: the hour histogram and session lists, which cannot be
 * reconstructed from daily aggregates. Peak hour and session counts therefore
 * still reflect the live transcripts only.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { computeStreaks, localDate } from './parser';
import type { ProviderId } from './providers';
import type { DailyEntry, ProjectSummary, UsageCell, UsageReport } from './types';
import { UNKNOWN_DATE } from './usage-math';

const HISTORY_VERSION = 1;

/** Entries with no usable timestamp are bucketed under this by the parser. */

export interface ArchivedBucket {
  perModel: Record<string, UsageCell>;
  combined: UsageCell;
}

export interface ArchivedDay extends ArchivedBucket {
  date: string;
  projects: Record<string, ArchivedBucket>;
}

export interface HistoryFile {
  version: number;
  updatedAt: string;
  /** Kept so a project whose transcripts are all gone can still be named. */
  projectMeta: Record<string, { name: string; cwd: string | null }>;
  days: Record<string, ArchivedDay>;
}

const ARCHIVE_FILES: Record<ProviderId, string> = {
  claude: 'history.json',
  codex: 'codex-history.json',
};

/**
 * Where the daily archive lives.
 *
 * `DASHBOARD_DATA_DIR` moves it, and that exists for one specific reason:
 * pointing `CLAUDE_CONFIG_DIR` or `CODEX_HOME` at a demo tree without it would
 * fold synthetic days into your real archive — and the merge keeps whichever
 * version has more messages, so a fabricated day could permanently overwrite
 * a real one. The archive is the one part of this tool that does not rebuild
 * itself from disk, so that damage is not recoverable.
 *
 * `scripts/make-demo-data.ts` prints the command with this variable already
 * set. Anything reading demo transcripts must set it too.
 */
export function historyPath(provider: ProviderId = 'claude'): string {
  const dir = process.env.DASHBOARD_DATA_DIR?.trim() || path.join(process.cwd(), 'data');
  return path.join(dir, ARCHIVE_FILES[provider] ?? ARCHIVE_FILES.claude);
}

function emptyHistory(): HistoryFile {
  return { version: HISTORY_VERSION, updatedAt: '', projectMeta: {}, days: {} };
}

/**
 * Read the archive. Fails soft in every direction: a missing, unreadable, or
 * corrupt file yields an empty archive and a warning, never an exception. The
 * dashboard must still work when the archive does not.
 */
export function loadHistory(provider: ProviderId = 'claude', warnings: string[] = []): HistoryFile {
  const file = historyPath(provider);
  if (!existsSync(file)) return emptyHistory();

  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<HistoryFile>;
    if (parsed?.version !== HISTORY_VERSION || typeof parsed.days !== 'object' || !parsed.days) {
      warnings.push(`History archive at ${file} has an unexpected shape; ignoring it.`);
      return emptyHistory();
    }
    return {
      version: HISTORY_VERSION,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
      projectMeta: parsed.projectMeta ?? {},
      days: sanitizeDays(parsed.days as Record<string, unknown>, file, warnings),
    };
  } catch (error) {
    warnings.push(
      `Could not read the history archive at ${file}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return emptyHistory();
  }
}

/* -------------------------------------------------------------------------
 * Reading back what was written
 * ---------------------------------------------------------------------- */

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** A stored cell, with every number coerced. Null when it is not a cell at all. */
function normalizeCell(value: unknown): UsageCell | null {
  if (!isObject(value)) return null;
  return {
    input: num(value.input),
    output: num(value.output),
    cacheRead: num(value.cacheRead),
    cacheWrite5m: num(value.cacheWrite5m),
    cacheWrite1h: num(value.cacheWrite1h),
    reasoning: num(value.reasoning),
    messages: num(value.messages),
    runtimeSeconds: num(value.runtimeSeconds),
    totalTokens: num(value.totalTokens),
    costUsd: num(value.costUsd),
    unpriced: value.unpriced === true,
  };
}

function normalizeBucket(value: unknown): ArchivedBucket | null {
  if (!isObject(value)) return null;
  const combined = normalizeCell(value.combined);
  if (!combined) return null;
  const perModel: Record<string, UsageCell> = {};
  if (isObject(value.perModel)) {
    for (const [model, cell] of Object.entries(value.perModel)) {
      const normalized = normalizeCell(cell);
      if (normalized) perModel[model] = normalized;
    }
  }
  return { perModel, combined };
}

/**
 * Validate the archive day by day, dropping the ones that cannot be read.
 *
 * The file is on the user's disk and nothing stops it being hand-edited or
 * truncated. A day missing its `combined` cell used to throw on the next parse
 * and take the whole dashboard down with it - which is exactly what this
 * module's "fails soft in every direction" promise says must not happen. A bad
 * day is now dropped with a warning; the rest of the archive still loads.
 */
export function sanitizeDays(
  days: Record<string, unknown> | undefined,
  file: string,
  warnings: string[] = [],
): Record<string, ArchivedDay> {
  const out: Record<string, ArchivedDay> = {};
  const dropped: string[] = [];

  for (const [date, value] of Object.entries(days ?? {})) {
    const bucket = isObject(value) ? normalizeBucket(value) : null;
    if (!bucket) {
      dropped.push(date);
      continue;
    }
    const projects: Record<string, ArchivedBucket> = {};
    if (isObject((value as Record<string, unknown>).projects)) {
      for (const [id, project] of Object.entries(
        (value as Record<string, unknown>).projects as Record<string, unknown>,
      )) {
        const normalized = normalizeBucket(project);
        if (normalized) projects[id] = normalized;
      }
    }
    out[date] = { date, perModel: bucket.perModel, combined: bucket.combined, projects };
  }

  if (dropped.length) {
    const shown = dropped.slice(0, 5).join(', ');
    warnings.push(
      `Skipped ${dropped.length} unreadable day${dropped.length === 1 ? '' : 's'} in the history archive at ${file} (${shown}${dropped.length > 5 ? ', …' : ''}).`,
    );
  }
  return out;
}

/** Atomic write, so a crash mid-save cannot leave a truncated archive. */
export function saveHistory(
  history: HistoryFile,
  provider: ProviderId = 'claude',
  warnings: string[] = [],
): void {
  const file = historyPath(provider);
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.tmp`;
    writeFileSync(temp, JSON.stringify(history, null, 2), 'utf8');
    renameSync(temp, file);
  } catch (error) {
    warnings.push(
      `Could not write the history archive at ${file}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function cloneBucket(source: {
  perModel: Record<string, UsageCell>;
  combined: UsageCell;
}): ArchivedBucket {
  return {
    perModel: JSON.parse(JSON.stringify(source.perModel)) as Record<string, UsageCell>,
    combined: JSON.parse(JSON.stringify(source.combined)) as UsageCell,
  };
}

/**
 * Fold a freshly parsed report into the archive.
 *
 * A day is replaced only when the fresh parse knows at least as much about it
 * (message count is the proxy). That direction matters: today's numbers grow as
 * you work and must overwrite, while a day whose transcripts have been partly
 * deleted comes back *thinner* and must not overwrite the fuller record already
 * stored.
 */
export function mergeReportIntoHistory(history: HistoryFile, report: UsageReport): HistoryFile {
  const projectDayIndex = new Map<string, Map<string, DailyEntry>>();
  for (const project of report.projects) {
    const byDate = new Map<string, DailyEntry>();
    for (const entry of project.daily) byDate.set(entry.date, entry);
    projectDayIndex.set(project.id, byDate);
  }

  for (const entry of report.global.daily) {
    if (entry.date === UNKNOWN_DATE) continue;

    const existing = history.days[entry.date];
    if (existing && existing.combined.messages > entry.combined.messages) continue;

    const projects: Record<string, ArchivedBucket> = {};
    for (const project of report.projects) {
      const day = projectDayIndex.get(project.id)?.get(entry.date);
      if (day) projects[project.id] = cloneBucket(day);
    }

    history.days[entry.date] = { date: entry.date, ...cloneBucket(entry), projects };
  }

  for (const project of report.projects) {
    history.projectMeta[project.id] = { name: project.name, cwd: project.cwd };
  }

  history.version = HISTORY_VERSION;
  history.updatedAt = new Date().toISOString();
  return history;
}

function zeroCell(): UsageCell {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite5m: 0,
    cacheWrite1h: 0,
    reasoning: 0,
    messages: 0,
    runtimeSeconds: 0,
    totalTokens: 0,
    costUsd: 0,
    unpriced: false,
  };
}

function addInto(target: UsageCell, source: UsageCell): void {
  target.input += source.input;
  target.output += source.output;
  target.cacheRead += source.cacheRead;
  target.cacheWrite5m += source.cacheWrite5m;
  target.cacheWrite1h += source.cacheWrite1h;
  // Archives written before Codex support existed have no `reasoning`, and
  // Claude Code never reports one. `?? 0` keeps those from poisoning the sum
  // with NaN.
  target.reasoning = (target.reasoning ?? 0) + (source.reasoning ?? 0);
  target.messages += source.messages;
  target.runtimeSeconds += source.runtimeSeconds;
  target.totalTokens += source.totalTokens;
  target.costUsd += source.costUsd;
  target.unpriced = target.unpriced || source.unpriced;
}

/** Sum a set of daily buckets back into a perModel/combined pair. */
function rollUp(buckets: ArchivedBucket[]): ArchivedBucket {
  const perModel: Record<string, UsageCell> = {};
  const combined = zeroCell();

  for (const bucket of buckets) {
    addInto(combined, bucket.combined);
    for (const [model, cell] of Object.entries(bucket.perModel)) {
      perModel[model] ??= zeroCell();
      addInto(perModel[model], cell);
    }
  }

  const ordered: Record<string, UsageCell> = {};
  for (const [model, cell] of Object.entries(perModel).sort(
    (a, b) => b[1].totalTokens - a[1].totalTokens,
  )) {
    ordered[model] = cell;
  }
  return { perModel: ordered, combined };
}

/**
 * Rebuild the report from the archive, which by this point holds the best known
 * version of every day - including the ones just parsed.
 */
export function applyHistoryToReport(report: UsageReport, history: HistoryFile): UsageReport {
  const archivedDates = Object.keys(history.days).sort();
  if (!archivedDates.length) return report;

  const liveDates = new Set(
    report.global.daily.map((entry) => entry.date).filter((date) => date !== UNKNOWN_DATE),
  );

  const mergedDaily: DailyEntry[] = archivedDates.map((date) => {
    const day = history.days[date];
    return { date, perModel: day.perModel, combined: day.combined };
  });

  // The parser's catch-all bucket has no date, so it cannot be archived by day.
  // Carry it through untouched rather than dropping usage on the floor.
  const unknown = report.global.daily.find((entry) => entry.date === UNKNOWN_DATE);
  if (unknown) mergedDaily.push(unknown);

  const globalRollUp = rollUp(
    mergedDaily.map((entry) => ({ perModel: entry.perModel, combined: entry.combined })),
  );

  const liveProjects = new Map(report.projects.map((project) => [project.id, project]));
  const projectIds = new Set<string>([
    ...report.projects.map((project) => project.id),
    ...archivedDates.flatMap((date) => Object.keys(history.days[date].projects)),
  ]);

  const projects: ProjectSummary[] = [...projectIds]
    .map((id) => {
      const live = liveProjects.get(id);

      const daily: DailyEntry[] = [];
      for (const date of archivedDates) {
        const bucket = history.days[date].projects[id];
        if (bucket) daily.push({ date, perModel: bucket.perModel, combined: bucket.combined });
      }
      const unknownDay = live?.daily.find((entry) => entry.date === UNKNOWN_DATE);
      if (unknownDay) daily.push(unknownDay);

      const rolled = rollUp(
        daily.map((entry) => ({ perModel: entry.perModel, combined: entry.combined })),
      );
      const meta = history.projectMeta[id];

      return {
        id,
        cwd: live?.cwd ?? meta?.cwd ?? null,
        name: live?.name ?? meta?.name ?? id,
        mergedFrom: live?.mergedFrom ?? [],
        perModel: rolled.perModel,
        combined: rolled.combined,
        daily,
        // Sessions cannot be reconstructed from aggregates. A project that only
        // survives in the archive shows totals with no session breakdown.
        sessions: live?.sessions ?? [],
      };
    })
    .filter((project) => project.combined.messages > 0 || project.combined.totalTokens > 0)
    .sort((a, b) => b.combined.costUsd - a.combined.costUsd);

  const activeDates = mergedDaily
    .map((entry) => entry.date)
    .filter((date) => date !== UNKNOWN_DATE);
  const todayKey = localDate(Date.now(), report.settings.localUtcOffsetHours);
  const { current, longest } = computeStreaks(activeDates, todayKey);

  const liveEarliest = [...liveDates].sort()[0] ?? null;
  const archivedOnlyDays = archivedDates.filter((date) => !liveDates.has(date)).length;

  return {
    ...report,
    activity: {
      ...report.activity,
      messages: globalRollUp.combined.messages,
      totalTokens: globalRollUp.combined.totalTokens,
      activeDays: activeDates.length,
      currentStreakDays: current,
      longestStreakDays: longest,
    },
    global: {
      perModel: globalRollUp.perModel,
      combined: globalRollUp.combined,
      daily: mergedDaily,
    },
    projects,
    coverage: {
      earliestDate: archivedDates[0] ?? null,
      latestDate: archivedDates[archivedDates.length - 1] ?? null,
      liveEarliestDate: liveEarliest,
      archivedOnlyDays,
      restored: archivedOnlyDays > 0,
    },
  };
}

/**
 * Parse-time hook: fold the fresh report in, persist it, rebuild from the
 * archive. The archive file is chosen by the report's own provider, so a Codex
 * parse can never write into Claude Code's history.
 */
export function withHistory(report: UsageReport): UsageReport {
  const warnings = report.diagnostics.warnings;
  const provider = report.provider ?? 'claude';
  const history = loadHistory(provider, warnings);
  mergeReportIntoHistory(history, report);
  saveHistory(history, provider, warnings);
  return applyHistoryToReport(report, history);
}
