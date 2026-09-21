# CLAUDE.md — architecture and traps

Read this before changing a parser or a chart. It covers the data model and its
traps, which are the parts of this project you cannot infer from the code alone.
It is written for Claude Code sessions and for human contributors alike.

Personal, machine-specific notes (your own baselines, local workflow rules)
belong in `CLAUDE.local.md`, which is gitignored and loaded alongside this file.

## Privacy rules for anyone changing this repo

This tool reads transcripts full of real code and paths. Everything committed
here is public. So:

- **Never commit anything derived from real transcripts** — no fixtures, no
  sample JSONL, no exported reports, no screenshots of real usage. `*.jsonl`,
  `*.sqlite`, `data/` and `out/` are gitignored as a backstop, not a licence.
- **Never put real project names, paths, usernames or spend figures in code,
  comments, docs or commit messages.** Use placeholders (`My App`,
  `C--Users-you-Projects-my-app`) and proportions ("about 9%") instead. When a
  measurement matters, record the ratio, not the total.
- **Per-user configuration is local.** `config/settings.json`,
  `config/projects.json`, `config/codex-projects.json` and the contents of both
  project-logo folders are gitignored; their `*.example.json` templates and the
  folders' `.gitkeep` are what gets committed.

## What this is

A **local-only** Next.js dashboard that reads coding agents' own JSONL session
transcripts and reports token consumption, estimated cost, and approximate
runtime — globally, per project, and per day. No database, no deployment, no
outbound network calls from the app. Data is recomputed on demand when the user
hits Refresh.

It covers **two agents**, picked from the sidebar:

| Agent | Transcripts | Route | Accent | Cost figure |
|---|---|---|---|---|
| Claude Code | `~/.claude/projects/` | `/claude` | terracotta `#D97757` | an estimate at per-token rates |
| Codex | `~/.codex/sessions/` | `/codex` | teal-green `#10A37F` | **API-equivalent**, not necessarily a charge |

**That last column is the one thing not to blur.** Codex is commonly used
through a flat ChatGPT subscription, where tokens are not billed individually, so
its figure answers *"what would these tokens have cost through the OpenAI API"*
and nothing more. Do not present the two totals as comparable spend, and never
add them.

### The UI carries this in the label, not a banner

The Codex headline reads **"API-equivalent spend"** where Claude Code's reads
"Total estimated spend". That label is the entire in-app treatment — including on
the project detail page, which once hard-coded Claude Code's wording and silently
erased the distinction. Always use `provider.costLabel`.

There was once a standing notice under it. It was removed because it was a
**permanent, unchanging** statement about a documented design choice, not an
anomaly, and a permanent banner about a known thing trains readers to ignore
banners — the same call made for the output-token residue below.

That decision was made when the tool had a single user who knew their own
subscription. It is now public, so the audience argument no longer holds on its
own. If users report confusing the two figures, revisit the notice — as a
deliberate decision, not by quietly adding a banner back.

**Where the explanation must stay:** this section, the README's cost-figure
table and caveats, and the header comment in `config/codex-pricing.json`.

### How the two halves share one UI

Both parsers emit the **same `UsageReport`**, so every chart, table and card is
written once and neither knows which agent it is rendering.

- `src/lib/providers.ts` — the registry. Everything that differs and is not a
  number lives there: labels, transcript locations, config file names, which
  token columns exist, the wording of tooltips. Components read it through
  `useProvider()`. **No component may hard-code an agent's name or wording.**
- `src/app/(dash)/[provider]/` — one set of pages, an agent per route segment.
  An unknown segment 404s rather than falling back to Claude Code; showing one
  agent's numbers under another's name is the one failure that matters.
- **The rail answers "which agent", the top bar answers "which page".** That
  split is deliberate and was arrived at the hard way: page links briefly lived
  in the rail alongside the agents, and one flat column made switching agent
  look like changing page. Overview/Projects belong in the top bar. The rail's
  expand/collapse control is a hamburger at its **top** — next to what it
  opens, rather than stranded at the bottom where it reads as a setting.
- **Colours are CSS variables, not literals.** `--accent*` and the heat-map
  ramp `--hm-0..5` are redefined under `[data-provider='codex']`, so switching
  agent re-themes the charts with no React state involved. Recharts writes these
  straight into SVG attributes, where `var()` resolves normally. Nothing outside
  those two blocks in `globals.css` may hard-code an accent colour.

  **That includes inline `style={{}}` in the chart tooltips**, which is where it
  went wrong once: the stacked charts' "Total" row carried a literal `#d97757`,
  so Codex's tooltips ended in Claude Code's terracotta while everything around
  them was teal. Tooltips render inside `[data-provider]` like anything else, so
  `color: 'var(--accent)'` resolves there — a literal is never the shorter path,
  only the wrong one. Grep for `#d97757` before adding a chart.
- `src/lib/model-colors.ts` holds **one** table for both agents, which works
  only because their model strings cannot collide (`claude-*` vs `gpt-*` /
  `codex-*`). Each agent's block is ordered by its own price; the two never need
  to interleave.

The sidebar's expand/collapse state is restored by a tiny inline script in the
root layout (`src/lib/rail.ts`), which sets `data-rail` on `<html>` **before
first paint**. Do this from React instead and a collapsed rail mounts expanded
and visibly snaps shut on every page load.

## Tech stack

- Next.js (App Router) + TypeScript (`strict`)
- API route reads the JSONL files directly with Node `fs` — no DB, no cache layer
- Recharts **v3** for charts, plain tables for detail
- True-black OLED dark theme, one accent per agent, Geist fonts (self-hosted by
  the `geist` package, so no font requests leave the machine)

### Recharts v3 gotchas

- A custom tooltip renderer is typed `TooltipContentProps`, **not**
  `TooltipProps` — v3 split them, and `payload` lives on the former. Use the
  bare generic (`TooltipContentProps`); parameterising it as
  `TooltipContentProps<number, string>` will not match what `Tooltip` expects.
- Pass custom content as a **function** (`content={ChartTooltip}`), not an
  element (`content={<ChartTooltip />}`) — the element form demands every prop.
- Do **not** put any `overflow` rule on a chart wrapper. `ResponsiveContainer`
  already sizes to its parent, and setting one axis to `auto` forces the other
  to compute as `auto` too, producing scrollbars inside the chart panel. Only
  tables scroll (`.table-scroll`).

### Hidden overlays inside `.table-scroll`

`.info-tip::after` (the runtime explainer tooltips) is toggled with
`display: none` / `display: block`, **not** `opacity`. This is deliberate.

A box hidden with `opacity: 0` is still laid out, and an absolutely positioned
descendant still contributes to the scrollable width of an ancestor with
`overflow-x: auto`. Each tooltip is 290px wide, so the tables carrying them
gained ~1100px of phantom horizontal scroll across blank space — the table
itself measured exactly its container's width while `scrollWidth` read double.

Because a CSS transition cannot run from `display: none`, the fade is a
keyframe animation (`tipIn`) applied in the `:hover` / `:focus-visible` rule.

If you add any other absolutely positioned overlay inside a table — a popover,
a menu, a custom tooltip — it must not be laid out while hidden. Check with:

```js
const w = document.querySelector('.table-scroll');
w.scrollWidth - w.clientWidth; // should be 0 when the table fits
```

**That check is necessary and was not sufficient.** It measures the overlay
while it is HIDDEN, which is the state the `display` rule fixed — and the
tooltips then spent months broken in the state nobody measured. The first
browser pass found three more variants of this same bug, all of them live:

- **The bubble inherited `white-space: nowrap` from its `<th>`.** The rule
  resets `letter-spacing`, `text-transform`, `text-align` and `font-weight`,
  but not this — so the one tip that sits in a table header rendered its 290px
  box as a single **~1540px line**. The table gained 1540px of scroll width the
  moment you hovered it, and the explainer itself was clipped out of view. It
  now resets `white-space: normal` (1540px → 8px, measured).
- **`.sr-only` escaped the scroller entirely.** The `aria-describedby` target
  behind each tip is `position: absolute`, and `.table-scroll` was **not**
  positioned — so its containing block was the panel OUTSIDE the scroller, it
  was never clipped, and at 997px it sat at x=1150 against a 982px viewport.
  That put a horizontal scrollbar on the **whole document**, permanently, not
  just while hovering. Being 1px wide does not save you: what overflows is
  where the box IS, not how big it is. `.sr-only` now sets `left: 0; top: 0`.
