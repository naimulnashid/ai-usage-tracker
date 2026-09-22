'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

function subscribeReducedMotion(onChange: () => void): () => void {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function prefersReducedMotion(): boolean {
  return window.matchMedia(REDUCED_MOTION).matches;
}

function prefersReducedMotionOnServer(): boolean {
  return false;
}

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
export function CountUp({ value, format, durationMs = 850, className, replayKey }: CountUpProps) {
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    prefersReducedMotion,
    prefersReducedMotionOnServer,
  );
  const animate = !reducedMotion && durationMs > 0;

  /*
   * The number on screen while animating. It is only ever set from an
   * animation frame: when there is nothing to animate, the value is rendered
   * directly instead of being copied into state by the effect.
   *
   * It starts at the final value rather than 0 so that a tab which never runs
   * an animation frame - a hidden one - still shows the real number.
   */
  const [display, setDisplay] = useState(value);
  // The number last drawn, which the next animation starts from. 0 at first,
  // so the first render counts up.
  const drawnRef = useRef(0);

  useEffect(() => {
    if (!animate) return;

    const from = drawnRef.current;
    const to = value;
    if (from === to) return;

    const start = performance.now();
    // easeOutExpo - fast out of the gate, settles gently on the final value.
    const ease = (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

    let frame = requestAnimationFrame(function tick(now: number) {
      const progress = Math.min(1, (now - start) / durationMs);
      // Land on `to` exactly, not on `from + (to - from)`, which floating
      // point can miss by an ulp - and then the next run would animate again.
      const n = progress < 1 ? from + (to - from) * ease(progress) : to;
      drawnRef.current = n;
      setDisplay(n);
      if (progress < 1) frame = requestAnimationFrame(tick);
    });

    return () => cancelAnimationFrame(frame);
  }, [value, durationMs, animate, replayKey]);

  return <span className={`num ${className ?? ''}`}>{format(animate ? display : value)}</span>;
}
