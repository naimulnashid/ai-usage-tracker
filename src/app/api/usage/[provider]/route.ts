import { NextResponse } from 'next/server';
import { buildUsageReport } from '@/lib/parser';
import { buildCodexUsageReport } from '@/lib/codex-parser';
import { withHistory } from '@/lib/history';
import { getProvider, type ProviderId } from '@/lib/providers';

/**
 * Re-reads and re-aggregates every transcript for one agent on each request.
 *
 * There is no cache and no database by design: each dataset is small enough to
 * parse in a couple of seconds, and the Refresh button is manual, so a stale
 * layer would add complexity without buying anything.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const PARSERS: Record<ProviderId, () => Promise<Awaited<ReturnType<typeof buildUsageReport>>>> = {
  claude: buildUsageReport,
  codex: buildCodexUsageReport,
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: raw } = await params;
  const provider = getProvider(raw);
  if (!provider) {
    return NextResponse.json({ error: `Unknown agent "${raw}".` }, { status: 404 });
  }

  try {
    const startedAt = Date.now();
    // withHistory persists today's aggregates and restores any day whose
    // transcript the agent has since deleted. It picks its archive file from
    // the report's own provider, so the two can never cross.
    const report = withHistory(await PARSERS[provider.id]());
    return NextResponse.json(
      { ...report, parseMs: Date.now() - startedAt },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Failed to parse ${provider.label} transcripts.`, detail: message },
      { status: 500 },
    );
  }
}
