/**
 * Codex rollout parser.
 *
 * Produces exactly the same `UsageReport` shape as the Claude Code parser, so
 * every chart, table and card in the UI is written once. The two agents record
 * usage in fundamentally different ways, though, and the differences are the
 * whole substance of this file — see the traps below.
 *
 * Codex writes one JSONL "rollout" file per thread to
 *   %CODEX_HOME%\sessions\YYYY\MM\DD\rollout-<local-time>-<thread-id>.jsonl
 * one JSON object per line, each with a UTC `timestamp` and a `type`.
 *
 * The schema is undocumented and internal, and has changed shape several times
 * through 2026 (MultiAgent V2, subagents, world_state). The parser must always
 * degrade rather than crash: skip unparseable lines, skip unreadable files,
 * record a warning, keep going.
 *
 * ── Trap 1: usage is CUMULATIVE, and the running total is repeated ──────────
 *
 * Token usage arrives as `event_msg` / `token_count`, carrying both a
 * `total_token_usage` (running total for the whole file) and a
 * `last_token_usage` (that turn alone). Summing `last_token_usage` overcounts,
 * because Codex sometimes emits the same reading twice — the second copy
 * repeats a non-zero `last_token_usage` while `total_token_usage` does not
 * move. On the reference data that inflated the total by about 0.4%.
 *
 * The fix is to treat `total_token_usage` as authoritative and take per-turn
 * usage as its delta, which makes a repeated reading contribute a delta of
 * zero automatically. Verified: the delta sum equals the sum of each file's
 * final running total, and its gap to the naive sum was exactly the repeated
 * readings.
 *
 * `last_token_usage` is still read, as an independent check — see
 * `reconciledFiles` in the diagnostics.
 *
 * ── Trap 2: `input_tokens` already INCLUDES the cached tokens ───────────────
 *
 * OpenAI reports `input_tokens` as the full prompt and `cached_input_tokens`
 * as the part of it served from cache. Pricing them as two separate buckets
 * bills the cached portion twice — and it is ~98% of the prompt here, so the
 * error is not small. `input` below carries the uncached remainder only.
 *
 * ── Trap 3: `reasoning_output_tokens` is INSIDE `output_tokens` ─────────────
 *
 * Reasoning tokens are billed as output and are already counted in it. They
 * are carried through for display and kept out of `totalTokens` and cost.
 *
 * ── Trap 4: auto-review threads are separate files, and are real spend ──────
 *
 * Codex spawns a "guardian" subagent to review its own planned actions, and
 * writes it to its own rollout file with `thread_source: "subagent"` and model
 * `codex-auto-review`. On the reference data that was most of the rollout
 * files and roughly 9% of the cost. They are counted, and kept as their own
 * model band rather than folded into the main model, because it is spend you
 * did not ask for directly.
 *
 * ── Trap 5: the model is a state, not a per-event field ─────────────────────
 *
 * `token_count` events carry no model. The model comes from the most recent
 * `turn_context`, which Codex writes only when the context changes — a
 * handful of `turn_context` lines against hundreds of `token_count` lines in a
 * typical file. So the model has to be tracked as running state. Verified that
 * no `token_count` ever precedes the first `turn_context` in the reference
 * data.
 */

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
import {
  UNKNOWN_DATE,
  computeSessionRecords,
  computeStreaks,
  isRecord,
  localDate,
  parseTimestampMs,
  toTokenCount,
} from './parser';
import type {
  ActivityStats,
  DailyEntry,
  ParseDiagnostics,
  PricingConfig,
  ProjectSummary,
  SessionSummary,
  Settings,
  TokenCounts,
  UsageCell,
  UsageReport,
} from './types';

/* -------------------------------------------------------------------------
 * Locating the rollouts
 * ---------------------------------------------------------------------- */

export function resolveCodexHome(): string {
  return process.env.CODEX_HOME ?? path.join(process.env.USERPROFILE ?? os.homedir(), '.codex');
}

/**
 * Both roots Codex uses. `archived_sessions` holds threads moved out of the
 * live list; it does not exist on every install, and a missing one is normal.
 */
