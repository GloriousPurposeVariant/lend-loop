"use client";

import { api } from "@lendloop/core/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { LoanList } from "@/components/LoanList";

export function MyRequests() {
  const loans = useQuery(api.loans.listMyRequests);
  const cancel = useMutation(api.loans.cancel);

  return (
    <LoanList
      loans={loans}
      emptyText="You have not asked to borrow anything yet."
      personLabel={(loan) => `from ${loan.lenderName}`}
      actions={(loan, run) =>
        loan.status === "pending" && (
          <button
            type="button"
            onClick={() => run(() => cancel({ loanId: loan._id }))}
            className="text-gray-600 hover:underline"
          >
            Cancel request
          </button>
        )
      }
    />
  );
}
