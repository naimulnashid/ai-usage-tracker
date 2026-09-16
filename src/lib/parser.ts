import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import {
  costOf,
  getRate,
  loadPricing,
  loadProjectConfig,
  loadSettings,
  resolveProjectId,
} from './pricing';
import type {
  ActivityStats,
  DailyEntry,
  ParseDiagnostics,
  PricingConfig,
  ProjectSummary,
  SessionRecord,
  SessionSummary,
  Settings,
  TokenCounts,
  UsageCell,
  UsageReport,
} from './types';

/* -------------------------------------------------------------------------
 * Locating the transcripts
 * ---------------------------------------------------------------------- */

export function resolveProjectsDir(): string {
  const base =
    process.env.CLAUDE_CONFIG_DIR ??
    path.join(process.env.USERPROFILE ?? os.homedir(), '.claude');
  return path.join(base, 'projects');
}

interface DiscoveredFile {
  /** Absolute path. */
  abs: string;
  /**
   * Project key after merge rules are applied. Files from a renamed directory
   * carry the target's id here so they aggregate together.
   */
  projectId: string;
  /** The directory the file actually lives in, before any merge. */
  sourceProjectId: string;
  /** Path relative to projectsDir, for display. */
  rel: string;
  /** Session id, from the filename. */
  sessionId: string;
  /** Subagent transcripts live in <session>/subagents/*.jsonl. */
  isSubagent: boolean;
  /** The session that spawned this one, for a subagent transcript. */
  parentSessionId: string | null;
}

/**
 * `<project>/<session-id>/subagents/agent-*.jsonl` -> `<session-id>`.
 *
 * Path-derived rather than read from the transcript body: the nesting is the
 * only place Claude Code records the relationship, and it is the same fact
 * `isSubagent` is already read from.
 */
function parentFromPath(rel: string): string | null {
  const parts = rel.split('/');
  const at = parts.lastIndexOf('subagents');
  return at > 0 ? parts[at - 1] : null;
}

/**
 * Recursively finds every .jsonl under each project directory.
 *
 * The recursion matters: subagent transcripts are nested at
 * <project>/<session-id>/subagents/agent-*.jsonl and hold real, separately
 * billed API usage that a top-level-only scan silently drops.
 */
export function discoverFiles(projectsDir: string, warnings: string[]): DiscoveredFile[] {
  const out: DiscoveredFile[] = [];
  let projectDirs: fs.Dirent[];
  try {
    projectDirs = fs.readdirSync(projectsDir, { withFileTypes: true });
  } catch (err) {
    warnings.push(`Cannot read projects directory ${projectsDir}: ${(err as Error).message}`);
    return out;
  }

  for (const projectDir of projectDirs) {
    if (!projectDir.isDirectory()) continue;
    const projectId = projectDir.name;
    const root = path.join(projectsDir, projectId);

    const walk = (dir: string) => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch (err) {
        warnings.push(`Skipped unreadable directory ${dir}: ${(err as Error).message}`);
        return;
      }
      for (const entry of entries) {
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(abs);
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.jsonl')) {
          const rel = path.relative(projectsDir, abs).split(path.sep).join('/');
          out.push({
            abs,
            projectId,
            sourceProjectId: projectId,
            rel,
            sessionId: entry.name.replace(/\.jsonl$/i, ''),
            isSubagent: rel.includes('/subagents/'),
            // `<project>/<session-id>/subagents/agent-*.jsonl` - the segment
            // before `subagents/` is the chat that spawned this one.
            parentSessionId: parentFromPath(rel),
          });
        }
      }
    };

    walk(root);
  }

  return out;
}

/* -------------------------------------------------------------------------
 * Reading lines
 * ---------------------------------------------------------------------- */

interface LineRecord {
  timestampMs: number | null;
  timestampRaw: string | null;
  /** message.model when present on this line. */
  lineModel: string | null;
  /** De-duplication key, null for lines that carry no message id. */
  key: string | null;
  tokens: TokenCounts | null;
  cwd: string | null;
}

