import { NextResponse } from 'next/server';
import { isSameOrigin } from '@/lib/auth';
import {
  isValidModelName,
  loadModelSettings,
  saveModelSetting,
  toModelRate,
} from '@/lib/model-settings';
import { isPaletteColor } from '@/lib/model-colors';
import { getProvider } from '@/lib/providers';

/**
 * One agent's per-model settings: custom rates and chosen colours.
 *
 * `GET` returns both; `PUT { model, rate?, color? }` changes one model and
 * returns everything as it now stands. `null` clears a field, an absent one is
 * left alone. Guarded exactly like `/api/hidden-projects/<agent>` - behind the
 * gate, same-origin writes only, bounded input - and see
 * `src/lib/model-settings.ts` for why this is a file in `data/` and not an
 * edit to the committed rate card.
 *
 * A rate change does not re-parse here. The page asks for a fresh report
 * afterwards, through the same Refresh path as the button, so there is one way
 * a report is ever built.
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
  return NextResponse.json(loadModelSettings(provider.id), { headers: NO_STORE });
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
  const { model, rate, color } = (body ?? {}) as {
    model?: unknown;
    rate?: unknown;
    color?: unknown;
  };
  if (!isValidModelName(model)) {
    return NextResponse.json(
      { error: 'bad-request', detail: 'Not a model name.' },
      { status: 400 },
    );
  }
  if (rate !== undefined && rate !== null && !toModelRate(rate)) {
    return NextResponse.json(
      { error: 'bad-request', detail: 'Every rate must be a number from 0 to 10,000.' },
      { status: 400 },
    );
  }
  if (
    color !== undefined &&
    color !== null &&
    (typeof color !== 'string' || !isPaletteColor(provider.id, color))
  ) {
    return NextResponse.json(
      { error: 'bad-request', detail: 'Pick one of the listed shades.' },
      { status: 400 },
    );
  }

  try {
    const saved = saveModelSetting(provider.id, model, {
      rate: rate === undefined ? undefined : rate === null ? null : toModelRate(rate),
      color: color as string | null | undefined,
    });
    return NextResponse.json(saved, { headers: NO_STORE });
  } catch (error) {
    // Behind the gate, so the reader is the one person who can see every path
    // in the report anyway - the same trade `/api/usage` makes with `detail`.
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'Could not save the model settings.', detail: message },
      { status: 500 },
    );
  }
}