- **The bubble was positioned at the tip's LAYOUT position.** In a table wider
  than its panel that position is out in the part you cannot see, so on a
  narrow shell the tooltip was drawn past the panel's right edge — invisible,
  and dragging 63px of page scroll with it. `.table-scroll` is now
  `position: relative`, which makes it the containing block for both of these,
  and a bubble inside a table hangs BELOW its tip (above would be outside the
  scroller's box, since the tips are in header cells) and anchors to its right
  edge in the last three columns.

So the invariant is stronger than the original check: **measure the page, not
just the table, and measure it with the overlay SHOWN.**

```js
// With every bubble forced visible - the state a hover produces.
const s = document.createElement('style');
s.textContent = '.info-tip::after { display: block !important; }';
document.head.appendChild(s);
const d = document.documentElement;
[d.scrollWidth - d.clientWidth, // 0: nothing may scroll the PAGE
 ...[...document.querySelectorAll('.table-scroll')]
   .map((w) => w.offsetWidth - w.clientWidth)]; // 0 each: no vertical scrollbar
s.remove();
```

Two things that are NOT expected to be 0 here, so do not chase them:

- **A table's own `scrollWidth - clientWidth`.** These tables carry a
  `min-width: 760px` and scroll horizontally by design on a narrow shell.
- **A table's `scrollHeight - clientHeight`.** `.table-scroll` now pins
  `overflow-y: hidden`, so a bubble that outgrows a short table is clipped
  rather than scrolled - the overflow is still *reported*, but no scrollbar is
  rendered, which is why the check above measures `offsetWidth` instead. Codex's
  two-model token table clips 2px of one bubble this way. Without the pin,
  `overflow-x: auto` forces the vertical axis to `auto` and those 2px become a
  scrollbar that appears on hover.

Note the transform in `tipIn` reads `--tip-x` rather than hard-coding
`translateX(-50%)`, so a right-anchored bubble does not slide 145px sideways
for the length of its own entry animation.

### The top bar has to be allowed to shrink

Same family, and the one that had nothing to do with a table. A flex item
defaults to `min-width: auto`, so it refuses to shrink below its content: at
997px with the rail expanded the shell is 730px and the bar wanted 766px, so it
pushed **Refresh 36px past the viewport edge** and wrapped "Sign out" onto two
lines. `.topbar-inner` and `.topbar-spacer` now carry `min-width: 0`, and
`.refresh-meta` ellipsises — the status line is what gives way, because the two
controls are the point of the bar and the timestamp is not.

Collapsing the rail hides it entirely, and 997px is a width this project
measures at constantly — but the skeleton recipe walks `main.shell`'s children
and never looks at the bar above them. Chrome that every page shares is exactly
what a per-page measurement misses.

### Hover transforms need a gutter

Same family of bug, another variant. `.heatmap-cell:hover` scales the square, and
the heat map's columns are `1fr` — so the grid fills its container exactly and a
cell in the last column scaled straight past the edge, raising a scrollbar on
hover. `.heatmap-scroll` therefore carries padding sized as a gutter for that
growth, and the two are coupled: **the gutter must stay at least half the
cell's hover growth** (`cell x (scale - 1) / 2`). Raising the scale means
widening the padding.

Note this bites on *both* axes: `overflow-x: auto` forces `overflow-y` to
compute as `auto` too, so the top row can raise a vertical scrollbar the same
way.

Verify by simulating the hover rather than trusting the eye:

```js
const s = document.querySelector('.heatmap-scroll');
const c = document.querySelectorAll('.heatmap-cell')[181]; // last column
c.style.transform = 'scale(1.14)';
[s.scrollWidth - s.clientWidth, s.scrollHeight - s.clientHeight]; // both 0
c.style.transform = '';
```

### Loading skeletons mirror the real sections, and must stay that way

All three skeletons reproduce their page section by section, in order, at
measured heights. They are not decorative grey boxes: their job is that nothing
moves when the data lands.

**The measurements are per agent, in `ProviderMeta.skeleton`.** A single shared
set is wrong for at least one of them, because the two pages are genuinely
different shapes: with typical usage Codex has two models to Claude Code's five
(a one-row stat grid against a three-row one at 997px) and a token table ~150px
shorter.

Three rules keep them honest:

- **Grids use the real class and the real cell count** (`stat-grid` with the
  agent's model count, `score-grid` with twelve, inside a `.score-grid-wrap`), so
  they re-flow exactly as the real grid does at every width. A hand-tuned cell
  count matches at one window size and is wrong at every other — and dropping
  the wrapper is the same mistake by another route, since `.score-grid` steps
  its columns on a **container** query and without a container it never steps.
- **Anything width-sensitive carries the mid-range of two measurements**, at
  997px and 1680px viewport, so the error is split rather than piled on one end.
  The score *card* height is the one that has stopped needing it, which is worth
  knowing before you re-derive it. It used to move a great deal — five fixed
  columns meant a ~130px card at a narrow shell with every label wrapped, taking
  it to ~200px, and treating 130 as constant left the skeleton 151px short at
  997px. Now a card is a flat 128px at every width and the only thing that moves
  is the ROW COUNT, which the skeleton follows for free by reusing the class.
  Both agents carry the same 129: the four-column grid gives Top model a 303px
  box (326px at two columns), wide enough that current model names don't wrap.
  A much longer model name would bring the difference back.

  **That flatness is a constraint on new cards, not a property to rely on.** The
  two record cards name a project, which can easily be long enough to wrap a
  sub-label and put one card a line taller than its row — so they clip that line
  instead (`.score-sub-clip`) and carry the full text on the card's `title`. A
  card that must wrap needs its own measurement, not a shared constant. The same
  test applies to the label icons: 15px inside a ~19px line box adds nothing to
  the card, and a larger one would.
- **Re-measure both agents at both widths** if a panel changes shape.

Measured after the `auto-fit` score grid, skeleton minus real:

| | above the fold | worst (page bottom) | total height |
|---|---|---|---|
| Claude 997px | −37px | −68px | −0.34% |
| Claude 1680px | +36px | +65px | +0.29% |
| Codex 997px | −49px | −104px | −0.70% |
| Codex 1680px | +48px | +100px | +0.62% |

The bottom-of-page column was ±127px / ±170px under the fixed five-column grid;
the flat card height is what shrank it.

**Re-measured when the overview gained a second stacked chart** — "Daily spend
by model", directly under the tokens one. It has its own skeleton entry
(`dailySpendByModel`) rather than reusing `dailyTokens`, because the two are the
same shape but not the same height:

| | 997px | 1680px | entry |
|---|---|---|---|
| Claude, tokens | 671 | 647 | `dailyTokens: 659` |
| Claude, spend | 671 | 647 | `dailySpendByModel: 659` |
| Codex, tokens | 603 | 553 | `dailyTokens: 578` |
| Codex, spend | **577** | 553 | `dailySpendByModel: 565` |

The one cell that differs is the interesting one. The spend legend drops the
`in · out · cached` column, and at 997px that column is exactly what pushes a
Codex legend row onto a second line — Codex has two long model labels where
Claude Code has five short ones. One shared constant would have been 26px wrong
for Codex and right for nobody.

**Re-measured twice for the score grid.** First for twelve score cards rather
than ten, then again when the grid became four fixed columns. Both agents
measure **840px in six rows at 997px and 415px in three rows at 1680px**, so both
take `scoreCard: 129` — +4px at 997px, exact at 1680px.

**The score grid is the one grid that is NOT `auto-fit`.** It is read as three
rows of four — what was run, what it consumed, when — and a column count that
drifted with the window would scramble that grouping, so it steps 4 → 2 → 1 to
keep whole rows together. The steps are **container queries** on
`.score-grid-wrap`, not viewport media queries, because the rail takes 252px out
of the page expanded and 70px collapsed: a viewport query would be wrong by
182px depending on a state it cannot see. Everything else in the dashboard is
still `auto-fit`, and should stay that way.

Note the real page still renders an **empty notices wrapper** at index 1 (it
holds the unpriced-model warning, which is usually absent). It is zero-height
for both agents, and the skeleton has no slot for it — so when comparing
offsets, drop that entry from the real list or everything below it looks
shifted by one.

The near-perfect mirroring between the two widths is the point: it says the
mid-range is centred. If one width's column grows while the other's shrinks, a
constant has drifted rather than the window having changed.

**The rail changed all of these.** It takes 252px out of the viewport, so at
997px the shell went from ~961px to 730px. Nothing measured before the rail
existed is comparable.

These heights depend on how many models and projects the measuring machine had.
Re-measure against your own data when a panel changes shape, and expect a few
pixels of drift on very different data.

Check it by mounting the skeleton markup under the real CSS, or by catching the
loading state directly:

```js
// Compare el.offsetTop, not getBoundingClientRect().top: the `rise` entry
// animation holds a translateY(14px) that rect-based measurements pick up.
[...document.querySelector('main.shell').firstElementChild.children]
  .map((el) => [el.className, el.offsetTop, Math.round(el.getBoundingClientRect().height)]);
```

**Catching it is easier than mounting it, and an iframe is how.** (This is why
the CSP sets `frame-ancestors 'self'` rather than `'none'` — see *Security
headers*. If framing the app ever stops working, check there first.) Load the
page in an `<iframe>` sized to the width you are measuring — the iframe's own
viewport drives the media queries, so 997px and 1680px are exact rather than
approximated by a resized window — and poll every 40ms for the skeleton and
again for the real page. One script then measures every project at every width
with no window resizing at all. `[aria-busy="true"]` on the wrapper is what
tells the two states apart.

Two things to know before trying it:

- **Refresh does not show a skeleton.** `UsageProvider` keeps the stale report
  on screen while it refetches, so the skeleton only appears on a COLD load.
  Clicking Refresh to make one appear will simply not work.
- **Each load is a full parse.** Every iframe re-reads every transcript, so a
  sweep of six projects is six parses. Run them in sequence, not at once.

**The project detail page is measured too, and it is the odd one out.** Three of
its panels depend on the PROJECT rather than the agent — a project uses some
subset of the models the agent has, and the stat grid, both stacked charts and
the token table each grow a row per model. So `SkeletonMetrics.detail` carries
the mean across every project measured at both widths, which is a weaker
guarantee than the overview's and is documented as such in the type. Reusing the
overview's numbers there, which is what it used to do, meant the agent-wide
model count: at 997px five cells wrapped to three rows where a four-model
project takes two, 166px of error from that one constant.

Measured after the fix, on a four-model project, skeleton minus real:

| | above the first capped table | stat grid | worst panel |
|---|---|---|---|
| Claude 997px | −2 to −42px | **+1px** | −43px |
| Claude 1680px | −2 to +46px | **0px** | −31px |

Everything below the first capped table still shifts, and always will: those two
tables' heights follow the number of days and sessions, which a skeleton cannot
know. `sessionsTable` is NOT one of them — it shows twelve rows before its
show-more, so it is a constant, and measuring it took it from 620 to 868.

**A caution about measuring this in browser automation.** If the pane is not
displayed, `document.visibilityState` is `hidden` and CSS animations stall at
`currentTime: 0` — so every `.rise` element sits at its opening
`translateY(14px)` forever, and rect-based tops read 14px low. That is the
harness, not a layout bug: `offsetTop` agrees exactly.

A hidden pane also stops `requestAnimationFrame` firing at all, so a probe that
waits on a double rAF before measuring simply never returns. Use `setTimeout`
in measuring scripts; it keeps running either way.

**The same caution applies to anything transitioned.** The rail animates its
width over 220ms and `.rail-item` its colour over 180ms, so a measurement taken
in the same tick as the change reads the *start* of the animation, not the end.
Two real examples while building this: the rail appeared not to collapse at all
(still 252px), and the Codex accent appeared not to reach the sidebar (still
terracotta). Both were correct; both probes were simply too early. Wait ~400ms
before reading, or read the custom property rather than the rendered value.

## Layout

```
config/pricing.json                  Claude Code rate card (USD per MILLION tokens). Committed.
config/codex-pricing.json            Codex rate card, plus model aliases. Same shape. Committed.
config/settings.example.json         Template -> settings.json (local): day offset, week start, idle cutoff.
config/projects.example.json         Template -> projects.json (local): merges, display names.
config/codex-projects.example.json   Template -> codex-projects.json (local): the same for Codex.
src/lib/types.ts                     Shared types. BOTH parsers emit this shape.
src/lib/providers.ts                 The two-agent registry. Client-safe: no `node:` imports.
src/lib/pricing.ts                   Loads config and settings, computes cost. Fails soft to "unpriced".
src/lib/parser.ts                    CLAUDE CODE CORE. Scan -> parse -> de-duplicate -> aggregate.
src/lib/codex-parser.ts              CODEX CORE. Same output, completely different traps.
src/lib/usage-math.ts                The arithmetic BOTH parsers do, once. Cells, buckets, daily rollup.
src/lib/history.ts                   Daily archive. One file per agent, keyed off report.provider.
src/lib/auth.ts                      Password gate: session cookie signing. Web Crypto only.
src/lib/rail.ts                      Sidebar state + the before-paint init script.
src/middleware.ts                    The single auth gate in front of every route.
scripts/dump-usage.ts                CLI: `npm run parse`.       -> out/usage-report.json
scripts/dump-codex-usage.ts          CLI: `npm run parse:codex`. -> out/codex-usage-report.json
scripts/report-console.ts            The two dump scripts' shared printing. Output is a baseline - keep it byte-identical.
scripts/run-tests.mjs                CLI: `npm test`. Discovers tests/*.test.ts.
scripts/make-demo-data.ts            CLI: `npm run demo:data`. Synthetic transcripts for both agents.
tests/                               node:test suites; fixtures are written at run time.
scripts/*.ps1, *.vbs, *.bat          Windows background service and launchers.
src/app/(dash)/[provider]/           The pages. One copy, two agents.
src/components/ScoreIcon.tsx         The twelve Activity card icons. Hand-drawn; the rules
                                     that keep them a set are in the file's header.
src/lib/project-logos.ts             Name -> logo-file matching. Client-safe.
src/components/ProjectLogo.tsx       The mark beside a project name, or its monogram.
src/app/api/project-logos/[provider]/  Lists that agent's logo folder.
src/app/icon.svg                     Tab icon only. SVG-only, on purpose - see below.
public/agent-marks/                  The vendors' official marks for the sidebar. Unmodified.
public/claude_code_project_logos/    One image per project, named after it. Contents gitignored.
public/codex_project_logos/          The same, for Codex. Per agent, never shared.
```

## Claude Code's data model, and the four traps

Claude Code writes one JSONL file per session to
`~/.claude/projects/<encoded-project-path>/<session-id>.jsonl`,
one JSON object per line. Token usage lives on `type: "assistant"` lines under
`message.usage`.

**This schema is undocumented and internal. It changes between Claude Code
versions.** The parser must always degrade rather than crash: skip unparseable
lines, skip unreadable files, record a warning, keep going. Never assume a field
exists. (Known gaps against this rule are listed under *Known issues* below.)

### Trap 1 — the same message is written many times (~49% of lines)

This is the single most important thing in this codebase. Counting every
assistant line inflates tokens and cost by **~89%** on the reference data. Two
distinct mechanisms:

1. **Streaming partials** — Claude Code writes one line per streaming update
   within a single assistant response. Same `message.id`, same `requestId`,
   several lines, each with a *different* (growing) `output_tokens`.
2. **Session replay** — resuming or forking a session copies the earlier
   conversation into the new session's `.jsonl`. The same messages then appear
   in two or more files, sometimes across different project directories.

**Fix:** de-duplicate globally on `(message.id, requestId)` across *all* files,
not per file. See `canonical` / `countedKeys` in `parser.ts`.

**This is what costs the memory, and it is not avoidable in one pass.** Global
de-duplication means no line can be attributed until every file's keys are
known, so the parser holds one small record per timestamped line across two
passes. Measured on real data: **158 MB peak heap for 155,000 lines**, about a
kilobyte a line, and Codex is similar. Node's default heap gives that somewhere
between ten and twenty times' headroom, which at ~20 MB of transcripts a day is
years — and the archive means old transcripts can be deleted without losing the
history, so the working set has a natural ceiling.

If it ever does matter, the fix is two passes over the FILES rather than one
pass holding everything: read once to build `canonical`, read again to
attribute. That trades the memory for reading every transcript twice. Do not
reach for a cache instead — "recomputed on demand, no cache layer" is a
documented property of this app, and a stale cache would report numbers that
were true a minute ago, which is worse than a slow parse.

### Trap 2 — `output_tokens` placeholders are recoverable

There is a known Claude Code limitation where `output_tokens` is recorded as a
small placeholder (often 1–4) while `input_tokens` and the cache counters stay
accurate. It is widely described as unrecoverable. **In practice it is mostly
recoverable**: the low values are the *early streaming partials*, and the final
line for that `message.id` carries the true value.

**Fix:** when de-duplicating, keep the record with the **maximum**
`output_tokens` for each key. On the reference data this recovered a few hundred
messages; afterwards about 0.2% of messages still looked wrong.

### The residue is real but immaterial — do not surface it

The remaining messages were investigated rather than assumed:

- **They are genuinely wrong, not false positives.** Nearly all carry real
  content logged as `output_tokens: 2` — thinking blocks thousands of characters
  long. Only a couple were legitimately empty.
- **Almost all are one narrow case:** Claude Sonnet 5 `thinking` blocks. It
  looks like a specific logging path that never writes output accounting back.
- **Correcting every one of them would move the total by under a thousandth of
  a percent.** The affected messages are thinking blocks on the cheapest model
  in the data.

**The UI therefore shows no warning, flag or disclaimer about this.** That was a
deliberate call, not an oversight. Rationale:

- The only *accurate* correction is Anthropic's `count_tokens` endpoint, which
  would mean sending transcript content — real code from the user's projects —
  off the machine. That breaks the local-only, read-only premise of this tool
  for a negligible amount.
- A local `chars / 4` estimate is possible but would replace a known-tiny error
  with an unknown-sized one, dressed up as precision. There is no accurate
  public Claude tokenizer (`tiktoken` is OpenAI's and wrong here).
- A permanent scary-sounding banner about a rounding error trains the reader to
  ignore banners, which costs more than the error does.

**Detection stays in the parser.** `SessionSummary.possiblyInaccurateOutput` and
`suspiciousMessageCount` are still computed and still present in the API
response and `npm run parse` output, with thresholds in settings. That is how
you would notice if Claude Code's logging changed and this stopped being
immaterial. Re-run the impact check before re-adding any UI for it.

### Trap 3 — subagent transcripts are nested

Subagent sessions live at
`<project>/<session-id>/subagents/agent-*.jsonl`. A non-recursive scan misses
them entirely. On the reference data they were real, separately billed usage
with **zero** overlap against the top-level files. `discoverFiles()` recurses;
keep it that way.

### Trap 4 — cache writes are split by TTL and priced differently

Prefer `usage.cache_creation.ephemeral_5m_input_tokens` /
`ephemeral_1h_input_tokens`. The older flat `cache_creation_input_tokens` has no
TTL split; when only that is present, assume the 5m rate (5m is the default TTL;
1h must be explicitly requested). The nested object was present on every
assistant entry in the reference data, so the flat path is a legacy fallback,
not the common case.

## Transcript retention, and why there is a local archive

**Claude Code deletes its own transcripts.** `cleanupPeriodDays` in
`~/.claude/settings.json` controls it. This app derives *everything* from those
files, so a deleted transcript silently removes a day from the charts and
shrinks the all-time totals — and nothing distinguishes "no work that day" from
"that transcript is gone". A falling grand total reads as reduced spend.

Measured with the setting unset (default retention):

| Check | Result |
|---|---|
| Top-level session files older than 30 days | **0** |
| Files older than 30 days overall | 1 |
| That survivor | a **nested subagent** transcript |

The cutoff landed exactly on 30 days. The one survivor being a
`<session-id>/subagents/agent-*.jsonl` strongly suggests **Claude Code's cleanup
does not recurse into `subagents/`** — the same blind spot Trap 3 describes for
scanning. Subagent transcripts appear to accumulate indefinitely.

Raising `cleanupPeriodDays` (for example to 365) keeps transcripts longer at the
cost of disk: heavy use can write tens of MB a day.

**The loss can already be masked, which is the trap.** Data can still reach back
weeks before the oldest top-level file, because session replay (Trap 1) copied
that old history into newer files. That is luck, not design: it holds only
while those session chains keep being resumed.

### The archive (`src/lib/history.ts`)

Every parse folds the day's aggregates into a gitignored archive, then rebuilds
the report from it. Once a day is recorded it survives its transcript being
deleted.

**One archive per agent**, chosen from `report.provider`: `data/history.json`
for Claude Code, `data/codex-history.json` for Codex. Merging them would be
actively wrong — the two have separate project id spaces and separate rate
cards, so a shared file would collide ids and add incomparable dollars.

Codex prunes its own `sessions/` tree too, so the same reasoning applies there.

- **Numbers only** — tokens, cost, runtime, project ids, display names and
  paths. No message content, nothing read out of a transcript body.
- **The merge is one-directional on purpose.** A day is overwritten only when
  the fresh parse has **at least as many messages**. Today's numbers grow and
  must overwrite; a day whose transcripts were partly deleted comes back
  *thinner* and must not be allowed to overwrite the fuller record. Verified:
  feeding a day back with `messages: 1` left the stored count untouched.
- **Fails soft** at the top level. A missing, unreadable, or corrupt archive
  yields an empty one plus a warning — never an exception. (Individual day
  entries are not yet shape-checked; see *Known issues*.)
- **Not archived:** the hour histogram and session lists, which cannot be
  rebuilt from daily aggregates. Peak hour, session counts and the two session
  records (`activity.peakSession` / `longestSession`, behind the Peak tokens and
  Longest chat cards) therefore still reflect live transcripts only — a record
  set by a transcript the agent has since deleted passes to whatever is left. A
  project surviving *only* in the archive shows its totals with an empty session
  table.

Verified by simulating deletion — thinning a real report from dozens of live
days to a handful restored every day and reproduced the total to the cent, with
`coverage.archivedOnlyDays` reporting the difference.

`report.coverage` carries the span, and the Overview headline states it (e.g.
`Jul 4 – Aug 19`) with an "N archived" badge once the archive is holding days
the transcripts no longer have. That badge is the signal that this mechanism has
started doing real work.

## Codex's data model, and its five traps

Nothing about Claude Code's parser transfers. Codex accounts for tokens in a
fundamentally different way, and every one of the traps below was measured
against real rollout files rather than assumed.

Codex writes one JSONL "rollout" file per thread to
`$CODEX_HOME/sessions/YYYY/MM/DD/rollout-<local-time>-<thread-id>.jsonl`
(`CODEX_HOME` defaults to `~/.codex`). Note the **filename carries LOCAL time
while every `timestamp` inside is UTC** — on a UTC+2 machine, a file named
`T10-00-00` opens with a timestamp of `08:00:00Z`.

Usage lives on `event_msg` lines with `payload.type == "token_count"`.

### Trap 1 — usage is CUMULATIVE, and the running total gets repeated

Each `token_count` carries both a `total_token_usage` (running total for the
whole file) and a `last_token_usage` (that turn alone). **Summing
`last_token_usage` overcounts**: Codex sometimes emits the same reading twice,
and the repeat carries a full, non-zero `last_token_usage` while
`total_token_usage` does not move.

Treat `total_token_usage` as authoritative and take per-turn usage as its
**delta**, which makes a repeat contribute zero automatically.

On the reference data the naive `last_token_usage` sum ran about 0.4% high. The
delta method reproduced the sum of each file's final `total_token_usage`
exactly, and the gap was entirely repeated readings (just under 1% of events).

`last_token_usage` is still read, as an independent check: when a counted
delta disagrees with the turn Codex reported for itself, the file is counted in
`diagnostics.reconcileFailures`. Every reference file reconciled. **That counter
is how you find out this schema has moved** — watch it rather than the totals.

### Trap 2 — `input_tokens` already INCLUDES the cached tokens

OpenAI reports `input_tokens` as the whole prompt and `cached_input_tokens` as
the part of it served from cache. Pricing them as two independent buckets bills
the cached portion twice — and cache hits are typically **~98%** of the prompt,
so this is not a rounding error. `UsageCell.input` therefore carries only
`input_tokens - cached_input_tokens`, and `cacheRead` carries the cached part.

A consequence worth knowing when reading the UI: Codex's Input column looks
tiny next to its Cached column — often a fiftieth of it. That is correct.

### Trap 3 — `reasoning_output_tokens` is INSIDE `output_tokens`

Reasoning tokens are billed as output and are already counted in it. They ride
along as `TokenCounts.reasoning` for display and are deliberately excluded from
`totalTokens` and from `costOf`. **Do not add them to a total.** This is why the
Codex token table's columns do not sum to its total, and why that column carries
an explainer.

### Trap 4 — auto-review threads are separate files, and are real spend

Codex spawns a "guardian" subagent to vet its own planned actions and writes it
to its own rollout file, with `thread_source: "subagent"` and model
`codex-auto-review`. On the reference data that was **most of the rollout files
and roughly 9% of the cost** — none of which the user asked for directly.

They are counted, and kept as **their own model band** rather than folded into
the main model, which is the useful view. `config/codex-pricing.json` aliases
`codex-auto-review` to `gpt-5.3-codex` for pricing only, so the rate is right
while the identity survives into the charts.

### Trap 5 — the model is a state, not a per-event field

`token_count` events carry no model. It comes from the most recent
`turn_context`, which Codex writes **only when the context changes** — a handful
of `turn_context` lines against hundreds of `token_count` lines in a typical
file. So the model must be tracked as running state across the file. Verified
that no `token_count` ever precedes the first `turn_context` in the reference
data, so nothing falls into `(unknown)`.

Same for `cwd`: projects are attributed per event from the current
`turn_context`/`session_meta`, not once per file.

### Regression baselines

`npm run parse:codex` prints the numbers worth watching after a parser change:
files scanned, lines read and unparseable, `token_count` events, repeats
skipped, reconciled files and reconcile failures, counter resets. Keep your own
baseline in `CLAUDE.local.md` — it is your data, so it does not belong here —
and if a change moves it, understand why first. `reconcileFailures` should stay
at 0.

### Two things Codex does NOT have

- **No streaming-partial output placeholder.** Claude Code's Trap 2 (recovering
  `output_tokens` from a later line) has no analogue: the counters are
  cumulative and self-checking. `possiblyInaccurateOutput` is therefore always
  false for Codex, and is left meaning what it means rather than repurposed.
- **No cache-write rate.** `cache_write_input_tokens` exists in the schema but
  has been 0 on every event observed, and OpenAI's rate card has no line for it.
  Both `cacheWrite` rates are 0 and the UI hides the column
  (`ProviderMeta.hasCacheWrites`) — a permanent stripe of zeroes reads as "we
  measured nothing" rather than "this does not exist here".

### Codex pricing caveats

- Rates in `config/codex-pricing.json` are OpenAI's **regular API** rates at
  standard speed. **Fast/priority mode roughly doubles them and Codex does not
  record which mode a turn ran in**, so heavy fast-mode use would run higher
  than shown. This is stated in the config file, not hidden in code.
- Codex thread names come from `~/.codex/session_index.jsonl` and are shown in
  the sessions table. That file is read for `id` and `thread_name` only —
  nothing out of a transcript body, same rule as everywhere else.

### The two record cards count CHATS, not transcripts

"Peak tokens" and "Longest chat" run over chats, which is not the same set as
`sessions`. A subagent transcript — Claude Code's Task subagents, Codex's
guardian auto-reviews — is separately billed work and belongs in the totals and
in the Sessions count, but it is **not a conversation**, and a card that says
"Longest chat" must not be able to name one.

So `computeSessionRecords` folds each transcript into its parent
(`SessionSummary.parentSessionId`: `parent_thread_id` from Codex's
`session_meta`, the path segment before `subagents/` for Claude Code) and then:

- **tokens and cost are summed** across the chat and everything it spawned,
  because that is what the chat cost;
- **runtime is the parent's own, never the sum.** A subagent runs *inside* the
  parent's wall clock, so adding it counts the same minutes twice — a guardian
  running for hours alongside its parent would nearly double the reported
  length of the chat.

An orphan — a subagent whose parent transcript is gone — stands as its own chat
rather than being dropped, on the usual reasoning: report what is on disk.

Nothing else changed. Every total, chart and table still counts each transcript
once, on its own.

## Cross-check against the Codex app's stats screen

The Codex desktop app has its own stats strip. It was compared against this
dashboard because two cards looked wrong; the conclusion is that **our
arithmetic is right and the app is measuring different things**. It is written
down so the comparison is not re-run from scratch.

| Card | Same thing as ours? |
|---|---|
| Lifetime tokens | **Yes** — the figures agree |
| Peak tokens | No — and the app's value could not be reproduced |
| Longest chat | No — the app shows the longest *turn* |
| Current / longest streak | No — the app's cover a recent window |

**Longest chat: the app is showing the longest TURN.** Codex's local
`thread_history_*.sqlite` has a `thread_turns` table with a `duration_ms` per
turn; its maximum matched the app's figure to the displayed minute. That table
held only a few days of turns, not all history — which also explains the
streaks, since a streak over a short window is capped by the window. Ours is the
longest **chat** by active runtime, over every transcript on disk. Different
quantity, different window; do not "fix" one to the other.

**Peak tokens: Codex's own database disagrees with the app.** `state_*.sqlite`'s
`threads.tokens_used` summed to *less* than both the app's lifetime figure and
ours. The gap was one thread whose running total **reset mid-file** (a context
reset / compaction): `tokens_used` stores only the last reading, so Codex forgets
everything before the reset. We sum across it, and it is our figure the app's
lifetime number agrees with, not its own table's.

The app's peak could not be reproduced from the rollout files by any grouping
tried — largest thread, largest chat, naive `last_token_usage` sums, largest
calendar day at every UTC offset, largest rolling 24h window. Given "Longest
chat" is provably a partial-window figure, the likeliest explanation is that
this card is too — possibly server-side, counting requests that never reach a
rollout file. **Re-derive before changing anything here; do not chase the
number.**

## Cross-check against the Claude Code app

The Claude Code app has its own usage screen. **Do not "fix" our numbers to match
its token counts** — the divergence is understood and deliberate.

**Matches exactly** (these validate the parsing, including the day bucketing at
the configured offset): top-level session count (we additionally report subagent
transcripts), active days, current and longest streak, peak hour, top model.

**Differs, for two independent reasons:**

1. **The app does not de-duplicate.** Its per-model figures matched our *raw*
   (undeduplicated) sums to three significant figures for every model, with an
   identical total. Ours are ~2.5x lower because streaming partials and replayed
   session history are collapsed. See Trap 1.
2. **The app counts input + output only.** It excludes cache reads and writes
   entirely. Cache reads are usually by far the largest bucket and where most of
   the actual spend lives, so its "total tokens" is an activity measure, not a
   cost proxy.

Its "Messages" counts raw assistant + user lines; ours counts de-duplicated
assistant messages only.

## Model colours encode price

`src/lib/model-colors.ts` maps each model to a shade of its agent's accent,
**darker = more expensive**. The shade is the encoding, not decoration: a dark
band low in a stacked chart is premium spend.

The `SHADES` table must stay ordered by price, and `byPriceDesc` breaks
same-price ties (the whole Opus family is $25) on that table's order so the
visual order always matches the colour order. Nothing enforces monotonicity
automatically — if you add a model or the rate card changes materially,
re-check that luminance still rises as price falls.

### A legend's figures must share the share's denominator

The two stacked charts each carry a legend ending in a percentage, and the rule
is that the number immediately left of that percentage is denominated in the
same thing the percentage is:

| Chart | Legend row | Share is of |
|---|---|---|
| Daily tokens by model | name · in/out/cached · **total tokens** · % | all tokens |
| Daily spend by model | name · **cost** · % | all spend |

This is not fussiness. The tokens legend used to end with a dollar figure beside
a percentage that was a share of *tokens*, not of dollars — and the two are far
apart, because the cheap models carry a lot of tokens. Read together they said
something false. The spend legend carries no token counts for the same reason.

`.model-legend-total` and `.model-legend-cost` are one rule with two names, so
the markup does not describe a token count as a cost. `.model-legend-compact`
drops the middle column for the spend legend while keeping the share in the same
62px gutter, so the two legends line up when stacked.

### The projects page opens with a share-of-spend donut

`ProjectShareChart` — a ring with its legend beside it, above the ranked list.
It exists because the list alone cannot answer one question: a dozen rows look
exactly the same whether the top project is 61% of spend or 15%.

- **Only the top nine get a slice; the rest are summed into "Others".** Past
  that the ring is mostly slivers a degree or two wide — unreadable,
  unhoverable, and they crowd the legend without adding what a 0.6% share was
  going to tell you. Shares are still taken against the WHOLE total, so the
  slices add to 100% and nothing is dropped. The ranked list below still
  enumerates every project; this panel is the summary, not the record.

  The collapse is skipped at exactly ten projects, where "Others" would stand
  for one project — hiding its name behind a euphemism and saving no room. So
  the legend is never more than ten rows, which is what `projectDonut` is
  measured against.

  The donut's centre label counts `ranked`, not the slices. "across 10
  projects" under a total covering twelve is the obvious way to get this wrong.
- **Slice colour encodes RANK, not identity.** A model's shade means its price
  (see above); a project has no equivalent fact, so the ramp is positional —
  the largest project takes the accent at full strength and each one below is
  mixed further back toward the panel. `color-mix(in srgb, var(--accent) N%,
  var(--surface))`, so it re-themes with the agent like everything else, and
  verified to resolve in an SVG `fill` attribute rather than being assumed.

  **"Others" sits outside that ramp, in a neutral grey**, because the ramp
  means rank and a remainder has no rank — its summed cost can exceed the slice
  above it, which would make a fainter colour read as a lie. Its legend row
  carries a `+N` count where a logo would go: a monogram there would draw "O"
  and read as a project called Others.
- **The legend is CSS multi-column, and the flow is the point.** A grid fills
  row by row, which puts ranks 1 and 2 side by side and reads across; columns
  fill top to bottom, so the left column is the top half of the ranking in
  order — the same order as the list below, which is what the panel's own
  subtitle promises.
- **Hovering a slice fades every other slice AND its legend row.** The pairing
  is the point — a ring of ten slivers is hard to map onto a two-column legend,
  and dimming both ends of the link does it without a connector line.

  It is React state (`active`, a slice id), not Recharts' own `activeIndex`,
  because the legend has to move in step and the chart cannot reach it. The
  `useState` sits *above* the empty-data early return, or the hook order
  changes between renders; the two mouse handlers sit below it as plain
  functions, since they close over `data`, which is built after that return.

  The fade is `fillOpacity` on each `<Cell>` — the panel is near-black, so
  fading toward it *is* "darker", and it costs nothing next to an SVG filter on
  ten sectors. CSS only animates it (`.donut-ring .recharts-sector`); the value
  itself comes from React, so the two ends stay in step by construction.
- **The donut's tooltip needs `z-index`.** `.donut-center` (the total in the
  hole) is absolutely positioned and later in the DOM than the chart, so
  without a stacking rule it paints *over* the hovered slice's tooltip and the
  two sets of numbers overlap.

**A fourth variant of the scrollbar bug, and the nastiest so far.** The legend
was first capped with `max-height` + `overflow-y: auto`, on the assumption that
too many projects would scroll. A multi-column box does not work that way: it
does not scroll its overflow down, it **fragments sideways**, laying the
remainder out in further columns past its right edge. A dozen projects put a
legend row hundreds of pixels past the document's right edge, raised a
horizontal scrollbar on the whole page, and stretched the top bar with it.

So the legend carries no height cap at all. It is as tall as it needs to be and
the panel follows — which is exactly why `skeleton.projectDonut` had to become a
per-agent measurement. The ten-row cap keeps that height bounded by construction
rather than by CSS, which is the safe way round.

**Do not add `max-height` to a multi-column element.** If a legend like this
ever genuinely needs to be bounded, bound the number of ITEMS, not the height.

### The favicon is SVG-only, deliberately

`src/app/icon.svg` is the tab icon. Next's App Router auto-detects that
filename and injects `<link rel="icon" type="image/svg+xml">` with a content
hash — `layout.tsx` says nothing about it. Renaming the file is the only thing
that can break the wiring.

The three bars are shaded by the rule above (**darker = more expensive**), so
the icon encodes the same thing the charts do. The login page also renders it as
a plain `<img src="/icon.svg">`, so a rename breaks that too.

**The bar geometry is a legibility constraint, not taste.** Browsers scale this
to 16px in the tab strip. The first draft used 5-unit bars with 2.5-unit gaps,
which rasterised to ~2px bars whose gaps never reached black — sampling a
16px raster gave gap columns at luminance 35-48 against 138 peaks, so the mark
smeared into one block. Bars are now **6 units wide with 3-unit gaps**, which
lands on ~3px bars and gaps that rasterise to a true 0. Keep those proportions
if you redraw it, and re-check rather than eyeballing:

```js
// In the page, against the dev server.
const img = new Image(); img.src = '/icon.svg?probe=' + Date.now();
await img.decode();
const c = document.createElement('canvas'); c.width = c.height = 16;
const g = c.getContext('2d'); g.drawImage(img, 0, 0, 16, 16);
const d = g.getImageData(0, 0, 16, 16).data;
// Row 12 crosses all three bars; gap columns should read 0, not "dark-ish".
Array.from({length: 16}, (_, x) => { const i = (12*16+x)*4;
  return Math.round(0.2126*d[i] + 0.7152*d[i+1] + 0.0722*d[i+2]); });
```

**There is no `.ico` fallback, and that is a choice.** SVG favicons are
unsupported by Safari before 17 and by IE; those browsers ignore the link and
fall back to the default icon. That was judged not worth a committed binary no
one would remember to regenerate when the mark changes. If users report it, the
fix is small and needs no code change: Next auto-detects `src/app/favicon.ico`
in the same way and emits both links, the `.ico` first, so each browser takes
the best format it understands. Generate a multi-size icon from the existing SVG
rather than drawing a second mark, e.g. with ImageMagick:

```bash
magick -background none src/app/icon.svg -define icon:auto-resize=48,32,16 src/app/favicon.ico
```

Then the two files must be kept in sync by hand — nothing checks that they
still show the same thing, which is the actual reason to keep resisting it.

### The sidebar's agent marks are the vendors' own files

`icon.svg` is the favicon and nothing else. The rail loads each agent's mark
from `public/agent-marks/`, referenced by path in `Sidebar.tsx`:

| File | Source |
|---|---|
| `claude-code.svg` | `Claude Spark - Clay.svg` from Anthropic's press kit (anthropic.com/press-kit). The kit publishes no usage terms; the mark is used nominatively, to identify Claude Code, with the non-affiliation notice. |
| `codex.svg` | `OAI_OpenAI-Blossom_White.svg` from `openai-logos.zip` (openai.com/brand), under OpenAI's brand guidelines. White, because the guidelines forbid adding colour and the UI is dark. |

Both are committed **byte-identical** to the vendor files — renamed, never
edited. To update one, replace the file with a newer official download. Rules:

- **Only official, published assets, used exactly as provided.** No redrawing,
  recolouring, cropping or effects — both vendors' brand guidelines forbid
  modification, and OpenAI's specifically forbids adding colour to its mark (so
  its white mark is used on this dark UI, never a green one). A previous
  hand-drawn approximation and a stock-image "logo" were removed for exactly
  this reason; do not reintroduce either.
