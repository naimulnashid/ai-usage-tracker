# Contributing

Thanks for looking. This is a small, single-maintainer project, so the most
useful contributions are focused ones: a bug with a reproduction, a parser fix
with the numbers to back it, a platform report from macOS or Linux.

## Read this part even if you skip the rest

**This tool reads transcripts full of your real code, file paths and project
names, and everything in this repository is public.** So the rule that matters
most here is not about style:

- **Never commit anything derived from a real transcript.** No fixtures, no
  sample `.jsonl`, no exported reports, no screenshots of real usage. `*.jsonl`,
  `*.sqlite`, `data/` and `out/` are gitignored as a backstop, not a licence.
- **Never put real project names, paths, usernames or spend figures** in code,
  comments, docs, tests, issues, pull requests **or commit messages**. Use
  placeholders — `My App`, `C--Users-you-Projects-my-app` — and proportions
  ("about 9%") rather than totals. When a measurement matters, record the
  ratio.
- The same applies to anything you paste into an issue. A stack trace or a
  warning from this app usually contains an absolute path. Redact it.

If you are unsure whether something is safe to include, leave it out and say
what you left out.

## Getting set up

```bash
nvm use                      # .nvmrc pins the Node version CI tests
npm ci
cp .env.example .env.local   # set DASHBOARD_PASSWORD - the app fails closed without one
npm run dev                  # http://localhost:7842
```

`npm run parse` and `npm run parse:codex` read your transcripts and print a
summary without going through the web layer. They need no password and are the
fastest way to see what a parser change did.

## Before you open a pull request

```bash
npm run typecheck
npm test
npm run lint
npm run format:check
npm run build
```

CI runs all of these on Windows and Ubuntu, on Node 20 and 22.

Commits use [Conventional Commits](https://www.conventionalcommits.org/).
Line endings are LF, enforced by `.gitattributes`.

## Two things that are easy to get wrong here

**Read [`CLAUDE.md`](CLAUDE.md) before changing a parser or a chart.** It is the
architecture document, and it exists because most of the traps in this codebase
are invisible in the code. The two biggest: Claude Code writes the same message
many times, so counting every line overstates usage by about 89%, and Codex
reports cumulative totals, so summing per-turn figures double-counts. Both are
handled, both are documented, and both look like bugs if you do not know.

**If you change a parser, prove the numbers did not move.** `npm run parse`
writes the exact structure the API serves, so:

1. run both parse commands and keep the two JSON files,
2. make your change,
3. run them again and diff, ignoring `generatedAt`.

Anything that differs should be something you meant to change, and you should
be able to say why in the pull request. Live usage grows while you work, so
expect today's date and whichever project you are working in to move.

**If you change a panel's copy or shape, re-measure its loading skeleton.** The
skeletons reproduce each page at measured heights so nothing jumps when data
lands, and the measurements live in `ProviderMeta.skeleton`. Adding one
sentence to a subtitle has already invalidated one of them — see *Loading
skeletons* in `CLAUDE.md` for how to measure, including the iframe trick that
makes a width exact.

## Reporting a bug

Open an issue with the template. Please include the agent (Claude Code or
Codex), your OS, and what `npm run parse` printed — **with paths redacted**.

For anything that looks exploitable, use
[private vulnerability reporting](https://github.com/naimulnashid/ai-usage-tracker/security/advisories/new)
instead. [`SECURITY.md`](SECURITY.md) covers what is in scope and, just as
usefully, which things that look like findings are deliberate.

## What is likely to be accepted

- Bug fixes with a test, especially in a parser.
- Support for a transcript format change from either vendor — these are
  undocumented and internal, and they move.
- Reports that the dashboard works, or does not, on macOS and Linux. It is
  developed on Windows and only expected to work elsewhere.
- Accessibility fixes. Nothing here has been past a screen reader yet.

Large refactors and new dependencies are a harder sell: this is deliberately a
local-only tool with no database, no telemetry and no network calls, and that
constraint is the point rather than a limitation to be worked around.
