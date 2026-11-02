"use client";

import { api } from "@lendloop/core/convex/_generated/api";
import type { Id } from "@lendloop/core/convex/_generated/dataModel";
import { usePaginatedQuery, useQuery } from "convex/react";
import { useState } from "react";
import { RequestForm } from "@/components/RequestForm";
import { CONDITION_LABELS } from "@/lib/labels";

const PAGE_SIZE = 20;

export function ToolBrowser() {
  const categories = useQuery(api.categories.listActive);
  const [categoryId, setCategoryId] = useState<Id<"categories"> | "">("");
  const { results, status, loadMore } = usePaginatedQuery(
    api.tools.browse,
    categoryId === "" ? {} : { categoryId },
    { initialNumItems: PAGE_SIZE },
  );

  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium">
        Category
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value as Id<"categories"> | "")}
          className="mt-1 block rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">All categories</option>
          {categories?.map((c) => (
            <option key={c._id} value={c._id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      {status === "LoadingFirstPage" ? (
        <p className="text-sm text-gray-500">Loading tools…</p>
      ) : results.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-gray-500">
          No tools in this category yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {results.map((tool) => (
            <li key={tool._id} className="rounded-lg border border-gray-200 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium">{tool.name}</p>
                <p className="text-sm text-gray-500">
                  {tool.categoryLabel} · {CONDITION_LABELS[tool.condition]}
                </p>
              </div>
              <p className="mt-1 text-sm text-gray-600">
                Lent by {tool.ownerName}
                {tool.ownerIsTrustedLender && (
                  <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                    Trusted Lender
                  </span>
                )}
              </p>
              {tool.description && <p className="mt-2 text-sm text-gray-700">{tool.description}</p>}
              {tool.isMine ? (
                <p className="mt-3 text-sm text-gray-500">This is your tool.</p>
              ) : (
                <RequestForm toolId={tool._id} />
              )}
            </li>
          ))}
        </ul>
      )}

      {status === "CanLoadMore" && (
        <button
          type="button"
          onClick={() => loadMore(PAGE_SIZE)}
          className="text-sm font-medium text-gray-700 underline"
        >
          Show more
        </button>
      )}
    </div>
  );
}
