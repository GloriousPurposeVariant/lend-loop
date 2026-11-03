"use client";

import { api } from "@lendloop/core/convex/_generated/api";
import { usePaginatedQuery } from "convex/react";
import { LoanList } from "@/components/LoanList";
import { buttonStyles } from "@/components/ui";

const PAGE_SIZE = 25;

/** Every loan on the platform, newest first. Read-only: decisions belong to lenders. */
export function AdminLoans() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.loans.listAll,
    {},
    { initialNumItems: PAGE_SIZE },
  );

  return (
    <div className="space-y-4">
      <LoanList
        loans={status === "LoadingFirstPage" ? undefined : results}
        emptyText="No loans yet."
        personLabel={(loan) => `${loan.lenderName} → ${loan.borrowerName}`}
      />
      {status === "CanLoadMore" && (
        <button
          type="button"
          onClick={() => loadMore(PAGE_SIZE)}
          className={buttonStyles.secondary}
        >
          Show more
        </button>
      )}
    </div>
  );
}