interface FileRecords {
  file: DiscoveredFile;
  records: LineRecord[];
  firstTimestampMs: number | null;
  /** First `cwd` seen in the file. Only a fallback - see `cwdCounts`. */
  cwd: string | null;
  /** Every `cwd` seen in the file, with the number of lines carrying it. */
  cwdCounts: Map<string, number>;
}

/**
 * Re-encodes a working directory the way Claude Code names its project
 * directories: every character outside [A-Za-z0-9] becomes a dash.
 *
 * The encoding is LOSSY and cannot be reversed - `My App` and `My_App` both
 * encode to `My-App` - which is why the display name is still read from a
 * transcript's `cwd`. But it can be applied FORWARDS to ask "which of the paths
 * in this directory's files is the directory itself?", and that is the only
 * reliable way to tell a project's own cwd from one replayed into it by a
 * resumed session (see `pickProjectCwd`).
 *
 * Verified against a real set of project directories: every directory holding
 * a matching path matched EXACTLY, including names with underscores, spaced
 * dashes (`Some App - Web`), non-ASCII punctuation and a trailing `)` that
 * encodes to a trailing dash.
 */
export function encodeProjectDir(cwd: string): string {
  return cwd.replace(/[^A-Za-z0-9]/g, '-');
}

/**
 * The path a project directory is named after, chosen from every `cwd` its
 * files mention.
 *
 * Resuming a session from a different directory makes Claude Code replay the
 * whole earlier conversation into the new project's file, and those replayed
 * lines carry the OLD cwd. Taking the first one seen therefore labels the new
 * project with the old one's name: a project started by resuming a session
 * from `Project A` was displayed as "Project A", so two rows carried that name
 * and the new project was nowhere on the projects page.
 *
 * So candidates are filtered to those that re-encode to the directory's own
 * name, which drops both replayed history and subdirectory cwds (`...\android`
 * encodes to `...-My-App-android`). Ties - the lossy case above - go to the
 * spelling on the most lines, which is the one the project has actually been
 * worked in.
 */
function pickProjectCwd(id: string, counts: Map<string, number>): string | null {
  let best: string | null = null;
  let bestCount = -1;
  for (const [cwd, count] of counts) {
    if (encodeProjectDir(cwd) !== id) continue;
    if (count > bestCount) {
      best = cwd;
      bestCount = count;
    }
  }
  return best;
}

