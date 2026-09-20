# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning is [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Accessibility

- Small text now clears WCAG AA contrast: `--text-faint` moves from `#6b6b75`
  (3.6-4.0:1, a failure) to `#7d7d87` (4.55:1 at worst). The charts' axis and
  tooltip colours are tokens instead of their own copies of those hex values.
- Every model shade and heat-map step clears 3:1 against the panel, with the
  price ordering intact. The darkest bands used to sit at 1.5-2.2:1, which is
  close to invisible against near-black.
- Every chart is wrapped in a named `<figure>` with a screen-reader table of the
  same numbers, so the data no longer exists only as a picture. The heat map's
  grid is hidden from assistive tech in favour of that table, instead of
  swallowing its own per-day labels behind `role="img"`.
- The "i" explainers are real buttons: keyboard-reachable, named, and announced
  through `aria-describedby`. Colour-only swatch columns carry the model names
  for screen readers, and the loading skeletons announce themselves.

### Tooling

- ESLint 9 (flat config, via `eslint-config-next`) and Prettier, wired into CI
  alongside the typecheck, tests and build. The codebase needed no rule
  suppressions: the first run reported two warnings, both now gone.
- `.gitattributes` normalises line endings to LF, with Windows scripts kept as
  CRLF. Without it, Prettier and a Windows checkout disagree on every line of
  every file.
- `.editorconfig` keeps editors in step with both.

### States

- A parse that finds nothing now says so: which agent, where it looked, and how
  to point it somewhere else. It used to render `$0.00` across a dozen cards
  with a warning claiming a file could not be read.
- Warnings are described honestly. "Nothing found" is left to the empty state,
  and the rest are no longer all announced as unreadable files - the same list
  carries merge-rule cycles and archive failures.
- Render errors keep the dashboard's chrome and offer a retry instead of
  blanking the page, and an unknown agent segment gets a real page.
- The project detail page's loading skeleton mirrors the page section by
  section, instead of three grey boxes standing in for nine sections.

### Fixed

- A project id containing `%` no longer blanks the page: the page was decoding
  a parameter that arrives decoded.
- One malformed line can no longer take down a report. JSON that is valid but
  not an object (`null`, a number, an array) is skipped instead of aborting the
  rest of that file; an out-of-range timestamp is treated as undated instead of
  throwing `RangeError` out of the whole parse; negative and fractional token
  counts are refused; and unreadable days in the local archive are dropped with
  a warning instead of throwing.
- `npm run parse` / `parse:codex` report an `implausible timestamps` count.

### Added

- A test suite (`npm test`, Node's built-in runner) covering both parsers'
  documented traps and these guards, the archive's one-directional merge, the
  session cookie and pricing.
- CI: typecheck, tests and build on Windows and Ubuntu, Node 20 and 22.

## [0.12.0] - Unreleased

First public release. Earlier versions were developed privately; this entry
summarises where the project stands rather than replaying that history.

### Features

- Dashboards for **Claude Code** and **Codex**, one route per agent, sharing
  every chart, table and card.
- Overview: estimated spend, tokens and runtime; daily spend with unusual days
  flagged; cost and token detail by model; twelve activity cards including
  streaks, peak hour, peak tokens and longest chat; daily tokens and daily spend
  stacked by model; a six-month heat map.
- Projects: a share-of-spend donut and a ranked project list; per-project detail
  with daily tables and every session ranked by cost.
- Claude Code parsing that de-duplicates streaming partials and replayed session
  history globally, recovers placeholder output counts, includes nested subagent
  transcripts and prices cache writes by TTL.
- Codex parsing from cumulative running totals, with cached input and reasoning
  tokens handled so nothing is billed twice, auto-review threads counted as
  their own band, and a per-file reconciliation check.
- A local daily archive (`data/`) so days survive the agents deleting old
  transcripts.
- Editable rate cards, unpriced models called out, project merges and display
  names, per-agent project logos.
- A password gate that fails closed; CLI parsers (`npm run parse`,
  `npm run parse:codex`); an optional Windows background service.

### Security

- Upgraded Next.js to 15.5.25 for GHSA-p293-qw3h-jr36 (unauthenticated remote
  code execution on Windows-hosted servers) and GHSA-2xp9-vwfh-vxw4, and sharp
  to 0.35.4.
- The server now listens on `127.0.0.1` by default. Network access is opt-in:
  `npm run dev:lan` / `start:lan`, `-Lan` for the Windows service,
  `DASHBOARD_LAN=1` for the `.bat` launcher.
- Session cookies are signed with a PBKDF2-derived key, optionally mixed with a
  new `SESSION_SECRET`, so a captured cookie can no longer be used to test
  password guesses offline. **Existing sessions are invalidated once; sign in
  again.**
- Failed logins are throttled per client and globally, answering 429 with
  `Retry-After`.

### Changed

- Days are bucketed at the machine's own UTC offset by default instead of a
  fixed one, and the heat map's first weekday is configurable (`weekStartsOn`,
  Monday by default).
- Personal configuration is local and gitignored: `config/settings.json`,
  `config/projects.json`, `config/codex-projects.json` and the project-logo
  folders' contents, each with a committed template.
- The sidebar uses the vendors' official marks from `public/agent-marks/`,
  unmodified, and falls back to the agent's initials when a file is missing.

### Fixed

- The Codex project detail page labelled its API-equivalent figure as "Total
  estimated spend", called requests "messages", and pointed its merge tooltip
  at Claude Code's config file.

### Removed

- Legacy PowerShell report scripts, which did not de-duplicate and overstated
  usage.
