/**
 * The rules that stop the page scrolling sideways.
 *
 * Every one of these is a bug that actually shipped, found by measuring a
 * signed-in page in a browser rather than by reading the CSS. They are cheap
 * to undo by accident - each is a single declaration whose purpose is not
 * obvious from the property name - so each gets a test that says why.
 *
 * A stylesheet test cannot prove a layout. What it can do is fail when the one
 * declaration holding a documented bug shut is deleted, which is what happened
 * to all three of these.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { PROVIDERS } from '../src/lib/providers';

const css = fs.readFileSync(path.join(process.cwd(), 'src/app/globals.css'), 'utf8');

/** The declarations of one rule, by its exact selector text. */
function rule(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `rule not found: ${selector}`);
  const end = css.indexOf('\n}', start);
  assert.ok(end > start, `unterminated rule: ${selector}`);
  return css.slice(start, end);
}

const declares = (selector: string, property: string, value: string) =>
  new RegExp(`${property}\\s*:\\s*${value}\\s*;`).test(rule(selector));

describe('the info tip cannot widen the table it sits in', () => {
  it('hides the bubble with display, not opacity', () => {
    // A box hidden with `opacity: 0` is still laid out, and an absolutely
    // positioned descendant still counts toward a scroll container's width.
    assert.ok(declares('.info-tip::after', 'display', 'none'));
  });

  it('resets white-space, which a table header would otherwise impose', () => {
    // Inherited `nowrap` from a `<th>` rendered the 290px bubble as one
    // ~1540px line: the text was clipped out of view and the table grew a
    // scrollbar on hover. Measured at 1540px of overflow before, 8px after.
    assert.ok(
      declares('.info-tip::after', 'white-space', 'normal'),
      '.info-tip::after must reset white-space',
    );
  });

  it('keeps the width the bubble is measured at', () => {
    assert.ok(declares('.info-tip::after', 'width', '290px'));
  });

  it('positions a bubble inside a table against the scroller', () => {
    // Against the panel instead, the bubble sat at the tip's LAYOUT position -
    // out in the part of a wide table you cannot see. At 997px it was drawn
    // past the panel's edge, invisible, and put 63px of horizontal scroll on
    // the whole page while it was open.
    assert.ok(declares('.table-scroll', 'position', 'relative'));
    // `overflow-x: auto` forces `overflow-y` to compute as `auto` as well, so
    // a bubble below the header of a short table raises a vertical scrollbar.
    assert.ok(declares('.table-scroll', 'overflow-y', 'hidden'));
    assert.ok(declares('.table-scroll .info-tip::after', 'top', 'calc\\(100% \\+ 10px\\)'));
    assert.ok(declares('.table-scroll .info-tip::after', 'bottom', 'auto'));
  });

  it('anchors a bubble in a table’s last columns to its right edge', () => {
    const anchored = rule('.table-scroll th:nth-last-child(-n + 3) .info-tip::after');
    assert.ok(/right\s*:\s*0\s*;/.test(anchored));
    assert.ok(/--tip-x\s*:\s*0%\s*;/.test(anchored));
  });

  it('keeps the entry animation in step with whichever anchor is used', () => {
    // A keyframe that hard-coded translateX(-50%) would slide a right-anchored
    // bubble half its width sideways for the length of the animation.
    assert.ok(declares('.info-tip::after', '--tip-x', '-50%'));
    const frames = rule('@keyframes tipIn');
    assert.ok(!/translateX\(-50%\)/.test(frames), 'tipIn must not hard-code the centring');
    assert.ok(/translateX\(var\(--tip-x\)\)/.test(frames));
  });
});

describe('visually hidden text cannot drag the page wider', () => {
  const sr = rule('.sr-only');

  it('is taken out of flow and clipped', () => {
    assert.ok(/position\s*:\s*absolute\s*;/.test(sr));
    assert.ok(/width\s*:\s*1px\s*;/.test(sr));
  });

  it('is anchored to its containing block, not left at its static position', () => {
    // Being 1px wide is not enough: inside `.table-scroll` the static position
    // is out in the overflowing part of a table wider than the panel, and the
    // scroller is not a containing block, so the box escapes the clip. One of
    // these sat at x=1150 against a 982px viewport and put a horizontal
    // scrollbar on the whole document.
    assert.ok(declares('.sr-only', 'left', '0'), '.sr-only must set left');
    assert.ok(declares('.sr-only', 'top', '0'), '.sr-only must set top');
  });
});

describe('the top bar gives way instead of overflowing', () => {
  it('lets both flex levels shrink below their content', () => {
    // `min-width: auto` is the flex default, so without these the bar refuses
    // to shrink: at 997px with the rail expanded it needed 766px in a 730px
    // shell and pushed Refresh 36px past the viewport edge.
    assert.ok(declares('.topbar-inner', 'min-width', '0'));
    assert.ok(declares('.topbar-spacer', 'min-width', '0'));
  });

  it('makes the status line the thing that truncates', () => {
    assert.ok(declares('.refresh-meta', 'text-overflow', 'ellipsis'));
    assert.ok(declares('.refresh-meta', 'overflow', 'hidden'));
  });

  it('keeps the two controls whole', () => {
    const controls = rule('.topbar-spacer .signout,\n.topbar-spacer .btn');
    assert.ok(/flex-shrink\s*:\s*0\s*;/.test(controls));
    assert.ok(/white-space\s*:\s*nowrap\s*;/.test(controls));
  });
});

describe('phones get the desktop layout, fitted to the screen', () => {
  it('lays the dashboard out 1024px wide, with no initial scale', async () => {
    // Next merges this over its default `initial-scale=1`; left in, that shows
    // the left third of the page at full size instead of fitting it.
    const { viewport } = await import('../src/app/(dash)/[provider]/layout');
    assert.equal(viewport.width, 1024);
    assert.ok('initialScale' in viewport, 'initialScale must be present to override the default');
    assert.equal(viewport.initialScale, undefined);
  });
});