function toInt(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Pulls the five token buckets off a usage object.
 *
 * Cache writes: prefer the `cache_creation` object, which splits 5m vs 1h TTL.
 * Fall back to the older flat `cache_creation_input_tokens` and assume the 5m
 * rate, since 5m is the default TTL and 1h must be requested explicitly.
 */
function readTokens(usage: Record<string, unknown>): TokenCounts {
  const creation = usage.cache_creation as Record<string, unknown> | undefined;
  let cacheWrite5m = 0;
  let cacheWrite1h = 0;

  if (creation && typeof creation === 'object') {
    cacheWrite5m = toInt(creation.ephemeral_5m_input_tokens);
    cacheWrite1h = toInt(creation.ephemeral_1h_input_tokens);
  } else {
    cacheWrite5m = toInt(usage.cache_creation_input_tokens);
  }

  return {
    input: toInt(usage.input_tokens),
    output: toInt(usage.output_tokens),
    cacheRead: toInt(usage.cache_read_input_tokens),
    cacheWrite5m,
    cacheWrite1h,
  };
}

async function readFileRecords(
  file: DiscoveredFile,
  diagnostics: ParseDiagnostics,
): Promise<FileRecords> {
  const records: LineRecord[] = [];
  let firstTimestampMs: number | null = null;
  let cwd: string | null = null;
  const cwdCounts = new Map<string, number>();

  let stream: fs.ReadStream;
  try {
    stream = fs.createReadStream(file.abs, { encoding: 'utf8' });
  } catch (err) {
    diagnostics.filesFailed += 1;
    diagnostics.warnings.push(`Cannot open ${file.rel}: ${(err as Error).message}`);
    return { file, records, firstTimestampMs, cwd, cwdCounts };
  }

  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  try {
    for await (const rawLine of rl) {
      const line = rawLine.trim();
      if (!line) continue;
      diagnostics.linesRead += 1;

      let entry: Record<string, unknown>;
      try {
        entry = JSON.parse(line) as Record<string, unknown>;
      } catch {
        // A truncated or malformed line is skipped, never fatal. Claude Code's
        // schema is internal and can change; the parser degrades instead of dying.
        diagnostics.linesUnparseable += 1;
        continue;
      }

      const tsRaw = typeof entry.timestamp === 'string' ? entry.timestamp : null;
      let timestampMs: number | null = null;
      if (tsRaw) {
        const parsed = Date.parse(tsRaw);
        if (!Number.isNaN(parsed)) {
          timestampMs = parsed;
          if (firstTimestampMs === null || parsed < firstTimestampMs) firstTimestampMs = parsed;
        }
      }

      if (typeof entry.cwd === 'string' && entry.cwd) {
        if (!cwd) cwd = entry.cwd;
        cwdCounts.set(entry.cwd, (cwdCounts.get(entry.cwd) ?? 0) + 1);
      }

      const message = entry.message as Record<string, unknown> | undefined;
      const lineModel =
        message && typeof message.model === 'string' && message.model ? message.model : null;

      let key: string | null = null;
      let tokens: TokenCounts | null = null;

      if (entry.type === 'assistant' && message && typeof message === 'object') {
        diagnostics.assistantLines += 1;
        const usage = message.usage as Record<string, unknown> | undefined;
        if (usage && typeof usage === 'object') {
          tokens = readTokens(usage);
          const messageId = typeof message.id === 'string' ? message.id : null;
          const requestId = typeof entry.requestId === 'string' ? entry.requestId : null;
          if (messageId) key = `${messageId}::${requestId ?? ''}`;
        }
      }

      records.push({ timestampMs, timestampRaw: tsRaw, lineModel, key, tokens, cwd: null });
    }
  } catch (err) {
    diagnostics.filesFailed += 1;
    diagnostics.warnings.push(`Error reading ${file.rel}: ${(err as Error).message}`);
  } finally {
    rl.close();
    stream.close();
  }

  return { file, records, firstTimestampMs, cwd, cwdCounts };
}

/* -------------------------------------------------------------------------
 * Aggregation helpers
 * ---------------------------------------------------------------------- */

function emptyCell(): UsageCell {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite5m: 0,
    cacheWrite1h: 0,
    messages: 0,
    runtimeSeconds: 0,
    totalTokens: 0,
    costUsd: 0,
    unpriced: false,
  };
}

function addTokens(cell: UsageCell, tokens: TokenCounts, cost: number) {
  cell.input += tokens.input;
  cell.output += tokens.output;
  cell.cacheRead += tokens.cacheRead;
  cell.cacheWrite5m += tokens.cacheWrite5m;
  cell.cacheWrite1h += tokens.cacheWrite1h;
  cell.messages += 1;
  cell.totalTokens +=
    tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite5m + tokens.cacheWrite1h;
  cell.costUsd += cost;
}

export function localDate(timestampMs: number, offsetHours: number): string {
  return new Date(timestampMs + offsetHours * 3_600_000).toISOString().slice(0, 10);
}

function localHour(timestampMs: number, offsetHours: number): number {
  return new Date(timestampMs + offsetHours * 3_600_000).getUTCHours();
}

/** Days apart between two YYYY-MM-DD keys, treating both as UTC midnight. */
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/**
 * Longest run of consecutive active days, and the run ending today (or
 * yesterday, so a streak isn't reported as broken before the day is over).
 */
