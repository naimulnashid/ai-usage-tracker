/**
 * The user's own per-model settings, set from the dashboard: a custom rate for
 * a model the rate card does not price (or prices wrongly), and a colour for
 * any model. One file per agent, like the archive and the hidden projects:
 * `data/model-settings.json` and `data/codex-model-settings.json`.
 *
 * **Why the data folder and not the rate card.** `config/pricing.json` is
 * committed, hand-written and carries its documentation as `_comment` keys; an
 * app rewriting it would reformat it on the first save and put the user's
 * guesses into a file that is meant to track the vendor. This file belongs to
 * the app, and a custom rate here wins over the card until it is reset.
 *
 * **Rates change the numbers; colours do not.** A rate feeds `costOf`, so
 * saving one is followed by a fresh parse. A colour is a view preference, read
 * alongside the report like the hidden projects, so changing one costs nothing.
 *
 * Colours are limited to the agent's own `ACCENT_PALETTES`, which is what keeps
 * every band above 3:1 against the panel whatever the user picks.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { dataDir } from './data-dir';
import { isPaletteColor } from './model-colors';
import { getRate, loadPricing } from './pricing';
import type { ProviderId } from './providers';
import type { ModelRate, ModelRateInfo, PricingConfig } from './types';

const FILES: Record<ProviderId, string> = {
  claude: 'model-settings.json',
  codex: 'codex-model-settings.json',
};

export const RATE_CARD_FILES: Record<ProviderId, string> = {
  claude: 'pricing.json',
  codex: 'codex-pricing.json',
};

const VERSION = 1;

/** Real model strings are a few dozen characters. */
export const MAX_MODEL_LENGTH = 200;

/** Far above any real per-million rate; a bound on what a request can store. */
export const MAX_RATE = 10_000;

/** A bound on the file, since every save rewrites all of it. */
export const MAX_MODELS = 500;

export const RATE_KEYS = ['input', 'cacheWrite5m', 'cacheWrite1h', 'cacheRead', 'output'] as const;

export interface ModelSettings {
  /** Custom rates, USD per million tokens. */
  pricing: Record<string, ModelRate>;
  /** Chosen colours, each one of the agent's palette shades. */
  colors: Record<string, string>;
}

export function modelSettingsPath(provider: ProviderId): string {
  return path.join(dataDir(), FILES[provider] ?? FILES.claude);
}

/**
 * A model string that can be a key. `_` keys are documentation in the rate
 * cards, and the prototype names would reach `Object.prototype` on assignment.
 */
export function isValidModelName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_MODEL_LENGTH &&
    !value.startsWith('_') &&
    value !== 'constructor' &&
    value !== 'prototype' &&
    value.trim() === value
  );
}

/** A complete, finite, non-negative rate. Null when any bucket is missing or out of range. */
export function toModelRate(value: unknown): ModelRate | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const rate = {} as ModelRate;
  for (const key of RATE_KEYS) {
    const n = source[key];
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > MAX_RATE) return null;
    rate[key] = n;
  }
  return rate;
}

function sanitize(provider: ProviderId, value: unknown): ModelSettings {
  const out: ModelSettings = { pricing: {}, colors: {} };
  if (typeof value !== 'object' || value === null) return out;
  const { pricing, colors } = value as { pricing?: unknown; colors?: unknown };

  if (typeof pricing === 'object' && pricing !== null) {
    for (const [model, raw] of Object.entries(pricing).slice(0, MAX_MODELS)) {
      const rate = toModelRate(raw);
      if (isValidModelName(model) && rate) out.pricing[model] = rate;
    }
  }
  if (typeof colors === 'object' && colors !== null) {
    for (const [model, raw] of Object.entries(colors).slice(0, MAX_MODELS)) {
      if (isValidModelName(model) && typeof raw === 'string' && isPaletteColor(provider, raw)) {
        out.colors[model] = raw.toUpperCase();
      }
    }
  }
  return out;
}

/**
 * One agent's settings. Fails soft to none - missing, unreadable, corrupt - so
 * the worst case is the rate card's own prices and the default colours.
 */
