import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { RAIL_INIT_SCRIPT } from '@/lib/rail';
import { THEME_INIT_SCRIPT } from '@/lib/theme';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Usage Dashboard',
  description:
    'Local dashboard for Claude Code and Codex token usage, estimated cost, and runtime.',
};

/**
 * Document shell only. The dashboard chrome (rail + provider + topbar) lives in
 * the `(dash)/[provider]` layout so the login screen, which sits outside it,
 * renders bare — otherwise the provider would fire an unauthenticated
 * /api/usage fetch behind the login form.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  // suppressHydrationWarning: the two init scripts below set `data-theme` and
  // `data-rail` on <html> before React hydrates it, by design. It silences this
  // one element's attributes only, not anything inside it.
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      data-theme="dark"
      suppressHydrationWarning
    >
      <head>
        {/* Restores the collapsed rail before first paint - see src/lib/rail.ts.
            It must run here, ahead of the body, or a collapsed rail mounts
            expanded and snaps shut on every page load. */}
        <script dangerouslySetInnerHTML={{ __html: RAIL_INIT_SCRIPT }} />
        {/* The light or dark theme, before first paint - see src/lib/theme.ts. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