export function resolveCodexSessionDirs(home = resolveCodexHome()): string[] {
  return [path.join(home, 'sessions'), path.join(home, 'archived_sessions')].filter((dir) =>
    fs.existsSync(dir),
  );
}

interface DiscoveredFile {
  abs: string;
  /** Path relative to the Codex home, for display. */
  rel: string;
  /** Thread id, from the filename. */
  sessionId: string;
}

/** `rollout-2026-08-05T01-26-25-<uuid>.jsonl` -> the uuid. */
function sessionIdFromName(name: string): string {
  const stem = name.replace(/\.jsonl$/i, '');
  const match = stem.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  return match ? match[0] : stem;
}

/** Every .jsonl under the date-partitioned session roots. */
export function discoverCodexFiles(home: string, warnings: string[]): DiscoveredFile[] {
  const out: DiscoveredFile[] = [];

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
        out.push({
          abs,
          rel: path.relative(home, abs).split(path.sep).join('/'),
          sessionId: sessionIdFromName(entry.name),
        });
      }
    }
  };

  for (const root of resolveCodexSessionDirs(home)) walk(root);
  return out;
}

/**
 * Thread id -> human-readable name, from Codex's own index.
 *
 * Purely cosmetic and entirely optional: a missing or malformed index just
 * means sessions show their id. Only the two fields used are read, and nothing
 * from a transcript body is touched.
 */
export function loadThreadNames(home: string, warnings: string[]): Map<string, string> {
  const names = new Map<string, string>();
  const file = path.join(home, 'session_index.jsonl');
  if (!fs.existsSync(file)) return names;
  try {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const entry = JSON.parse(trimmed) as { id?: unknown; thread_name?: unknown };
        if (typeof entry.id === 'string' && typeof entry.thread_name === 'string') {
          names.set(entry.id, entry.thread_name);
        }
      } catch {
        // One bad line does not invalidate the rest of the index.
      }
    }
  } catch (err) {
    warnings.push(`Could not read the Codex session index: ${(err as Error).message}`);
  }
  return names;
}

/* -------------------------------------------------------------------------
 * Project identity
 * ---------------------------------------------------------------------- */

/**
 * A URL- and filename-safe id for a working directory.
 *
 * Codex has no encoded project directory of its own — it records the raw `cwd`
 * — so we mint the same shape Claude Code uses: every character outside the
 * safe set becomes one dash. `C:\Users\me\Thing` gives `C--Users-me-Thing`, and
 * the doubled dash is the drive colon plus the separator rather than a typo.
 * Matching that shape keeps project ids consistent across the two halves of the
 * dashboard.
 *
 * Replacing each character individually rather than collapsing runs is the
 * whole point: collapsing folds `C:\` into a single dash and quietly yields a
 * different id for the same path.
 *
 * Changing this function renames every project, orphaning whatever the archive
 * stored under the old ids. Delete data/codex-history.json if you ever do.
 */
export function projectIdFromCwd(cwd: string): string {
  return cwd.replace(/[^A-Za-z0-9._-]/g, '-').replace(/^-+|-+$/g, '');
}

/* -------------------------------------------------------------------------
 * Reading a rollout file
 * ---------------------------------------------------------------------- */

/** The running total Codex reports, in its own field names. */
interface RawTotals {
  input: number;
  cached: number;
  cacheWrite: number;
  output: number;
  reasoning: number;
  total: number;
}

const ZERO_TOTALS: RawTotals = {
  input: 0,
  cached: 0,
  cacheWrite: 0,
  output: 0,
  reasoning: 0,
  total: 0,
};

/** Shared with the Claude Code parser: a non-negative integer, or 0. */
const toInt = toTokenCount;

function readTotals(usage: Record<string, unknown>): RawTotals {
  return {
    input: toInt(usage.input_tokens),
    cached: toInt(usage.cached_input_tokens),
    cacheWrite: toInt(usage.cache_write_input_tokens),
    output: toInt(usage.output_tokens),
    reasoning: toInt(usage.reasoning_output_tokens),
    total: toInt(usage.total_tokens),
  };
}