- **They are third-party trademarks, not covered by this repo's MIT license.**
  The README's Trademarks section and the footer's non-affiliation line must
  stay while they are shown.
- **Nothing tints them.** An `<img>` does not pass `currentColor` through, and a
  mark that recolours with UI state stops doing its one job — saying which agent
  this is when the rail is collapsed to icons. The active row is shown by its
  pill.
- **A missing file falls back to the agent's initials** in the same 24px box
  (`.rail-mark-fallback`), so a fork that removes the marks still has a usable
  rail. The check also runs after mount, because an image that fails before
  hydration fires `error` before React has attached the handler.
- **They must be let through `middleware.ts`.** Gating an image does not hide
  anything; it just renders the login page's HTML into an `<img>` and shows a
  broken icon. The matcher excludes `agent-marks/`.

`.rail-mark` sets `object-fit: contain` so the box is pinned rather than
trusting every vendor's file to be perfectly square.

**The box is per mark, because the vendors pad their files differently.** Both
marks are square and centred, and they still did not look the same size.
Measured by rasterising each and taking the alpha bounding box: **Anthropic's
artwork fills 99.5% of its viewBox, OpenAI's fills exactly 50%** — a 25% margin
baked into every side of the file. In one shared 24px box that is 24px of mark
against 12px, which is half the size, not an illusion.

