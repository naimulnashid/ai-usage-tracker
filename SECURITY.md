# Security policy

## Reporting a vulnerability

**Use GitHub's private vulnerability reporting:**
[Report a vulnerability](https://github.com/naimulnashid/ai-usage-tracker/security/advisories/new).
It is enabled on this repository, so the report stays private between you and
the maintainer until there is a fix to publish.

Please do not open a public issue for anything that looks exploitable. For
anything else — a hardening idea, a question about a trade-off below — a normal
issue is the right place.

Useful in a report, roughly in order of usefulness:

- what an attacker gets, and what they need in order to get it;
- whether the dashboard was reachable from the network (`dev:lan` / `start:lan`
  / `-Lan` / `DASHBOARD_LAN=1`) or on localhost only, since that changes the
  severity of almost everything here;
- the version or commit, your OS and Node version;
- the smallest reproduction you have.

**What to expect.** This is one person's side project, so there is no
response-time commitment. Expect an acknowledgement within a few days and
progress in the open once a fix exists. If a report turns out to be a genuine
vulnerability you will be credited in the advisory unless you would rather not
be.

## Supported versions

| Version | Supported |
| --- | --- |
| `main` | Yes |
| [v0.12.0](https://github.com/naimulnashid/ai-usage-tracker/releases/tag/v0.12.0) | Yes — it is the only release |
| Anything earlier | No — there is nothing earlier; the repository opened at this release |

There is no long-term support branch and nothing is backported. A fix lands on
`main` and goes out in the next release. Given the deployment model — you run it
yourself from a clone — upgrading is `git pull && npm ci && npm run build`.

## What this application is, in security terms

It is a **local-only** dashboard that reads coding agents' session transcripts
from your own home directory and renders numbers from them. There is no
database, no server component you do not run, and no outbound network call: a
content security policy with `connect-src 'self'` enforces that last point in
the browser rather than leaving it to the code. It writes only inside its own
data folder (`data/`, or `DASHBOARD_DATA_DIR`): the daily archive, and the list
of projects hidden from the Projects page — the one thing a request can
change.

Two consequences shape what counts as a vulnerability here:

- **The data is sensitive even though the app is small.** Transcripts contain
  real code and real filesystem paths from your other projects, and the UI
  serves working-directory paths and project names. Anything that discloses
  those without a session is serious.
- **Reachability is your choice.** It binds `127.0.0.1` by default. LAN access
  is opt-in and, once on, it is plain HTTP on a trusted home network behind a
  shared password. That is the documented model, not an oversight.

### In scope

- Bypassing the password gate, or reaching any route, API response or asset
  that should require a session.
- Forging or replaying a session cookie; weaknesses in how the signing key is
  derived from the password.
- Reading files outside the configured transcript directories — path traversal
  through a project id, a logo filename, or anything else that reaches the
  filesystem.
- Getting the app to send data anywhere off the machine.
- Getting it to write anywhere but its data folder, or changing the
  hidden-project list without a session or from another site —
  `/api/hidden-projects/<agent>` refuses both, and accepts only a bounded list
  of project ids.
- Code execution from a malformed transcript, a crafted `config/*.json`, or a
  file dropped into a project-logo folder.
- Stored or reflected script execution in the dashboard, including through a
  project name or path that came out of a transcript.
- Dependency vulnerabilities that are actually reachable from this code.

### Known, deliberate, and not vulnerabilities

Each of these is a documented decision with its reasoning in `CLAUDE.md`. A
report that one of them exists will be closed with a pointer here — but a report
that the reasoning is *wrong*, or that one is exploitable in a way the reasoning
did not anticipate, is very much wanted.

- **No HTTPS, and the session cookie is not `Secure`.** LAN mode is plain HTTP;
  a `Secure` cookie is silently never stored over HTTP, so setting it would
  simply break sign-in. Run it on a network you trust, or keep it on localhost.
- **`script-src` allows `'unsafe-inline'`.** Next streams its payload as inline
  scripts whose contents change per render, so they cannot be hashed, and
  noncing them costs static rendering. The policy is an origin fence — nothing
  may load from anywhere else — not an XSS defence.
- **Login throttling is in memory and resets when the process restarts**, and
  the per-client key is `x-forwarded-for`, which a client can forge. The global
  cap is what stands behind the per-client one. Restarting the server to clear
  a lockout is a feature, not a bypass.
- **An authenticated error response can include a raw error message**, and
  warnings can include absolute paths. Both are behind the gate, and the same
  page already shows you your own paths.
- **Anyone who knows the password sees everything.** There is one shared
  password and no roles. It is a single-user tool.
- **A missing `DASHBOARD_PASSWORD` locks everyone out rather than opening the
  door.** That direction is deliberate.
- **The project-logo folders serve whatever you put in them.** They are yours;
  an SVG there is served with a policy that allows it no script.

## Keeping a deployment safe

- Set `DASHBOARD_PASSWORD` to something long. It is the only thing between the
  network and your project paths.
- Set `SESSION_SECRET` before enabling LAN access. Without it, a cookie
  captured off plain HTTP is worth more than it should be.
- **Rotating the password requires a restart, not just an edit.** Until the
  process restarts, devices already holding a session stay signed in — which is
  the wrong direction if you are rotating because something leaked.
- Keep dependencies current: `npm audit`, and watch Next.js security releases
  in particular. The one critical finding in this project's own pre-release
  audit was an upstream Next.js advisory, not this code.
- Nothing derived from a transcript should ever be committed. `*.jsonl`,
  `*.sqlite`, `data/` and `out/` are gitignored as a backstop, and the reasoning
  is at the top of `CLAUDE.md`.