function sameTotals(a: RawTotals, b: RawTotals): boolean {
  return (
    a.input === b.input &&
    a.cached === b.cached &&
    a.cacheWrite === b.cacheWrite &&
    a.output === b.output &&
    a.reasoning === b.reasoning &&
    a.total === b.total
  );
}

/**
 * Per-turn usage as the delta of the running totals, mapped onto the shared
 * five buckets.
 *
 * A negative delta on any field means the counter restarted — history rollback,
 * or a schema change we have not seen. That field is treated as a fresh
 * baseline (the whole current reading) rather than as negative usage, which
 * would silently subtract from the totals.
 */
function deltaTokens(previous: RawTotals, current: RawTotals, onReset: () => void): TokenCounts {
  let reset = false;
  const step = (before: number, after: number): number => {
    const diff = after - before;
    if (diff >= 0) return diff;
    reset = true;
    return after;
  };

  const input = step(previous.input, current.input);
  const cached = step(previous.cached, current.cached);
  const cacheWrite = step(previous.cacheWrite, current.cacheWrite);
  const output = step(previous.output, current.output);
  const reasoning = step(previous.reasoning, current.reasoning);
  if (reset) onReset();

  return {
    // Trap 2: `input_tokens` is the whole prompt, cache hits included. Only the
    // uncached remainder is charged at the input rate.
    input: Math.max(0, input - cached),
    output,
    cacheRead: cached,
    cacheWrite5m: cacheWrite,
    cacheWrite1h: 0,
    reasoning,
  };
}

/** One billed turn, already de-duplicated and mapped onto the shared buckets. */
interface UsageEvent {
  timestampMs: number | null;
  model: string;
  cwd: string | null;
  tokens: TokenCounts;
  /** What Codex said this turn cost on its own, for the reconciliation check. */
  reportedTotal: number;
}

interface FileRecords {
  file: DiscoveredFile;
  events: UsageEvent[];
  /** (timestampMs, model, cwd) for every line, in order — the runtime signal. */
  ticks: Array<{ timestampMs: number; model: string | null; cwd: string | null }>;
  firstTimestampMs: number | null;
  lastTimestampMs: number | null;
  firstTimestampRaw: string | null;
  lastTimestampRaw: string | null;
  cwd: string | null;
  isSubagent: boolean;
  /** `parent_thread_id` from session_meta - the chat this thread was spawned by. */
  parentThreadId: string | null;
  subagentKind: string | null;
  /** True when every counted delta matched the turn Codex reported. */
  reconciled: boolean;
}

