/**
 * The two coding agents this dashboard reports on.
 *
 * Everything that differs between them and is not a number lives here: labels,
 * where the transcripts are, what the token buckets are called, and whether the
 * cost figure is a real charge or a hypothetical one. Components read this
 * rather than branching on an id, so adding a third agent is a matter of adding
 * a row plus a parser.
 *
 * This module is imported by client components. Keep it free of `node:` imports.
 */

export type ProviderId = 'claude' | 'codex';

export const PROVIDER_IDS = ['claude', 'codex'] as const;

export interface ProviderMeta {
  id: ProviderId;
  /** Full name, used in headings, page titles and the sidebar. */
  label: string;
  /** URL prefix. Always `/${id}`. */
  basePath: string;

  /** Where the transcripts live, for the "could not read" copy. */
  transcriptHint: string;
  /** Env var that relocates them, or null when there isn't one. */
  transcriptEnvVar: string | null;
  /** The rate card file, named in the unpriced-model notice. */
  pricingFile: string;
  /** The local merge/rename overrides file, named where merges are explained. */
  projectsFile: string;

  /**
   * Headline label for the big number, and the whole of how the cost basis is
   * carried in the UI.
   *
   * Claude Code usage is billed per token, so its estimate tracks a real bill.
   * Codex here runs on a flat ChatGPT subscription, so its figure is "what
   * these tokens would have cost through the API" — a comparison number, not a
   * charge. **The UI must never present the two as the same kind of thing**,
   * and this label is the entire mechanism for that: "API-equivalent spend"
   * rather than "Total estimated spend".
   *
   * There is deliberately NO standing banner explaining it. The full
   * explanation lives in README.md and CLAUDE.md, on the same reasoning as the
   * output-token residue - a permanent notice about a known, documented
   * framing trains the reader to ignore notices, which costs more than the
   * ambiguity does.
   *
   * (There used to be a `costBasis: 'billed' | 'api-equivalent'` beside this,
   * carrying the same distinction as data. Nothing ever read it - the label
   * does all the work - so it went, and its reasoning moved here.)
   */
  costLabel: string;

  /** True when the agent writes cache-creation tokens we can price. */
  hasCacheWrites: boolean;
  /** True when the agent reports reasoning tokens as a subset of output. */
  hasReasoningTokens: boolean;
  /** Column/card label for the cheap re-read bucket. */
  cacheReadLabel: string;

  /**
   * Directory under `public/` holding this agent's project marks.
   *
   * One per agent, not one shared folder: the two have separate project name
   * spaces and a name can legitimately exist in both (a "My App" worked on
   * from either agent is two projects with two histories), so a
   * shared folder would silently hand one agent's mark to the other's project.
   */
  projectLogoDir: string;

  /** What one row of `messages` counts, for tooltips. */
  messageNoun: string;
  messageTip: string;
  /** Tooltip for the Sessions card. */
  sessionTip: string;
  /** Sub-label under the Sessions card's split. */
  subagentNoun: string;

  /** Measured loading-skeleton geometry, per page. See SkeletonMetrics. */
  skeleton: SkeletonMetrics;
}

/**
 * What the dashboard's loading skeletons measure to, per agent.
 *
 * The loading skeleton's job is that nothing moves when the data lands, so it
 * reproduces the real page section by section at measured heights. Those
 * heights are NOT the same for both agents: Codex has two models to Claude
 * Code's five, so its stat grid is one row where the other wraps to two at
 * 997px (three with the rail expanded), and its token table is ~150px shorter.
 *
 * A single shared set of numbers is therefore wrong for at least one agent by
 * a couple of hundred pixels, which is the exact failure the skeletons were
 * fixed for in 0.10.1.
 *
 * **Panels whose height drifts with window width carry the mid-range of what
 * was measured at 997px and 1680px viewport**, so the error is split rather
 * than piled on one end. Re-measure both agents at both widths if a panel
 * changes shape — and note the rail now takes 252px out of the viewport, so
 * these are not comparable to anything measured before it existed:
 *
 * ```js
 * [...document.querySelector('main.shell').firstElementChild.children]
 *   .map((el) => [el.className, el.offsetTop, Math.round(el.getBoundingClientRect().height)]);
 * ```
 */
