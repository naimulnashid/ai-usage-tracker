# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning is [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **The two stacked charts have a date range.** "Daily tokens by model" and
  "Daily spend by model" — on the overview and on every project page — can
  show the last 30 days (the default), the last 60, or every day on record.
  A window is calendar days ending today, so idle days show as empty columns
  instead of being skipped, and each chart's legend describes just the days it
  is showing.
- **Projects can be hidden from the Projects page.** Each card has a **⋯**
  menu that hides it; once anything is hidden, **Show all projects** at the end
  of the list brings it back. Hiding never changes a number: hidden projects
  still count in every total, and the share-of-spend donut adds them to its
  remainder slice. The list is saved under `data/`, so it follows you from
  device to device.

- **The rate card's age is on the page.** The Cost by model panel now names the
  file its rates came from and the date they were last verified. Every money
  figure in this dashboard is a token count multiplied by that file, and
  nothing on screen said whether it had been checked last week or last year.
- `.nvmrc`, naming the newest Node version CI tests.
- **`npm run demo:data`** — a synthetic transcript tree for both agents, so you
  can see the dashboard, take a screenshot or try a change without pointing it
  at your own machine. The fake transcripts go through the real parsers, so the
  numbers are computed the way yours are.
- `DASHBOARD_DATA_DIR` moves the daily archive. Set it whenever you point the
  app at transcripts that are not yours, or invented days get merged into your
  real history.
- `CONTRIBUTING.md`, issue and pull-request templates, and Dependabot. The
  templates lead with the privacy rule, because an app that reads your real
  code and paths makes a public bug report the easiest way to leak them.
- **The README says that no screen reader has been run against this.** The
  accessible markup is covered by tests, an axe-core pass reports no
  violations and the accessibility tree has been read back by hand — but none
  of that is the same as hearing it, and the gap was recorded only in the
  contributor notes, where someone relying on one would never see it.

### Fixed

- **The top bar fits a narrow window.** It was one row that needed about
  560px, so anything narrower was pushed sideways. Below 720px it is now two
  rows: the agent's name and Refresh, then the page tabs and Sign out.
- **The headline total always fits its card.** It was drawn at a fixed size,
  so a five-figure total pushed the page sideways, and with the sidebar
  expanded even a four-figure one pushed the runtime figure out of the card.
  It now keeps its usual size whenever that fits, and shrinks just enough
  when it doesn't.
- **Starting the background service a second time no longer fails without a
  trace.** While the dashboard ran, the server's output held
  `logs/dashboard.log` open against other writers, so a second launch — a
  re-run task, a double-clicked launcher — could not log that the dashboard was
  already running, and exited with an error instead. The log is now shared, and
  every line is appended as a single operation, so two writers cannot overwrite
  each other's lines. The log's contents are unchanged.
- **`stop-dashboard.bat` no longer stops other apps' servers.** It stopped
  every Node process listening on the dashboard's port, and another local
  app's Node server can hold that same port through a different bind address.
  It now stops only a server running this checkout's Next.js, and leaves
  anything else alone with a message saying what it is. The background
  service's "already running" check uses the same rule, so another program on
  the port is logged as an error instead of passing for the dashboard.
- **The demo recipe no longer points at a port other apps use, or stops the
  server in a way that takes them down with it.** The README ran the screenshot
  server on 7843, right beside this dashboard's own port and so a likely one
  for another local app to hold already, and
  `demo:data` printed `npm run dev`, which is this dashboard's own 7842. A
  server bound to `127.0.0.1` can share a port with another app's wildcard
  listener, so stopping the demo by killing whatever listened on that port
  killed the other app as well. The demo now runs on 7942, and the README says
  to stop it by the PID you started (the whole process tree, on Windows) or
  with Ctrl+C — never by port.
- **One bad project merge rule no longer floods the warning box.** A cycle in
  `codex-projects.json` produced a warning per usage event — thousands of
  identical lines, which the dashboard then summarised as a pile of unreadable
  files. It is reported once now.
- **Every page scrolled a long way past its footer.** The screen-reader tables
  that carry each chart's numbers were hidden with a class that cannot hide a
  `<table>` — a table ignores the 1px size and the clipped overflow the class
  relies on — so two full-height tables stayed laid out, invisible, adding
  around 1200px of empty scroll below the overview's footer. Every page now
  ends where its footer does.
- **Counters no longer start below zero.** The first frame of every count-up
  could draw a negative figure — `$-2.45`, say — for a moment before climbing
  to the real number. They now start at zero.
- **Back no longer returns you to a page that throws you straight out.** When
  a session expired mid-visit, the login page was added as a new history
  entry, so Back went to the dashboard, which sent you to the login page
  again. It now replaces the entry, as Sign out already did.

### Changed

- **Phones show the desktop dashboard, scaled to fit the screen,** the way a
  browser's "Desktop site" option does. Pinch to zoom in on the details. The
  login page is unchanged.
- **The sidebar starts collapsed.** Expanding it is remembered per browser, as
  before; every browser starts collapsed once, including ones where it had been
  left expanded.
- **Next.js 16**, which needs **Node.js 20.9 or newer**. The password gate
  moves from `src/middleware.ts` to `src/proxy.ts`, Next's new name for it,
  and now runs on Node rather than the Edge runtime. One visible effect:
  under `npm run dev`, changing the password in `.env.local` now signs
  existing sessions out at once, where they used to stay signed in until a
  restart. The production server still reads the file only when it starts,
  so a restart is still what applies a new password there.

