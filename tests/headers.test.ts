/**
 * The security headers, and the matcher that decides what goes ungated.
 *
 * These are static config, so a unit test can only check that the declarations
 * are still there and still say what they were reasoned about saying. What they
 * DO was verified against `next start` and is recorded in CLAUDE.md; this is
 * the guard that stops a directive being dropped or loosened in passing.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import nextConfig from '../next.config.mjs';
import { config as proxyConfig } from '../src/proxy';

/** The policy the config would send for a given path. */
async function headersFor(path: string): Promise<Record<string, string>> {
  const rules = await nextConfig.headers!();
  const out: Record<string, string> = {};
  for (const rule of rules) {
    // The two sources in use are `/:path*` (everything) and an `.svg` matcher.
    const isSvgRule = rule.source.includes('svg');
    if (isSvgRule && !path.endsWith('.svg')) continue;
    // Later rules win on a repeated key, which is how the SVG policy replaces
    // the general one rather than narrowing it.
    for (const { key, value } of rule.headers) out[key] = value;
  }
  return out;
}

describe('security headers', () => {
  it('sends a policy on every path', async () => {
    const h = await headersFor('/claude');
    for (const key of [
      'Content-Security-Policy',
      'X-Frame-Options',
      'X-Content-Type-Options',
      'Referrer-Policy',
      'Permissions-Policy',
    ]) {
      assert.ok(h[key], `${key} is not sent`);
    }
  });

  it('refuses to let anything reach another origin', async () => {
    // The local-only promise, which is otherwise enforced by nothing. This is
    // the directive in this file worth having.
    const csp = (await headersFor('/claude'))['Content-Security-Policy'];
    assert.match(csp, /connect-src 'self'/);
    assert.match(csp, /default-src 'self'/);
    assert.ok(!/connect-src[^;]*https?:/.test(csp), 'connect-src names an external origin');
  });

  it('allows no script from another origin', async () => {
    const csp = (await headersFor('/claude'))['Content-Security-Policy'];
    assert.match(csp, /script-src 'self'/);
    assert.ok(!/script-src[^;]*https?:/.test(csp), 'script-src names an external origin');
  });

  it('blocks cross-origin framing while allowing the app to frame itself', async () => {
    // `'self'` rather than `'none'`: clickjacking needs a cross-origin frame,
    // and `'none'` additionally breaks the iframe harness used to measure the
    // loading skeletons. The two framing headers have to agree.
    const h = await headersFor('/claude');
    assert.match(h['Content-Security-Policy'], /frame-ancestors 'self'/);
    assert.equal(h['X-Frame-Options'], 'SAMEORIGIN');
  });

  it('keeps project ids out of anyone else’s referrer log', async () => {
    assert.equal((await headersFor('/claude'))['Referrer-Policy'], 'no-referrer');
  });

  it('gives an SVG no script at all', async () => {
    // Inert inside an <img>, but opened directly an SVG is a document that can
    // carry its own script - and these are files a user drops into public/.
    const csp = (await headersFor('/agent-marks/codex.svg'))['Content-Security-Policy'];
    assert.match(csp, /default-src 'none'/);
    assert.ok(!/script-src/.test(csp), 'the SVG policy should not re-allow script');
  });

  it('still sends the other four headers on an SVG', async () => {
    // Only the repeated key is replaced; the rest have different names.
    const h = await headersFor('/agent-marks/codex.svg');
    assert.equal(h['X-Content-Type-Options'], 'nosniff');
    assert.equal(h['X-Frame-Options'], 'SAMEORIGIN');
  });
});

describe('the auth matcher', () => {
  const pattern = proxyConfig.matcher[0];
  const gated = (path: string) => new RegExp(`^${pattern}$`).test(path);

  it('lets through exactly the assets the login screen needs', () => {
    assert.equal(gated('/icon.svg'), false);
    assert.equal(gated('/agent-marks/claude-code.svg'), false);
    assert.equal(gated('/favicon.ico'), false);
    assert.equal(gated('/_next/static/chunks/main.js'), false);
  });

  it('gates everything else', () => {
    assert.equal(gated('/claude'), true);
    assert.equal(gated('/api/usage/claude'), true);
    assert.equal(gated('/claude/projects/My-App'), true);
  });

  it('anchors the exclusions, so a lookalike path is still gated', () => {
    // These were NOT gated before the exclusions were anchored and their dots
    // escaped: `icon.svg` matched any path merely starting with it, and `.`
    // matched any character at all.
    assert.equal(gated('/icon.svgx'), true);
    assert.equal(gated('/iconxsvg'), true);
    assert.equal(gated('/favicon.icon'), true);
    assert.equal(gated('/agent-marks-secret'), true);
  });
});
