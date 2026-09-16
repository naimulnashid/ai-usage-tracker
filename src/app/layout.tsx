import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { RAIL_INIT_SCRIPT } from '@/lib/rail';
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
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <head>
        {/* Restores the collapsed rail before first paint - see src/lib/rail.ts.
            It must run here, ahead of the body, or a collapsed rail mounts
            expanded and snaps shut on every page load. */}
        <script dangerouslySetInnerHTML={{ __html: RAIL_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