- The arithmetic both parsers share — tokens into a cell, cells into a bucket,
  buckets into a sorted daily array — now lives in one module instead of two
  copies that had already started to drift. No number changes: the full
  reports were diffed before and after.
- The two `npm run parse` scripts share their printing instead of keeping two
  copies of it. What each agent reports that the other does not — its model
  columns, its own diagnostics counters — stays separate. The printed output is
  unchanged, character for character.
- **The Codex mark in the sidebar is drawn at the same visual size as the
  Claude Code one.** Both files are square and centred, but OpenAI's bakes a
  25% margin into every side where Anthropic's runs edge to edge, so in one
  shared box the Codex mark rendered at half the size. Neither file is
  modified; only the box it is drawn into.

## [0.12.0] - 2026-09-20

First public release. Earlier versions were developed privately, so this entry
summarises where the project stands rather than replaying that history — and it
includes everything done between opening the repository and tagging it, none of
which was ever released separately.

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

### Added

- A test suite (`npm test`, Node's built-in runner) covering both parsers'
  documented traps and the input guards, the archive's one-directional merge,
  the session cookie, pricing, the accessible markup, the contrast ratios, the
  security headers and the rules that keep the page from scrolling sideways.
- CI: lint, formatting, typecheck, tests and build on Windows and Ubuntu, Node
  20 and 22.

### Security

- **Security headers on every response.** A content security policy, plus
  `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy: no-referrer`
  and `Permissions-Policy`. The policy's `connect-src 'self'` is the one that
  matters: "this app makes no outbound network calls" was a promise the code
  kept and nothing enforced, and the browser now refuses instead. An `.svg`
  path — the agent marks and your project logos, which are files you drop in
  yourself — gets a tighter policy that allows no script at all.
- **The login screen can no longer be framed by another site**, which is the
  clickjacking defence it was missing.
- **The auth gate's exclusions are anchored.** `icon.svg` and `favicon.ico`
  were matched as prefixes with an unescaped `.`, so paths like `/icon.svgx`
  and `/iconxsvg` were treated as the favicon and skipped the password gate.
  Nothing was actually served through the gap — the paths 404 — but it is shut.
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
- Every page has exactly one `<h1>`. The overview and projects pages started
  their outline at h2, so a screen reader had no page title to land on.

### States

- A parse that finds nothing now says so: which agent, where it looked, and how
  to point it somewhere else. It used to render `$0.00` across a dozen cards
  with a warning claiming a file could not be read.
- Warnings are described honestly. "Nothing found" is left to the empty state,
  and the rest are no longer all announced as unreadable files - the same list
  carries merge-rule cycles and archive failures.
- Render errors keep the dashboard's chrome and offer a retry instead of
  blanking the page, and an unknown agent segment gets a real page.
- Every loading skeleton mirrors its page section by section at measured
  heights, so nothing moves when the data lands.

### Changed

- Days are bucketed at the machine's own UTC offset by default instead of a
  fixed one, and the heat map's first weekday is configurable (`weekStartsOn`,
  Monday by default).
- Personal configuration is local and gitignored: `config/settings.json`,
  `config/projects.json`, `config/codex-projects.json` and the project-logo
  folders' contents, each with a committed template.
- The sidebar uses the vendors' official marks from `public/agent-marks/`,
  unmodified, and falls back to the agent's initials when a file is missing.
- **The project detail page's loading skeleton is measured**, not derived from
  the overview's panels. Its three model-dependent panels and its stat grid
  were sized for the agent's whole model list rather than the project's, which
  at 997px put the placeholder 166px out on the grid alone; its sessions table
  was 248px short. Measured across every project at both widths, the skeleton
  now lands within ~43px everywhere above the two deliberately capped tables.

### Tooling

- ESLint 9 (flat config, via `eslint-config-next`) and Prettier, wired into CI
  alongside the typecheck, tests and build. The codebase needed no rule
  suppressions: the first run reported two warnings, both now gone.
- `.gitattributes` normalises line endings to LF, with Windows scripts kept as
  CRLF. Without it, Prettier and a Windows checkout disagree on every line of
  every file.
- `.editorconfig` keeps editors in step with both.

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
- The Codex project detail page labelled its API-equivalent figure as "Total
  estimated spend", called requests "messages", and pointed its merge tooltip
  at Claude Code's config file.
- **An expired session no longer loses your place.** A session that ran out
  while a tab sat open bounced to the login screen and then to the overview;
  it now returns you to the page you were on, query string included, the same
  way a request that never had a session already did.

The rest were found by loading the signed-in dashboard and measuring it, after
an audit that had checked the same ground at the markup, token and unit level
and passed. An axe-core run over both agents' three pages and the empty, failed
and error states reported no violations beyond the missing `<h1>` above.

- **The explainer tooltip inside a table was unreadable.** It inherited
  `white-space: nowrap` from its header cell, so a 290px bubble rendered as one
  ~1540px line: clipped out of view, and the table grew a scrollbar the moment
  you hovered it. It also sat at the column's layout position, which on a table
  wider than its panel is off where you cannot see it. It now wraps, hangs
  below its header, and stays inside the table it belongs to.
- **The dashboard scrolled sideways at narrow widths.** The screen-reader text
  behind each tooltip escaped its scrolling table — it is absolutely positioned
  and the table was not a containing block — and landed 169px past the right
  edge of the page, taking a horizontal scrollbar with it.
- **The top bar pushed Refresh off the edge of the page** at around 1000px with
  the sidebar expanded, and wrapped "Sign out" onto two lines. The status line
  now truncates instead, and both controls stay whole.

### Removed

- Legacy PowerShell report scripts, which did not de-duplicate and overstated
  usage.