export function computeStreaks(
  activeDates: string[],
  todayKey: string,
): { current: number; longest: number } {
  if (!activeDates.length) return { current: 0, longest: 0 };
  const sorted = [...activeDates].sort();

  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i += 1) {
    run = daysBetween(sorted[i - 1], sorted[i]) === 1 ? run + 1 : 1;
    if (run > longest) longest = run;
  }

  const last = sorted[sorted.length - 1];
  const gapFromToday = daysBetween(last, todayKey);
  if (gapFromToday > 1) return { current: 0, longest };

  const present = new Set(sorted);
  let current = 0;
  let cursor = last;
  while (present.has(cursor)) {
    current += 1;
    cursor = new Date(Date.parse(`${cursor}T00:00:00Z`) - 86_400_000)
      .toISOString()
      .slice(0, 10);
  }
  return { current, longest };
}

/**
 * The record-holding sessions: most tokens, and most active runtime.
 *
 * Shared with the Codex parser, which emits the same `SessionSummary` shape.
 * Both parsers walk their files chronologically, so taking the strict maximum
 * leaves the EARLIEST session holding a tie - a later session has to actually
 * beat the record to take it.
 *
 * Runtime is the gap-summed figure, not `spanSeconds`: first-to-last overstates
 * by ~5.8x on this corpus because it counts sessions left open overnight, which
 * would make "longest chat" a measure of forgetting to close a terminal.
 *
 * A session scoring zero can never win, so an agent with no usage yields null
 * rather than an arbitrary empty transcript.
 */
/**
 * The two "biggest chat" records, computed over CHATS rather than transcripts.
 *
 * A subagent transcript is not a chat. Both agents spawn them - Claude Code's
 * Task subagents, Codex's guardian auto-reviews - and both bill them
 * separately, so they belong in the totals and in the Sessions count. But they
 * are work one chat spawned, not a conversation of their own, and a card that
 * says "Longest chat" must not be able to name one.
 *
 * So each transcript is folded into its parent (`parentSessionId`), and:
 *
 * - **tokens and cost are summed** across the chat and everything it spawned,
 *   because that is what the chat cost;
 * - **runtime is the parent's own**, because a subagent runs inside the
 *   parent's wall clock. Summing would charge the same minutes twice - the
 *   worst case here was a Codex guardian running 5h48m concurrently with its
 *   5h56m parent, which would have reported an 11h44m "chat".
 *
 * An orphan - a subagent whose parent transcript is gone - stands on its own
 * rather than being dropped, on the same reasoning as everywhere else: report
 * what is on disk, do not silently lose usage.
 */
export function computeSessionRecords(
  sessions: SessionSummary[],
  projectNames: Map<string, string>,
  offsetHours: number,
): { peakSession: SessionRecord | null; longestSession: SessionRecord | null } {
  const byId = new Map(sessions.map((session) => [session.sessionId, session]));

  interface Chat {
    root: SessionSummary;
    totalTokens: number;
    costUsd: number;
    subagentThreads: number;
  }

  const chats = new Map<string, Chat>();
  const chatFor = (root: SessionSummary): Chat => {
    let chat = chats.get(root.sessionId);
    if (!chat) {
      chat = { root, totalTokens: 0, costUsd: 0, subagentThreads: 0 };
      chats.set(root.sessionId, chat);
    }
    return chat;
  };

  for (const session of sessions) {
    const parentId = session.parentSessionId ?? null;
    // A parent we never saw leaves the subagent standing as its own chat.
    const root = (parentId ? byId.get(parentId) : null) ?? session;
    const chat = chatFor(root);
    chat.totalTokens += session.totalTokens;
    chat.costUsd += session.costUsd;
    if (session !== root) chat.subagentThreads += 1;
  }

  const toRecord = (chat: Chat): SessionRecord => {
    const { root } = chat;
    const startedMs = root.firstTimestamp ? Date.parse(root.firstTimestamp) : NaN;
    return {
      sessionId: root.sessionId,
      projectId: root.projectId,
      projectName: projectNames.get(root.projectId) ?? root.projectId,
      date: Number.isNaN(startedMs) ? null : localDate(startedMs, offsetHours),
      totalTokens: chat.totalTokens,
      // Deliberately the root's runtime, not the chat's sum. See above.
      runtimeSeconds: root.runtimeSeconds,
      costUsd: chat.costUsd,
      isSubagent: root.isSubagent,
      title: root.title ?? null,
      subagentThreads: chat.subagentThreads,
    };
  };

  const best = (score: (chat: Chat) => number): SessionRecord | null => {
    let winner: Chat | null = null;
    let winning = 0;
    for (const chat of chats.values()) {
      const value = score(chat);
      if (value > winning) {
        winner = chat;
        winning = value;
      }
    }
    return winner ? toRecord(winner) : null;
  };

  return {
    peakSession: best((chat) => chat.totalTokens),
    longestSession: best((chat) => chat.root.runtimeSeconds),
  };
}

