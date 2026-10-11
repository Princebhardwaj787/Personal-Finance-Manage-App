/**
 * Visually hidden data table.
 * Charts must never be the only way to read the numbers (§26) — this is the
 * accessible equivalent of every chart on the dashboard.
 *
 * Pure helpers live in ./chartTicks so this file exports only a component
 * (React Fast Refresh requirement).
 */
export function ChartDataTable({ caption, rows, columns }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Period</th>
          {columns.map((column) => <th key={column.key} scope="col">{column.label}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key ?? row.label}>
            <th scope="row">{row.label}</th>
            {columns.map((column) => (
              <td key={column.key}>{column.format(row[column.key])}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
