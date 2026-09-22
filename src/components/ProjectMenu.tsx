'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

/**
 * The "⋯" button on a project card and the one-item menu it opens: hide the
 * project from the list, or show it again.
 *
 * A menu rather than a bare button because a one-click hide on a card that is
 * itself a link is one mis-click from happening by accident - and a menu is
 * where more per-project actions would go, without adding a second icon to
 * every card.
 *
 * It sits OUTSIDE the card's link, as a sibling: a button inside an `<a>` is
 * invalid markup, and a click on it would also follow the link. See
 * `.project-card` in globals.css for how the two share one card.
 *
 * The menu opens below the button, over the next card. Cards carry a
 * transform (the `rise` entry animation), so each is its own stacking context
 * and the NEXT card would paint over an open menu; the card holding an open
 * menu is lifted with `:has()` in the CSS rather than with React state.
 */
export function ProjectMenu({
  projectName,
  hidden,
  onToggle,
}: {
  projectName: string;
  hidden: boolean;
  /** Resolves once the change is saved; rejects with a readable message. */
  onToggle: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  // Focus the item as the menu opens, and close it on a press anywhere else.
  // Nothing is set while the effect runs - only from the listener, later.
  useEffect(() => {
    if (!open) return;
    itemRef.current?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setFailure(null);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  function close(returnFocus: boolean) {
    setOpen(false);
    setFailure(null);
    if (returnFocus) buttonRef.current?.focus();
  }

  async function choose() {
    setPending(true);
    setFailure(null);
    try {
      await onToggle();
      // When a hide takes this card out of the list, it is gone by now or
      // about to be, and the page moves focus on (see the projects page).
      // When the card stays - showing it again, or hiding with every project
      // listed - focus goes back where it came from.
      close(true);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(false);
    }
  }

  function onMenuKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      // One item, so every arrow lands on it - but they must not scroll the page.
      event.preventDefault();
      itemRef.current?.focus();
    }
  }

  return (
    <div
      ref={wrapRef}
      className="card-menu-wrap"
      // Tabbing out of the menu closes it, as leaving any menu should.
      onBlur={(event) => {
        if (open && !wrapRef.current?.contains(event.relatedTarget as Node | null)) {
          close(false);
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className="card-menu-button"
        aria-label={`Options for ${projectName}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close(false) : setOpen(true))}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <circle cx="3" cy="8" r="1.5" fill="currentColor" />
          <circle cx="8" cy="8" r="1.5" fill="currentColor" />
          <circle cx="13" cy="8" r="1.5" fill="currentColor" />
        </svg>
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={`Options for ${projectName}`}
          className="card-menu"
          onKeyDown={onMenuKeyDown}
        >
          <button
            ref={itemRef}
            type="button"
            role="menuitem"
            className="card-menu-item"
            // Not `disabled`: a focused button that becomes disabled drops
            // focus, which reads as leaving the menu and closes it mid-save.
            aria-disabled={pending || undefined}
            onClick={() => {
              if (!pending) void choose();
            }}
          >
            <span>{hidden ? 'Show in project list' : 'Hide from project list'}</span>
            <span className="card-menu-hint">
              {hidden
                ? 'Lists it again. Nothing else changes.'
                : 'Its spend still counts in every total.'}
            </span>
          </button>
          {failure && (
            <p className="card-menu-error" role="alert">
              Could not save: {failure}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