/** Nested accumulator: model -> cell, plus a combined cell. */
interface Bucket {
  perModel: Map<string, UsageCell>;
  combined: UsageCell;
}

function newBucket(): Bucket {
  return { perModel: new Map(), combined: emptyCell() };
}

function bucketCell(bucket: Bucket, model: string): UsageCell {
  let cell = bucket.perModel.get(model);
  if (!cell) {
    cell = emptyCell();
    bucket.perModel.set(model, cell);
  }
  return cell;
}

function bucketToPlain(bucket: Bucket): {
  perModel: Record<string, UsageCell>;
  combined: UsageCell;
} {
  const perModel: Record<string, UsageCell> = {};
  for (const [model, cell] of [...bucket.perModel.entries()].sort(
    (a, b) => b[1].totalTokens - a[1].totalTokens,
  )) {
    perModel[model] = cell;
  }
  return { perModel, combined: bucket.combined };
}

function dailyToPlain(map: Map<string, Bucket>): DailyEntry[] {
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, bucket]) => ({ date, ...bucketToPlain(bucket) }));
}

/* -------------------------------------------------------------------------
 * Main entry point
 * ---------------------------------------------------------------------- */

export interface ParseOptions {
  projectsDir?: string;
  pricing?: PricingConfig;
  settings?: Settings;
}

