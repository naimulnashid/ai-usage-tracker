/**
 * The sidebar's remembered expand/collapse state.
 *
 * This lives in a plain module rather than alongside <ProviderScope> on
 * purpose: the root layout is a *server* component and needs the init script,
 * and every export of a `'use client'` file becomes a client reference that
 * throws when a server component touches it.
 */

export const RAIL_STORAGE_KEY = 'aiusage.rail';

/**
 * Restores the stored rail state before first paint.
 *
 * Rendering this from React would be a frame too late — a collapsed rail would
 * mount expanded and visibly snap shut on every page load. The attribute goes
 * on <html>, which exists before any component does, and the CSS reads
 * `:root[data-rail='collapsed']`.
 *
 * Deliberately tiny and wrapped in try/catch: a browser with storage blocked
 * should get the default rail, not a broken page.
 */
export const RAIL_INIT_SCRIPT =
  `try{var v=localStorage.getItem('${RAIL_STORAGE_KEY}');` +
  `if(v==='collapsed')document.documentElement.dataset.rail='collapsed';}catch(e){}`;
