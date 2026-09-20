import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { issueSession, safeEqual, verifySession } from '../src/lib/auth';

const PASSWORD = 'test-password-one';

afterEach(() => {
  delete process.env.SESSION_SECRET;
});

describe('session cookies', () => {
  it('round-trips a session for the same password', async () => {
    const { value, maxAgeSeconds } = await issueSession(PASSWORD);
    assert.equal(await verifySession(PASSWORD, value), true);
    assert.equal(maxAgeSeconds, 30 * 24 * 60 * 60);
  });

  it('rejects another password, so rotating one signs every device out', async () => {
    const { value } = await issueSession(PASSWORD);
    assert.equal(await verifySession('test-password-two', value), false);
  });

  it('rejects a tampered signature or expiry', async () => {
    const { value } = await issueSession(PASSWORD);
    const [expiry, signature] = value.split('.');
    assert.equal(await verifySession(PASSWORD, `${expiry}.${signature.slice(0, -2)}AA`), false);
    assert.equal(await verifySession(PASSWORD, `${Number(expiry) + 1}.${signature}`), false);
  });

  it('rejects an expired cookie', async () => {
    const realNow = Date.now;
    Date.now = () => realNow() - 31 * 86_400_000;
    const { value } = await issueSession(PASSWORD);
    Date.now = realNow;
    assert.equal(await verifySession(PASSWORD, value), false);
  });

  it('rejects junk and a missing cookie', async () => {
    assert.equal(await verifySession(PASSWORD, undefined), false);
    assert.equal(await verifySession(PASSWORD, ''), false);
    assert.equal(await verifySession(PASSWORD, 'nope'), false);
    assert.equal(await verifySession(PASSWORD, '.abc'), false);
  });

  it('rejects a cookie signed with the raw password, the pre-PBKDF2 format', async () => {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(PASSWORD),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const expiry = String(Date.now() + 86_400_000);
    const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(expiry)));
    let raw = '';
    for (const byte of signature) raw += String.fromCharCode(byte);
    const legacy = `${expiry}.${btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;

    assert.equal(await verifySession(PASSWORD, legacy), false);
  });

  it('binds the cookie to SESSION_SECRET when one is set', async () => {
    const withoutSecret = await issueSession(PASSWORD);

    process.env.SESSION_SECRET = 'secret-one';
    assert.equal(
      await verifySession(PASSWORD, withoutSecret.value),
      false,
      'setting a secret invalidates cookies issued without one',
    );

    const withSecret = await issueSession(PASSWORD);
    assert.equal(await verifySession(PASSWORD, withSecret.value), true);

    process.env.SESSION_SECRET = 'secret-two';
    assert.equal(await verifySession(PASSWORD, withSecret.value), false, 'rotating it signs out');
  });
});

describe('safeEqual', () => {
  it('compares without leaking length', async () => {
    assert.equal(await safeEqual('abc', 'abc'), true);
    assert.equal(await safeEqual('abc', 'abd'), false);
    assert.equal(await safeEqual('abc', 'abcdefghijkl'), false);
    assert.equal(await safeEqual('', ''), true);
  });
});
