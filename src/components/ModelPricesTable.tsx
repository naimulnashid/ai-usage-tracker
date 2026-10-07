'use client';

import { Fragment, useState } from 'react';
import type { LongContextRule, ModelRate, ModelRateInfo, UsageCell } from '@/lib/types';
import { displayModel } from '@/lib/format';
import { ACCENT_PALETTES, byPriceDesc, modelColor, themedColor } from '@/lib/model-colors';
import { useProvider } from './ProviderScope';
import { useModelColor, useUsage } from './UsageProvider';
import { useTheme } from './ThemeToggle';

/**
 * What each model is priced at, and the one place a price or a colour is set.
 *
 * A model the rate card has never heard of - a new release, which turns up in
 * the transcripts before anyone edits `pricing.json` - is listed here as
 * UNPRICED with a "Set price" button. The rate saved goes into the app's own
 * `data/` file rather than the committed card (see model-settings.ts), wins
 * over the card, and reaches every figure on the page through a fresh parse.
 * The same editor picks a model's colour from the agent's own shades.
 *
 * Rates are shown as the rate card writes them: USD per million tokens.
 */
export function ModelPricesTable({
  perModel,
  rates,
}: {
  perModel: Record<string, UsageCell>;
  rates: Record<string, ModelRateInfo> | undefined;
}) {
  const provider = useProvider();
  const colorOf = useModelColor();
  const [editing, setEditing] = useState<string | null>(null);

  const rows = Object.keys(perModel)
    .map((model) => ({
      model,
      info: rates?.[model] ?? { rate: null, source: 'none' as const, onCard: false },
    }))
    // Dearest first, like every legend; equal prices fall back to the ramp.
    .sort(
      (a, b) =>
        (b.info.rate?.output ?? -1) - (a.info.rate?.output ?? -1) || byPriceDesc(a.model, b.model),
    );

  if (!rows.length) {
    return (
      <div style={{ color: 'var(--text-faint)', padding: '40px 0', textAlign: 'center' }}>
        No models found.
      </div>
    );
  }

  const columns = provider.hasCacheWrites ? 8 : 6;
  const price = (value: number | undefined) =>
    value === undefined ? '—' : `$${formatRate(value)}`;

  // Models sharing a long-context rule are named in one sentence under it.
  const tiers = new Map<string, { rule: LongContextRule; models: string[] }>();
  for (const { model, info } of rows) {
    const rule = info.rate?.longContext;
    if (!rule) continue;
    const key = JSON.stringify(rule);
    const tier = tiers.get(key) ?? { rule, models: [] };
    tier.models.push(displayModel(model));
    tiers.set(key, tier);
  }

  return (
    <>
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Model</th>
              <th>Input</th>
              {provider.hasCacheWrites && <th>Write 5m</th>}
              {provider.hasCacheWrites && <th>Write 1h</th>}
              <th>{provider.cacheReadLabel}</th>
              <th>Output</th>
              <th>Source</th>
              <th>
                <span className="sr-only">Edit</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ model, info }) => {
              const rate = info.rate ?? undefined;
              const open = editing === model;
              return (
                <Fragment key={model}>
                  <tr>
                    <td>
                      <span className="cell-model">
                        <span
                          className="model-swatch"
                          style={{ background: colorOf(model) }}
                          aria-hidden
                        />
                        {displayModel(model)}
                        {info.source === 'none' && <span className="unpriced-pill">UNPRICED</span>}
                      </span>
                    </td>
                    <td className="num">{price(rate?.input)}</td>
                    {provider.hasCacheWrites && (
                      <td className="num">{price(rate?.cacheWrite5m)}</td>
                    )}
                    {provider.hasCacheWrites && (
                      <td className="num">{price(rate?.cacheWrite1h)}</td>
                    )}
                    <td className="num">{price(rate?.cacheRead)}</td>
                    <td className="num">{price(rate?.output)}</td>
                    <td className="rate-source">{sourceLabel(info)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-small"
                        aria-expanded={open}
                        aria-controls={`rate-editor-${slug(model)}`}
                        onClick={() => setEditing(open ? null : model)}
                      >
                        {open ? 'Close' : info.source === 'none' ? 'Set price' : 'Edit'}
                        <span className="sr-only"> {displayModel(model)}</span>
                      </button>
                    </td>
                  </tr>
                  {open && (
                    <tr className="rate-editor-row">
                      <td colSpan={columns} id={`rate-editor-${slug(model)}`}>
                        <RateEditor model={model} info={info} onDone={() => setEditing(null)} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {[...tiers.values()].map(({ rule, models }) => (
        <p key={models.join()} className="rate-tier-note">
          {longContextSentence(rule, models)}
        </p>
      ))}
    </>
  );
}

function sourceLabel(info: ModelRateInfo): string {
  switch (info.source) {
    case 'card':
      return 'Rate card';
    case 'custom':
      return 'Yours';
    case 'alias':
      return `As ${displayModel(info.aliasOf ?? '')}`;
    default:
      return 'None';
  }
}

/**
 * The long-context tier, said under the rates, since the rates alone no longer
 * give the cost: a long request is billed at a multiple of them. A note rather
 * than a column, which at 997px pushed the Edit buttons out of the panel.
 */
function longContextSentence(rule: LongContextRule, models: string[]): string {
  const above =
    rule.aboveInputTokens >= 1000
      ? `${formatRate(rule.aboveInputTokens / 1000)}K`
      : String(rule.aboveInputTokens);
  const names =
    models.length > 1 ? `${models.slice(0, -1).join(', ')} and ${models.at(-1)}` : models[0];
  return (
    `${names}: a request whose prompt is over ${above} tokens is billed at ` +
    `${formatRate(rule.inputMultiplier)}× the input and cache rates and ` +
    `${formatRate(rule.outputMultiplier)}× output.`
  );
}

/** Up to four decimals, no trailing zeros: 0.175, 3.75, 25. */
function formatRate(value: number): string {
  return String(Number(value.toFixed(4)));
}

function slug(model: string): string {
  return model.replace(/[^A-Za-z0-9]+/g, '-');
}

/** The rates the editor sets. The long-context tier is the card's alone. */
type Field = Exclude<keyof ModelRate, 'longContext'>;

const FIELD_LABELS: Record<Field, string> = {
  input: 'Input',
  cacheWrite5m: 'Cache write 5m',
  cacheWrite1h: 'Cache write 1h',
  cacheRead: 'Cache read',
  output: 'Output',
};

/**
 * The editor under a row: five rates (three for an agent without cache
 * writes) and the colour. The colour saves as soon as it is picked, since it
 * changes nothing but the view; a price saves on Save, since it re-parses.
 */
function RateEditor({
  model,
  info,
  onDone,
}: {
  model: string;
  info: ModelRateInfo;
  onDone: () => void;
}) {
  const provider = useProvider();
  const { saveModelSetting, modelColors } = useUsage();
  const theme = useTheme();
  const fields: Field[] = provider.hasCacheWrites
    ? ['input', 'cacheWrite5m', 'cacheWrite1h', 'cacheRead', 'output']
    : ['input', 'cacheRead', 'output'];

  const [values, setValues] = useState<Record<Field, string>>(() => {
    const rate = info.rate;
    return {
      input: rate ? formatRate(rate.input) : '',
      cacheWrite5m: rate ? formatRate(rate.cacheWrite5m) : '',
      cacheWrite1h: rate ? formatRate(rate.cacheWrite1h) : '',
      cacheRead: rate ? formatRate(rate.cacheRead) : '',
      output: rate ? formatRate(rate.output) : '',
    };
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const chosen = modelColors[model] ?? null;
  const fallback = modelColor(model);
  const palette = ACCENT_PALETTES[provider.id];
  const id = slug(model);

  const run = async (action: () => Promise<void>, after?: () => void) => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      after?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const parsed = (): ModelRate | null => {
    // A rate the editor does not show - cache writes, for an agent that hides
    // that column - keeps its current value rather than being saved as 0.
    const out = {
      input: 0,
      cacheWrite5m: info.rate?.cacheWrite5m ?? 0,
      cacheWrite1h: info.rate?.cacheWrite1h ?? 0,
      cacheRead: 0,
      output: 0,
    };
    for (const field of fields) {
      const text = values[field].trim();
      const n = Number(text);
      if (text === '' || !Number.isFinite(n) || n < 0) return null;
      out[field] = n;
    }
    return out;
  };

  /** The usual multipliers off base input, for a card that follows them. */
  const fillFromInput = () => {
    const input = Number(values.input);
    if (!values.input.trim() || !Number.isFinite(input) || input < 0) {
      setMessage('Enter an input rate first.');
      return;
    }
    setMessage(null);
    setValues((current) => ({
      ...current,
      cacheWrite5m: formatRate(input * 1.25),
      cacheWrite1h: formatRate(input * 2),
      cacheRead: formatRate(input * 0.1),
    }));
  };

  const save = () => {
    const rate = parsed();
    if (!rate) {
      setMessage('Every rate needs a number, 0 or more.');
      return;
    }
    void run(() => saveModelSetting(model, { rate }), onDone);
  };

  return (
    <div className="rate-editor">
      <div className="rate-editor-group">
        <div className="rate-editor-heading">
          Price for <code>{model}</code>, USD per million tokens
        </div>
        <div className="rate-fields">
          {fields.map((field) => (
            <label key={field} className="rate-field">
              <span>{field === 'cacheRead' ? provider.cacheReadLabel : FIELD_LABELS[field]}</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={values[field]}
                disabled={busy}
                onChange={(event) =>
                  setValues((current) => ({ ...current, [field]: event.target.value }))
                }
                onKeyDown={(event) => {
                  if (event.key === 'Enter') save();
                }}
              />
            </label>
          ))}
        </div>
        <div className="rate-actions">
          <button
            type="button"
            className="btn btn-primary btn-small"
            disabled={busy}
            onClick={save}
          >
            Save price
          </button>
          {provider.hasCacheWrites && (
            <button type="button" className="btn btn-small" disabled={busy} onClick={fillFromInput}>
              Cache rates from input
            </button>
          )}
          {info.source === 'custom' && (
            <button
              type="button"
              className="btn btn-small"
              disabled={busy}
              onClick={() => void run(() => saveModelSetting(model, { rate: null }), onDone)}
            >
              {info.onCard ? 'Reset to rate card' : 'Remove price'}
            </button>
          )}
          <button type="button" className="btn btn-small" disabled={busy} onClick={onDone}>
            Cancel
          </button>
        </div>
      </div>

      <div className="rate-editor-group">
        <div className="rate-editor-heading" id={`palette-label-${id}`}>
          Colour
        </div>
        <div className="palette" role="group" aria-labelledby={`palette-label-${id}`}>
          {palette.map((shade, index) => {
            const selected = (chosen ?? fallback).toUpperCase() === shade.toUpperCase();
            return (
              <button
                key={shade}
                type="button"
                className="palette-swatch"
                // Stored as the dark shade; drawn as the theme's twin of it.
                style={{ background: themedColor(shade, theme) }}
                aria-pressed={selected}
                aria-label={`Shade ${index + 1} of ${palette.length}${index === 0 ? ', deepest' : index === palette.length - 1 ? ', palest' : ''}`}
                disabled={busy}
                onClick={() => void run(() => saveModelSetting(model, { color: shade }))}
              />
            );
          })}
          {chosen && (
            <button
              type="button"
              className="btn btn-small"
              disabled={busy}
              onClick={() => void run(() => saveModelSetting(model, { color: null }))}
            >
              Default colour
            </button>
          )}
        </div>
        <p className="rate-editor-note">
          Deeper shades usually mean dearer models - the charts stack the dearest at the bottom.
        </p>
      </div>

      {message && (
        <p className="rate-editor-error" role="alert">
          {message}
        </p>
      )}
    </div>
  );
}