So `img.rail-mark[data-agent='codex']` is a 44px image pulled back by `-10px`
on every side. The margin box stays 24px, so the rail's spacing and alignment
do not move; nothing visually overflows either, because at 44px the Blossom's
own artwork is 22px and still inside the original box. Sizing the element
rather than transforming it keeps the SVG rendering natively, so it stays
crisp. 22px against 23.9px leaves the rounder mark at about 92% of the spikier
one, which is where two marks of these shapes look equal rather than measure
equal.

**This is not a modification of either asset, and the rule above still holds.**
The files stay byte-identical to the vendors' downloads, the aspect ratio is
untouched, and the clear space each vendor specifies scales with its own mark.
Choosing a display size is not redrawing, recolouring or cropping. Re-measure
if a vendor republishes its mark with different padding — and note the selector
says `img` on purpose, because the missing-file fallback is a `<span>` sharing
the class and must keep the plain 24px box.

### Project logos

Separate from the agent marks, and a different mechanism. Each agent has its own
folder under `public/`, holding one image per project, **claimed by filename**:
`My App.png` is the mark for the project displayed as "My App". That is the
entire contract. The folders' contents are gitignored — they are named after the
user's projects.

| Agent | Folder |
|---|---|
| Claude Code | `public/claude_code_project_logos/` |
| Codex | `public/codex_project_logos/` |

