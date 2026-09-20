/**
 * Fixture helpers.
 *
 * Every fixture here is written at run time into a temp directory and deleted
 * again. Nothing derived from a real transcript is ever committed - see the
 * privacy rules in CLAUDE.md - and `*.jsonl` is gitignored anyway, so a
 * committed fixture would silently not be a file the test suite could rely on.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after } from 'node:test';

import type { PricingConfig, Settings } from '../src/lib/types';

/**
 * A temp directory that removes itself when the test file finishes.
 *
 * The retries are for Windows: the parsers have just closed read streams over
 * these files, and a handle can outlive the close long enough for `rmSync` to
 * fail the directory with ENOTEMPTY. CI caught exactly that on Node 20.
 */
export function tempDir(prefix = 'aiusage-test-'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));
  return dir;
}

export function writeLines(file: string, lines: unknown[]): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    lines.map((line) => (typeof line === 'string' ? line : JSON.stringify(line))).join('\n') + '\n',
    'utf8',
  );
}

/* ---------------------------------------------------------------- Claude -- */

export interface AssistantLineOptions {
  ts: string;
  id: string;
  requestId?: string;
  model?: string;
  cwd?: string;
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite5m?: number;
  cacheWrite1h?: number;
  /** Use the pre-TTL-split field instead of `cache_creation`. */
  flatCacheWrite?: number;
}

/** One `type: "assistant"` line in the shape Claude Code writes. */
export function assistantLine(options: AssistantLineOptions): Record<string, unknown> {
  const usage: Record<string, unknown> = {
    input_tokens: options.input ?? 0,
    output_tokens: options.output ?? 0,
    cache_read_input_tokens: options.cacheRead ?? 0,
  };
  if (options.flatCacheWrite !== undefined) {
    usage.cache_creation_input_tokens = options.flatCacheWrite;
  } else {
    usage.cache_creation = {
      ephemeral_5m_input_tokens: options.cacheWrite5m ?? 0,
      ephemeral_1h_input_tokens: options.cacheWrite1h ?? 0,
    };
  }
  return {
    type: 'assistant',
    timestamp: options.ts,
    requestId: options.requestId ?? `req_${options.id}`,
    ...(options.cwd ? { cwd: options.cwd } : {}),
    message: { id: options.id, model: options.model ?? 'test-model', usage },
  };
}

/** A non-assistant line, which still moves the runtime clock. */
export function plainLine(ts: string, cwd?: string): Record<string, unknown> {
  return { type: 'user', timestamp: ts, ...(cwd ? { cwd } : {}) };
}

/* ----------------------------------------------------------------- Codex -- */

export function sessionMeta(
  ts: string,
  cwd: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return { type: 'session_meta', timestamp: ts, payload: { cwd, ...extra } };
}

export function turnContext(ts: string, model: string, cwd?: string): Record<string, unknown> {
  return { type: 'turn_context', timestamp: ts, payload: { model, ...(cwd ? { cwd } : {}) } };
}

export interface TokenCountOptions {
  ts: string;
  /** Running totals, as Codex reports them. */
  input: number;
  cached: number;
  output: number;
  reasoning?: number;
  /** What Codex claims this turn cost on its own; defaults to the real delta. */
  lastTotal?: number;
}

export function tokenCount(options: TokenCountOptions, previous?: TokenCountOptions): Record<string, unknown> {
  const derived =
    options.input - (previous?.input ?? 0) + (options.output - (previous?.output ?? 0));
  return {
    type: 'event_msg',
    timestamp: options.ts,
    payload: {
      type: 'token_count',
      info: {
        total_token_usage: {
          input_tokens: options.input,
          cached_input_tokens: options.cached,
          output_tokens: options.output,
          reasoning_output_tokens: options.reasoning ?? 0,
          total_tokens: options.input + options.output,
        },
        last_token_usage: { total_tokens: options.lastTotal ?? derived },
      },
    },
  };
}

/** A rollout filename Codex would produce for this thread id. */
export function rolloutName(threadId: string, localTime = '2026-08-01T12-00-00'): string {
  return `rollout-${localTime}-${threadId}.jsonl`;
}

/* --------------------------------------------------------------- Config -- */

/** A rate card with round numbers, so expected costs are obvious by hand. */
export function testPricing(extra: Partial<PricingConfig> = {}): PricingConfig {
  return {
    currency: 'USD',
    unit: 'per_million_tokens',
    models: {
      'test-model': {
        input: 10,
        cacheWrite5m: 12.5,
        cacheWrite1h: 20,
        cacheRead: 1,
        output: 50,
      },
      'cheap-model': { input: 1, cacheWrite5m: 1.25, cacheWrite1h: 2, cacheRead: 0.1, output: 5 },
    },
    ...extra,
  };
}

export function testSettings(extra: Partial<Settings> = {}): Settings {
  return {
    localUtcOffsetHours: 0,
    weekStartsOn: 'monday',
    maxIdleGapMinutes: 30,
    suspiciousOutputTokens: 5,
    suspiciousContextTokens: 1000,
    ...extra,
  };
}
