'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  THEME_CHOICES,
  THEME_STORAGE_KEY,
  isThemeChoice,
  type Theme,
  type ThemeChoice,
} from '@/lib/theme';

declare global {
  interface Window {
    __aiuTheme?: () => void;
  }
}

/*
 * The applied theme lives in one place, `data-theme` on <html>, where
 * THEME_INIT_SCRIPT puts it before first paint. React subscribes to the
 * attribute rather than keeping a copy, exactly as it does for the rail.
 */
function subscribeTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  return () => observer.disconnect();
}

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

// The server cannot see the attribute, so it renders the default.
function serverTheme(): Theme {
  return 'dark';
}

/**
 * The theme on screen right now. For the few colours that cannot be CSS
 * variables - a model's stored shade - see `useModelColor`.
 */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribeTheme, currentTheme, serverTheme);
}

function readChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeChoice(stored) ? stored : 'dark';
  } catch {
    return 'dark';
  }
}

/**
 * Applies a new choice through the init script's own function, so there is one
 * implementation. The fallback only runs if that script never did - a CSP
 * change, say - and cannot follow the system, so 'system' lands on dark.
 */
function applyTheme(choice: ThemeChoice): void {
  if (window.__aiuTheme) {
    window.__aiuTheme();
    return;
  }
  const root = document.documentElement;
  const next = choice === 'light' ? 'light' : 'dark';
  root.dataset.theme = next;
  root.style.colorScheme = next;
}

const SunIcon = () => (
  <svg
    className="theme-icon theme-icon-sun"
    width="19"
    height="19"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    aria-hidden
  >
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
  </svg>
);

const MoonIcon = () => (
  <svg
    className="theme-icon theme-icon-moon"
    width="19"
    height="19"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M20.5 13.2A8.5 8.5 0 1 1 10.8 3.5a6.6 6.6 0 0 0 9.7 9.7Z" />
  </svg>
);

/**
 * The theme menu at the foot of the rail: Dark, Light, or follow the system.
 *
 * In the rail rather than the top bar because it is a setting, and the foot of
 * the rail is where a setting reads as one - the top bar is "which page", and
 * its narrow-window layout is measured to the half pixel (see CLAUDE.md).
 *
 * The menu is `position: fixed` beside the rail, because the rail clips its
 * own overflow (`overflow: hidden`, so labels vanish cleanly as it collapses)
 * and a popover inside it would be cut off at 70px.
 *
 * Both icons are rendered and CSS shows the right one, so the button is right
 * on first paint; only the ticked item waits for the effect below.
 */
export function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>('dark');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const theme = useTheme();

  // Closes on a press elsewhere or Escape, as any menu does.
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  function pick(value: ThemeChoice) {
    setChoice(value);
    setOpen(false);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, value);
    } catch {
      // Private mode: applies to this page only.
    }
    applyTheme(value);
    buttonRef.current?.focus();
  }

  const label = theme === 'light' ? 'Light theme' : 'Dark theme';

  return (
    <div className="theme-menu" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className="rail-item rail-theme"
        onClick={() => {
          // Read as the menu opens, not while rendering: the server cannot
          // know it, and reading storage in render would hand the server one
          // answer and the client another.
          if (!open) setChoice(readChoice());
          setOpen(!open);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Theme: ${label.split(' ')[0]}`}
      >
        <span className="rail-icon" aria-hidden>
          <SunIcon />
          <MoonIcon />
        </span>
        <span className="rail-label">Theme</span>
      </button>
      {open && (
        <div className="theme-popover" role="menu" aria-label="Theme">
          {THEME_CHOICES.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={choice === option.value}
              className="theme-option"
              onClick={() => pick(option.value)}
            >
              <span className="theme-check" aria-hidden>
                {choice === option.value ? '✓' : ''}
              </span>
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
