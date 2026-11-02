"use client";

import { api } from "@lendloop/core/convex/_generated/api";
import { usePaginatedQuery } from "convex/react";

const PAGE_SIZE = 20;

export function PublicToolList() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.tools.listPublic,
    {},
    { initialNumItems: PAGE_SIZE },
  );

  if (status === "LoadingFirstPage") {
    return (
      <ul aria-busy="true" className="divide-y divide-gray-100">
        {Array.from({ length: 3 }, (_, i) => (
          <li key={i} className="h-12 animate-pulse bg-gray-50" />
        ))}
      </ul>
    );
  }

  if (results.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-gray-500">
        No tools listed yet. Be the first to lend one.
      </p>
    );
  }

  return (
    <div>
      <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
        {/* The public list has no ids on purpose, so position is the key. */}
        {results.map((tool, i) => (
          <li key={i} className="flex items-center justify-between px-4 py-3">
            <span className="font-medium">{tool.name}</span>
            <span className="text-sm text-gray-500">{tool.category}</span>
          </li>
        ))}
      </ul>
      {status === "CanLoadMore" && (
        <button
          type="button"
          onClick={() => loadMore(PAGE_SIZE)}
          className="mt-4 text-sm font-medium text-gray-700 underline"
        >
          Show more
        </button>
      )}
      {status === "LoadingMore" && <p className="mt-4 text-sm text-gray-500">Loading…</p>}
    </div>
  );
}
