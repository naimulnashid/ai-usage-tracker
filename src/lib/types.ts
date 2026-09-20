/**
 * Shared types for the usage parsers.
 *
 * Both agents get parsed into this one shape, so every chart, table and card in
 * the UI is written once. Where the two genuinely differ the field is optional
 * and the provider registry (src/lib/providers.ts) says whether to show it.
 *
 * The JSONL schemas these describe are undocumented and internal to Claude Code
 * and Codex; both change between releases. Everything here is treated as
 * best-effort: a parser must never assume a field exists.
 */

import type { ProviderId } from './providers';

/** Rates in USD per million tokens. */
export interface ModelRate {
  input: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
  output: number;
}

export interface PricingConfig {
  currency: string;
  unit: string;
  lastVerified?: string;
  models: Record<string, ModelRate>;
  /**
   * Model strings seen in transcripts that should be *priced* as another entry
   * in `models`, without being renamed in the report.
   *
   * Codex logs its automated code-review turns as `codex-auto-review`, which is
   * GPT-5.3-Codex wearing a job title. Aliasing prices it correctly while the
   * charts keep showing it as its own band — which is the useful view, since it
   * is spend you did not ask for directly.
   */
  aliases?: Record<string, string>;
}

/** First day of the week in the activity heat map. */
export type WeekStart = 'sunday' | 'monday' | 'saturday';

export interface Settings {
  localUtcOffsetHours: number;
  weekStartsOn: WeekStart;
  maxIdleGapMinutes: number;
  suspiciousOutputTokens: number;
  suspiciousContextTokens: number;
}

/**
 * The five priced token buckets. Cache writes are split by TTL.
 *
 * Codex maps onto the same five: its `cached_input_tokens` becomes `cacheRead`,
 * `input` carries only the uncached remainder (OpenAI's `input_tokens` is the
 * total *including* cached, so the two would otherwise double count), and the
 * cache-write buckets stay zero.
 */
export interface TokenCounts {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  /**
   * Reasoning tokens, reported by Codex only.
   *
   * NOT a sixth bucket: these are already inside `output` and are billed as
   * output. Carried for display, and deliberately excluded from `totalTokens`
   * and from cost, which would otherwise count them twice.
   */
  reasoning?: number;
}

/** A cell of aggregated usage: tokens + derived cost + runtime. */
export interface UsageCell extends TokenCounts {
  /** Number of de-duplicated assistant messages contributing to this cell. */
  messages: number;
  /** Seconds of approximate active runtime attributed here. */
  runtimeSeconds: number;
  /** Sum of all five token buckets. */
  totalTokens: number;
  /** Estimated USD. Zero when the model is unpriced - check `unpriced`. */
  costUsd: number;
  /** True when no rate card entry exists for this model. */
  unpriced: boolean;
}

export interface DailyEntry {
  /** YYYY-MM-DD in the configured local offset. */
  date: string;
  perModel: Record<string, UsageCell>;
  combined: UsageCell;
}

export interface SessionSummary {
  sessionId: string;
  projectId: string;
  /** Relative path of the .jsonl, for traceability. */
  file: string;
  firstTimestamp: string | null;
  lastTimestamp: string | null;
  /** Gap-summed active time, excluding idle stretches. */
  runtimeSeconds: number;
  /** First-to-last span, for comparison. Always >= runtimeSeconds. */
  spanSeconds: number;
  models: string[];
  messages: number;
  totalTokens: number;
  costUsd: number;
  /** True when this session is a subagent transcript. */
  isSubagent: boolean;
  /**
   * The chat this transcript belongs to, when it is not one itself.
   *
   * A subagent does not have a conversation of its own: it is work the parent
   * chat spawned, running inside the parent's wall clock. Codex records
   * `parent_thread_id` in its rollout's `session_meta`; Claude Code encodes it
   * in the path (`<session-id>/subagents/agent-*.jsonl`). Null for a real chat.
   *
   * Only the "Peak tokens" / "Longest chat" records use this - every total in
   * the report counts each transcript once, on its own, as before.
   */
  parentSessionId?: string | null;
  /** What kind of subagent, when the transcript says. Codex: "guardian". */
  subagentKind?: string | null;
  /** Human-readable thread name, when the agent keeps one. Codex only. */
  title?: string | null;
  /**
   * Set when at least one message looks like it recorded a placeholder
   * output_tokens that we could not recover a better value for.
   */
  possiblyInaccurateOutput: boolean;
  suspiciousMessageCount: number;
}

export interface ProjectSummary {
  /** The encoded directory name under .claude/projects. */
  id: string;
  /** Real working directory, recovered from the `cwd` field when available. */
  cwd: string | null;
  /** Short human-facing name (last path segment). */
  name: string;
  /**
   * Other project directories merged into this one via config/projects.json.
   * Empty for the usual case. Surfaced in the UI so a combined total is never
   * silently different from what the transcripts are keyed by.
   */
  mergedFrom: string[];
  perModel: Record<string, UsageCell>;
  combined: UsageCell;
  daily: DailyEntry[];
  sessions: SessionSummary[];
}

