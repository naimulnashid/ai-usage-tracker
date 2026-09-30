/**
 * Light and dark themes.
 *
 * The theme is `data-theme` on <html>: `'dark'` or `'light'`. Every colour in
 * globals.css is a custom property with a value per theme, so that one
 * attribute repaints the whole page - charts included, since Recharts writes
 * `var()` straight into SVG attributes. The few colours that must be literals
 * (model shades, chosen from a palette and stored as hex) are mapped to their
 * light twins in `model-colors.ts` by `useThemedColor`.
 *
 * The CHOICE is 'dark', 'light' or 'system', kept per browser in
 * localStorage. It is a viewing preference, not data: two devices may well
 * want different themes, so unlike the hidden projects it does not go in
 * `data/`. Dark is the default because it is what this dashboard has always
 * been; 'system' follows the OS and keeps following it.
 *
 * It is applied by THEME_INIT_SCRIPT, inlined at the top of <head> BEFORE first
 * paint - the same reason the rail's state is (see rail.ts): from React it
 * would paint one frame of the wrong theme on every load. The toggle calls the
 * same function afterwards (`window.__aiuTheme`), so there is exactly one
 * implementation of "work out the theme and apply it".
 *
 * Plain module, not `'use client'`: the root layout is a server component and
 * needs the script.
 */

export type ThemeChoice = 'dark' | 'light' | 'system';
export type Theme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'aiusage.theme';

export const THEME_CHOICES: ReadonlyArray<{ value: ThemeChoice; label: string }> = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
];

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === 'dark' || value === 'light' || value === 'system';
}

/**
 * Resolves the stored choice, sets `data-theme` and `color-scheme` (so native
 * controls, scrollbars and the colour picker follow), and keeps following the
 * OS while the choice is 'system'. Re-run on `storage`, so a change in one tab
 * reaches the others.
 *
 * ES5 and wrapped in try/catch: it runs before anything else, and
 * localStorage throws in some private modes. A broken script must never be
 * what decides the page is unreadable - the fallback is dark, the default.
 */
export const THEME_INIT_SCRIPT = `(function(){
var mq=window.matchMedia?window.matchMedia('(prefers-color-scheme: light)'):null;
function choice(){try{return localStorage.getItem('${THEME_STORAGE_KEY}')||'dark'}catch(e){return 'dark'}}
function apply(){var c=choice(),t=c==='system'?(mq&&mq.matches?'light':'dark'):(c==='light'?'light':'dark'),d=document.documentElement;
d.setAttribute('data-theme',t);d.style.colorScheme=t;}
apply();
if(mq&&mq.addEventListener)mq.addEventListener('change',apply);
window.addEventListener('storage',function(e){if(e.key==='${THEME_STORAGE_KEY}')apply()});
window.__aiuTheme=apply;
})();`;
