import fs from 'node:fs';
import path from 'node:path';
import type { ModelRate, PricingConfig, Settings, TokenCounts, WeekStart } from './types';

const CONFIG_DIR = path.join(process.cwd(), 'config');

const WEEK_STARTS: readonly WeekStart[] = ['sunday', 'monday', 'saturday'];

/**
 * Defaults for a fresh clone, where `config/settings.json` does not exist.
 *
 * The day-bucketing offset follows the machine's CURRENT UTC offset, so "today"
 * matches the user's calendar without any setup. It is read once per parse and
 * applied to every timestamp, so in a zone with daylight saving a few hours
 * around each switch can land a day off - pin `localUtcOffsetHours` in
 * settings.json if that matters.
 */
function defaultSettings(): Settings {
  return {
    // `|| 0` turns UTC's `-0` into a plain 0.
    localUtcOffsetHours: -new Date().getTimezoneOffset() / 60 || 0,
    weekStartsOn: 'monday',
    maxIdleGapMinutes: 30,
    suspiciousOutputTokens: 5,
    suspiciousContextTokens: 1000,
  };
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

/**
 * Loads an editable rate card. Falls back to an empty model map rather than
 * throwing - an unreadable pricing file should surface every model as
 * "unpriced", not take the whole dashboard down.
 *
 * One file per agent: `pricing.json` for Claude Code, `codex-pricing.json` for
 * Codex. They are separate files rather than one merged card because the two
 * rate cards are maintained by different vendors and move independently.
 */
export function loadPricing(file = 'pricing.json'): PricingConfig {
  const parsed = readJson<PricingConfig>(path.join(CONFIG_DIR, file));
  if (!parsed || typeof parsed.models !== 'object' || parsed.models === null) {
    return { currency: 'USD', unit: 'per_million_tokens', models: {} };
  }
  return parsed;
}

/**
 * Parser settings from `config/settings.json`, which is the user's own and
 * gitignored; `config/settings.example.json` is the template. Every key is
 * optional, and a missing or invalid one falls back to its default.
 */
export function loadSettings(): Settings {
  const defaults = defaultSettings();
  const parsed = readJson<Partial<Settings>>(path.join(CONFIG_DIR, 'settings.json'));
  if (!parsed) return defaults;
  const num = (v: unknown, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return {
    localUtcOffsetHours: num(parsed.localUtcOffsetHours, defaults.localUtcOffsetHours),
    weekStartsOn: WEEK_STARTS.includes(parsed.weekStartsOn as WeekStart)
      ? (parsed.weekStartsOn as WeekStart)
      : defaults.weekStartsOn,
    maxIdleGapMinutes: num(parsed.maxIdleGapMinutes, defaults.maxIdleGapMinutes),
    suspiciousOutputTokens: num(parsed.suspiciousOutputTokens, defaults.suspiciousOutputTokens),
    suspiciousContextTokens: num(parsed.suspiciousContextTokens, defaults.suspiciousContextTokens),
  };
}

/**
 * Project merge/rename overrides.
 *
 * Claude Code keys projects by working directory, so renaming or moving a
 * folder starts a fresh project and splits that project's history in two.
 * `merge` folds one directory's usage into another's.
 *
 * The file is the user's own and gitignored - it names their projects. A
 * missing file is the normal state for a fresh clone and means "no overrides";
 * `config/projects.example.json` is the template to copy from.
 */
export function loadProjectConfig(file = 'projects.json'): {
  merge: Record<string, string>;
  displayNames: Record<string, string>;
} {
  const parsed = readJson<{
    merge?: Record<string, unknown>;
    displayNames?: Record<string, unknown>;
  }>(path.join(CONFIG_DIR, file));

  const clean = (source: Record<string, unknown> | undefined) => {
    const out: Record<string, string> = {};
    if (!source) return out;
    for (const [key, value] of Object.entries(source)) {
      // `_comment` keys are documentation, not data.
      if (key.startsWith('_')) continue;
      if (typeof value === 'string' && value) out[key] = value;
    }
    return out;
  };

  return { merge: clean(parsed?.merge), displayNames: clean(parsed?.displayNames) };
}

/**
 * Follows a merge chain (A -> B -> C resolves to C) with a cycle guard, so a
 * mistake in the config degrades to "no merge" rather than hanging the parser.
 */
export function resolveProjectId(
  id: string,
  merge: Record<string, string>,
  warnings: string[],
): string {
  const seen = new Set<string>([id]);
  let current = id;
  while (merge[current]) {
    const next = merge[current];
    if (seen.has(next)) {
      warnings.push(`Ignored a cycle in config/projects.json merge rules involving "${next}".`);
      return id;
    }
    seen.add(next);
    current = next;
  }
  return current;
}

/**
 * The rate for a model string, following one hop of `aliases` when the string
 * is a job title rather than a model name (see PricingConfig.aliases).
 */
export function getRate(pricing: PricingConfig, model: string): ModelRate | null {
  const direct = pricing.models[model];
  if (direct) return direct;
  const aliased = pricing.aliases?.[model];
  if (!aliased) return null;
  return pricing.models[aliased] ?? null;
}

/**
 * USD for one set of token buckets. Returns 0 when the model has no rate card
 * entry - callers check `unpriced` rather than treating that as free.
 *
 * `reasoning` is deliberately absent: those tokens are already inside `output`
 * and adding them here would bill them twice.
 */
export function costOf(tokens: TokenCounts, rate: ModelRate | null): number {
  if (!rate) return 0;
  return (
    (tokens.input * rate.input +
      tokens.cacheWrite5m * rate.cacheWrite5m +
      tokens.cacheWrite1h * rate.cacheWrite1h +
      tokens.cacheRead * rate.cacheRead +
      tokens.output * rate.output) /
    1_000_000
  );
}
