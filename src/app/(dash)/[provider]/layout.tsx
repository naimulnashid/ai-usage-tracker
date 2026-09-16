import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { UsageProvider } from '@/components/UsageProvider';
import { ProviderScope } from '@/components/ProviderScope';
import { Sidebar } from '@/components/Sidebar';
import { TopBar } from '@/components/TopBar';
import { PROVIDER_IDS, getProvider } from '@/lib/providers';

/**
 * Everything behind the password gate, for one agent.
 *
 * The agent is a route segment rather than a toggle, so every page has its own
 * URL (`/claude/projects`, `/codex/projects`) and the browser's back button and
 * bookmarks work the way they should. It also means the whole dashboard is
 * written once: the pages below never branch on which agent they are showing,
 * they read <ProviderScope> for the handful of things that genuinely differ.
 */

/** Pre-render both agents' shells; there will never be a third at runtime. */
export function generateStaticParams() {
  return PROVIDER_IDS.map((provider) => ({ provider }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ provider: string }>;
}): Promise<Metadata> {
  const { provider } = await params;
  const meta = getProvider(provider);
  return { title: meta ? `${meta.label} · AI Usage Dashboard` : 'AI Usage Dashboard' };
}

export default async function ProviderLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ provider: string }>;
}) {
  const { provider } = await params;
  const meta = getProvider(provider);
  // An unknown agent is a 404, not a silent fallback to Claude Code - showing
  // one agent's numbers under another's name is the one failure that matters.
  if (!meta) notFound();

  return (
    <ProviderScope provider={meta}>
      <Sidebar />
      <div className="app-main">
        <UsageProvider>
          <TopBar />
          <main className="shell">
            {children}
            {/* Sits in the layout, not the page, so it is there while a page is
                still loading its skeleton - one less thing that moves when the
                data lands. */}
            <footer className="site-footer">
              © 2026 Naimul Nashid · MIT License · Not affiliated with Anthropic or OpenAI
            </footer>
          </main>
        </UsageProvider>
      </div>
    </ProviderScope>
  );
}