- **One folder per agent, not one shared folder.** The two key projects
  independently and the same name can legitimately exist in both — a "My App"
  worked on from either agent is two projects with two histories — so a shared
  folder would hand one agent's mark to the other's project with no way to tell.
  The folder name lives in `ProviderMeta.projectLogoDir`, so a third agent is a
  row in the registry, not a code change.
- **There is no config file, on purpose.** A hand-kept name → file map goes
  stale the first time a folder is renamed, and the failure is silent. Matching
  is done on a normalised key (`logoKey()` in `src/lib/project-logos.ts`:
  lower-cased, every run of non-alphanumerics collapsed to one space), so
  `My_App` finds `My App.png` and the spacing around the dash in `Some App - Web`
  does not matter.
- **The directory is listed server-side** by `/api/project-logos/<agent>`, not
  guessed in the browser. The agent is a route param validated against the
  registry and an unknown one 404s, exactly like `/api/usage/<agent>`. Probing
  `<name>.svg` then `<name>.png` then giving up would cost a 404 per candidate
  for every project that has no logo — and there are more of those than not. As
  it stands a project with no file draws its monogram on first paint.
- **The manifest is fetched once per agent per page load**, cached in a
  module-level `Map` in `ProjectLogo.tsx`. A dozen project rows must not be a
  dozen requests, and the two agents must not share one entry.
- **It is deliberately not part of the `UsageReport`.** Logos are a folder the
  user drops files into; coupling them to the parser would mean re-reading every
  transcript to pick up a new PNG.
- **A new file needs the server restarted, but not rebuilt.** Verified against
  `next start`: `/api/project-logos/<agent>` lists the directory per request and
  saw the new file immediately, but `public/` is enumerated once at **server
  startup**, so the image itself 404'd until a restart — no `npm run build`
  required. The `onError` on the `<img>` catches exactly this and falls back to
  the monogram, so the half-state is a plain project row, not a broken image
  icon.
- **It is NOT in the `middleware.ts` matcher, unlike the agent marks.** Those
  are needed before any session exists. These are only ever requested by a page
  that is already behind the gate, so the cookie is sent and they resolve;
  leaving them gated keeps project names away from anyone without a session.

**A trap, met while adding this.** The project card's top row aligned on
`baseline`. A flex container takes its baseline from its **first flex item**,
and an `<img>`'s baseline is its bottom edge — so putting the logo first in the
name block dropped that whole block 13px and grew every card **that had a logo**
to 190px while the monogram ones stayed at 177px, quietly invalidating the
measured skeleton. The row is `center` now. Any element put at the head of a
flex row inherits this problem; check the card height, not the look.