describe('the top bar becomes two rows in a narrow window', () => {
  // The single row needs ~560px and a 360px phone leaves it 262. Chrome did not
  // scroll the overflow, it zoomed the whole dashboard out to ~45% to show it.
  // Phones get the desktop layout now, so this serves narrow desktop windows.
  const start = css.indexOf('@media (max-width: 720px) {');
  const end = css.indexOf('\n}', start);
  const phone = css.slice(start, end);
  const inPhone = (selector: string, property: string, value: string) => {
    const at = phone.indexOf(`  ${selector} {`);
    assert.ok(at >= 0, `phone rule not found: ${selector}`);
    const body = phone.slice(at, phone.indexOf('}', at));
    return new RegExp(`${property}\\s*:\\s*${value}\\s*;`).test(body);
  };

  it('has a phone layout at all', () => {
    assert.ok(start >= 0, 'no @media (max-width: 720px) block');
  });

  it('wraps rather than using a grid, whose columns both rows would share', () => {
    // A grid gave Refresh's column to the tabs' row too, which then overflowed.
    assert.ok(inPhone('.topbar-inner', 'flex-wrap', 'wrap'));
    assert.doesNotMatch(phone, /display\s*:\s*grid/);
  });

  it('lets the right-hand cluster join the rows, and forces the break', () => {
    assert.ok(inPhone('.topbar-spacer', 'display', 'contents'));
    assert.ok(inPhone('.topbar-inner::after', 'flex-basis', '100%'));
  });

  it('keeps the tabs narrow enough to share a row with Sign out at 360px', () => {
    // At the desktop's 15px side padding the row was 0.5px short of fitting.
    assert.ok(inPhone('.nav-link', 'padding', '7px 11px'));
  });
});

describe('the headline total fits its card, however long it gets', () => {
  // A fixed clamp(58px, 8vw, 92px) overflowed the page at five figures:
  // "$12,345.67" at 80px is ~420px, and the grid's first column grew to fit
  // it and pushed the grid past the card.
  const value = rule('.headline-value');
  const card = rule('.headline-card');

  it('sizes against the card, which is a container for it', () => {
    assert.ok(declares('.headline-card', 'container-type', 'inline-size'));
    assert.match(value, /100cqi/);
  });

  it('divides the room by the figure’s own length', () => {
    assert.match(value, /var\(--chars/);
  });

  it('leaves room for the side columns, from the size they are drawn at', () => {
    assert.match(value, /var\(--headline-reserve\)/);
    assert.match(card, /--headline-reserve\s*:\s*calc\([^;]*var\(--headline-side-size\)/);
    assert.ok(declares('.headline-side-value', 'font-size', 'var\\(--headline-side-size\\)'));
  });

  it('never grows past the size it always had', () => {
    assert.match(value, /clamp\(58px, 8vw, 92px\)/);
  });

  it('drops the reserve where the grid is one column, after the rule it overrides', () => {
    // A same-specificity override above the base rule loses on source order,
    // which is exactly how an earlier version of this fix failed silently.
    const base = css.indexOf('.headline-card {');
    const one = css.indexOf('--headline-reserve: 0px;');
    assert.ok(one > base, 'the one-column reserve must come after the base rule');
    assert.ok(css.lastIndexOf('@media (max-width: 900px) {', one) > base);
  });
});

describe('project detail skeleton metrics', () => {
  for (const provider of Object.values(PROVIDERS)) {
    describe(provider.label, () => {
      const { detail, modelCards } = provider.skeleton;

      it('carries a height for every section of the page', () => {
        for (const [key, value] of Object.entries(detail)) {
          assert.ok(Number.isFinite(value) && value > 0, `${key} is not a positive number`);
        }
      });

      it('sizes the stat grid for a project, not for the whole agent', () => {
        // A project uses a subset of the agent's models. Reusing the
        // agent-wide count wrapped the placeholder to an extra row at 997px.
        assert.ok(
          detail.modelCards <= modelCards,
          'a project cannot use more models than its agent',
        );
      });
    });
  }
});

describe('a chart legend row gives way in a narrow window', () => {
  // A bare `1fr` name column never shrank below its text, so in a narrow
  // window a row spilled out of its card - 3px past the page at 320px.
  const start = css.indexOf('@media (max-width: 760px) {\n  .model-legend-row {');
  const block = css.slice(start, css.indexOf('\n}', start));

  it('lets the name column shrink, in both legends', () => {
    assert.ok(start >= 0, 'narrow-window legend block not found');
    assert.match(block, /\.model-legend-row \{\s*grid-template-columns: minmax\(0, 1fr\) auto;/);
    assert.match(
      block,
      /\.model-legend-compact \.model-legend-row \{\s*grid-template-columns: minmax\(0, 1fr\) auto auto;/,
    );
  });

  it('wraps the name instead of letting it push the row wider', () => {
    assert.match(block, /\.model-legend-name \{[^}]*min-width: 0;[^}]*overflow-wrap: anywhere;/);
  });

  it('gives the spend legend’s name a line of its own in the narrowest windows', () => {
    // Beside a cost and a share at 320px the name had ~20px - wrapped, a word
    // a letter at a time; truncated, "o…".
    const narrow = css.indexOf('@media (max-width: 440px) {');
    assert.ok(narrow > start, 'the 440px block must follow the 760px one');
    const rules = css.slice(narrow, css.indexOf('\n}', narrow));
    assert.match(rules, /\.model-legend-compact \.model-legend-name \{\s*grid-column: 1 \/ -1;/);
  });
});
