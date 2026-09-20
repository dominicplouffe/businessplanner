"use client";

import type { StatementTable } from "@/lib/finance/statements";
import { formatAccounting } from "@/lib/finance/format";
import { cn } from "@/lib/utils";

/**
 * A financial statement, typeset as one.
 *
 * Hairline rules rather than zebra striping, tabular figures, negatives in
 * parentheses, subtotals carrying weight while components recede. The table
 * scrolls inside its own container so the page never scrolls sideways.
 */
export function StatementTableView({
  table,
  currency,
}: {
  table: StatementTable;
  currency: string;
}) {
  return (
    <section aria-labelledby={`${table.id}-heading`}>
      <h3 id={`${table.id}-heading`} className="font-display text-xl">
        {table.title}
      </h3>

      {/* tabIndex makes the scroll container reachable by keyboard. Without it
          a sixty-column statement is simply unreadable without a mouse. */}
      <div
        tabIndex={0}
        role="region"
        aria-label={`${table.title}, scrollable`}
        className="mt-4 overflow-x-auto rounded-lg border border-hairline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
      >
        <table className="w-full min-w-[40rem] border-collapse text-right">
          <caption className="sr-only">
            {table.title}, by {table.columns.length === 12 ? "month" : "year"}
          </caption>
          <thead>
            <tr className="border-b border-strong">
              <th scope="col" className="sticky left-0 bg-surface-raised px-4 py-3 text-left text-sm font-medium text-primary">
                &nbsp;
              </th>
              {table.columns.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className="px-4 py-3 text-sm font-medium text-primary"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => {
              const isEmphasised = row.kind === "subtotal" || row.kind === "total";
              const isCheck = row.kind === "check";

              return (
                <tr
                  key={row.key}
                  className={cn(
                    "border-b border-hairline last:border-b-0",
                    row.kind === "total" && "border-t-2 border-t-strong",
                    isCheck && "bg-surface-sunken",
                  )}
                >
                  <th
                    scope="row"
                    className={cn(
                      "sticky left-0 bg-surface-raised px-4 py-2.5 text-left text-sm font-normal",
                      row.indent && "pl-8",
                      isEmphasised ? "font-medium text-primary" : "text-secondary",
                      isCheck && "bg-surface-sunken text-tertiary",
                    )}
                  >
                    {row.label}
                    {row.note ? (
                      <span className="mt-0.5 block text-xs font-normal leading-snug text-tertiary">
                        {row.note}
                      </span>
                    ) : null}
                  </th>

                  {row.values.map((value, i) => (
                    <td
                      key={`${row.key}-${i}`}
                      className={cn(
                        "numeric px-4 py-2.5 text-sm",
                        isEmphasised ? "font-medium text-primary" : "text-secondary",
                        isCheck && (Math.abs(value) < 0.01 ? "text-good" : "text-critical"),
                      )}
                    >
                      {isCheck && Math.abs(value) < 0.01
                        ? "0"
                        : formatAccounting(value, currency)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