## Auth, network exposure, and why the app is split into route groups

The dashboard serves real `cwd` paths out of the user's other projects, so every
route is behind a shared password — even though **it listens on `127.0.0.1` by
default**. LAN access is opt-in (`npm run dev:lan` / `start:lan`, the `-Lan`
switch on the Windows launchers, `DASHBOARD_LAN=1` for the `.bat`). Never make a
default script bind every interface again: a stranger's first `npm run dev`
would serve their project paths to their whole network.

`DASHBOARD_PASSWORD` lives in `.env.local` (gitignored). **It fails closed**: an
unset password locks the door rather than opening it. Never "helpfully" make a
missing password mean open access.

- `src/lib/auth.ts` — **Web Crypto only, no `node:crypto` import.** This module
  is pulled into `middleware.ts`, which Next runs on the Edge runtime where the
  Node built-ins do not exist. Adding a `node:` import here breaks the build.
- `src/middleware.ts` — the single gate. Enforcing auth here rather than
  per-page is the point: a new route cannot forget to protect itself. Pages get
  redirected to `/login`, `/api/*` gets a 401 JSON body.
- `src/app/api/login/route.ts` — password check, throttling, sets the session
  cookie; `DELETE` signs out.

### The session cookie

`<expiry-ms>.<HMAC-SHA256(expiry-ms)>`. The HMAC key is **derived** from the
password — PBKDF2-SHA256 at 600,000 iterations, with `SESSION_SECRET` (when set)
mixed into the salt — and cached per runtime (~85ms once, then free).

- Keying off the password is still the point: rotating it invalidates every
  outstanding session for free, with no session store. Rotating
  `SESSION_SECRET` does the same.
- The derivation is what stops a captured cookie becoming an offline
  password-guessing oracle. When the raw password was the HMAC key, one cookie
  sniffed off plain HTTP allowed guesses at full HMAC speed with the server
  never involved. With `SESSION_SECRET` set, a captured cookie is useless
  without the secret. Bump `KDF_SALT_PREFIX` if the derivation ever changes, so
  old cookies stop verifying.

### Login throttling

Failures are counted in a 15-minute window, **10 per client and 50 in total**,
in memory. The client key is `x-forwarded-for`, which a client can forge — the
global cap is what stops rotating fake addresses. Over either limit the route
answers 429 with `Retry-After`, and the login page shows how long to wait. The
trade-off is deliberate: under attack the form can be locked for everyone until
the window passes, while already-signed-in devices are unaffected because the
middleware never consults the counter. A restart clears it. The 400ms delay on
each wrong password stays on top.

### Security headers

`next.config.mjs` sends five on every response. Four are the usual hardening —
`X-Content-Type-Options`, `Referrer-Policy: no-referrer` (a URL here carries a
project id), `Permissions-Policy`, and the framing pair below.

**The one that earns its place is `connect-src 'self'`.** "No outbound network
calls" is this project's central promise and was, until these headers, enforced
by nothing but the code's good intentions. That directive makes the browser
refuse instead — and it is not decorative: it blocks a real thing that a real
session did (see the axe note under *Known issues*).

Three decisions in there that look like mistakes and are not:

- **`script-src 'self' 'unsafe-inline'`.** Next streams its flight payload as
  inline `<script>` tags whose contents change per render, so they cannot be
  hashed; noncing them means reading `headers()` in the root layout — to nonce
  the rail script too — which makes every page dynamic. The directive still
  does the thing worth doing here, which is to allow no script from anywhere
  else. If you ever want the strict version, the cost is the SSG, not a hash.
- **`frame-ancestors 'self'`, not `'none'`,** with `X-Frame-Options:
  SAMEORIGIN` to agree with it. Clickjacking needs a CROSS-origin frame and
  both of these refuse every one. `'none'` additionally forbids the app framing
  itself, which breaks the iframe harness for measuring the skeletons — found
  by trying it, within a minute of it being wrong. The two headers must move
  together: `DENY` next to `'self'` overrides it in browsers honouring both.
- **An `.svg` path gets its own, tighter policy** (`default-src 'none'`). Inside
  an `<img>` an SVG is inert; opened directly it is a document that can carry
  script, and both the agent marks and the project logos are files a user drops
  into `public/` themselves. Matched on the extension rather than the folders,
  so it does not copy `projectLogoDir` out of the registry. **Next collapses two
  rules that set the same header, last one wins**, so this REPLACES the main
  policy for those paths rather than narrowing it — which is why it repeats
  `frame-ancestors`. The four differently-named headers still apply.

### Accepted, not overlooked

`SECURITY.md` carries the public list of things that look like findings and are
deliberate — plain HTTP on a LAN, the cookie that cannot be `Secure` because of
it, `'unsafe-inline'`, in-memory throttling keyed off a forgeable header. One
more is worth recording here, because it began as a pre-release audit item and
was **closed as accepted rather than fixed**, and the code still reads like an
oversight:

**`/api/usage/<agent>` returns the raw error message as `detail`, and warnings
carry absolute paths.** Both sit behind the gate, and the page that receives
them already renders the user's own `cwd` paths in every table — so the
disclosure is to the one person who can already see all of it, and it is what
makes a failed parse diagnosable from the browser instead of from a log nobody
reads. Anyone with a session to read the `detail` has the whole report anyway.

**Revisit it if the gate ever stops being all-or-nothing.** The reasoning rests
entirely on there being exactly one class of reader; a second one — a read-only
share, a guest password, anything per-project — invalidates it rather than
weakening it.

### Traps

**The cookie must not be `secure`.** This is served over plain HTTP on the LAN.
A `secure` cookie is silently never stored, and the symptom is a login form that
appears to do nothing — it accepts the password, returns 200, and bounces
straight back to `/login`.

**`/login` must stay outside the `(dash)` route group.** The group's layout
(`(dash)/[provider]/layout.tsx`) mounts the sidebar and `UsageProvider`, and the
latter fetches `/api/usage/<agent>` on mount. With the login page inside it, the
login screen would fire an unauthenticated fetch behind the form on every
render. That is the only reason the group exists — `(dash)` does not change any
URL.

**`/api/usage/<agent>` is one route, not two.** The agent is a route param
validated against the provider registry; an unknown one is a 404. Adding a third
agent means a row in `providers.ts` and a parser, not a new endpoint.

### Verified behaviour

Checked rather than assumed, in dev *and* against `next build && next start`:

| Check | Result |
|---|---|
| `/` and `/projects` with no session | redirect to `/login`, deep link kept as `?next=` |
| `/api/usage` with no session | 401, no data in the body |
| Wrong password | 401, plus a 400ms delay |
| 11th wrong password from one client | 429 with `Retry-After` |
| Session cookie | `httpOnly` — invisible to `document.cookie` |
| Password rotation | edit `.env.local`, restart, **no rebuild**; old password 401s |
| Old session after rotation **+ restart** | 401 — sessions really are invalidated |
| Old session after rotation, **no restart** (dev) | still 200 — see the trap below |
| Session expiring on a deep link | `/login?next=` keeps the path **and** the query |
| `/icon.svg`, `/agent-marks/*.svg` with no session | 200 — the login screen's own assets |
| `/icon.svgx`, `/iconxsvg` with no session | **307 to `/login`** — both were let through before the matcher's exclusions were anchored |
| All five security headers | present on a page, and on an SVG |
| Loading a script or fetching from a CDN | blocked by the CSP |
| Framing from another origin | refused; same-origin framing still works |

The cookie derivation and throttling were additionally verified with a script
against the modules: round-trip, wrong password, tampered signature and expiry,
expired cookie, an old-format cookie, `SESSION_SECRET` set and rotated, the
per-client and global limits.

**Env vars are read at runtime, not inlined at build time.** This was tested
directly because the opposite is a common Edge-middleware gotcha: the password
was changed with no rebuild, the server restarted, and the new value took
effect. Do not add a rebuild step to the rotation instructions.

**A rotation is only half-applied until you restart the dev server.** Next
hot-reloads `.env.local` (it logs `Reload env: .env.local`), but that reload
reaches the **Node** runtime only. `/api/login` immediately starts rejecting the
old password — which makes the rotation look complete — while `middleware.ts`,
which is what actually validates session cookies, keeps the old value until the
process restarts. Net effect: nobody can log in with the old password, but every
device already holding a session **stays logged in**.

That is the dangerous direction for a rotation done because a password leaked:
after editing `.env.local` with the server left running, the old password 401'd
but an existing cookie still returned 200; after a restart, both 401'd.
**Always restart, and verify by loading the dashboard in a browser that was
already signed in.**

**Enter submits the login form.** If you test this through browser automation
and it appears not to, that is the harness: a synthetic `Enter` does not drive
Chromium's implicit form submission. A plain vanilla control form on the same
page fails identically. Verify with a control before "fixing" it.

## Pricing

Two rate cards, same shape, USD **per million tokens**, five buckets per model:
`input`, `cacheWrite5m`, `cacheWrite1h`, `cacheRead`, `output`. Claude Code's is
`config/pricing.json`; Codex's is `config/codex-pricing.json` and additionally
supports an `aliases` map (see Codex Trap 4). They are separate files because
the two are maintained by different vendors and move independently.

Standard multipliers off base input: cache write 5m = 1.25x, 1h = 2x,
cache read = 0.1x.

**Sonnet 5 is $2/$10 permanently.** It launched as introductory pricing "through
2026-08-31", but Anthropic made it the standard price and cancelled the planned
increase to $3/$15. Cached Anthropic references may still show $3/$15 — do not
"fix" `pricing.json` to match them.

A model string found in the transcripts but missing from the rate card is
reported as **unpriced** — surfaced explicitly in the UI, never silently
counted as $0. `<synthetic>` is deliberately priced at zero (no API call).

**Each card's `lastVerified` date is shown in the UI**, in the Cost by model
panel's subtitle, beside the name of the file it came from. Every money figure
on the page is a token count multiplied by that card, and a reader had no way
to tell whether it was checked last week or last year. It sits there rather
than under the headline because that panel is the one explicitly about money
per model, and it appears once — a date in one subtitle is not the standing
notice this UI keeps refusing to add.

Adding that sentence made the panel wrap to two lines on a narrow shell, which
moved `skeleton.costByModel` off a constant it had held at every width. Re-read
*Loading skeletons* before changing any panel's copy: a one-sentence edit is
invisible in a diff of `providers.ts` and still invalidates a measurement
there.

Codex rates as of the card's `lastVerified` date: GPT-5.6 Sol
`$5 / $0.50 cached / $30`, GPT-5.3 Codex `$1.75 / $0.175 cached / $14`. See the
Codex pricing caveats above for fast mode, which is not detected.

## Runtime is an approximation — state this in the UI

