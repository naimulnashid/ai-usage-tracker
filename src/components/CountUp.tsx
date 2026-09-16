'use client';

import { useEffect, useRef, useState } from 'react';

interface CountUpProps {
  value: number;
  /** Formatter applied to every intermediate frame, not just the final value. */
  format: (n: number) => string;
  durationMs?: number;
  className?: string;
  /** Change this to replay the animation (e.g. after a refresh). */
  replayKey?: number | string;
}

/**
 * Counts a number up on mount and after each refresh.
 *
 * Values render with tabular figures (`.num`), so the digits do not shift
 * width while the animation runs.
 */
export function CountUp({
  value,
  format,
  durationMs = 850,
  className,
  replayKey,
}: CountUpProps) {
  const [display, setDisplay] = useState(value);
  const frameRef = useRef<number | null>(null);
  const fromRef = useRef(0);

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced || durationMs <= 0) {
      setDisplay(value);
      return;
    }

    const from = fromRef.current;
    const to = value;
    if (from === to) {
      setDisplay(to);
      return;
    }

    const start = performance.now();
    // easeOutExpo - fast out of the gate, settles gently on the final value.
    const ease = (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      setDisplay(from + (to - from) * ease(progress));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      fromRef.current = value;
    };
  }, [value, durationMs, replayKey]);

  return <span className={`num ${className ?? ''}`}>{format(display)}</span>;
}