export interface SkeletonMetrics {
  /**
   * Cells in the stat grid — one per model, so `auto-fit` wraps the
   * placeholder exactly as the real grid does at every width. A count that is
   * merely plausible matches at one window size and is wrong at every other.
   * Bump this if the agent gains a model.
   */
  modelCards: number;
  /**
   * Height of ONE score card.
   *
   * A card no longer wraps its own label or sub-label, so it is a flat 128px at
   * every width, and the width-sensitivity is entirely in the ROW COUNT: the
   * grid steps 4 -> 2 -> 1 columns (see `.score-grid`), so twelve cards are
   * three rows at 1680px and six at 997px. The skeleton reuses the real class
   * and re-flows to the same row count on its own.
   *
   * What is left for a uniform placeholder height to absorb is the Top model
   * card, the only one whose VALUE can wrap - it is 132px for both agents now
   * that four columns give it a 303px box and two give it 326px. It used to be
   * 162px for Codex at 997px, when `auto-fit` squeezed that column to 212px;
   * that is why both agents finally carry the same number here. A much longer
   * model name would bring the difference back, which is a reason to
   * re-measure, not to pad it.
   *
   * The two record cards (Peak tokens, Longest chat) name a project, which can
   * be long - they clip that line rather than wrapping it (`.score-sub-clip`)
   * precisely so they stay 128px and this stays one number.
   */
  scoreCard: number;
  headline: number;
  dailySpend: number;
  /**
   * The Cost by model panel. It was a flat 393 at every width until its
   * subtitle gained the rate card's name and last-verified date, which wraps
   * to a second line on a narrow shell - so it is a mid-range like the rest
   * now. A good example of why adding one sentence to a panel means measuring
   * it again: the copy change is invisible in a diff of this file.
   */
  costByModel: number;
  tokenTable: number;
  /**
   * The tokens chart and its spend twin below it. They are the same shape - one
   * stacked column chart plus one legend row per model - but not the same
   * height: the spend legend drops the in/out/cached column, which is what
   * makes a legend row wrap on a narrow shell.
   *
   * **Measured at the default range, the last 30 days**, whose legend has a row
   * per model used IN those days - not every model the agent has ever used.
   * So these follow what you have been using lately, and move when a model
   * enters or leaves the window. See day-range.ts.
   */
  dailyTokens: number;
  dailySpendByModel: number;
  heatmap: number;

  /**
   * PROJECTS page: the share-of-spend donut panel.
   *
   * The one entry on this page that needed measuring per agent, and by the
   * widest margin of anything here - 458 against 405. The ring is a fixed
   * 260px, so the panel's height is the ring until the LEGEND is taller than
   * it. Claude Code shows ten legend rows (nine projects plus "Others") and
   * Codex two: at 1680px both fit in two columns beside the ring and both
   * panels are 393px, but at 997px the legend drops to one column and Claude
   * Code's ten rows push the panel to 522px while Codex's two leave it at
   * 417px.
   *
   * The legend is capped at ten rows (nine projects plus "Others"), so this
   * stops moving once an agent passes eleven projects - it is the ROW count
   * that drives it, not the project count. Re-measure when the row cap or the
   * column breakpoint changes; a thirteenth project alone will not move it.
   */
  projectDonut: number;