Neither agent logs per-turn inference time. The only timing signal is a
`timestamp` on each line. Runtime here is the **sum of wall-clock gaps between
consecutive log lines within a session**, attributed to whichever model most
recently appeared, **excluding any gap longer than `maxIdleGapMinutes`**
(default 30) on the assumption that a long gap means the user stepped away.

This measures *active session time*, not inference time. It runs slightly high
(includes reading and typing) and slightly low (drops long idle stretches even
mid-task).

The naive alternative — first-to-last timestamp per session — overstated by
~5.8x on the reference data, because it counts sessions left open overnight. Do
not switch to it. `SessionSummary.spanSeconds` keeps that figure for comparison
only.

## Conventions

- **Settings are local.** `config/settings.json` is gitignored; every key is
  optional and falls back to its default (`loadSettings()` in `pricing.ts`).
  `config/settings.example.json` documents them.
- **Day buckets** use `settings.localUtcOffsetHours` applied to the UTC
  timestamp, so "today" matches the user's calendar day. It **defaults to the
  machine's current UTC offset** (half-hour zones included), read once per
  parse — so in a daylight-saving zone a few hours around each switch can land a
  day off unless the offset is pinned. One settings file serves both agents —
  same machine, same user, same clock. (Codex records a `timezone` in every
  `turn_context`, a useful cross-check that is not read.)
- **The heat map's first row** is `settings.weekStartsOn` (`monday` default,
  `sunday`, `saturday`). Row placement and weekday labels both derive from it.
- Project display names come from the `cwd` field in the transcript when
  available — the encoded directory name is lossy and cannot be reliably decoded.

  **But it CAN be re-encoded, and that is how the right `cwd` is picked.** The
  first `cwd` in a file is not it. A resumed session replays the whole earlier
  conversation into the new project's file, and those replayed lines carry the
  OLD project's path — so a project started by resuming a session from
  `Project A` opened with `...\Project A`, and because files are walked in
  timestamp order that path won. The result was **two projects both labelled
  "Project A" and the new project nowhere on the page**. The totals were right
  the whole time; only the label was wrong, which is the nastier failure —
  nothing looks broken.

  `pickProjectCwd()` therefore keeps only the candidates that re-encode to the
  directory's own name (`encodeProjectDir()`: every character outside
  `[A-Za-z0-9]` becomes a dash). That drops replayed paths and subdirectory
  ones (`...\My App\android` encodes with a trailing `-android`) in one test.
  Verified against a real set of project directories: every directory holding a
  matching path matched **exactly**, including names with underscores, spaced
  dashes, non-ASCII punctuation and a trailing `)` that encodes to a trailing
  dash.

  The encoding stays lossy, so ties are possible: `My App` and `My_App` both
  encode to `My-App`. The tie-break is the spelling on the most lines, which is
  the one the project has actually been worked in. When the user prefers the
  other spelling, `displayNames` in their local `config/projects.json` pins it:
  a tie the data genuinely cannot break is a preference, not a bug in the
  tie-break. Leave the tie-break as it is — it is what names the project when
  nobody has expressed a preference.

  Note this is why the two dropped-project mechanisms are different things: a
  replayed folder that contributes nothing is hidden (below), while one that
  *does* contribute real work of its own stays — it just has to be named after
  itself rather than after whatever was replayed into it first.
- **A project directory can hold session files yet contribute nothing.**
  Resuming a session from a different working directory makes Claude Code replay
  the entire history into a *new* project folder; global de-duplication then
  credits every one of those messages to whichever project recorded them first.
  The newer folder is a copy, not a second piece of work.

  On the reference data, such a folder held two session files whose every unique
  message also appeared in the original project, with none exclusive to it. Such
  projects are dropped from `report.projects` and listed in
  `diagnostics.emptyProjectsHidden` rather than shown as a row of zeroes. The
  test is strict — any token, message or second of runtime keeps a project
  visible.
- **Codex projects are keyed by the `cwd` slug**, minted by
  `projectIdFromCwd()` in the same shape Claude Code encodes its directories
  (`C--Users-me-Thing`). Changing that function renames every project and
  orphans the archive's entries; delete `data/codex-history.json` if you do.
- **Projects are keyed by working directory, so renaming or moving a folder
  splits a project's history in two.** The local `config/projects.json` merges
  them back: merge rules are resolved in `buildUsageReport` immediately after
  discovery, so every downstream aggregate sees the canonical id. The target
  keeps its own `cwd` (a merged-in path is only a fallback), and
  `ProjectSummary.mergedFrom` records what was folded in so the UI can say so.
  Merging must never change the grand total — only how it is grouped.
- All money is `costUsd` (number, USD); all durations are seconds.
- Never copy, cache, or commit anything out of `.claude/projects/` or
  `.codex/sessions/` — both hold real code and paths from the user's other
  projects. Read at runtime only. `out/` and `data/` are gitignored for the same
  reason (the reports embed real `cwd` paths).

### What the two parsers share, and the one thing they cannot

Nothing about *reading* a transcript transfers between them — the formats have
nothing in common and the traps above are entirely different. What does
transfer is everything after a line is understood: tokens into a cell, cells
into a per-model bucket, buckets out as a sorted daily array. That lived twice
until `src/lib/usage-math.ts`, and a fix to one copy would have missed the
other.

**The one genuine difference is reasoning tokens, so it is the one thing
`usageMath()` is parameterised on.** Codex reports `reasoning` as a subset of
output; Claude Code does not report it at all, so a Claude Code cell has no
`reasoning` key — and that absence is meaningful. `undefined` says "this agent
does not report it"; a `0` would claim it was measured and found to be none.
Do not "tidy" that into a default of zero.

Two of the seven helpers differed between the copies before this, and both
differed only in that field. The other five were identical to the character.

**How to prove a change here is safe:** `npm run parse` and
`npm run parse:codex` write the exact structure the API serves, so capture
both reports, make the change, and diff them with `generatedAt` stripped. When
this module was extracted, Codex's report came back **identical** — it was not
in use during the change — and Claude Code's matched on 53 of 54 days, the
exception being the one the session doing the work was writing to.

## Input guards: what a malformed line can and cannot do

The rule at the top of the Claude Code section — degrade, never crash — is now
enforced in one place per concern, shared by both parsers (`parser.ts`):

| Helper | Guards against |
|---|---|
| `isRecord()` | Valid JSON that is not an object (`null`, a number, an array). Reading a field off one used to throw and abort the **rest of that file**; it is now counted in `linesUnparseable` and skipped. |
| `parseTimestampMs()` | Absurd dates. `Date.parse` accepts `+275760-09-13T00:00:00Z`, and adding a timezone offset to it overflows `Date`, so `toISOString()` threw `RangeError` out of the parse and onto the page. Anything before 2000 or more than a year ahead is treated as no timestamp, counted in `diagnostics.implausibleTimestamps`; its tokens still count, under `(unknown date)`. |
| `toTokenCount()` | Negative, fractional, non-numeric counts. One negative value used to flow into the totals as negative cost and then into the archive, where it outlived the line that caused it. |
| `localDate()` (`parser.ts`) / `localHour()` (`usage-math.ts`) | A backstop for the same overflow, so no future caller can reintroduce it. |
| `sanitizeDays()` (`history.ts`) | A hand-edited or truncated archive. Days that cannot be read are dropped with a warning instead of throwing; missing numbers coerce to 0. |

Each of these has a test that fails if the guard is removed.

## The demo tree, and the archive it must not touch

`npm run demo:data` writes a synthetic `~/.claude/projects` and
`~/.codex/sessions` into `./demo-data`, and prints the env vars that point the
dashboard at them. It exists because every screenshot of this dashboard is
otherwise a screenshot of somebody's real projects and spend, which the privacy
rules make uncommittable — so there were no screenshots at all.

**It is not mock data, and it cannot be.** The output goes through the real
parsers, so the generator has to produce transcripts that survive them: Claude
Code streaming partials with a growing `output_tokens` and a recoverable
placeholder, replayed history shared between files, nested subagent
transcripts, cache writes split by TTL; Codex cumulative totals with a repeated
reading, cached tokens inside input, reasoning inside output, auto-review
threads under their own model. Get one of those wrong and the demo shows
numbers no real parse could produce.

The diagnostics are how you know it is honest. A demo parse should report
duplicate lines skipped and output tokens recovered on the Claude Code side,
and **`files reconciled: N ok / 0 mismatched`** on the Codex side — that last
one fails immediately if the cumulative arithmetic in the generator drifts from
what the parser expects.

It is seeded (`seed` at the top of the script), so the same command produces
the same dashboard and a diff in a screenshot means something really changed.

**`DASHBOARD_DATA_DIR` is what makes this safe, and it is new for this.**
`historyPath()` used to be hard-wired to `process.cwd()/data`, so pointing
`CLAUDE_CONFIG_DIR` at a demo tree would have folded invented days into the
real archive — and since the merge keeps whichever copy has more messages, a
fabricated day could permanently overwrite a real one. The archive is the only
part of this tool that does not rebuild itself from disk, so that damage does
not come back. Anything that reads demo transcripts must set that variable;
the generator prints it as part of the command for exactly that reason.

## The four states a page can be in

Loading, failed, empty, and has-data. The middle two used to be told apart by
the reader rather than the code, which is how a fresh install came to look
broken:

- **Empty is its own state.** `isEmptyReport()` (`src/lib/report-state.ts`) is
  the single rule - no projects, no messages, no tokens, no runtime - and
  `EmptyState` says which agent found nothing, where it looked, and which
  environment variable moves that. Before, the page rendered `$0.00` across a
  dozen cards with "No dated activity found." in every chart.
- **"Nothing found" is not a warning.** A missing transcript directory is the
  normal state of a fresh install, so `noteworthyWarnings()` keeps it out of
  the warning box and the empty state carries it instead.
- **`ParseWarnings` no longer calls everything a file.** The same list carries
  merge-rule cycles and archive write failures; announcing "N files could not
  be read" sent people looking for a file that was fine.
- **A merge-rule cycle is reported once.** It used to be reported once per
  event: Codex resolves a project per tick and per event, so one bad rule in
  `codex-projects.json` produced thousands of identical warnings, which that
  same warning box then summarised as a pile of unreadable files. Resolution is
  memoised per working directory now, and `resolveProjectId` names the cycle's
  members in sorted order so `a -> b -> a` reads the same from either end and
  de-duplicates to one line.
- **Render errors are caught.** `(dash)/[provider]/error.tsx` keeps the chrome
  and offers a retry; `app/not-found.tsx` handles an unknown agent segment.
  Before, one exception - a literal `%` in a project id was enough - left a
  blank page. That particular one is fixed at the source too: `useParams`
  already decodes, so the page no longer decodes a second time.

## Accessibility rules that are easy to undo by accident

