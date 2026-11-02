"use client";

import { api } from "@lendloop/core/convex/_generated/api";
import type { Id } from "@lendloop/core/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { getErrorMessage } from "@/lib/errors";
import { CONDITION_LABELS } from "@/lib/labels";

export function MyListings() {
  const tools = useQuery(api.tools.listMine);
  const removeTool = useMutation(api.tools.remove);
  const [error, setError] = useState<string | null>(null);

  async function handleRemove(toolId: Id<"tools">, name: string) {
    if (!window.confirm(`Remove "${name}" from LendLoop?`)) {
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
    return <p className="text-sm text-gray-500">Loading your listings…</p>;
  }

  if (tools.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-gray-500">
        You have not listed any tools yet.
      </p>
    );
  }

  return (
    <div>
      {error !== null && (
        <p role="alert" className="mb-2 text-sm text-red-600">
          {error}
        </p>
      )}
      <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
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
              className="text-sm text-red-600 hover:underline"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
