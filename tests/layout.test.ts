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
