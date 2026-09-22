/**
 * Password gate.
 *
 * The dashboard serves real `cwd` paths out of the user's other projects, so it
 * is never served without a password - even though it listens on localhost by
 * default. With `npm run start:lan` it is reachable from the whole network, and
 * this gate is all that stands in front of it. One shared password, held in
 * `.env.local`.
 *
 * Web Crypto only, no `node:crypto` import. That was a hard requirement while
 * this was used from `middleware.ts`, which Next ran on the Edge runtime where
 * the Node built-ins do not exist. Next 16's `proxy.ts` always runs on Node, so
 * it no longer is one - but Web Crypto works the same there, and keeping it
 * means the module still runs anywhere.
 *
 * The session cookie is `<expiry-ms>.<HMAC-SHA256(expiry-ms)>`. The HMAC key is
 * derived from the password, so changing it in `.env.local` still invalidates
 * every outstanding session for free, with no session store.
 *
 * It is DERIVED, not the password itself. When the password was the raw HMAC
 * key, anyone who captured one cookie (plain HTTP on a LAN) could test password
 * guesses offline at full HMAC speed, never touching the server. Now:
 *
 * - the key goes through PBKDF2-SHA256 at `KDF_ITERATIONS`, so every offline
 *   guess costs that many HMAC rounds instead of one; and
 * - `SESSION_SECRET`, when set, is mixed into the salt. A captured cookie is
 *   then useless without that secret, however weak the password - which is why
 *   the README asks for one before LAN use.
 *
 * The derivation runs once per runtime and is cached, not once per request.
 */

export const SESSION_COOKIE = 'aiusage_session';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — a phone shouldn't re-auth daily.

/**
 * OWASP's current floor for PBKDF2-HMAC-SHA256. Measured at ~85ms on a desktop
 * CPU, once per runtime - invisible behind the first request after a restart -
 * and that same cost lands on every guess an attacker makes offline.
 */
const KDF_ITERATIONS = 600_000;

/** Bump the version to invalidate every session if the derivation ever changes. */
const KDF_SALT_PREFIX = 'aiusage-session-v2';

/** The configured password, or undefined when the operator has not set one. */
export function configuredPassword(): string | undefined {
  const pw = process.env.DASHBOARD_PASSWORD;
  return pw && pw.trim().length > 0 ? pw : undefined;
}

/** Optional high-entropy secret mixed into the session key. Empty when unset. */
function configuredSessionSecret(): string {
  return process.env.SESSION_SECRET?.trim() ?? '';
}

/** Length-independent equality. Compares digests so length itself doesn't leak. */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const va = new Uint8Array(da);
  const vb = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

function base64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Derived signing keys, keyed by what they were derived from. Normally this
 * holds exactly one entry; a rotated password or secret simply derives a new
 * one, and the old entry can no longer verify anything that matters.
 */
const signingKeys = new Map<string, Promise<CryptoKey>>();

function signingKey(password: string): Promise<CryptoKey> {
  const secret = configuredSessionSecret();
  // Length-prefixed so no (secret, password) pair can collide with another.
  const cacheKey = `${secret.length}:${secret}${password}`;
  let key = signingKeys.get(cacheKey);
  if (!key) {
    const enc = new TextEncoder();
    key = crypto.subtle
      .importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'])
      .then((base) =>
        crypto.subtle.deriveKey(
          {
            name: 'PBKDF2',
            hash: 'SHA-256',
            salt: enc.encode(`${KDF_SALT_PREFIX}:${secret}`),
            iterations: KDF_ITERATIONS,
          },
          base,
          { name: 'HMAC', hash: 'SHA-256', length: 256 },
          false,
          ['sign'],
        ),
      );
    // A failed derivation must not be cached as a permanent rejection.
    key.catch(() => signingKeys.delete(cacheKey));
    signingKeys.set(cacheKey, key);
  }
  return key;
}

async function sign(password: string, payload: string): Promise<string> {
  const key = await signingKey(password);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return base64url(new Uint8Array(sig));
}

export async function issueSession(
  password: string,
): Promise<{ value: string; maxAgeSeconds: number }> {
  const expiry = String(Date.now() + SESSION_TTL_MS);
  return {
    value: `${expiry}.${await sign(password, expiry)}`,
    maxAgeSeconds: Math.floor(SESSION_TTL_MS / 1000),
  };
}

export async function verifySession(
  password: string,
  cookie: string | undefined,
): Promise<boolean> {
  if (!cookie) return false;
  const dot = cookie.lastIndexOf('.');
  if (dot <= 0) return false;

  const payload = cookie.slice(0, dot);
  if (!(await safeEqual(cookie.slice(dot + 1), await sign(password, payload)))) return false;

  const expiry = Number(payload);
  return Number.isFinite(expiry) && Date.now() < expiry;
}
