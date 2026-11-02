"use client";

import { api } from "@lendloop/core/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { LoanList } from "@/components/LoanList";

export function IncomingRequests() {
  const loans = useQuery(api.loans.listIncoming);
  const approve = useMutation(api.loans.approve);
  const decline = useMutation(api.loans.decline);
  const markReturned = useMutation(api.loans.markReturned);

  return (
    <LoanList
      loans={loans}
      emptyText="Nobody has asked to borrow your tools yet."
      personLabel={(loan) => `by ${loan.borrowerName}`}
      actions={(loan, run) => {
        if (loan.status === "pending") {
          return (
            <>
              <button
                type="button"
                onClick={() => run(() => approve({ loanId: loan._id }))}
                className="font-medium text-green-700 hover:underline"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => run(() => decline({ loanId: loan._id }))}
                className="text-red-600 hover:underline"
              >
                Decline
              </button>
            </>
          );
        }
        if (loan.status === "approved") {
          return (
            <button
              type="button"
              onClick={() => run(() => markReturned({ loanId: loan._id }))}
              className="font-medium hover:underline"
            >
              Mark returned
            </button>
          );
        }
        return null;
      }}
    />
  );
}
