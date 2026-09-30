import { NextResponse } from 'next/server';
import { isSameOrigin } from '@/lib/auth';
import { isValidProjectId } from '@/lib/hidden-projects';
import { isHexColor } from '@/lib/project-colors';
import { loadProjectColors, saveProjectColor } from '@/lib/project-colors-store';
import { getProvider } from '@/lib/providers';

/**
 * The colours chosen for one agent's projects.
 *
 * `GET` returns `{ colors: { <id>: '#RRGGBB' } }`; `PUT { id, color }` sets one
 * (`null` clears it, back to the logo's colour) and returns every colour as it
 * now stands. Guarded exactly like `/api/hidden-projects/<agent>` - behind the
 * gate, same-origin writes only, bounded input. See project-colors-store.ts.
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
  return NextResponse.json({ colors: loadProjectColors(provider.id) }, { headers: NO_STORE });
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
  const { id, color } = (body ?? {}) as { id?: unknown; color?: unknown };
  if (!isValidProjectId(id) || (color !== null && !isHexColor(color))) {
    return NextResponse.json(
      { error: 'bad-request', detail: 'A colour is written #RRGGBB.' },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      { colors: saveProjectColor(provider.id, id, color as string | null) },
      { headers: NO_STORE },
    );
  } catch (error) {
    // Behind the gate - the same trade `/api/usage` makes with `detail`.
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'Could not save the project colour.', detail: message },
      { status: 500 },
    );
  }
}