async function readFileRecords(
  file: DiscoveredFile,
  diagnostics: ParseDiagnostics,
): Promise<FileRecords> {
  const events: UsageEvent[] = [];
  const ticks: FileRecords['ticks'] = [];

  let firstTimestampMs: number | null = null;
  let lastTimestampMs: number | null = null;
  let firstTimestampRaw: string | null = null;
  let lastTimestampRaw: string | null = null;
  let cwd: string | null = null;
  let isSubagent = false;
  let parentThreadId: string | null = null;
  let subagentKind: string | null = null;
  let reconciled = true;

  let currentModel: string | null = null;
  let currentCwd: string | null = null;
  let previous: RawTotals = ZERO_TOTALS;
  let havePrevious = false;

  let stream: fs.ReadStream;
  try {
    stream = fs.createReadStream(file.abs, { encoding: 'utf8' });
  } catch (err) {
    diagnostics.filesFailed += 1;
    diagnostics.warnings.push(`Cannot open ${file.rel}: ${(err as Error).message}`);
    return {
      file,
      events,
      ticks,
      firstTimestampMs,
      lastTimestampMs,
      firstTimestampRaw,
      lastTimestampRaw,
      cwd,
      isSubagent,
      subagentKind,
      reconciled,
      parentThreadId,
    };
  }

  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  try {
    for await (const rawLine of rl) {
      const line = rawLine.trim();
      if (!line) continue;
      diagnostics.linesRead += 1;

      let parsedLine: unknown;
      try {
        parsedLine = JSON.parse(line);
      } catch {
        diagnostics.linesUnparseable += 1;
        continue;
      }
      // `null`, a bare number or an array is valid JSON and unusable here -
      // and reading a field off it would abort the rest of the file.
      if (!isRecord(parsedLine)) {
        diagnostics.linesUnparseable += 1;
        continue;
      }
      const entry: Record<string, unknown> = parsedLine;

      const timestampMs = parseTimestampMs(entry.timestamp);
      const tsRaw =
        timestampMs !== null && typeof entry.timestamp === 'string' ? entry.timestamp : null;
      if (timestampMs === null && typeof entry.timestamp === 'string' && entry.timestamp) {
        diagnostics.implausibleTimestamps = (diagnostics.implausibleTimestamps ?? 0) + 1;
      }
      if (timestampMs !== null && tsRaw) {
        if (firstTimestampMs === null || timestampMs < firstTimestampMs) {
          firstTimestampMs = timestampMs;
          firstTimestampRaw = tsRaw;
        }
        if (lastTimestampMs === null || timestampMs > lastTimestampMs) {
          lastTimestampMs = timestampMs;
          lastTimestampRaw = tsRaw;
        }
      }

      const payload = isRecord(entry.payload) ? entry.payload : {};
      const type = entry.type;

      if (type === 'session_meta') {
        if (typeof payload.cwd === 'string' && payload.cwd) {
          currentCwd = payload.cwd;
          cwd ??= payload.cwd;
        }
        // The chat that spawned this thread. Present on every subagent rollout
        // and absent on a real chat, which is exactly the distinction the
        // "Longest chat" / "Peak tokens" records need.
        if (typeof payload.parent_thread_id === 'string' && payload.parent_thread_id) {
          parentThreadId ??= payload.parent_thread_id;
        }
        if (payload.thread_source === 'subagent') {
          isSubagent = true;
          // `source: { subagent: { other: "guardian" } }` — the shape has moved
          // before, so read it defensively and settle for "subagent" if it has
          // moved again.
          const source = payload.source as Record<string, unknown> | undefined;
          const sub = source?.subagent as Record<string, unknown> | undefined;
          const kind = sub ? (sub.other ?? sub.kind ?? sub.type) : undefined;
          subagentKind ??= typeof kind === 'string' ? kind : 'subagent';
        }
        // Some schema versions carried the model here rather than on turn_context.
        if (typeof payload.model === 'string' && payload.model) currentModel = payload.model;
      } else if (type === 'turn_context') {
        if (typeof payload.model === 'string' && payload.model) currentModel = payload.model;
        if (typeof payload.cwd === 'string' && payload.cwd) {
          currentCwd = payload.cwd;
          cwd ??= payload.cwd;
        }
      } else if (type === 'event_msg' && payload.type === 'token_count') {
        const info = payload.info as Record<string, unknown> | undefined;
        const totalUsage = (info?.total_token_usage ?? payload.total_token_usage) as
          Record<string, unknown> | undefined;
        // Older shapes, and the odd null `info` on an aborted turn, carry no
        // running total. Nothing can be derived from those, so they are skipped
        // rather than guessed at.
        if (!totalUsage || typeof totalUsage !== 'object') {
          diagnostics.linesUnparseable += 1;
          continue;
        }

        diagnostics.assistantLines += 1;
        const current = readTotals(totalUsage);

        // Trap 1: a repeated reading. Identical running totals mean this line
        // says nothing new, however large its `last_token_usage` looks.
        if (havePrevious && sameTotals(previous, current)) {
          diagnostics.duplicateLinesSkipped += 1;
          continue;
        }

        const tokens = deltaTokens(havePrevious ? previous : ZERO_TOTALS, current, () => {
          diagnostics.counterResets = (diagnostics.counterResets ?? 0) + 1;
        });
        previous = current;
        havePrevious = true;

        // Independent check: Codex also reports the turn on its own. When the
        // two disagree, our reading of the schema has drifted.
        const lastUsage = (info?.last_token_usage ?? payload.last_token_usage) as
          Record<string, unknown> | undefined;
        const reportedTotal = lastUsage ? toInt(lastUsage.total_tokens) : 0;
        const derivedTotal = tokens.input + tokens.cacheRead + tokens.output + tokens.cacheWrite5m;
        if (lastUsage && reportedTotal !== derivedTotal) reconciled = false;

        events.push({
          timestampMs,
          model: currentModel ?? '(unknown)',
          cwd: currentCwd,
          tokens,
          reportedTotal,
        });
      }

      if (timestampMs !== null) {
        ticks.push({ timestampMs, model: currentModel, cwd: currentCwd });
      }
    }
  } catch (err) {
    diagnostics.filesFailed += 1;
    diagnostics.warnings.push(`Error reading ${file.rel}: ${(err as Error).message}`);
  } finally {
    rl.close();
    stream.close();
  }

  return {
    file,
    events,
    ticks,
    firstTimestampMs,
    lastTimestampMs,
    firstTimestampRaw,
    lastTimestampRaw,
    cwd,
    isSubagent,
    subagentKind,
    reconciled,
    parentThreadId,
  };
}

