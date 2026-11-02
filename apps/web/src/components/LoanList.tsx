"use client";

import type { api } from "@lendloop/core/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { useState, type ReactNode } from "react";
import { LoanStatusBadge } from "@/components/LoanStatusBadge";
import { formatDateRange } from "@/lib/dates";
import { getErrorMessage } from "@/lib/errors";

export type LoanSummary = FunctionReturnType<typeof api.loans.listMyRequests>[number];

type Props = {
  loans: LoanSummary[] | undefined;
  emptyText: string;
  /** Who to name on each row: the lender on My requests, the borrower on Incoming. */
  personLabel: (loan: LoanSummary) => string;
  /** Buttons for a row. `run` shows any error above the list. */
  actions: (loan: LoanSummary, run: (action: () => Promise<unknown>) => void) => ReactNode;
};

/** Shared list for My requests and Incoming requests. */
export function LoanList({ loans, emptyText, personLabel, actions }: Props) {
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<unknown>) {
    setError(null);
    action().catch((e: unknown) => setError(getErrorMessage(e)));
  }

  if (loans === undefined) {
    return <p className="text-sm text-gray-500">Loading…</p>;
  }
  if (loans.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-gray-500">
        {emptyText}
      </p>
    );
  }

  return (
    <div>
      {error !== null && (
        <p role="alert" className="mb-2 text-sm text-red-600">
          {error}
        </p>
      )}
      <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
        {loans.map((loan) => (
          <li
            key={loan._id}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          >
            <div>
              <p className="font-medium">
                {loan.toolName} <LoanStatusBadge {...loan} />
              </p>
              <p className="text-sm text-gray-500">
                {formatDateRange(loan.startDate, loan.endDate)} · {personLabel(loan)}
              </p>
            </div>
            <div className="flex gap-3 text-sm">{actions(loan, run)}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
