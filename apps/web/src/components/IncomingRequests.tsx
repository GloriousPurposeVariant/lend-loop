"use client";

import { api } from "@lendloop/core/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { LoanList } from "@/components/LoanList";
import { buttonStyles } from "@/components/ui";

export function IncomingRequests() {
  const loans = useQuery(api.loans.listIncoming);
  const approve = useMutation(api.loans.approve);
  const decline = useMutation(api.loans.decline);
  const markReturned = useMutation(api.loans.markReturned);

  return (
    <LoanList
      loans={loans}
      emptyText="Nobody has asked to borrow your tools yet."
      emptyAction={
        <Link href="/my-listings" className={buttonStyles.secondary}>
          List a tool
        </Link>
      }
      personLabel={(loan) => `by ${loan.borrowerName}`}
      actions={(loan, run) => {
        if (loan.status === "pending") {
          return (
            <>
              <button
                type="button"
                onClick={() => run(() => approve({ loanId: loan._id }))}
                className={buttonStyles.primary}
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => run(() => decline({ loanId: loan._id }))}
                className={buttonStyles.danger}
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
              className={buttonStyles.secondary}
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
