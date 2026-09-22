/**
 * The sidebar's remembered expand/collapse state.
 *
 * This lives in a plain module rather than alongside <ProviderScope> on
 * purpose: the root layout is a *server* component and needs the init script,
 * and every export of a `'use client'` file becomes a client reference that
 * throws when a server component touches it.
 */

/**
 * Versioned, because the DEFAULT changed. The rail used to start expanded; it
 * now starts collapsed. Under the old key, a browser holding 'expanded' - a
 * value written by anyone who had ever collapsed and re-opened it - would
 * have kept the old behaviour forever, and the new default would have looked
 * like it had not shipped. A new key starts every browser collapsed once;
 * after that, whatever is chosen is remembered as before.
 */
export const RAIL_STORAGE_KEY = 'aiusage.rail.v2';

/**
 * Restores the rail state before first paint: collapsed unless this browser
 * has chosen expanded.
 *
 * Rendering this from React would be a frame too late — a collapsed rail would
 * mount expanded and visibly snap shut on every page load. The attribute goes
 * on <html>, which exists before any component does, and the CSS reads
 * `:root[data-rail='collapsed']`.
 *
 * Collapsed by default because phones get the desktop layout (see the
 * viewport export in the `(dash)` layout), and on a 1024px page an expanded
 * rail takes a quarter of the width for two links. Storage that is blocked or
 * throws gets the default too - a broken page is never the fallback.
 */
export const RAIL_INIT_SCRIPT =
  `(function(){try{if(localStorage.getItem('${RAIL_STORAGE_KEY}')==='expanded')return;}catch(e){}` +
  `document.documentElement.dataset.rail='collapsed';})();`;
