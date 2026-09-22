import { NextResponse } from 'next/server';
import { isSameOrigin } from '@/lib/auth';
import { isValidProjectId, loadHiddenProjects, setProjectHidden } from '@/lib/hidden-projects';
import { getProvider } from '@/lib/providers';

/**
 * The projects hidden from one agent's Projects page.
 *
 * `GET` returns the list; `PUT { id, hidden }` changes one entry and returns
 * the list as it now stands, so the page never has to guess what the file
 * holds. The agent is a route param validated against the registry, like
 * `/api/usage/<agent>`, and an unknown one is a 404.
 *
 * The first route in this app that writes anything a request asked for, so it
 * is behind the same gate as everything else (`proxy.ts` covers all of
 * `/api/*`) and additionally refuses a write from another origin. What it can
 * write is bounded: ids only, of a bounded length, in a list of bounded size.
 * See `src/lib/hidden-projects.ts` for why this is a file and not browser
 * storage.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: raw } = await params;
  const provider = getProvider(raw);
  if (!provider) {
    return NextResponse.json({ error: `Unknown agent "${raw}".` }, { status: 404 });
  }
  return NextResponse.json({ hidden: loadHiddenProjects(provider.id) }, { headers: NO_STORE });
}

export async function PUT(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: raw } = await params;
  const provider = getProvider(raw);
  if (!provider) {
    return NextResponse.json({ error: `Unknown agent "${raw}".` }, { status: 404 });
  }
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'cross-origin' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad-request' }, { status: 400 });
  }
  const { id, hidden } = (body ?? {}) as { id?: unknown; hidden?: unknown };
  if (!isValidProjectId(id) || typeof hidden !== 'boolean') {
    return NextResponse.json({ error: 'bad-request' }, { status: 400 });
  }

  try {
    return NextResponse.json(
      { hidden: setProjectHidden(provider.id, id, hidden) },
      { headers: NO_STORE },
    );
  } catch (error) {
    // Behind the gate, so the reader is the one person who can see every path
    // in the report anyway - the same trade `/api/usage` makes with `detail`.
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'Could not save the hidden projects.', detail: message },
      { status: 500 },
    );
  }
}
