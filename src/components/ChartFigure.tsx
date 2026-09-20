'use client';

import { useId, type ReactNode } from 'react';

export interface ChartTableColumn<Row> {
  header: string;
  /** Right-aligned in the visible tables; here it only sets the cell scope. */
  cell: (row: Row) => string;
}

/**
 * A chart, named, with the same numbers available as text.
 *
 * Recharts v3 turns each chart into a keyboard-reachable region (its
 * `accessibilityLayer` is on by default, and arrow keys move the tooltip), but
 * that region has no name and its contents are drawn, not written. A screen
 * reader lands on an unnamed application and finds nothing in it.
 *
 * So every chart is wrapped in a `<figure>` with:
 *
 * - a **caption** naming what is plotted (visually hidden - the panel heading
 *   above already says it on screen), and
 * - a **table fallback**, also visually hidden, carrying the series as rows.
 *
 * The table is the part that matters: it is the non-visual route to the data,
 * and it is also what makes the charts' colour ramp acceptable. Neighbouring
 * bands in a nine-step single-hue ramp differ by about 1.2:1, so colour alone
 * can never be the only way to read a value.
 *
 * Keep the row count sane - a 180-row table is worse than useless to page
 * through. Callers summarise (active days only, top N) and say so in the
 * caption.
 */
export function ChartFigure<Row>({
  label,
  summary,
  columns,
  rows,
  children,
}: {
  /** What the chart plots, as a sentence. Becomes the figure's caption. */
  label: string;
  /** Optional extra sentence: what the table below covers, or what was summarised. */
  summary?: string;
  columns: Array<ChartTableColumn<Row>>;
  rows: Row[];
  children: ReactNode;
}) {
  const captionId = useId();
  return (
    <figure className="chart-figure" aria-labelledby={captionId}>
      <figcaption id={captionId} className="sr-only">
        {label}
        {summary ? ` ${summary}` : ''}
      </figcaption>
      {children}
      {rows.length > 0 && (
        <table className="sr-only">
          <caption>{label}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.header} scope="col">
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                {columns.map((column, columnIndex) =>
                  columnIndex === 0 ? (
                    <th key={column.header} scope="row">
                      {column.cell(row)}
                    </th>
                  ) : (
                    <td key={column.header}>{column.cell(row)}</td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </figure>
  );
}
