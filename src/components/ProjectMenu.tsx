'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { parseHexColor, type ProjectColorSource } from '@/lib/project-colors';

/**
 * The "⋯" button on a project card and the menu it opens: change the colour
 * the project is drawn in, or hide it from the list (or show it again).
 *
 * A menu rather than bare buttons because a one-click hide on a card that is
 * itself a link is one mis-click from happening by accident - and a menu is
 * where per-project actions go without adding icons to every card.
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
  color,
  colorSource,
  onSaveColor,
}: {
  projectName: string;
  hidden: boolean;
  /** Resolves once the change is saved; rejects with a readable message. */
  onToggle: () => Promise<void>;
  /** The colour the project is drawn in now. */
  color: string;
  colorSource: ProjectColorSource;
  /** `#RRGGBB` to choose one, `null` to go back to the logo's. Rejects with a readable message. */
  onSaveColor: (color: string | null) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'menu' | 'color'>('menu');
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [draft, setDraft] = useState(color);
  const [hexText, setHexText] = useState(color);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const hexRef = useRef<HTMLInputElement>(null);
  const menuId = useId();

  // Focus the first item as the menu opens (or the hex field as the editor
  // does), and close it on a press anywhere else. Nothing is set while the
  // effect runs - only from the listener, later.
  useEffect(() => {
    if (!open) return;
    if (view === 'menu') itemRefs.current[0]?.focus();
    else hexRef.current?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setFailure(null);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, view]);

  function close(returnFocus: boolean) {
    setOpen(false);
    setFailure(null);
    if (returnFocus) buttonRef.current?.focus();
  }

  function openMenu() {
    setView('menu');
    setFailure(null);
    setOpen(true);
  }

  function openColor() {
    setDraft(color);
    setHexText(color);
    setFailure(null);
    setView('color');
  }

  async function run(action: () => Promise<void>) {
    setPending(true);
    setFailure(null);
    try {
      await action();
      // When a hide takes this card out of the list, it is gone by now or
      // about to be, and the page moves focus on (see the projects page).
      // Otherwise focus goes back where it came from.
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
      return;
    }
    if (view !== 'menu') return;
    const items = itemRefs.current.filter((item): item is HTMLButtonElement => item !== null);
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    let next = -1;
    if (event.key === 'ArrowDown') next = (at + 1) % items.length;
    else if (event.key === 'ArrowUp') next = (at - 1 + items.length) % items.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    if (next >= 0) {
      // Arrows move between items; they must not scroll the page.
      event.preventDefault();
      items[next]?.focus();
    }
  }

  const parsedHex = parseHexColor(hexText);
  const sourceNote =
    colorSource === 'custom'
      ? 'Chosen by you.'
      : colorSource === 'logo'
        ? 'Taken from its logo.'
        : 'Picked automatically - it has no logo.';

  return (
    <div
      ref={wrapRef}
      className="card-menu-wrap"
      // Tabbing out of the menu closes it, as leaving any menu should. Not the
      // colour editor: the browser's colour picker takes focus with it, and
      // closing the editor under the picker would lose the choice.
      onBlur={(event) => {
        if (
          open &&
          view === 'menu' &&
          !wrapRef.current?.contains(event.relatedTarget as Node | null)
        ) {
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
        onClick={() => (open ? close(false) : openMenu())}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <circle cx="3" cy="8" r="1.5" fill="currentColor" />
          <circle cx="8" cy="8" r="1.5" fill="currentColor" />
          <circle cx="13" cy="8" r="1.5" fill="currentColor" />
        </svg>
      </button>

      {open && view === 'menu' && (
        <div
          id={menuId}
          role="menu"
          aria-label={`Options for ${projectName}`}
          className="card-menu"
          onKeyDown={onMenuKeyDown}
        >
          <button
            ref={(element) => {
              itemRefs.current[0] = element;
            }}
            type="button"
            role="menuitem"
            className="card-menu-item"
            onClick={openColor}
          >
            <span className="card-menu-item-title">
              <span className="model-swatch" style={{ background: color }} aria-hidden />
              Change colour…
            </span>
            <span className="card-menu-hint">How it is drawn in the charts. {sourceNote}</span>
          </button>
          <button
            ref={(element) => {
              itemRefs.current[1] = element;
            }}
            type="button"
            role="menuitem"
            className="card-menu-item"
            // Not `disabled`: a focused button that becomes disabled drops
            // focus, which reads as leaving the menu and closes it mid-save.
            aria-disabled={pending || undefined}
            onClick={() => {
              if (!pending) void run(onToggle);
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

      {open && view === 'color' && (
        <div
          id={menuId}
          role="dialog"
          aria-label={`Colour for ${projectName}`}
          className="card-menu color-editor"
          onKeyDown={onMenuKeyDown}
        >
          <div className="color-editor-heading">Colour for {projectName}</div>
          <div className="color-editor-row">
            {/* The browser's own picker, for choosing by eye... */}
            <input
              type="color"
              className="color-editor-picker"
              value={(parsedHex ?? draft).toLowerCase()}
              aria-label="Pick a colour"
              onChange={(event) => {
                const value = event.target.value.toUpperCase();
                setDraft(value);
                setHexText(value);
              }}
            />
            {/* ...and a text field, for entering one exactly. */}
            <input
              ref={hexRef}
              type="text"
              className="color-editor-hex num"
              value={hexText}
              spellCheck={false}
              autoComplete="off"
              maxLength={9}
              aria-label="Colour as a hex code"
              aria-invalid={parsedHex === null}
              onChange={(event) => {
                setHexText(event.target.value);
                const parsed = parseHexColor(event.target.value);
                if (parsed) setDraft(parsed);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && parsedHex && !pending) {
                  event.preventDefault();
                  void run(() => onSaveColor(parsedHex));
                }
              }}
            />
          </div>
          <p className="card-menu-hint color-editor-note">
            {parsedHex === null ? 'Enter a colour like #3B82F6.' : sourceNote}
          </p>
          <div className="color-editor-actions">
            <button
              type="button"
              className="btn btn-primary btn-small"
              disabled={pending || parsedHex === null}
              onClick={() => parsedHex && void run(() => onSaveColor(parsedHex))}
            >
              Save
            </button>
            {colorSource === 'custom' && (
              <button
                type="button"
                className="btn btn-small"
                disabled={pending}
                onClick={() => void run(() => onSaveColor(null))}
              >
                Reset
              </button>
            )}
            <button
              type="button"
              className="btn btn-small"
              disabled={pending}
              onClick={() => close(true)}
            >
              Cancel
            </button>
          </div>
          {colorSource === 'custom' && (
            <p className="card-menu-hint color-editor-note">
              Reset goes back to the logo&apos;s colour, or an automatic one.
            </p>
          )}
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
