import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from '../src/lib/theme';

/**
 * Runs the before-paint script against a stand-in <html>, storage and media
 * query, and returns the theme it applied.
 */
function themeAfterInit(stored: string | null | Error, systemLight = false): string | null {
  const attributes: Record<string, string> = {};
  const document = {
    documentElement: {
      style: {} as Record<string, string>,
      setAttribute(name: string, value: string) {
        attributes[name] = value;
      },
    },
  };
  const localStorage = {
    getItem(key: string) {
      if (stored instanceof Error) throw stored;
      return key === THEME_STORAGE_KEY ? stored : null;
    },
  };
  const window = {
    matchMedia: () => ({ matches: systemLight, addEventListener() {} }),
    addEventListener() {},
  } as Record<string, unknown>;
  new Function('document', 'localStorage', 'window', THEME_INIT_SCRIPT)(
    document,
    localStorage,
    window,
  );
  assert.equal(typeof window.__aiuTheme, 'function', 'the toggle reuses the same function');
  return attributes['data-theme'] ?? null;
}

describe('the theme before first paint', () => {
  it('is dark for a browser that has never chosen', () => {
    assert.equal(themeAfterInit(null), 'dark');
  });

  it('applies a stored light choice', () => {
    assert.equal(themeAfterInit('light'), 'light');
  });

  it('follows the system when asked to', () => {
    assert.equal(themeAfterInit('system', true), 'light');
    assert.equal(themeAfterInit('system', false), 'dark');
  });

  it('falls back to dark when storage is blocked or holds junk', () => {
    assert.equal(themeAfterInit(new Error('SecurityError')), 'dark');
    assert.equal(themeAfterInit('purple'), 'dark');
  });
});