  /**
   * PROJECT DETAIL page.
   *
   * **Measured, like the rest** - this used to say "derived, not measured",
   * which it was until the page was finally measured in a signed-in browser.
   * The recipe is the usual one, with one difference forced by the page: the
   * skeleton only appears on a COLD load (Refresh keeps the stale data on
   * screen), so it is caught by racing a fresh load rather than by mounting
   * markup. Loading each project in an iframe sized to the target width is the
   * tidy way to do it - the iframe's own viewport drives the media queries, so
   * 997px and 1680px are exact rather than approximated.
   *
   * **Three of these depend on the PROJECT, not just the agent**, which is the
   * thing that makes this page different from the other two. A project uses
   * some subset of the models the agent has ever used, and the stat grid, the
   * two stacked charts and the token table all grow a row per model. So unlike
   * the overview's numbers - which describe one known page - these are the
   * mean across every project measured at both widths, and a project at the
   * edge of that range will still move a little. Claude Code was measured
   * across three projects (2, 4 and 4 models), Codex across both of its.
   *
   * That is also why `modelCards` is here rather than reusing the agent-wide
   * `modelCards` above. The overview shows every model, a project does not: at
   * 997px the agent's five cells wrapped to three rows where a four-model
   * project took two, which was 166px of error on its own. (That was with the
   * rail expanded; collapsed, both are two rows at 997px, but the counts still
   * part at other widths.)
   *
   * The two long tables stay capped: their height follows the number of days
   * and sessions, which the skeleton cannot know. Everything above them lands
   * without moving; below them it shifts. `sessionsTable` is NOT one of those
   * - the table shows twelve rows before its show-more, so it is a constant
   * for any project with at least twelve sessions, and measured as one.
   */
  detail: {
    headline: number;
    dailySpend: number;
    combinedTable: number;
    /** The typical PROJECT's model count, not the agent's. See above. */
    modelCards: number;
    dailyTokens: number;
    dailySpendByModel: number;
    tokenTable: number;
    modelDailyTable: number;
    sessionsTable: number;
  };
}