export function loadModelSettings(provider: ProviderId): ModelSettings {
  const file = modelSettingsPath(provider);
  if (!existsSync(file)) return { pricing: {}, colors: {} };
  try {
    return sanitize(provider, JSON.parse(readFileSync(file, 'utf8')));
  } catch {
    return { pricing: {}, colors: {} };
  }
}

/**
 * Change one model's rate and/or colour, and return the settings as they now
 * stand. `undefined` leaves a field alone; `null` removes it (back to the rate
 * card, back to the default shade).
 *
 * Synchronous and written through a temporary file, for the same reasons as
 * `setProjectHidden`: two quick saves cannot interleave, and a crash leaves
 * the old file rather than half a new one. Throws on bad input or a failed
 * write, because the person who clicked Save should be told.
 */
export function saveModelSetting(
  provider: ProviderId,
  model: string,
  change: { rate?: ModelRate | null; color?: string | null },
): ModelSettings {
  if (!isValidModelName(model)) throw new Error('Not a model name.');
  if (change.color && !isPaletteColor(provider, change.color)) {
    throw new Error('That colour is not one of this agent’s shades.');
  }
  if (change.rate && !toModelRate(change.rate)) throw new Error('Rates must be 0 or more.');

  const current = loadModelSettings(provider);
  if (change.rate === null) delete current.pricing[model];
  else if (change.rate) current.pricing[model] = toModelRate(change.rate)!;
  if (change.color === null) delete current.colors[model];
  else if (change.color) current.colors[model] = change.color.toUpperCase();

  if (
    Object.keys(current.pricing).length > MAX_MODELS ||
    Object.keys(current.colors).length > MAX_MODELS
  ) {
    throw new Error(`No more than ${MAX_MODELS} models can have settings.`);
  }

  const file = modelSettingsPath(provider);
  mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  const body = { version: VERSION, pricing: current.pricing, colors: current.colors };
  writeFileSync(temp, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
  renameSync(temp, file);
  return current;
}

/**
 * The rate card with the user's custom rates laid over it. What both parsers
 * price with by default, so a rate saved from the dashboard reaches every
 * figure on the next parse.
 */
export function loadEffectivePricing(provider: ProviderId): PricingConfig {
  return withCustomRates(
    loadPricing(RATE_CARD_FILES[provider]),
    loadModelSettings(provider).pricing,
  );
}

export function withCustomRates(
  card: PricingConfig,
  custom: Record<string, ModelRate>,
): PricingConfig {
  const models = Object.keys(custom);
  if (!models.length) return card;
  // A custom rate replaces the per-token prices only. The long-context tier is
  // how the vendor bills a long prompt, which the editor does not set, so it
  // stays as the card has it - including a tier reached through an alias.
  const overrides: Record<string, ModelRate> = {};
  for (const model of models) {
    const longContext = getRate(card, model)?.longContext;
    overrides[model] = longContext ? { ...custom[model], longContext } : custom[model];
  }
  return {
    ...card,
    models: { ...card.models, ...overrides },
    customModels: [...new Set([...(card.customModels ?? []), ...models])].sort(),
  };
}

/**
 * Where each model's rate comes from, for the Model prices table. Takes the
 * card and the custom rates separately, because once they are laid over each
 * other a custom rate hides whether the card had an entry of its own - which
 * is what decides whether "Reset" leaves a price behind.
 */
export function describeRates(
  card: PricingConfig,
  custom: Record<string, ModelRate>,
  models: Iterable<string>,
): Record<string, ModelRateInfo> {
  const out: Record<string, ModelRateInfo> = {};
  for (const model of models) {
    const aliasOf = card.aliases?.[model];
    const cardRate = getRate(card, model);
    const onCard = cardRate !== null;
    if (custom[model]) {
      out[model] = { rate: custom[model], source: 'custom', onCard };
    } else if (card.models[model]) {
      out[model] = { rate: card.models[model], source: 'card', onCard };
    } else if (aliasOf && cardRate) {
      out[model] = { rate: cardRate, source: 'alias', aliasOf, onCard };
    } else {
      out[model] = { rate: null, source: 'none', onCard };
    }
  }
  return out;
}
