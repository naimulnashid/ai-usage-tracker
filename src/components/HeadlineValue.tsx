'use client';

import type { CSSProperties } from 'react';
import { formatUsd } from '@/lib/format';
import { CountUp } from './CountUp';

/**
 * The big money figure at the top of the overview and of a project page.
 *
 * It carries its own length as `--chars`, which is what lets the CSS size it
 * to fit: `.headline-value` is as large as it always was UNLESS that many
 * characters would not fit beside the two side columns, and only then shrinks
 * - see the rule in globals.css. A fixed size overflowed the page as soon as
 * a total reached five figures.
 *
 * The length is the FINAL value's. The count-up only ever passes through
 * shorter strings on the way up; on the rare refresh where a total falls
 * across a digit boundary, it is one character long for under a second.
 */
export function HeadlineValue({ value, replayKey }: { value: number; replayKey?: number }) {
  const style = { '--chars': formatUsd(value).length } as CSSProperties;
  return (
    <div className="headline-value num" style={style}>
      <CountUp value={value} format={(n) => formatUsd(n)} replayKey={replayKey} />
    </div>
  );
}
