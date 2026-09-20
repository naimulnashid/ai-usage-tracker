/**
 * Security headers.
 *
 * This app is local-only: it reads the user's transcripts off disk and never
 * talks to the network. That is a promise made in the README and enforced by
 * nothing — until here. `connect-src 'self'` is the directive that matters
 * most in this file, because it is the one that makes a browser refuse an
 * outbound request rather than trusting the code not to make one.
 *
 * The rest close what the pre-release audit found open: the login page could be
 * framed, responses were sniffable, and a referrer carrying a project id could
 * leave with any outbound navigation.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",

  // `'unsafe-inline'` here is a deliberate trade, not an oversight. Next
  // streams its flight payload as inline <script> tags whose contents differ
  // per render, so they cannot be hashed; noncing them would mean reading
  // `headers()` in the root layout to nonce OUR inline script too, which makes
  // every page dynamic. What this directive still buys, and what is actually
  // worth having here, is that no script may be loaded from anywhere else.
  "script-src 'self' 'unsafe-inline'",

  // React writes inline styles, and Recharts writes one per SVG element.
  "style-src 'self' 'unsafe-inline'",

  "img-src 'self' data:",
  "font-src 'self'",

  // The local-only promise, enforced.
  "connect-src 'self'",

  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",

  // `'self'`, not `'none'`. Clickjacking needs a CROSS-origin frame, and this
  // refuses every one of those, which is the whole of the threat. `'none'`
  // additionally forbids the app framing itself — and that breaks the iframe
  // harness CLAUDE.md documents for measuring the loading skeletons at an exact
  // viewport width, which was found the moment it was tried. Buying nothing at
  // the cost of a working technique is a bad trade.
  "frame-ancestors 'self'",
].join('; ');

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: CONTENT_SECURITY_POLICY },
  // `frame-ancestors` above covers modern browsers; this covers the rest, and
  // has to agree with it - `DENY` here would override the `'self'` above in
  // browsers that honour both, and break same-origin framing anyway.
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Nothing here should ever appear in another site's referrer log, and a URL
  // on this app carries a project id.
  { key: 'Referrer-Policy', value: 'no-referrer' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
];

/**
 * An SVG is inert inside an `<img>`, but opened directly it is a document that
 * can carry its own script — and both the agent marks and the project logos are
 * files a user drops into `public/` themselves. Matching on the extension
 * rather than on the folders keeps this from duplicating `projectLogoDir` out
 * of the provider registry, and covers `icon.svg` for free.
 *
 * Next collapses two rules setting the same header, last one wins, so this
 * REPLACES the policy above for these paths rather than narrowing it — which
 * is why it repeats `frame-ancestors` instead of inheriting it. The other four
 * headers have different keys and still apply; verified against `next start`.
 */
const SVG_HEADERS = [
  {
    key: 'Content-Security-Policy',
    value: "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self'",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  async headers() {
    return [
      { source: '/:path*', headers: SECURITY_HEADERS },
      { source: '/:path(.*\\.svg)', headers: SVG_HEADERS },
    ];
  },
};

export default nextConfig;
