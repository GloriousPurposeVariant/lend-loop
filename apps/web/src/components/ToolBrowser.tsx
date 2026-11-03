"use client";

import { api } from "@lendloop/core/convex/_generated/api";
import type { Id } from "@lendloop/core/convex/_generated/dataModel";
import { TOOL_LIMITS } from "@lendloop/core/convex/lib/toolFields";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { RequestForm } from "@/components/RequestForm";
import {
  buttonStyles,
  cardStyles,
  EmptyState,
  ErrorText,
  inputStyles,
  ListSkeleton,
} from "@/components/ui";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { formatDateRange } from "@/lib/dates";
import { getErrorMessage } from "@/lib/errors";
import { CONDITION_LABELS } from "@/lib/labels";

const PAGE_SIZE = 20;
// Wait until typing pauses before searching, instead of one query per keystroke.
const SEARCH_DELAY_MS = 300;

type BrowseTool = FunctionReturnType<typeof api.tools.browse>["page"][number];

function AvailabilityBadge({ tool }: { tool: BrowseTool }) {
  if (tool.availability === "available") {
    return (
      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
        Available
      </span>
    );
  }
  return (
    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
      {tool.availableFrom
        ? `On loan · back ${formatDateRange(tool.availableFrom, tool.availableFrom)}`
        : "On loan"}
    </span>
  );
}

export function ToolBrowser() {
  const categories = useQuery(api.categories.listActive);
  const removeTool = useMutation(api.tools.remove);
  const currentUser = useCurrentUser();
  const isAdmin = currentUser.status === "ready" && currentUser.user.role === "admin";
  const [categoryId, setCategoryId] = useState<Id<"categories"> | "">("");
  const [searchText, setSearchText] = useState("");
  const search = useDebouncedValue(searchText.trim(), SEARCH_DELAY_MS);
  const [error, setError] = useState<string | null>(null);
  const { results, status, loadMore } = usePaginatedQuery(
    api.tools.browse,
    {
      ...(categoryId === "" ? {} : { categoryId }),
      ...(search === "" ? {} : { search }),
    },
    { initialNumItems: PAGE_SIZE },
  );

  async function handleAdminRemove(tool: BrowseTool) {
    if (
      !window.confirm(`Remove "${tool.name}" by ${tool.ownerName}? Pending requests are declined.`)
    ) {
      return;
    }
    setError(null);
    try {
      await removeTool({ toolId: tool._id });
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <label className="block text-sm font-medium">
          Search
          <input
            type="search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="e.g. drill, ladder"
            maxLength={TOOL_LIMITS.nameMax}
            className={inputStyles}
          />
        </label>
        <label className="block text-sm font-medium">
          Category
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value as Id<"categories"> | "")}
            className={inputStyles}
          >
            <option value="">All categories</option>
            {categories?.map((c) => (
              <option key={c._id} value={c._id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ErrorText message={error} />

      {status === "LoadingFirstPage" ? (
        <ListSkeleton />
      ) : results.length === 0 ? (
        <EmptyState
          title={search === "" ? "No tools in this category yet." : `No tools match "${search}".`}
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {results.map((tool) => (
            <li key={tool._id} className={`${cardStyles} flex flex-col p-5`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold">{tool.name}</p>
                  <p className="text-sm text-gray-500">
                    {tool.categoryLabel} · {CONDITION_LABELS[tool.condition]}
                  </p>
                </div>
                <AvailabilityBadge tool={tool} />
              </div>

              <p className="mt-3 text-sm text-gray-600">
                Lent by <span className="font-medium text-gray-800">{tool.ownerName}</span>
                {tool.ownerIsTrustedLender && (
                  <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                    Trusted Lender
                  </span>
                )}
              </p>
              {tool.description && <p className="mt-2 text-sm text-gray-700">{tool.description}</p>}
              {tool.upcomingBookings.length > 0 && (
                <p className="mt-2 text-xs text-gray-500">
                  Booked:{" "}
                  {tool.upcomingBookings
                    .map((b) => formatDateRange(b.startDate, b.endDate))
                    .join(", ")}
                </p>
              )}

              <div className="mt-auto pt-4">
                {tool.isMine ? (
                  <p className="text-sm text-gray-500">This is your tool.</p>
                ) : (
                  <RequestForm toolId={tool._id} />
                )}
                {isAdmin && !tool.isMine && (
                  <button
                    type="button"
                    onClick={() => handleAdminRemove(tool)}
                    className={`${buttonStyles.danger} mt-3`}
                  >
                    Remove listing (admin)
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

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