export async function buildUsageReport(options: ParseOptions = {}): Promise<UsageReport> {
  const projectsDir = options.projectsDir ?? resolveProjectsDir();
  const pricing = options.pricing ?? loadPricing();
  const settings = options.settings ?? loadSettings();

  const diagnostics: ParseDiagnostics = {
    filesScanned: 0,
    filesFailed: 0,
    linesRead: 0,
    linesUnparseable: 0,
    assistantLines: 0,
    uniqueMessages: 0,
    duplicateLinesSkipped: 0,
    outputTokensRecovered: 0,
    unpricedModels: [],
    emptyProjectsHidden: [],
    warnings: [],
  };

  const files = discoverFiles(projectsDir, diagnostics.warnings);
  diagnostics.filesScanned = files.length;

  // Apply project merge rules before anything is aggregated, so a renamed
  // directory's sessions land in the same buckets as the target's.
  const projectConfig = loadProjectConfig();
  for (const file of files) {
    file.projectId = resolveProjectId(
      file.sourceProjectId,
      projectConfig.merge,
      diagnostics.warnings,
    );
  }

  // --- Read every file once, keeping only the fields we need. -------------
  const fileRecords: FileRecords[] = [];
  for (const file of files) {
    fileRecords.push(await readFileRecords(file, diagnostics));
  }

  /*
   * De-duplication.
   *
   * Claude Code writes the SAME assistant message more than once:
   *   1. Streaming partials - one line per update within a single response.
   *      Early lines carry an incomplete output_tokens (often 1-4); the final
   *      line carries the true value.
   *   2. Session replay - resuming or forking a session copies the earlier
   *      history into the new session's .jsonl.
   *
   * Counting every line inflates tokens and cost by ~89% on a real corpus.
   * We key on (message.id, requestId) and keep the MAXIMUM output_tokens seen,
   * which recovers the true value that the streaming partials understate.
   */
  const canonical = new Map<string, TokenCounts>();
  const firstSeenOutput = new Map<string, number>();
  for (const { records } of fileRecords) {
    for (const record of records) {
      if (!record.key || !record.tokens) continue;
      const existing = canonical.get(record.key);
      if (!existing) {
        canonical.set(record.key, record.tokens);
        firstSeenOutput.set(record.key, record.tokens.output);
      } else if (record.tokens.output > existing.output) {
        canonical.set(record.key, record.tokens);
      }
    }
  }
  for (const [key, tokens] of canonical) {
    if ((firstSeenOutput.get(key) ?? 0) < tokens.output) diagnostics.outputTokensRecovered += 1;
  }

  // --- Walk files in chronological order, counting each message once. -----
  fileRecords.sort((a, b) => (a.firstTimestampMs ?? Infinity) - (b.firstTimestampMs ?? Infinity));

  const globalBucket = newBucket();
  const globalDaily = new Map<string, Bucket>();
  const projectBuckets = new Map<string, Bucket>();
  const projectDaily = new Map<string, Map<string, Bucket>>();
  const projectCwd = new Map<string, string>();
  const projectCwdFallback = new Map<string, string>();
  /** Every cwd each SOURCE directory's files mention, keyed by directory. */
  const dirCwdCounts = new Map<string, Map<string, number>>();
  const projectMergedFrom = new Map<string, Set<string>>();
  const sessions: SessionSummary[] = [];
  const unpricedModels = new Set<string>();
  const countedKeys = new Set<string>();
  const maxIdleGapSeconds = settings.maxIdleGapMinutes * 60;
  const hourHistogram = new Array<number>(24).fill(0);

  const getDaily = (map: Map<string, Bucket>, date: string): Bucket => {
    let bucket = map.get(date);
    if (!bucket) {
      bucket = newBucket();
      map.set(date, bucket);
    }
    return bucket;
  };

  for (const { file, records, cwd, cwdCounts } of fileRecords) {
    // A merged project should show the surviving directory's path, not the
    // one it was renamed away from - so only the target's own files set `cwd`,
    // and a merged-in path is used solely as a fallback.
    if (cwd) {
      if (file.sourceProjectId === file.projectId) {
        if (!projectCwd.has(file.projectId)) projectCwd.set(file.projectId, cwd);
      } else if (!projectCwdFallback.has(file.projectId)) {
        projectCwdFallback.set(file.projectId, cwd);
      }
    }
    // Counted against the directory the file actually lives in: a replayed
    // conversation names a different project's path, and only the directory
    // it sits in says which project that is. See `pickProjectCwd`.
    let dirCounts = dirCwdCounts.get(file.sourceProjectId);
    if (!dirCounts) {
      dirCounts = new Map<string, number>();
      dirCwdCounts.set(file.sourceProjectId, dirCounts);
    }
    for (const [seen, count] of cwdCounts) {
      dirCounts.set(seen, (dirCounts.get(seen) ?? 0) + count);
    }
    if (file.sourceProjectId !== file.projectId) {
      const merged = projectMergedFrom.get(file.projectId) ?? new Set<string>();
      merged.add(file.sourceProjectId);
      projectMergedFrom.set(file.projectId, merged);
    }

    if (!projectBuckets.has(file.projectId)) projectBuckets.set(file.projectId, newBucket());
    if (!projectDaily.has(file.projectId)) projectDaily.set(file.projectId, new Map());
    const projectBucket = projectBuckets.get(file.projectId)!;
    const projectDailyMap = projectDaily.get(file.projectId)!;

    let currentModel: string | null = null;
    let lastKeptTimestampMs: number | null = null;
    let sessionRuntime = 0;
    let sessionMessages = 0;
    let sessionTokens = 0;
    let sessionCost = 0;
    let sessionSuspicious = 0;
    let firstTs: string | null = null;
    let lastTs: string | null = null;
    let minMs: number | null = null;
    let maxMs: number | null = null;
    const sessionModels = new Set<string>();

    for (const record of records) {
      // A line whose message we have already counted is a replay or a
      // streaming partial: it contributes neither tokens nor runtime.
      if (record.key) {
        if (countedKeys.has(record.key)) {
          diagnostics.duplicateLinesSkipped += 1;
          continue;
        }
        countedKeys.add(record.key);
      }

      if (record.lineModel) currentModel = record.lineModel;

      if (record.timestampRaw) {
        if (!firstTs) firstTs = record.timestampRaw;
        lastTs = record.timestampRaw;
      }
      if (record.timestampMs !== null) {
        if (minMs === null || record.timestampMs < minMs) minMs = record.timestampMs;
        if (maxMs === null || record.timestampMs > maxMs) maxMs = record.timestampMs;
      }

      // --- Runtime: sum of gaps between consecutive kept lines. -----------
      if (record.timestampMs !== null) {
        if (lastKeptTimestampMs !== null && currentModel) {
          const gap = (record.timestampMs - lastKeptTimestampMs) / 1000;
          if (gap > 0 && gap <= maxIdleGapSeconds) {
            const date = localDate(record.timestampMs, settings.localUtcOffsetHours);
            sessionRuntime += gap;
            for (const bucket of [
              globalBucket,
              projectBucket,
              getDaily(globalDaily, date),
              getDaily(projectDailyMap, date),
            ]) {
              bucketCell(bucket, currentModel).runtimeSeconds += gap;
              bucket.combined.runtimeSeconds += gap;
            }
          }
        }
        lastKeptTimestampMs = record.timestampMs;
      }

      // --- Tokens and cost. ------------------------------------------------
      if (!record.key || !record.tokens) continue;
      const tokens = canonical.get(record.key) ?? record.tokens;
      const model = record.lineModel ?? currentModel ?? '(unknown)';
      sessionModels.add(model);

      const rate = getRate(pricing, model);
      if (!rate) unpricedModels.add(model);
      const cost = costOf(tokens, rate);

      const date =
        record.timestampMs !== null
          ? localDate(record.timestampMs, settings.localUtcOffsetHours)
          : '(unknown date)';

      if (record.timestampMs !== null) {
        hourHistogram[localHour(record.timestampMs, settings.localUtcOffsetHours)] += 1;
      }

      for (const bucket of [
        globalBucket,
        projectBucket,
        getDaily(globalDaily, date),
        getDaily(projectDailyMap, date),
      ]) {
        const cell = bucketCell(bucket, model);
        addTokens(cell, tokens, cost);
        if (!rate) cell.unpriced = true;
        addTokens(bucket.combined, tokens, cost);
      }

      sessionMessages += 1;
      sessionTokens +=
        tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite5m + tokens.cacheWrite1h;
      sessionCost += cost;

      // Known Claude Code limitation: output_tokens is occasionally a
      // placeholder. Taking the max across duplicates recovers most cases;
      // anything still tiny despite a large context is flagged, not trusted.
      if (
        model !== '<synthetic>' &&
        tokens.output < settings.suspiciousOutputTokens &&
        tokens.input + tokens.cacheRead >= settings.suspiciousContextTokens
      ) {
        sessionSuspicious += 1;
      }
    }

    sessions.push({
      sessionId: file.sessionId,
      projectId: file.projectId,
      file: file.rel,
      firstTimestamp: firstTs,
      lastTimestamp: lastTs,
      runtimeSeconds: sessionRuntime,
      spanSeconds: minMs !== null && maxMs !== null ? (maxMs - minMs) / 1000 : 0,
      models: [...sessionModels],
      messages: sessionMessages,
      totalTokens: sessionTokens,
      costUsd: sessionCost,
      isSubagent: file.isSubagent,
      parentSessionId: file.parentSessionId,
      possiblyInaccurateOutput: sessionSuspicious > 0,
      suspiciousMessageCount: sessionSuspicious,
    });
  }

  diagnostics.uniqueMessages = countedKeys.size;
  diagnostics.unpricedModels = [...unpricedModels].sort();

  // --- Shape the output. --------------------------------------------------
  const projects: ProjectSummary[] = [...projectBuckets.entries()]
    .map(([id, bucket]) => {
      // A merged project shows the surviving directory's path; a path from a
      // merged-in directory is only a fallback. Within each directory the path
      // it is named after wins over any replayed into it.
      const mergedIn = [...(projectMergedFrom.get(id) ?? [])].sort();
      const cwd =
        pickProjectCwd(id, dirCwdCounts.get(id) ?? new Map()) ??
        mergedIn
          .map((sourceId) => pickProjectCwd(sourceId, dirCwdCounts.get(sourceId) ?? new Map()))
          .find((path) => path !== null) ??
        projectCwd.get(id) ??
        projectCwdFallback.get(id) ??
        null;
      const derivedName = cwd
        ? cwd.split(/[\\/]/).filter(Boolean).pop() ?? id
        : id.replace(/^C--Users-[^-]+-/, '').replace(/-/g, ' ').trim();
      return {
        id,
        cwd,
        name: projectConfig.displayNames[id] ?? derivedName,
        mergedFrom: mergedIn,
        ...bucketToPlain(bucket),
        daily: dailyToPlain(projectDaily.get(id) ?? new Map()),
        sessions: sessions
          .filter((s) => s.projectId === id)
          .sort((a, b) => b.costUsd - a.costUsd),
      };
    })
    .sort((a, b) => b.combined.costUsd - a.combined.costUsd);

  /*
   * Drop projects with no original usage.
   *
   * A directory can hold session files yet contribute nothing: resuming a
   * session from a different working directory makes Claude Code replay the
   * whole history into a new project folder, and global de-duplication then
   * attributes every one of those messages to the project that recorded them
   * first. The folder is a copy, not a second piece of work, so listing it
   * with a row of zeroes is noise.
   *
   * The test is deliberately strict — any token, message or second of runtime
   * keeps the project visible. Hidden ids are reported in diagnostics rather
   * than silently discarded.
   */
  const visibleProjects = projects.filter((project) => {
    const empty =
      project.combined.messages === 0 &&
      project.combined.totalTokens === 0 &&
      project.combined.runtimeSeconds === 0;
    if (empty) diagnostics.emptyProjectsHidden.push(project.id);
    return !empty;
  });

  // --- Headline activity stats. ------------------------------------------
  const globalDailyPlain = dailyToPlain(globalDaily);
  const activeDates = globalDailyPlain
    .map((entry) => entry.date)
    .filter((date) => date !== '(unknown date)');
  const todayKey = localDate(Date.now(), settings.localUtcOffsetHours);
  const { current, longest } = computeStreaks(activeDates, todayKey);

  const peakHour = hourHistogram.some((n) => n > 0)
    ? hourHistogram.indexOf(Math.max(...hourHistogram))
    : null;

  const favoriteModel =
    [...globalBucket.perModel.entries()]
      .filter(([model]) => model !== '<synthetic>')
      .sort((a, b) => b[1].totalTokens - a[1].totalTokens)[0]?.[0] ?? null;

  // Named from the visible projects: a hidden one is hidden precisely because
  // it holds no tokens, messages or runtime, so it can never own a record.
  const { peakSession, longestSession } = computeSessionRecords(
    sessions,
    new Map(visibleProjects.map((project) => [project.id, project.name])),
    settings.localUtcOffsetHours,
  );

  const activity: ActivityStats = {
    sessions: sessions.length,
    subagentSessions: sessions.filter((session) => session.isSubagent).length,
    messages: globalBucket.combined.messages,
    totalTokens: globalBucket.combined.totalTokens,
    activeDays: activeDates.length,
    currentStreakDays: current,
    longestStreakDays: longest,
    peakHour,
    hourHistogram,
    favoriteModel,
    peakSession,
    longestSession,
  };

  return {
    provider: 'claude',
    generatedAt: new Date().toISOString(),
    projectsDir,
    settings,
    pricingLastVerified: pricing.lastVerified ?? null,
    diagnostics,
    activity,
    global: {
      ...bucketToPlain(globalBucket),
      daily: globalDailyPlain,
    },
    projects: visibleProjects,
  };
}
