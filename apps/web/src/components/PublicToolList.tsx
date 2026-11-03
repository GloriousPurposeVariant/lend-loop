"use client";

import { api } from "@lendloop/core/convex/_generated/api";
import { usePaginatedQuery } from "convex/react";
import { buttonStyles, cardStyles, EmptyState, ListSkeleton } from "@/components/ui";

const PAGE_SIZE = 20;

export function PublicToolList() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.tools.listPublic,
    {},
    { initialNumItems: PAGE_SIZE },
  );

  if (status === "LoadingFirstPage") {
    return <ListSkeleton />;
  }
  if (results.length === 0) {
    return <EmptyState title="No tools listed yet. Be the first to lend one." />;
  }

  return (
    <div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {/* The public list has no ids on purpose, so position is the key. */}
        {results.map((tool, i) => (
          <li key={i} className={`${cardStyles} flex items-center justify-between px-4 py-3`}>
            <span className="font-medium">{tool.name}</span>
            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600">
              {tool.category}
            </span>
          </li>
        ))}
      </ul>
      {status === "CanLoadMore" && (
        <button
          type="button"
          onClick={() => loadMore(PAGE_SIZE)}
          className={`${buttonStyles.secondary} mt-4`}
        >
          Show more
        </button>
      )}
      {status === "LoadingMore" && <p className="mt-4 text-sm text-gray-500">Loading…</p>}
    </div>
  );
}
