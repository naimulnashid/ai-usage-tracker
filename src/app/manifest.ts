import type { MetadataRoute } from 'next';
import { APP_ICON_SIZES } from '@/lib/app-icon';
import { PROVIDER_IDS, PROVIDERS } from '@/lib/providers';

/**
 * The web app manifest, which is what lets a browser install the dashboard as
 * an app of its own: a window with no browser chrome, a Start menu entry and a
 * taskbar icon. Next serves this at `/manifest.webmanifest` and links it from
 * every page's head.
 *
 * **It has to be let through `proxy.ts`.** A browser fetches the manifest
 * WITHOUT cookies, so a gated one comes back as a redirect to the login page
 * and the app is silently not installable. It carries nothing but a name and
 * colours; the icons it names are ungated for the same reason.
 *
 * **There is no service worker, deliberately.** Chromium stopped requiring one
 * to install, and the only thing it would add here is an offline cache of a
 * report - a copy of the numbers that goes stale, which is exactly the cache
 * layer this app promises not to have.
 *
 * Installing needs a secure context, and `localhost` is one while a LAN address
 * over plain HTTP is not: another device on the network can still open the
 * dashboard, but not install it.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'AI Usage Dashboard',
    short_name: 'AI Usage',
    description:
      'Local dashboard for Claude Code and Codex token usage, estimated cost, and runtime.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    // True black, the page's own `--bg`, so the window opens on the colour the
    // dashboard is about to paint rather than flashing white first.
    background_color: '#000000',
    theme_color: '#000000',
    icons: APP_ICON_SIZES.map((size) => ({
      src: `/app-icon/${size}`,
      sizes: `${size}x${size}`,
      type: 'image/png',
      purpose: 'any',
    })),
    // Right-click the taskbar icon to open either agent directly. From the
    // registry, so a third agent gets a shortcut without touching this file.
    shortcuts: PROVIDER_IDS.map((id) => ({
      name: PROVIDERS[id].label,
      url: PROVIDERS[id].basePath,
    })),
  };
}
