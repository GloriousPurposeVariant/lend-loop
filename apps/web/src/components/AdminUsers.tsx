"use client";

import { api } from "@lendloop/core/convex/_generated/api";
import { useMutation, usePaginatedQuery } from "convex/react";
import { useState } from "react";
import { buttonStyles, cardStyles, EmptyState, ErrorText, ListSkeleton } from "@/components/ui";
import { getErrorMessage } from "@/lib/errors";

const PAGE_SIZE = 25;

/** Members A to Z, with the Trusted Lender switch. */
export function AdminUsers() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.users.listForAdmin,
    {},
    { initialNumItems: PAGE_SIZE },
  );
  const setTrustedLender = useMutation(api.users.setTrustedLender);
  const [error, setError] = useState<string | null>(null);

  if (status === "LoadingFirstPage") {
    return <ListSkeleton />;
  }
  if (results.length === 0) {
    return <EmptyState title="No members yet." />;
  }

  return (
    <div className="space-y-4">
      <ErrorText message={error} />
      <ul className={`${cardStyles} divide-y divide-gray-100`}>
        {results.map((user) => (
          <li
            key={user._id}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          >
            <div>
              <p className="flex flex-wrap items-center gap-2 font-medium">
                {user.displayName}
                {user.role === "admin" && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs">Admin</span>
                )}
                {user.isTrustedLender && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
                    Trusted Lender
                  </span>
                )}
              </p>
              <p className="text-sm text-gray-500">{user.email}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setTrustedLender({
                  userId: user._id,
                  isTrustedLender: !user.isTrustedLender,
                }).catch((e: unknown) => setError(getErrorMessage(e)));
              }}
              className={user.isTrustedLender ? buttonStyles.secondary : buttonStyles.primary}
            >
              {user.isTrustedLender ? "Remove Trusted Lender" : "Mark Trusted Lender"}
            </button>
          </li>
        ))}
      </ul>
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