/* -------------------------------------------------------------------------
 * Aggregation
 * ---------------------------------------------------------------------- */

function emptyCell(): UsageCell {
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

function addTokens(cell: UsageCell, tokens: TokenCounts, cost: number) {
  cell.input += tokens.input;
  cell.output += tokens.output;
  cell.cacheRead += tokens.cacheRead;
  cell.cacheWrite5m += tokens.cacheWrite5m;
  cell.cacheWrite1h += tokens.cacheWrite1h;
  // Reasoning is already inside `output`, so it is tracked but never summed
  // into totalTokens.
  cell.reasoning = (cell.reasoning ?? 0) + (tokens.reasoning ?? 0);
  cell.messages += 1;
  cell.totalTokens +=
    tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite5m + tokens.cacheWrite1h;
  cell.costUsd += cost;
}

function localHour(timestampMs: number, offsetHours: number): number | null {
  const shifted = timestampMs + offsetHours * 3_600_000;
  if (!Number.isFinite(shifted) || Math.abs(shifted) > 8.64e15) return null;
  return new Date(shifted).getUTCHours();
}

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

export interface CodexParseOptions {
  codexHome?: string;
  pricing?: PricingConfig;
  settings?: Settings;
}

export async function buildCodexUsageReport(options: CodexParseOptions = {}): Promise<UsageReport> {
  const home = options.codexHome ?? resolveCodexHome();
  const pricing = options.pricing ?? loadPricing('codex-pricing.json');
  const settings = options.settings ?? loadSettings();

  const diagnostics: ParseDiagnostics = {
    filesScanned: 0,
    filesFailed: 0,
    linesRead: 0,
    linesUnparseable: 0,
    assistantLines: 0,
    uniqueMessages: 0,
    duplicateLinesSkipped: 0,
    // Codex has no streaming-partial output placeholder to recover from; the
    // field stays at zero so the shared report type holds for both agents.
    outputTokensRecovered: 0,
    reconciledFiles: 0,
    reconcileFailures: 0,
    counterResets: 0,
    unpricedModels: [],
    emptyProjectsHidden: [],
    warnings: [],
  };

  const sessionsRoot = resolveCodexSessionDirs(home)[0] ?? path.join(home, 'sessions');
  const files = discoverCodexFiles(home, diagnostics.warnings);
  diagnostics.filesScanned = files.length;

  if (!files.length) {
    diagnostics.warnings.push(
      `No Codex rollout files found under ${home}. Set CODEX_HOME if yours live elsewhere.`,
    );
  }

  const threadNames = loadThreadNames(home, diagnostics.warnings);
  const projectConfig = loadProjectConfig('codex-projects.json');

  const fileRecords: FileRecords[] = [];
  for (const file of files) {
    fileRecords.push(await readFileRecords(file, diagnostics));
  }

  // Chronological, so the earliest run of a project sets its display path.
  fileRecords.sort((a, b) => (a.firstTimestampMs ?? Infinity) - (b.firstTimestampMs ?? Infinity));

  const globalBucket = newBucket();
  const globalDaily = new Map<string, Bucket>();
  const projectBuckets = new Map<string, Bucket>();
  const projectDaily = new Map<string, Map<string, Bucket>>();
  const projectCwd = new Map<string, string>();
  const projectMergedFrom = new Map<string, Set<string>>();
  const sessions: SessionSummary[] = [];
  const unpricedModels = new Set<string>();
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

  const UNPLACED = '(unknown project)';

  /** cwd -> merged project id, remembering what was folded into what. */
  const resolveProject = (rawCwd: string | null): string => {
    if (!rawCwd) return UNPLACED;
    const sourceId = projectIdFromCwd(rawCwd);
    const targetId = resolveProjectId(sourceId, projectConfig.merge, diagnostics.warnings);
    if (sourceId === targetId) {
      if (!projectCwd.has(targetId)) projectCwd.set(targetId, rawCwd);
    } else {
      const merged = projectMergedFrom.get(targetId) ?? new Set<string>();
      merged.add(sourceId);
      projectMergedFrom.set(targetId, merged);
    }
    return targetId;
  };

  const bucketsFor = (projectId: string, date: string): Bucket[] => {
    if (!projectBuckets.has(projectId)) projectBuckets.set(projectId, newBucket());
    if (!projectDaily.has(projectId)) projectDaily.set(projectId, new Map());
    return [
      globalBucket,
      projectBuckets.get(projectId)!,
      getDaily(globalDaily, date),
      getDaily(projectDaily.get(projectId)!, date),
    ];
  };

  for (const record of fileRecords) {
    if (record.reconciled) diagnostics.reconciledFiles = (diagnostics.reconciledFiles ?? 0) + 1;
    else diagnostics.reconcileFailures = (diagnostics.reconcileFailures ?? 0) + 1;

    // --- Runtime: sum of gaps between consecutive lines, idle excluded. ----
    // Codex writes densely within a turn, so this measures active session time
    // the same way the Claude parser does. A gap longer than the cutoff is
    // assumed to be the user stepping away and is dropped.
    let sessionRuntime = 0;
    let previousTickMs: number | null = null;
    for (const tick of record.ticks) {
      if (previousTickMs !== null && tick.model) {
        const gap = (tick.timestampMs - previousTickMs) / 1000;
        if (gap > 0 && gap <= maxIdleGapSeconds) {
          const date = localDate(tick.timestampMs, settings.localUtcOffsetHours);
          const projectId = resolveProject(tick.cwd ?? record.cwd);
          sessionRuntime += gap;
          for (const bucket of bucketsFor(projectId, date)) {
            bucketCell(bucket, tick.model).runtimeSeconds += gap;
            bucket.combined.runtimeSeconds += gap;
          }
        }
      }
      previousTickMs = tick.timestampMs;
    }

    // --- Tokens and cost. --------------------------------------------------
    let sessionMessages = 0;
    let sessionTokens = 0;
    let sessionCost = 0;
    let sessionProject: string | null = null;
    const sessionModels = new Set<string>();

    for (const event of record.events) {
      const model = event.model;
      sessionModels.add(model);

      const rate = getRate(pricing, model);
      if (!rate) unpricedModels.add(model);
      const cost = costOf(event.tokens, rate);

      const date =
        event.timestampMs !== null
          ? localDate(event.timestampMs, settings.localUtcOffsetHours)
          : UNKNOWN_DATE;
      const projectId = resolveProject(event.cwd ?? record.cwd);
      sessionProject ??= projectId;

      if (event.timestampMs !== null) {
        const hour = localHour(event.timestampMs, settings.localUtcOffsetHours);
        if (hour !== null) hourHistogram[hour] += 1;
      }

      for (const bucket of bucketsFor(projectId, date)) {
        const cell = bucketCell(bucket, model);
        addTokens(cell, event.tokens, cost);
        if (!rate) cell.unpriced = true;
        addTokens(bucket.combined, event.tokens, cost);
      }

      sessionMessages += 1;
      sessionTokens +=
        event.tokens.input +
        event.tokens.output +
        event.tokens.cacheRead +
        event.tokens.cacheWrite5m +
        event.tokens.cacheWrite1h;
      sessionCost += cost;
    }

    const projectId = sessionProject ?? resolveProject(record.cwd);
    // A file with no usage still needs its project to exist, so an empty
    // thread does not vanish without a trace.
    bucketsFor(
      projectId,
      localDate(record.firstTimestampMs ?? Date.now(), settings.localUtcOffsetHours),
    );

    sessions.push({
      sessionId: record.file.sessionId,
      projectId,
      file: record.file.rel,
      firstTimestamp: record.firstTimestampRaw,
      lastTimestamp: record.lastTimestampRaw,
      runtimeSeconds: sessionRuntime,
      spanSeconds:
        record.firstTimestampMs !== null && record.lastTimestampMs !== null
          ? (record.lastTimestampMs - record.firstTimestampMs) / 1000
          : 0,
      models: [...sessionModels],
      messages: sessionMessages,
      totalTokens: sessionTokens,
      costUsd: sessionCost,
      isSubagent: record.isSubagent,
      parentSessionId: record.parentThreadId,
      subagentKind: record.subagentKind,
      title: threadNames.get(record.file.sessionId) ?? null,
      // Codex has no equivalent of Claude Code's placeholder-output bug: its
      // counters are cumulative and self-checking. The flag stays false rather
      // than being repurposed for something it does not mean.
      possiblyInaccurateOutput: false,
      suspiciousMessageCount: 0,
    });
  }

  diagnostics.uniqueMessages = globalBucket.combined.messages;
  diagnostics.unpricedModels = [...unpricedModels].sort();

  const projects: ProjectSummary[] = [...projectBuckets.entries()]
    .map(([id, bucket]) => {
      const cwd = projectCwd.get(id) ?? null;
      const derivedName = cwd
        ? (cwd.split(/[\\/]/).filter(Boolean).pop() ?? id)
        : id
            .replace(/^C--Users-[^-]+-/, '')
            .replace(/-/g, ' ')
            .trim();
      return {
        id,
        cwd,
        name: projectConfig.displayNames[id] ?? derivedName,
        mergedFrom: [...(projectMergedFrom.get(id) ?? [])].sort(),
        ...bucketToPlain(bucket),
        daily: dailyToPlain(projectDaily.get(id) ?? new Map()),
        sessions: sessions.filter((s) => s.projectId === id).sort((a, b) => b.costUsd - a.costUsd),
      };
    })
    .sort((a, b) => b.combined.costUsd - a.combined.costUsd);

  const visibleProjects = projects.filter((project) => {
    const empty =
      project.combined.messages === 0 &&
      project.combined.totalTokens === 0 &&
      project.combined.runtimeSeconds === 0;
    if (empty) diagnostics.emptyProjectsHidden.push(project.id);
    return !empty;
  });

  const globalDailyPlain = dailyToPlain(globalDaily);
  const activeDates = globalDailyPlain
    .map((entry) => entry.date)
    .filter((date) => date !== UNKNOWN_DATE);
  const todayKey = localDate(Date.now(), settings.localUtcOffsetHours);
  const { current, longest } = computeStreaks(activeDates, todayKey);

  const peakHour = hourHistogram.some((n) => n > 0)
    ? hourHistogram.indexOf(Math.max(...hourHistogram))
    : null;

  const favoriteModel =
    [...globalBucket.perModel.entries()].sort(
      (a, b) => b[1].totalTokens - a[1].totalTokens,
    )[0]?.[0] ?? null;

  // Records count chats, not transcripts: computeSessionRecords folds each
  // auto-review thread into the chat that spawned it (tokens and cost summed,
  // runtime the parent's own), so a guardian thread can never be named the
  // longest chat on its own.
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
    provider: 'codex',
    generatedAt: new Date().toISOString(),
    projectsDir: sessionsRoot,
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
