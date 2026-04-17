import React, { useState } from "react";

interface Column {
  key: string;
  label: string;
  render?: (value: any, row: Record<string, any>) => React.ReactNode;
}

interface Props {
  columns: Column[];
  data: Record<string, any>[];
}

export function Table({ columns, data }: Props) {
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);

  return (
    <div className="border-2 rounded-xl border-[var(--cl-border)] w-full overflow-x-auto">
      <table
        className="w-full text-sm"
        style={{ color: "var(--cl-font-primary)" }}
      >
        <thead>
          <tr style={{ borderBottom: "1px solid var(--cl-border)" }}>
            {columns.map((col) => (
              <th
                key={col.key}
                className="text-left text-base px-4 py-3 font-semibold"
                style={{ color: "var(--cl-font-secondary)" }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {data.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              onMouseEnter={() => setHoveredRow(rowIndex)}
              onMouseLeave={() => setHoveredRow(null)}
              className="transition-colors duration-200"
              style={{
                borderBottom: "1px solid var(--cl-border)",
                background:
                  hoveredRow === rowIndex
                    ? "var(--bg-tables-selector)"
                    : "var(--bg-tables)",
              }}
            >
              {columns.map((col) => (
                <td key={col.key} className="px-4 py-3">
                  {col.render ? col.render(row[col.key], row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
