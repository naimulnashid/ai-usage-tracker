/** Display helpers. All numeric output is rendered with `.num` (tabular figures). */

import { modelDisplayName } from './model-colors';

export function formatUsd(value: number, opts: { compact?: boolean } = {}): string {
  if (opts.compact && Math.abs(value) >= 1000) {
    return `$${(value / 1000).toFixed(1)}k`;
  }
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatTokens(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString('en-US');
}

export function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  const s = Math.floor(seconds % 60);
  return m > 0 ? `${m}m` : `${s}s`;
}

export function formatCount(value: number): string {
  return value.toLocaleString('en-US');
}

/** "Aug 19" - compact axis/table label for a YYYY-MM-DD key. */
export function formatDateShort(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [, month, day] = iso.split('-');
  const names = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${names[Number(month) - 1]} ${Number(day)}`;
}

/** "Tue, Aug 19 2026" - full label for tooltips. */
export function formatDateLong(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const date = new Date(`${iso}T00:00:00Z`);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatClockTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** 15 -> "3 PM". Hours are already in the configured local offset. */
export function formatHour(hour: number | null): string {
  if (hour === null || Number.isNaN(hour)) return '—';
  const suffix = hour < 12 ? 'AM' : 'PM';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display} ${suffix}`;
}

/**
 * Model label for display only — the raw string is what the rate card and the
 * transcripts use, and is what the unpriced notice shows.
 *
 * Claude models just lose the redundant "claude-" prefix. Codex model strings
 * are not readable that way, so they come from an explicit table.
 */
export function displayModel(model: string): string {
  if (model === '<synthetic>') return 'synthetic';
  return modelDisplayName(model) ?? model.replace(/^claude-/, '');
}
