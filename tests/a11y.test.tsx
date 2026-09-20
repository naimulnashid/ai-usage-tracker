/**
 * Markup-level accessibility checks.
 *
 * These render the two shared wrappers to static HTML - no browser, no DOM
 * library - and assert the attributes a screen reader and a keyboard actually
 * depend on. They are the regression guard for the pass that made the info
 * tips focusable and gave every chart a name and a table.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
// tsx compiles this file's JSX with the classic runtime, so React must be in
// scope even though the app itself never needs the import.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { ChartFigure } from '../src/components/ChartFigure';
import { EmptyState } from '../src/components/EmptyState';
import { InfoTip } from '../src/components/InfoTip';
import { ProviderScope } from '../src/components/ProviderScope';
import { PROVIDERS } from '../src/lib/providers';

const render = (element: React.ReactElement) => renderToStaticMarkup(element);

describe('InfoTip', () => {
  const html = render(<InfoTip label="About runtime" text="Runtime is the sum of gaps." />);

  it('is a button, so it can be reached without a mouse', () => {
    assert.match(html, /<button[^>]*type="button"/);
    assert.match(html, /class="info-tip"/);
  });

  it('has a name of its own', () => {
    assert.match(html, /aria-label="About runtime"/);
  });

  it('points aria-describedby at an element holding the explanation', () => {
    const described = html.match(/aria-describedby="([^"]+)"/);
    assert.ok(described, 'no aria-describedby');
    const id = described[1];
    const target = new RegExp(`id="${id.replace(/[$:]/g, '\\$&')}"[^>]*class="sr-only"`);
    assert.match(html, target);
    assert.match(html, /Runtime is the sum of gaps\./);
  });

  it('keeps the visible bubble in CSS, where display can toggle it', () => {
    // Load-bearing: a laid-out-but-hidden bubble adds scroll width inside
    // .table-scroll. See globals.css.
    assert.match(html, /data-tip="Runtime is the sum of gaps\."/);
  });

  it('hides the decorative glyph from assistive tech', () => {
    assert.match(html, /aria-hidden="true">i</);
  });
});

describe('ChartFigure', () => {
  const rows = [
    { date: 'Mon, Aug 3 2026', spend: '$1.50' },
    { date: 'Tue, Aug 4 2026', spend: '$2.25' },
  ];
  const columns = [
    { header: 'Date', cell: (row: (typeof rows)[number]) => row.date },
    { header: 'Spend', cell: (row: (typeof rows)[number]) => row.spend },
  ];
  const html = render(
    <ChartFigure label="Daily combined spend." summary="2 days, oldest first." columns={columns} rows={rows}>
      <div className="chart-wrap">chart goes here</div>
    </ChartFigure>,
  );

  it('names the figure with a caption that assistive tech reads', () => {
    const labelled = html.match(/<figure[^>]*aria-labelledby="([^"]+)"/);
    assert.ok(labelled, 'figure has no aria-labelledby');
    const id = labelled[1].replace(/[$:]/g, '\\$&');
    assert.match(html, new RegExp(`<figcaption id="${id}" class="sr-only">`));
    assert.match(html, /Daily combined spend\. 2 days, oldest first\./);
  });

  it('renders the chart itself', () => {
    assert.match(html, /chart goes here/);
  });

  it('carries the same numbers as a table, for anyone not reading the picture', () => {
    assert.match(html, /<table class="sr-only">/);
    assert.match(html, /<caption>Daily combined spend\.<\/caption>/);
    assert.match(html, /<th scope="col">Date<\/th>/);
    assert.match(html, /<th scope="col">Spend<\/th>/);
    assert.match(html, /<th scope="row">Mon, Aug 3 2026<\/th>/);
    assert.match(html, /<td>\$2\.25<\/td>/);
    assert.equal((html.match(/<tr>/g) ?? []).length, 3, 'one header row plus one per data row');
  });

  it('omits the table when there is nothing to put in it', () => {
    const empty = render(
      <ChartFigure label="Nothing yet." columns={columns} rows={[]}>
        <div>empty chart</div>
      </ChartFigure>,
    );
    assert.doesNotMatch(empty, /<table/);
    assert.match(empty, /Nothing yet\./);
  });
});

describe('EmptyState', () => {
  const html = render(
    <ProviderScope provider={PROVIDERS.claude}>
      <EmptyState warnings={['Cannot read projects directory /nowhere: ENOENT']} />
    </ProviderScope>,
  );

  it('says which agent found nothing, rather than showing zeroes', () => {
    assert.match(html, /No Claude Code usage found yet/);
  });

  it('says where it looked and how to point it elsewhere', () => {
    assert.match(html, /Looked in/);
    assert.match(html, /USERPROFILE/);
    assert.match(html, /\.claude/);
    assert.match(html, /CLAUDE_CONFIG_DIR/);
  });

  it('tucks the raw warning away instead of leading with it', () => {
    assert.match(html, /<details[^>]*class="empty-state-details"/);
    assert.match(html, /What the parser reported \(1\)/);
    assert.match(html, /ENOENT/);
  });

  it('shows no details block when the parse had nothing to report', () => {
    const quiet = render(
      <ProviderScope provider={PROVIDERS.codex}>
        <EmptyState />
      </ProviderScope>,
    );
    assert.doesNotMatch(quiet, /<details/);
    assert.match(quiet, /No Codex usage found yet/);
    assert.match(quiet, /CODEX_HOME/);
  });
});
