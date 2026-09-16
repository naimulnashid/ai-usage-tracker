/**
 * The line icons on the Activity score cards.
 *
 * Drawn here rather than pulled from an icon package: twelve glyphs is not
 * worth a dependency, and these are tuned for the one size they are used at.
 *
 * Three rules hold the set together, and a new icon has to follow them or it
 * will not look like it belongs:
 *
 * - **One 16-unit grid, one 1.5 stroke, round caps and joins.** Every glyph is
 *   an outline; none is filled. A filled shape at this size reads as a much
 *   heavier element than its neighbours even at the same nominal weight.
 * - **Three strokes or fewer.** These render at 15px inside a 13.5px label, so
 *   detail turns to mush - the cache cylinder is already at the limit.
 * - **They inherit `currentColor`** from `.score-label`, which is what lets one
 *   hover rule tint the whole card's icon to the agent's accent. Never colour a
 *   path here: the accent is per-agent and lives in CSS variables.
 */
export type ScoreIconName =
  | 'sessions'
  | 'messages'
  | 'hourglass'
  | 'model'
  | 'input'
  | 'output'
  | 'cache'
  | 'peak'
  | 'calendar'
  | 'flame'
  | 'trophy'
  | 'clock';

const PATHS: Record<ScoreIconName, React.ReactNode> = {
  // A terminal window - a session is a transcript of one.
  sessions: (
    <>
      <rect x="2" y="2.9" width="12" height="10.2" rx="2.2" />
      <path d="M2 6.3h12" />
    </>
  ),
  // Speech bubble.
  messages: (
    <path d="M4.6 2.4h6.8a2.2 2.2 0 0 1 2.2 2.2v3.6a2.2 2.2 0 0 1-2.2 2.2H7.2l-3 2.8v-2.8a2.2 2.2 0 0 1-2.2-2.2V4.6a2.2 2.2 0 0 1 2.2-2.2Z" />
  ),
  // Hourglass: elapsed time, as against the clock face used for time of day.
  hourglass: (
    <path d="M4.6 2h6.8M4.6 14h6.8M5.4 2v2.3c0 1.4 2.6 2.3 2.6 3.7s-2.6 2.3-2.6 3.7V14M10.6 2v2.3c0 1.4-2.6 2.3-2.6 3.7s2.6 2.3 2.6 3.7V14" />
  ),
  // Four-point sparkle.
  model: <path d="M8 1.8 9.5 6.5 14.2 8 9.5 9.5 8 14.2 6.5 9.5 1.8 8 6.5 6.5Z" />,
  // Arrow down onto a line, and its mirror - a pair, so they read as opposites.
  input: <path d="M8 2.4v7.4M4.9 6.7 8 9.8l3.1-3.1M2.6 13.4h10.8" />,
  output: <path d="M8 9.8V2.4M4.9 5.5 8 2.4l3.1 3.1M2.6 13.4h10.8" />,
  // Stacked store.
  cache: (
    <>
      <ellipse cx="8" cy="4" rx="5.2" ry="2.2" />
      <path d="M2.8 4v8c0 1.2 2.3 2.2 5.2 2.2s5.2-1 5.2-2.2V4" />
      <path d="M2.8 8c0 1.2 2.3 2.2 5.2 2.2s5.2-1 5.2-2.2" />
    </>
  ),
  // A line with one spike well above the rest.
  peak: <path d="M1.8 12.8 5.1 8.8l2.3 2.5L11 3.6l3.2 9.2" />,
  calendar: (
    <>
      <rect x="2.2" y="3.5" width="11.6" height="10.3" rx="2" />
      <path d="M2.2 6.9h11.6M5.6 2v2.6M10.4 2v2.6" />
    </>
  ),
  // One path, and the lick on the right edge is what keeps it from reading as
  // a water drop. A second inner flame turns to mush at 15px.
  flame: (
    <path d="M9.2 1.6c.3 2.2-1 3.2-2.2 4.4-1.4 1.3-2.6 2.5-2.6 4.3A3.9 3.9 0 0 0 8.3 14.2 3.9 3.9 0 0 0 12.2 10c0-2-1.2-3.2-2.2-4.2-.2 1.1-.7 1.7-1.3 2.1.5-2.1.7-4.3.5-6.3Z" />
  ),
  trophy: (
    <>
      <path d="M4.9 2.4h6.2v3.1a3.1 3.1 0 0 1-6.2 0V2.4Z" />
      <path d="M4.9 3.6H3.3v.9a2.2 2.2 0 0 0 1.9 2.2M11.1 3.6h1.6v.9a2.2 2.2 0 0 1-1.9 2.2" />
      <path d="M8 8.6v2.8M5.6 13.6h4.8" />
    </>
  ),
  clock: (
    <>
      <circle cx="8" cy="8" r="5.8" />
      <path d="M8 4.7V8l2.4 1.5" />
    </>
  ),
};

export function ScoreIcon({ name }: { name: ScoreIconName }) {
  return (
    <svg
      className="score-icon"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
