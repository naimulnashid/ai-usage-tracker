import { NextResponse } from 'next/server';
import { SESSION_COOKIE, configuredPassword, issueSession, safeEqual } from '@/lib/auth';

export const runtime = 'nodejs';

/** Blunt brute-force tax. The gate is a single shared password, so make guesses slow. */
const WRONG_PASSWORD_DELAY_MS = 400;

/*
 * Attempt limits.
 *
 * The delay above slows one guess at a time, but not guesses sent in parallel,
 * so failures are also counted in a fixed window:
 *
 * - per client, so one device hammering the form is shut out quickly; and
 * - globally, because the client key comes from `x-forwarded-for`, which a
 *   client can set itself. Rotating fake addresses gets past the per-client
 *   limit and straight into this one.
 *
 * The global limit is a deliberate trade: someone determined can lock the login
 * form for everyone until the window passes. Devices already signed in are
 * unaffected - the middleware checks cookies, not this counter - and a locked
 * form is a far better failure than an unthrottled one.
 *
 * In memory, so a restart clears it. This is one process on one machine.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_CLIENT = 10;
const MAX_FAILURES_GLOBAL = 50;

interface Window {
  failures: number;
  resetAt: number;
}

const clientWindows = new Map<string, Window>();
const globalWindow: Window = { failures: 0, resetAt: 0 };

function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || request.headers.get('x-real-ip') || 'unknown';
}

function current(window: Window, now: number): Window {
  if (now >= window.resetAt) {
    window.failures = 0;
    window.resetAt = now + WINDOW_MS;
  }
  return window;
}

/** Seconds until the caller may try again, or 0 when not limited. */
function lockedFor(client: string, now: number): number {
  for (const [key, window] of clientWindows) {
    if (now >= window.resetAt) clientWindows.delete(key);
  }
  const g = current(globalWindow, now);
  const c = clientWindows.get(client);
  const until = Math.max(
    g.failures >= MAX_FAILURES_GLOBAL ? g.resetAt : 0,
    c && c.failures >= MAX_FAILURES_PER_CLIENT ? c.resetAt : 0,
  );
  return until > now ? Math.ceil((until - now) / 1000) : 0;
}

function recordFailure(client: string, now: number): void {
  current(globalWindow, now).failures += 1;
  const window = clientWindows.get(client) ?? { failures: 0, resetAt: now + WINDOW_MS };
  window.failures += 1;
  clientWindows.set(client, window);
}

export async function POST(request: Request) {
  const expected = configuredPassword();
  if (!expected) {
    return NextResponse.json({ error: 'auth-not-configured' }, { status: 503 });
  }

  const client = clientKey(request);
  const retryAfter = lockedFor(client, Date.now());
  if (retryAfter > 0) {
    return NextResponse.json(
      { error: 'too-many-attempts', retryAfterSeconds: retryAfter },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  let submitted: unknown;
  try {
    submitted = (await request.json())?.password;
  } catch {
    return NextResponse.json({ error: 'bad-request' }, { status: 400 });
  }

  if (typeof submitted !== 'string' || !(await safeEqual(submitted, expected))) {
    recordFailure(client, Date.now());
    await new Promise((r) => setTimeout(r, WRONG_PASSWORD_DELAY_MS));
    return NextResponse.json({ error: 'wrong-password' }, { status: 401 });
  }

  clientWindows.delete(client);
  const { value, maxAgeSeconds } = await issueSession(expected);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSeconds,
    // NOT `secure`. This is served over plain HTTP on the LAN; a secure cookie
    // would simply never be stored and the login would appear to do nothing.
    secure: false,
  });
  return response;
}

/** Sign out. */
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  return response;
}
