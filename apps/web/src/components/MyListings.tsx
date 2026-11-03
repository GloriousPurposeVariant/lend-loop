"use client";

import { api } from "@lendloop/core/convex/_generated/api";
import type { Id } from "@lendloop/core/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { buttonStyles, cardStyles, EmptyState, ErrorText, ListSkeleton } from "@/components/ui";
import { getErrorMessage } from "@/lib/errors";
import { CONDITION_LABELS } from "@/lib/labels";

export function MyListings() {
  const tools = useQuery(api.tools.listMine);
  const removeTool = useMutation(api.tools.remove);
  const [error, setError] = useState<string | null>(null);

  async function handleRemove(toolId: Id<"tools">, name: string) {
    if (!window.confirm(`Remove "${name}" from LendLoop? Pending requests for it are declined.`)) {
      return;
    }
    setError(null);
    try {
      await removeTool({ toolId });
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  if (tools === undefined) {
    return <ListSkeleton />;
  }
  if (tools.length === 0) {
    return <EmptyState title="You have not listed any tools yet. Use the form above." />;
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Your tools</h2>
      <ErrorText message={error} />
      <ul className={`${cardStyles} divide-y divide-gray-100`}>
        {tools.map((tool) => (
          <li key={tool._id} className="flex items-start justify-between gap-4 px-4 py-3">
            <div>
              <p className="font-medium">{tool.name}</p>
              <p className="text-sm text-gray-500">
                {tool.categoryLabel} · {CONDITION_LABELS[tool.condition]}
              </p>
              {tool.description && <p className="mt-1 text-sm text-gray-700">{tool.description}</p>}
            </div>
            <button
              type="button"
              onClick={() => handleRemove(tool._id, tool.name)}
              className={buttonStyles.danger}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