export const PROVIDERS: Record<ProviderId, ProviderMeta> = {
  claude: {
    id: 'claude',
    label: 'Claude Code',
    basePath: '/claude',

    transcriptHint: '%USERPROFILE%\\.claude\\projects\\',
    transcriptEnvVar: 'CLAUDE_CONFIG_DIR',
    pricingFile: 'config/pricing.json',
    projectsFile: 'config/projects.json',
    costLabel: 'Total estimated spend',

    hasCacheWrites: true,
    hasReasoningTokens: false,
    cacheReadLabel: 'Cache read',

    projectLogoDir: 'claude_code_project_logos',

    messageNoun: 'messages',
    messageTip:
      'One per billed API response. Claude Code writes the same message to disk several times (streaming updates, and replays when a session is resumed); those copies are collapsed here.',
    sessionTip:
      'Every transcript file found, including subagent transcripts nested under a session. The Claude Code app counts only top-level sessions.',
    subagentNoun: 'subagent',

    // Measured 2026-08-19 at 997px and 1680px viewport (scoreCard 2026-08-21,
    // twelve cards in a fixed 4-column grid). The 997px column was re-measured
    // 2026-09-22 with the rail COLLAPSED, its new default: 182px more shell,
    // so several subtitles stopped wrapping. 1680px is the same either way -
    // the shell reaches its max-width before the rail makes a difference.
    skeleton: {
      modelCards: 5,
      scoreCard: 129, // grid 840 in 6 rows @997 / 415 in 3 rows @1680
      headline: 269, // 263 / 275 (282 at 997 with the rail expanded)
      dailySpend: 433, // flat - 499 at 997 with the rail expanded
      costByModel: 393, // flat - the rate-card line no longer wraps at 997
      tokenTable: 499, // 506 / 491
      // Re-measured 2026-09-22 at the 30-day default: two models in the window
      // where all-time had four (671 / 647 before the range existed).
      dailyTokens: 565, // 577 / 553
      dailySpendByModel: 565, // 577 / 553 - same as its tokens twin here
      heatmap: 457, // 402 / 512
      projectDonut: 458, // 522 / 393 - ten legend rows, one column at 997px
      // Measured across three projects (2, 4 and 4 models) at both widths.
      detail: {
        headline: 359, // 342/368/368 @997, 358 flat @1680 - the cwd path wraps
        dailySpend: 413, // flat at both widths, identical on every project
        combinedTable: 560, // capped: one screen of a table as long as the data
        modelCards: 4, // the projects' own model counts, not the agent's five
        // Re-measured 2026-09-22 at the 30-day default, on the same three
        // projects: one model each in the window, where all-time had 2-4.
        dailyTokens: 518, // 530 @997, 506 @1680, on all three
        dailySpendByModel: 506, // flat at both widths and on all three
        tokenTable: 383, // 425/425/321 @997, 410/410/305 @1680
        modelDailyTable: 620, // capped, as above
        sessionsTable: 860, // twelve rows, flat across widths and projects
      },
    },
  },

  codex: {
    id: 'codex',
    label: 'Codex',
    basePath: '/codex',

    transcriptHint: '%USERPROFILE%\\.codex\\sessions\\',
    transcriptEnvVar: 'CODEX_HOME',
    pricingFile: 'config/codex-pricing.json',
    projectsFile: 'config/codex-projects.json',
    costLabel: 'API-equivalent spend',

    // Codex reports a `cache_write_input_tokens` field but it has been 0 on
    // every event in this corpus, and OpenAI's rate card has no cache-write
    // line, so the column would be a stripe of zeroes.
    hasCacheWrites: false,
    hasReasoningTokens: true,
    cacheReadLabel: 'Cached input',

    projectLogoDir: 'codex_project_logos',

    messageNoun: 'requests',
    messageTip:
      'One per billed API request. Codex reports a running total after each turn and sometimes repeats the last reading; repeats contribute nothing here.',
    sessionTip:
      'Every rollout file found, including the auto-review threads Codex spawns to check its own actions. Those are billed separately and are counted here.',
    subagentNoun: 'auto-review',

    // Measured 2026-08-19 at 997px and 1680px viewport (scoreCard 2026-08-21,
    // twelve cards in a fixed 4-column grid). The 997px column was re-measured
    // 2026-09-22 with the rail collapsed, as for Claude Code above.
    skeleton: {
      modelCards: 2,
      scoreCard: 129, // same as Claude Code: 840 / 415, both measured
      headline: 269, // 263 / 275 (306 at 997 with the rail expanded)
      dailySpend: 433, // flat - 499 at 997 with the rail expanded
      costByModel: 393, // flat - the rate-card line no longer wraps at 997
      tokenTable: 353, // 373 / 334 - two models, not five
      // Both models are in the 30-day window, so the legend is the same two
      // rows; the collapsed rail is what stopped its detail column wrapping.
      dailyTokens: 565, // 577 / 553 (603 at 997 with the rail expanded)
      dailySpendByModel: 565, // 577 / 553
      heatmap: 457, // 402 / 512 (353 at 997 with the rail expanded)
      projectDonut: 405, // 417 / 393 - two projects, so the ring governs
      // Derived from the overview's measured panels - see SkeletonMetrics.detail.
      // Measured across both Codex projects at both widths.
      detail: {
        headline: 363, // 368/368 @997, 358 flat @1680
        dailySpend: 413, // flat at both widths, identical to Claude Code's
        combinedTable: 560, // capped: one screen of a table as long as the data
        modelCards: 2, // a Codex project uses both models, so this matches above
        // Re-measured 2026-09-22 at the 30-day default and the collapsed rail:
        // the legend's detail column no longer wraps at 997px on either.
        dailyTokens: 565, // 577/577 @997, 553 @1680
        dailySpendByModel: 553, // flat at both widths and on both projects
        tokenTable: 313, // 321 / 305 - two models, not five
        modelDailyTable: 620, // capped, as above
        sessionsTable: 1017, // 1251/1095 @997, 860 @1680 - thread names wrap
      },
    },
  },
};

export function isProviderId(value: string): value is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(value);
}

export function getProvider(id: string): ProviderMeta | null {
  return isProviderId(id) ? PROVIDERS[id] : null;
}