`tests/contrast.test.ts` and `tests/a11y.test.tsx` enforce all of this, so a
regression fails before it ships rather than after someone complains.

- **Contrast is measured, not judged.** `--text-faint` carries most of the small
  text on the page and must clear **4.5:1** on every background it sits on
  (`--bg`, `--surface`, `--surface-hover`, `--tooltip-bg`). It was `#6b6b75`,
  which measured 3.6-4.0:1 and failed AA outright.
- **Every model shade and heat-map step clears 3:1** against the panel (WCAG
  1.4.11). That floor compresses the ramp - neighbouring bands differ by about
  1.2:1 - so the encoding "darker = more expensive" survives, but **colour can
  never be the only way to read a band**. The test also checks that ordering:
  a dearer model may never be lighter than a cheaper one.
- **`.sr-only` goes on a WRAPPER around a table, never on the table.** This is
  the one that got away for months. `.sr-only` hides a box by shrinking it to
  1px and clipping the overflow — and **neither applies to a `display: table`
  box**: `overflow` does not apply to it, and a 1px `width`/`height` is only a
  minimum, because a table sizes to its content. `clip-path` still hid it, so
  the symptom was not a visible table but **~1200px of empty scroll below the
  footer** on the overview, from two full-height tables nobody could see.
  `ChartFigure` now wraps its table in a `<div class="sr-only">`. The tempting
  wrong fix is `display: block` on the table, which strips exactly the table
  semantics the element exists to provide. Anything else visually hidden this
  way — a list, a span — is fine; only tables need the wrapper.
- **Charts carry their numbers as text.** `ChartFigure` wraps every chart in a
  `<figure>` with a visually hidden caption and a `.sr-only` table of the same
  series. Recharts' `accessibilityLayer` makes the plot keyboard-reachable but
  leaves it unnamed and its contents drawn, not written; the figure supplies
  the name and the table supplies the data. Keep the row count sane - summarise
  (active days only, top N) and say so in the caption.
- **The heat map's grid is `aria-hidden`.** It used to be `role="img"`, which
  hid its ~180 per-day `title`s and left a screen reader with a label and
  nothing else. The table fallback is the data now.
- **`.info-tip` is a `<button>`**, named by `aria-label` and explained through
  `aria-describedby`. It used to be a `<span>` with an `aria-label`: not
  focusable, and not reliably announced. `InfoTip` is the only way to add one.
  The visible bubble stays CSS `::after` from `data-tip`, because `display`
  toggling is what keeps it out of `.table-scroll`'s scroll width.
- **A swatch on its own says nothing.** Any colour-only cell (the Models columns
  in the sessions and daily tables) carries an `.sr-only` list of the names
  beside it, and the swatches are `aria-hidden`.
- **Charts hold no hex literals.** They use the tokens, so both agents re-theme;
  a test greps for `#rrggbb` in `src/components/*Chart.tsx` and fails on one.
- **Loading is announced.** Each skeleton is `role="status" aria-busy="true"`
  with an `.sr-only` line, so the wait is not silence.
- **Every page has exactly one `<h1>`, and on two of them it is invisible.** The
  top bar is deliberately NOT one — it is chrome that repeats on every page, and
  two competing h1s is worse than none — but the overview and projects pages had
  no visible title of their own either, so their outline started at h2 with
  nothing to land on. They now carry an `.sr-only` h1 naming the agent and the
  page. The project detail page already had a real one (the project's name), and
  the empty, error and no-projects states promote their own heading to h1
  because in those states it IS the whole page. Adding a second visible heading
  to the two dashboards would be the wrong fix; adding a second h1 anywhere is
  the wrong fix twice.

## Known issues

Found in the pre-release audit and not yet fixed. Check before assuming the code
already handles them:

- **No screen reader has been run against this.** An axe-core pass now has
  (below), which is not the same thing: axe checks the markup, a screen reader
  checks whether the result is usable. The `.sr-only` chart tables in
  particular have never been *heard*.

### What the browser pass covered, and what it found

The first pass with a signed-in browser — axe-core 4.10.2 against WCAG 2.1
A/AA plus best-practice, on the overview, projects and project detail pages for
both agents, and on the empty, failed and render-error states.

**Zero violations** on all of it, once two measuring artefacts were understood:

- **Ten "serious" contrast failures on the projects page were the `.rise`
  entry animation.** Run 1.5s after load, axe caught cards mid-fade and
  measured the blended colour. Zero once `getAnimations()` reports `finished`.
  Wait for that, not for a timeout.
- **78 `color-contrast` results come back "incomplete" on every page with a
  chart.** axe cannot compute contrast for SVG `<text>`. Done by hand, the axis
  labels are `#7d7d87` on `#0a0a0c` = 4.86:1, which passes. This is a gap in
  the tool, not in the page, and it will recur on every run.

**Getting axe into the page is now the hard part, on purpose.** That first run
pulled axe-core from cdnjs, which the CSP added afterwards refuses — both the
`<script src>` and a `fetch`, verified. That is the `connect-src`/`script-src`
pair doing exactly its job, and it is a small comfort that the first thing it
ever blocked was something this repo's own notes told someone to do. To run it
again, either drop a copy of `axe.min.js` into `public/` and load it from
`/axe.min.js` (same origin, so the policy allows it — and `public/` is
enumerated at server **startup**, so restart first), or comment the header rule
out of `next.config.mjs` for the run. Do not loosen the policy to make an audit
convenient.

It also found four real bugs, all now fixed and all invisible to the markup,
token and unit tests that were supposed to cover this ground. Three were
variants of the overflow family documented above; they are written up there,
where the next person will be looking. The fourth was the missing `<h1>`, under
*Accessibility rules*.

**The detail skeleton is measured now**, so the entry that used to sit here is
gone. `SkeletonMetrics.detail` carries the numbers and the method.

## Running

```bash
npm ci
cp .env.example .env.local   # then set DASHBOARD_PASSWORD - the app fails closed without it
npm run parse         # Claude Code -> out/usage-report.json, plus a printed summary
npm run parse:codex   # Codex       -> out/codex-usage-report.json
npm run demo:data     # synthetic transcripts for both agents -> ./demo-data
npm run dev           # dashboard at http://localhost:7842 (this machine only), lands on /claude
npm run dev:lan       # the same, reachable from your network - set SESSION_SECRET first
npm run typecheck
npm test              # node:test via tsx; see tests/
npm run lint          # eslint . - `lint:fix` applies what it can
npm run format:check  # prettier --check . - `format` writes
```

**`.nvmrc` says 22, which is not what this machine runs.** It names the newest
LTS that CI actually tests (the matrix is 20 and 22), so a contributor running
`nvm use` lands on a version the build is proven against rather than on
whatever is newest. `engines` stays `>=20` because nothing here needs more.
Note the gap that leaves: development happens on Node 24, which CI never
exercises — if that ever matters, widen the matrix rather than the `.nvmrc`.

**Lint and format config.** ESLint 9 flat config (`eslint.config.mjs`) loads
`eslint-config-next` through `FlatCompat`, because that package is still
written in the old `.eslintrc` shape. **Keep `eslint-config-next` pinned to the
same major as `next`** - `npm install` will happily fetch the next major, which
lints for a framework version this app is not on. `eslint-config-prettier` goes
last so nothing fights Prettier over formatting.

`@next/next/no-img-element` is off repo-wide, with the reasoning in the config:
the three `<img>`s are local files of unknown dimensions on a localhost-only
page, and `next/image` would need a loader configured to buy nothing.

**Line endings are LF, enforced by `.gitattributes`.** Without it a Windows
checkout writes CRLF while the repository stores LF, and Prettier - configured
for LF - rewrites every line of every file it touches, so a one-line change
shows up as a whole-file diff. Windows scripts (`.bat`, `.ps1`, `.vbs`) stay
CRLF.

**Tests build their fixtures at run time** (`tests/helpers.ts` writes JSONL into
a temp directory and deletes it afterwards). Nothing derived from a real
transcript is ever committed, and `*.jsonl` is gitignored anyway, so a committed
fixture would not survive a fresh clone. Each documented trap above has a test
named after it; if you change a parser, that is where to look first.

`.github/workflows/ci.yml` runs typecheck, tests and build on Windows and
Ubuntu, on Node 20 and 22.

Neither parse script needs a password — they are CLIs that read disk directly
and never go through the HTTP layer. They are also the fastest way to check a
parser change: the numbers they print are exactly what `/api/usage/<agent>`
serves.

**A `next start` build does not pick up code changes.** After changing code, run
`npm run build` and restart the server. `npm run typecheck` is not a substitute —
it does not produce a `.next`. If the Windows background service is running, port
7842 is taken; stop it with `stop-dashboard.bat` (or
`powershell -ExecutionPolicy Bypass -File scripts\dashboard-stop.ps1`).

### The launchers never rebuild, except when there is no build

| Launcher | Behaviour |
|---|---|
| `scripts/dashboard-service.ps1` (the logon task) | builds only if `.next/BUILD_ID` is missing |
| `start-ai-usage-dashboard.bat` (double-click) | the same; `FORCE_BUILD=1` overrides |

Both once rebuilt on every start. That put a ~15s Next build on the boot path
and, worse, made **a broken build a startup failure**: the dashboard just never
appeared, and the only trace was one line in `logs/dashboard.log` that nobody
reads at logon. A build belongs where you are looking at its output.

The missing-build case still builds, and is a different problem entirely — not
stale code but no code: `npm start` against an absent `.next` exits immediately,
so there would be nothing to open. A first clone, or a wiped `.next`, still
comes up on its own.

**Staleness is still detected. It reports instead of acting** — an mtime scan
over `src/`, `config/`, `package.json` and `next.config.mjs`, with a warning as
the outcome:

- the service writes `WARNING: source is newer than the build (... vs ...)` to
  `logs/dashboard.log` and starts anyway;
- the `.bat`, which has a console to print to, says so on screen before it
  starts.

Keep that check. Serving the previous build silently is exactly what it exists
to catch — it would once have meant serving a version from before the password
gate existed. **Grep `logs/dashboard.log` for `WARNING` if the dashboard is not
showing a change you know you made.**

Verified for both launchers against a sandbox tree: fresh build → no build;
stale → warning, starts, does not build; no `BUILD_ID` → builds once then
starts; failing build → does not start, logs the exit code. The `.bat` was
additionally run with a poisoned `errorlevel 7` before its build section, since
the stale check reads an exit code — `if errorlevel` sits inside the
`if not defined DO_BUILD` block so an earlier failure cannot be read as "stale".

## Git

Conventional commit messages. Before committing, re-read the privacy rules at
the top of this file: no real project names, paths or figures in the diff **or
the message**. Personal commit rules (author identity, push policy) belong in
`CLAUDE.local.md`.
