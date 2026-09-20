/**
 * The arithmetic both parsers do, in one copy.
 *
 * `parser.ts` and `codex-parser.ts` share nothing about how they READ a
 * transcript — the two formats have nothing in common, and the traps
 * documented in CLAUDE.md are entirely different. What they do share is what
 * happens after a line has been understood: tokens go into a cell, cells go
 * into a per-model bucket, buckets come out as a sorted daily array. That was
 * written twice, and a fix to one copy would have missed the other.
 *
 * **The one real difference is reasoning tokens**, so it is the one thing this
 * module is parameterised on. Codex reports `reasoning` as a subset of
 * `output`; Claude Code does not report it at all. A Claude Code cell
 * therefore has no `reasoning` key, and that is meaningful rather than
 * incidental: `undefined` says "this agent does not report it", where a `0`
 * would claim it was measured and found to be none. Hence `usageMath()` takes
 * a flag rather than always tracking the field.
 */
import type { DailyEntry, TokenCounts, UsageCell } from './types';

/** The bucket for usage whose line carried no usable timestamp. */
export const UNKNOWN_DATE = '(unknown date)';

/** Nested accumulator: model -> cell, plus a combined cell. */
export interface Bucket {
  perModel: Map<string, UsageCell>;
  combined: UsageCell;
}

/**
 * The hour of a UTC instant in the configured local offset, or null when the
 * shifted instant falls outside the range a `Date` can represent.
 *
 * Same backstop as `localDate`: callers already drop implausible timestamps,
 * and this is what keeps one from ever throwing out of a parse.
 */
export function localHour(timestampMs: number, offsetHours: number): number | null {
  const shifted = timestampMs + offsetHours * 3_600_000;
  if (!Number.isFinite(shifted) || Math.abs(shifted) > 8.64e15) return null;
  return new Date(shifted).getUTCHours();
}

export interface UsageMath {
  emptyCell: () => UsageCell;
  addTokens: (cell: UsageCell, tokens: TokenCounts, cost: number) => void;
  newBucket: () => Bucket;
  bucketCell: (bucket: Bucket, model: string) => UsageCell;
  bucketToPlain: (bucket: Bucket) => { perModel: Record<string, UsageCell>; combined: UsageCell };
  dailyToPlain: (map: Map<string, Bucket>) => DailyEntry[];
}

/**
 * @param tracksReasoning true for an agent that reports reasoning tokens.
 *   It seeds `reasoning: 0` on every cell, so the field is present from the
 *   start rather than appearing on the first record that happens to carry one.
 */
export function usageMath({ tracksReasoning = false } = {}): UsageMath {
  function emptyCell(): UsageCell {
    const cell: UsageCell = {
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
    if (tracksReasoning) cell.reasoning = 0;
    return cell;
  }

  function addTokens(cell: UsageCell, tokens: TokenCounts, cost: number): void {
    cell.input += tokens.input;
    cell.output += tokens.output;
    cell.cacheRead += tokens.cacheRead;
    cell.cacheWrite5m += tokens.cacheWrite5m;
    cell.cacheWrite1h += tokens.cacheWrite1h;
    if (tracksReasoning) {
      // Reasoning is already inside `output`, so it is tracked but never
      // summed into totalTokens. See Codex Trap 3.
      cell.reasoning = (cell.reasoning ?? 0) + (tokens.reasoning ?? 0);
    }
    cell.messages += 1;
    cell.totalTokens +=
      tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite5m + tokens.cacheWrite1h;
    cell.costUsd += cost;
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

  return { emptyCell, addTokens, newBucket, bucketCell, bucketToPlain, dailyToPlain };
}
