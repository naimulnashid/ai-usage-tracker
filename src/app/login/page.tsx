'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (response.ok) {
        const next = params.get('next');
        // Only same-site paths, so a crafted ?next= cannot bounce elsewhere.
        router.replace(next?.startsWith('/') && !next.startsWith('//') ? next : '/');
        router.refresh();
        return;
      }
      const payload = await response.json().catch(() => ({}));
      if (payload?.error === 'too-many-attempts') {
        const minutes = Math.max(1, Math.ceil(Number(payload.retryAfterSeconds ?? 60) / 60));
        setError(
          `Too many wrong attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
        );
        return;
      }
      setError(
        payload?.error === 'auth-not-configured'
          ? 'No password is set on the server. Add DASHBOARD_PASSWORD to .env.local and restart.'
          : 'That password is not right.',
      );
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="login-card" onSubmit={submit}>
      <img src="/icon.svg" alt="" className="login-mark" width={40} height={40} />
      <h1 className="login-title">AI Usage Dashboard</h1>
      <p className="login-sub">
        This dashboard is reachable from your network, so it asks for the shared password first.
      </p>

      <input
        type="password"
        className="login-input"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        aria-label="Password"
        autoFocus
        autoComplete="current-password"
      />

      {error && <p className="login-error">{error}</p>}

      <button type="submit" className="btn btn-primary login-submit" disabled={busy || !password}>
        {busy ? (
          <>
            <span className="spinner" aria-hidden />
            Checking
          </>
        ) : (
          'Unlock'
        )}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="login-shell">
      {/* useSearchParams needs a Suspense boundary to prerender. */}
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
