import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, configuredPassword, verifySession } from '@/lib/auth';

/**
 * One gate in front of everything. Enforcing this here rather than per-page is
 * the whole point: a new route cannot forget to protect itself.
 *
 * The matcher lets the login screen's own assets through, plus the favicon and
 * the agent marks in `public/agent-marks/`. `icon.svg` is the favicon, which
 * browsers fetch before any session exists; the marks are let through for the
 * same reason and because gating an image only makes it render as a broken
 * login page. None of it leaks anything - they are logos.
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|icon.svg|agent-marks/|favicon.ico).*)'],
};

/** Only same-site absolute paths may be bounced back to after login. */
function safeNext(pathname: string, search: string): string {
  const target = `${pathname}${search}`;
  return pathname.startsWith('/') && !pathname.startsWith('//') ? target : '/';
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname === '/login' || pathname === '/api/login') return NextResponse.next();

  const password = configuredPassword();
  const authorised =
    password !== undefined &&
    (await verifySession(password, request.cookies.get(SESSION_COOKIE)?.value));

  if (authorised) return NextResponse.next();

  // Fail closed, and say so in a form the caller can actually read. An
  // unconfigured password is a locked door, never an open one.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: password === undefined ? 'auth-not-configured' : 'unauthorised' },
      { status: 401 },
    );
  }

  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  if (pathname !== '/') url.searchParams.set('next', safeNext(pathname, search));
  return NextResponse.redirect(url);
}
