"use client";

import type { api } from "@lendloop/core/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { useState, type ReactNode } from "react";
import { LoanStatusBadge } from "@/components/LoanStatusBadge";
import { cardStyles, EmptyState, ErrorText, ListSkeleton } from "@/components/ui";
import { formatDateRange } from "@/lib/dates";
import { getErrorMessage } from "@/lib/errors";

export type LoanSummary = FunctionReturnType<typeof api.loans.listMyRequests>[number];

type Props = {
  loans: LoanSummary[] | undefined;
  emptyText: string;
  /** Optional next step shown in the empty state, e.g. a link to Browse. */
  emptyAction?: ReactNode;
  /** Who to name on each row: the lender on My requests, the borrower on Incoming. */
  personLabel: (loan: LoanSummary) => string;
  /** Buttons for a row. `run` shows any error above the list. */
  actions?: (loan: LoanSummary, run: (action: () => Promise<unknown>) => void) => ReactNode;
};

/** Shared list for My requests, Incoming requests and the admin loan list. */
export function LoanList({ loans, emptyText, emptyAction, personLabel, actions }: Props) {
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<unknown>) {
    setError(null);
    action().catch((e: unknown) => setError(getErrorMessage(e)));
  }

  if (loans === undefined) {
    return <ListSkeleton />;
  }
  if (loans.length === 0) {
    return <EmptyState title={emptyText}>{emptyAction}</EmptyState>;
  }

  return (
    <div className="space-y-3">
      <ErrorText message={error} />
      <ul className={`${cardStyles} divide-y divide-gray-100`}>
        {loans.map((loan) => (
          <li
            key={loan._id}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          >
            <div>
              <p className="flex flex-wrap items-center gap-2 font-medium">
                {loan.toolName} <LoanStatusBadge {...loan} />
              </p>
              <p className="mt-0.5 text-sm text-gray-500">
                {formatDateRange(loan.startDate, loan.endDate)} · {personLabel(loan)}
              </p>
            </div>
            {actions && <div className="flex gap-2">{actions(loan, run)}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}
