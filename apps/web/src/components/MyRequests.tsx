"use client";

import { api } from "@lendloop/core/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { LoanList } from "@/components/LoanList";
import { buttonStyles } from "@/components/ui";

export function MyRequests() {
  const loans = useQuery(api.loans.listMyRequests);
  const cancel = useMutation(api.loans.cancel);

  return (
    <LoanList
      loans={loans}
      emptyText="You have not asked to borrow anything yet."
      emptyAction={
        <Link href="/tools" className={buttonStyles.primary}>
          Browse tools
        </Link>
      }
      personLabel={(loan) => `from ${loan.lenderName}`}
      actions={(loan, run) =>
        loan.status === "pending" && (
          <button
            type="button"
            onClick={() => run(() => cancel({ loanId: loan._id }))}
            className={buttonStyles.secondary}
          >
            Cancel request
          </button>
        )
      }
    />
  );
}
