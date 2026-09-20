'use client';

import { useId } from 'react';

/**
 * The little "i" that explains a figure.
 *
 * It is a real `<button>`, because the explanation has to be reachable without
 * a mouse: most of these used to be a `<span>` with an `aria-label`, which is
 * neither focusable nor reliably announced.
 *
 * The text exists twice on purpose:
 *
 * - **Visibly**, as `::after` content from `data-tip`. That bubble is toggled
 *   with `display`, which is load-bearing inside `.table-scroll` - see the
 *   phantom-scrollbar note in globals.css. Keeping it in CSS keeps that
 *   property.
 * - **For assistive tech**, as an `.sr-only` span referenced by
 *   `aria-describedby`, so a screen reader announces the explanation when the
 *   button takes focus. It is 1px and clipped, so it cannot contribute scroll
 *   width the way a laid-out bubble would.
 */
export function InfoTip({ label, text }: { label: string; text: string }) {
  const id = useId();
  return (
    <span className="info-tip-wrap">
      <button
        type="button"
        className="info-tip"
        data-tip={text}
        aria-label={label}
        aria-describedby={id}
      >
        {/* The glyph is decoration; the button is named by aria-label. */}
        <span aria-hidden="true">i</span>
      </button>
      <span id={id} className="sr-only">
        {text}
      </span>
    </span>
  );
}