export interface ParseDiagnostics {
  filesScanned: number;
  filesFailed: number;
  linesRead: number;
  linesUnparseable: number;
  assistantLines: number;
  /** Unique (message.id, requestId) pairs that carried usage. */
  uniqueMessages: number;
  /** Assistant lines discarded as duplicates of an already-counted message. */
  duplicateLinesSkipped: number;
  /** Messages whose output_tokens was recovered from a later streaming line. */
  outputTokensRecovered: number;
  /**
   * Codex only: rollout files whose de-duplicated per-turn deltas summed back
   * to the running total the file itself reported. A file that fails to
   * reconcile is the signal that Codex's accounting shape has moved.
   */
  reconciledFiles?: number;
  reconcileFailures?: number;
  /**
   * Codex only: times the running counter went backwards mid-file, which is
   * treated as a fresh baseline rather than negative usage.
   */
  counterResets?: number;
  /**
   * Lines whose `timestamp` parsed but landed outside any plausible window
   * (before 2000, or more than a year ahead). They still count towards tokens
   * and cost; they just carry no date, so they bucket under "(unknown date)"
   * rather than being trusted enough to place on a chart.
   */
  implausibleTimestamps?: number;
  /** Model strings with no rate card entry. */
  unpricedModels: string[];
  /**
   * Project directories dropped from `projects` because they contained no
   * original usage — every message in them was a replay already counted
   * against another project. Listed rather than silently discarded.
   */
  emptyProjectsHidden: string[];
  warnings: string[];
}

/**
 * The single biggest session on one axis - the record behind a "peak" card.
 *
 * Session lists are deliberately NOT archived (src/lib/history.ts keeps daily
 * aggregates only, since sessions cannot be rebuilt from them), so a record
 * describes the transcripts still on disk. When the agent deletes the
 * transcript that set a record, the record moves to whatever is left - the
 * same window that peak hour and the session count already live in.
 */
export interface SessionRecord {
  sessionId: string;
  projectId: string;
  /** Project display name, resolved when the report is shaped. */
  projectName: string;
  /** Local day the session started (YYYY-MM-DD), or null when untimed. */
  date: string | null;
  totalTokens: number;
  /** Gap-summed active runtime - the same measure used everywhere else. */
  runtimeSeconds: number;
  costUsd: number;
  isSubagent: boolean;
  /** Thread name, where the agent keeps one. Codex only. */
  title?: string | null;
  /**
   * Subagent transcripts folded into this record - work the chat spawned.
   * 0 for a chat that spawned none. Their tokens and cost are included in the
   * figures above; their runtime is NOT, because they run inside this chat's
   * wall clock and adding it would count the same minutes twice.
   */
  subagentThreads: number;
}

/**
 * Headline activity stats, mirroring what the Claude Code app surfaces.
 *
 * These are deliberately comparable to that app so the two can be sanity
 * checked against each other - see CLAUDE.md for where they agree and where
 * they intentionally differ.
 */
export interface ActivityStats {
  /** All transcript files, including subagent transcripts. */
  sessions: number;
  /** Subset of `sessions` that are subagent transcripts. */
  subagentSessions: number;
  /** De-duplicated assistant messages (one per billed API response). */
  messages: number;
  totalTokens: number;
  activeDays: number;
  /** Consecutive active days ending today or yesterday; 0 if the streak lapsed. */
  currentStreakDays: number;
  longestStreakDays: number;
  /** Local hour 0-23 with the most messages, or null when there is no data. */
  peakHour: number | null;
  /** 24 buckets, message counts by local hour. */
  hourHistogram: number[];
  /** Model with the most tokens, excluding `<synthetic>`. */
  favoriteModel: string | null;
  /**
   * The single session that consumed the most tokens, or null when nothing
   * has. Subagent transcripts are eligible: they are separately billed work and
   * are already counted in `sessions`.
   */
  peakSession: SessionRecord | null;
  /** The single session with the most active runtime, on the same basis. */
  longestSession: SessionRecord | null;
}

/**
 * What span of time the report actually describes.
 *
 * Claude Code deletes transcripts past its retention window, so the live files
 * on disk are a moving window rather than a complete record. The local archive
 * (src/lib/history.ts) preserves earlier days, and this says how far each
 * reaches - so the totals are never silently mistaken for all-time.
 */
export interface HistoryCoverage {
  /** Earliest day in the report, archive included. */
  earliestDate: string | null;
  latestDate: string | null;
  /** Earliest day still present in the transcripts on disk. */
  liveEarliestDate: string | null;
  /** Days that exist only in the archive - their transcripts are gone. */
  archivedOnlyDays: number;
  /** True when the archive is contributing days the transcripts no longer hold. */
  restored: boolean;
}

export interface UsageReport {
  /** Which agent this report describes. */
  provider: ProviderId;
  generatedAt: string;
  projectsDir: string;
  settings: Settings;
  pricingLastVerified: string | null;
  diagnostics: ParseDiagnostics;
  activity: ActivityStats;
  global: {
    perModel: Record<string, UsageCell>;
    combined: UsageCell;
    daily: DailyEntry[];
  };
  projects: ProjectSummary[];
  /** Absent only when the archive could not be read. */
  coverage?: HistoryCoverage;
}
