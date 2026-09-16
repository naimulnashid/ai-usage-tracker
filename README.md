# AI Usage Dashboard

A local web dashboard for **Claude Code** and **Codex** usage: token consumption,
estimated cost and approximate runtime, broken down by model, by project and by
day.

It works by reading the session transcripts both agents already write to your
disk. There is no account, no database and no cloud service.

---

## Privacy: what it reads, writes and sends

This tool reads files that contain your own code and project paths, so here is
exactly what it does with them.

**Reads** (never modifies, copies or uploads):

| Agent | Location | Override |
|---|---|---|
| Claude Code | `~/.claude/projects/` (Windows: `%USERPROFILE%\.claude\projects\`) | `CLAUDE_CONFIG_DIR` |
| Codex | `~/.codex/sessions/` and `~/.codex/archived_sessions/`, plus thread names from `~/.codex/session_index.jsonl` | `CODEX_HOME` |

Only usage numbers, timestamps, model names, working-directory paths and Codex
thread titles are extracted. Message content never reaches the dashboard's
output, the archive or any file it writes.

**Writes**, all inside this folder and all gitignored:

| Path | What | Why |
|---|---|---|
| `data/history.json`, `data/codex-history.json` | Daily totals: tokens, cost, runtime, project names and paths | Both agents delete old transcripts; this keeps past days from vanishing ([details](#the-local-archive)) |
| `out/*.json` | Full report, only when you run `npm run parse` / `parse:codex` | Inspecting numbers without the UI |
| `logs/dashboard.log` | Launcher output | Only when using the Windows background service |

**Sends:** the app itself makes no outbound network requests. Two things to know:

- **Next.js telemetry.** The Next.js CLI collects anonymous build and usage
  telemetry by default. It never sees your transcripts, but if you want nothing
  leaving the machine, run `npx next telemetry disable` once, or set
  `NEXT_TELEMETRY_DISABLED=1`.
- **Who can reach the dashboard.** By default it listens on `127.0.0.1` only, so
  just this computer. It can be opened up to your local network, deliberately;
  read [Using it from other devices](#using-it-from-other-devices) first.

Either way a password is required. With no password configured the dashboard
refuses every request rather than opening up.

---

## What it shows

- **Overview:** total estimated spend, tokens and runtime; daily spend with
  unusual days flagged; per-model cost; token detail by model; activity cards
  (sessions, streaks, peak hour, longest chat); daily tokens and daily spend
  stacked by model; a six-month heat map.
- **Projects:** a share-of-spend donut (top nine projects plus "Others") and a
  ranked list of every project with a per-model share bar.
- **Project detail:** the same breakdowns for one project, day-by-day tables,
  and every session ranked by cost, with subagent transcripts marked.
- **Refresh:** re-reads every transcript and recomputes. There is no background
  polling.

Model bands are shaded by price: the darker the band, the more expensive the
model.

### The two cost figures mean different things

| Agent | Headline label | What it is |
|---|---|---|
| Claude Code | Total estimated spend | An estimate of what the tokens cost at per-token API rates |
| Codex | API-equivalent spend | What the tokens *would* cost through the OpenAI API |

If you use Codex through a ChatGPT subscription, you are not billed per token,
so the Codex figure is a comparison number, not a charge. The two totals are
never added together, and the app never shows them side by side as the same
kind of number.

Both are best-effort estimates from undocumented log formats. For
authoritative billing, use each vendor's own console.

---

## Requirements

- **Node.js 20 or newer**, with npm
- Claude Code and/or Codex installed and used at least once. Either alone is
  fine; the other agent's page is simply empty.

### Platform support

| | Windows | macOS / Linux |
|---|---|---|
| Dashboard and parsers | Tested | Expected to work, **untested**. Paths resolve from your home directory, not Windows-only variables. |
| Background service and `.bat` launchers | Tested | Not available (Windows-only scripts). Use `npm start` or your own process manager. |

Reports from macOS and Linux users are welcome.

---

## Quick start

```bash
git clone https://github.com/naimulnashid/ai-usage-tracker.git
cd ai-usage-tracker
npm ci
```

Create your local environment file from the template:

```bash
cp .env.example .env.local
```

```powershell
Copy-Item .env.example .env.local   # PowerShell
```

Open `.env.local` and set a password:

```
DASHBOARD_PASSWORD=choose-something-long
```

Start the dev server and open <http://localhost:7842>:

```bash
npm run dev
```

That's it: the dashboard finds your transcripts in their default locations.
If yours live elsewhere, set `CLAUDE_CONFIG_DIR` or `CODEX_HOME` before starting.

For everyday use, a production build is faster than the dev server:

```bash
npm run build
npm start
```

> **Windows PowerShell 5.1** has no `&&`. Run chained commands as two lines, or
> use `npm run build; if ($?) { npm start }`. PowerShell 7 (`pwsh`) supports
> `&&` as written.

---

## Configuration

### Environment variables (`.env.local`)

| Variable | Required | Purpose |
|---|---|---|
| `DASHBOARD_PASSWORD` | **Yes** | The shared login password. Changing it signs every device out. |
| `SESSION_SECRET` | Before LAN use | A long random value mixed into the session-cookie key; see below. |
| `CLAUDE_CONFIG_DIR` | No | Claude Code's config directory, if not `~/.claude` |
| `CODEX_HOME` | No | Codex's home directory, if not `~/.codex` |

**Restart the server after changing `.env.local`.** Next.js hot-reloads the
file, but only partly: the login route picks up a new password at once while the
middleware that checks existing sessions keeps the old value until restart. If
you are rotating a password because it leaked, restart, then confirm a
signed-in browser is sent back to the login page.

### Config files (`config/`)

| File | Committed? | Purpose |
|---|---|---|
| `pricing.json` | Yes | Claude Code rate card, USD per million tokens |
| `codex-pricing.json` | Yes | Codex rate card, plus model aliases |
| `settings.json` | No, copy from `settings.example.json` | Day-boundary timezone, heat-map week start, runtime idle cutoff |
| `projects.json` | No, copy from `projects.example.json` | Merge renamed Claude Code projects, override display names |
| `codex-projects.json` | No, copy from `codex-projects.example.json` | The same for Codex |

The local files are gitignored because they name your projects. All of them are
optional, and no rebuild is needed after editing: hit Refresh.

**Timezone.** Days are split at your machine's current UTC offset by default.
Pin `localUtcOffsetHours` in `settings.json` if that is not the zone you think
in, or to keep daylight-saving switches from moving a few hours between days.

### Project logos

Drop an image named after a project into your agent's folder and it appears
beside that project:

| Agent | Folder |
|---|---|
| Claude Code | `public/claude_code_project_logos/` |
| Codex | `public/codex_project_logos/` |

`My App.png` matches the project shown as "My App". Matching ignores case,
spacing and punctuation, so it also matches `My_App`. SVG, PNG, JPG, WebP, GIF and
AVIF work. Projects without an image show their initials. The folders' contents
are gitignored.

In dev a new image shows on the next page load. A production server lists
`public/` at startup, so restart it (no rebuild needed).

---

## Using it from other devices

Listening on your network is opt-in:

```bash
npm run dev:lan      # or
npm run start:lan
```

The server then prints a `Network:` address to open from a phone or laptop on
the same network. Windows asks to allow `node.exe` through the firewall the
first time.

**Before you do, understand what the gate is and isn't.**

- **It's plain HTTP.** Your password and session cookie cross the network
  unencrypted. The gate stops other people on your network from casually
  opening the dashboard. It does not protect against someone actively capturing
  traffic on that network.
- **Set `SESSION_SECRET`.** Without it, a captured session cookie lets an
  attacker test password guesses offline. Each guess is slowed by 600,000
  PBKDF2 rounds, but a weak password can still fall. With a secret set, a
  captured cookie is useless without the secret. Generate one with:

  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
  ```

- **Use a strong password anyway.** Wrong guesses are throttled to 10 per client
  and 50 in total per 15 minutes. Under attack the login form can be locked for
  everyone until the window passes. Devices already signed in keep working.
- **Sessions last 30 days.** Rotating either `DASHBOARD_PASSWORD` or
  `SESSION_SECRET`, then restarting, signs every device out.

Don't expose this to the internet. It was never designed for that.

---

## Running in the background on Windows

To avoid a console window left open all day, the dashboard can run hidden and
start at logon:

```powershell
npm run build
powershell -ExecutionPolicy Bypass -File scripts\install-autostart.ps1        # this machine only
powershell -ExecutionPolicy Bypass -File scripts\install-autostart.ps1 -Lan   # or: reachable on your network
```

This registers a Task Scheduler entry, **Start AI Usage Dashboard**, that runs
as you, only while you are logged on. No admin rights are needed and Windows
never stores your password. Running the script again replaces the task, so
switching between `-Lan` and localhost-only is just a re-run.

| Task | How |
|---|---|
| Start now without logging out | `wscript scripts\dashboard-hidden.vbs` (add `-Lan` for network access) |
| Stop it | double-click `stop-dashboard.bat` |
| See what happened | `logs\dashboard.log` |
| Remove the logon task | `powershell -ExecutionPolicy Bypass -File scripts\install-autostart.ps1 -Remove` |

`-ExecutionPolicy Bypass` applies to that one command only, and is needed where
PowerShell's default policy blocks local scripts. It changes no system setting.

**The launcher doesn't rebuild.** It builds only when there is no build at all.
After changing code, run `npm run build` and restart. If source files are newer
than the build, it still starts, and writes a `WARNING` to `logs\dashboard.log`.
That warning is the first place to look when a change doesn't show up.

**Prefer a visible window?** Double-click `start-ai-usage-dashboard.bat`. It
installs dependencies and builds if needed, starts the server, and opens your
browser once it responds. Set `DASHBOARD_LAN=1` first for network access. Closing
the window stops the server.

---

## Inspecting the numbers without the UI

```bash
npm run parse          # Claude Code -> out/usage-report.json
npm run parse:codex    # Codex       -> out/codex-usage-report.json
```

Each prints a summary with parser diagnostics and writes the full report. It is
exactly what `/api/usage/<agent>` serves. No password is needed: these read
disk directly and never touch the web app.

---

## How the numbers are derived

### Claude Code

Each project directory under `~/.claude/projects/` holds one `.jsonl` file per
session. Subagent transcripts nested at `<session>/subagents/*.jsonl` are
included: they are separately billed usage and easy to miss.

Claude Code writes the same assistant message many times (streaming updates,
and history replayed into resumed sessions), so messages are de-duplicated
globally on `(message.id, requestId)`. Counting every line would overstate cost
by close to 90%.

### Codex

Codex writes one rollout file per thread under `sessions/YYYY/MM/DD/`. Usage is
reported as a running total, so per-turn usage is taken as the change in that
total. Cached prompt tokens are split out of input so they aren't billed twice,
and reasoning tokens (already inside output) are shown but never added on top.
Codex's automated "auto-review" threads are counted, as their own band.

### Projects

Projects are keyed by working directory, so **renaming or moving a folder starts
a new project**. Stitch the halves back together in `config/projects.json` (or
`codex-projects.json`):

```json
"merge": {
  "C--Users-you-Projects-old-name": "C--Users-you-Projects-new-name"
}
```

The merged project shows an "Includes usage merged from…" line. Merging never
changes the grand total, only how it is grouped.

A project folder that holds only history replayed from another project (which
happens when a session is resumed from a different directory) contributes
nothing new and is hidden. `npm run parse` lists any hidden projects.

### The local archive

Claude Code deletes transcripts older than `cleanupPeriodDays` (30 days by
default, set in `~/.claude/settings.json`), and Codex prunes its sessions too.
Because everything here is derived from those files, a deleted transcript would
silently remove days from the charts and shrink your totals.

So every parse folds each day's totals into `data/history.json` (Claude Code) or
`data/codex-history.json` (Codex). Once a day is recorded it survives its
transcripts being deleted. A day is only overwritten by a parse that saw at least
as many messages, so a partly deleted day never replaces a fuller record. The
overview shows the date span covered and how many days come only from the
archive.

The archive holds numbers, project names and paths, never message content.
Delete the `data/` folder to start it fresh. Session lists and the peak hour
can't be rebuilt from daily totals, so those reflect only transcripts still on
disk.

### Pricing

Rates are USD **per million tokens**, five buckets per model:

```json
"claude-opus-5": {
  "input": 5.0,
  "cacheWrite5m": 6.25,
  "cacheWrite1h": 10.0,
  "cacheRead": 0.5,
  "output": 25.0
}
```

A model found in your transcripts but missing from the rate card is shown as
**unpriced** and called out on the page; it is never silently counted as $0.
Codex's card also has an `aliases` map, which is how `codex-auto-review` is priced
as GPT-5.3 Codex while keeping its own band. Each card has a `lastVerified` date.
Check vendors' current pricing if it is old.

---

## Caveats

- **Estimates, not bills.** Both log formats are undocumented and change between
  versions. The parsers skip anything they can't read rather than crashing.
- **Runtime is approximate.** Neither agent logs inference time. Runtime is the
  sum of gaps between consecutive lines in a session, ignoring gaps longer than
  the idle cutoff (30 minutes by default). It measures *active session time*: it
  includes your own reading and typing, and drops long idle stretches.
- **A few Claude Code output counts are understated.** Claude Code sometimes logs
  a placeholder `output_tokens`. Most are recovered from a later copy of the same
  message; the residue on the reference data was a few dozen messages in tens of
  thousands, a negligible share of cost. The only exact fix would mean sending
  transcript content to an API, so it is detected (see `npm run parse`) but not
  corrected.
- **Codex fast mode isn't detected.** Priority mode costs roughly double, and
  rollout files don't record it, so everything is priced at standard speed.
- **Numbers won't match the vendors' own usage screens.** Claude Code's app
  doesn't de-duplicate and excludes cache tokens. Several of the Codex app's
  stats cover a recent window rather than all history. Where they measure the
  same thing (for example, lifetime Codex tokens), the figures agree.

---

## Troubleshooting

**The page shows $0.00 and a warning.** No transcripts were found where
expected. The warning names the directory it tried. Set `CLAUDE_CONFIG_DIR` or
`CODEX_HOME` if yours are elsewhere, then hit Refresh.

**The login page says no password is set.** `DASHBOARD_PASSWORD` is missing from
`.env.local`, or the server wasn't restarted after adding it.

**"Too many wrong attempts."** The login throttle tripped. Wait for the time
shown, or restart the server to clear it.

**A code change doesn't show up.** You're probably running a production build.
Run `npm run build` and restart; the background service logs a `WARNING` when
the build is stale.

**`Cannot find module './NNN.js'`.** The `.next` folder is inconsistent, usually
after switching between `npm run dev` and `npm run build`. Delete `.next` and
start again.

**Next.js warns that `@next/swc-win32-x64-msvc` was blocked by an Application
Control policy.** Windows (often Smart App Control) blocked the native compiler,
so Next falls back to a slower WebAssembly build. Everything still works; builds
just take longer.

**PowerShell says running scripts is disabled.** Use the commands exactly as
shown above, with `-ExecutionPolicy Bypass`.

---

## Project layout

```
config/              Rate cards (committed) and *.example.json templates for local settings
public/agent-marks/  Official Claude Code and Codex marks shown in the sidebar
public/*_project_logos/  Your project logos (contents gitignored)
scripts/             CLI parsers (npm run parse), Windows background-service scripts
src/lib/             Both parsers, pricing, the local archive, auth, the agent registry
src/app/             Next.js App Router pages and API routes, one set of pages for both agents
src/components/      Charts, tables and cards
```

[`CLAUDE.md`](CLAUDE.md) documents the data model in depth: every quirk of
both log formats the parsers handle, and the UI conventions that keep the
two agents apart. Read it before changing a parser.

---

## Trademarks

Claude and Claude Code are trademarks of Anthropic, PBC. OpenAI, ChatGPT and Codex
are trademarks of OpenAI. This project is independent and is not affiliated
with, endorsed by or sponsored by either company.

The sidebar marks in `public/agent-marks/` are the vendors' own published assets,
used unmodified to identify each agent. They are not covered by this project's
license. If a file is removed, the sidebar shows the agent's initials instead.

## License

[MIT](LICENSE)
