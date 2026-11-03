"use client";

import { api } from "@lendloop/core/convex/_generated/api";
import type { Id } from "@lendloop/core/convex/_generated/dataModel";
import { CATEGORY_LIMITS } from "@lendloop/core/convex/lib/categoryFields";
import { useMutation, useQuery } from "convex/react";
import { useState, type FormEvent } from "react";
import {
  buttonStyles,
  cardStyles,
  EmptyState,
  ErrorText,
  inputStyles,
  ListSkeleton,
} from "@/components/ui";
import { getErrorMessage } from "@/lib/errors";

export function AdminCategories() {
  const categories = useQuery(api.categories.listAll);
  const createCategory = useMutation(api.categories.create);
  const renameCategory = useMutation(api.categories.rename);
  const setActive = useMutation(api.categories.setActive);
  const [newLabel, setNewLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Runs a mutation and shows its error message, so each button stays one line.
  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      return true;
    } catch (e) {
      setError(getErrorMessage(e));
      return false;
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await run(() => createCategory({ label: newLabel }))) {
      setNewLabel("");
    }
  }

  function handleRename(categoryId: Id<"categories">, current: string) {
    const label = window.prompt("New name for this category:", current);
    if (label !== null && label !== current) {
      void run(() => renameCategory({ categoryId, label }));
    }
  }

  if (categories === undefined) {
    return <ListSkeleton />;
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleCreate} className="flex max-w-md items-end gap-2">
        <input
          required
          minLength={CATEGORY_LIMITS.labelMin}
          maxLength={CATEGORY_LIMITS.labelMax}
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="New category, e.g. Bikes"
          aria-label="New category name"
          className={inputStyles}
        />
        <button type="submit" className={buttonStyles.primary}>
          Add
        </button>
      </form>

      <ErrorText message={error} />

      {categories.length === 0 ? (
        <EmptyState title="No categories yet. Add one above, or run npm run categories:seed." />
      ) : (
        <ul className={`${cardStyles} divide-y divide-gray-100`}>
          {categories.map((c) => (
            <li key={c._id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div>
                <span className={c.isActive ? "font-medium" : "text-gray-400 line-through"}>
                  {c.label}
                </span>
                <span className="ml-2 text-xs text-gray-400">{c.slug}</span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleRename(c._id, c.label)}
                  className={buttonStyles.secondary}
                >
                  Rename
                </button>
                <button
                  type="button"
                  onClick={() => run(() => setActive({ categoryId: c._id, isActive: !c.isActive }))}
                  className={c.isActive ? buttonStyles.danger : buttonStyles.secondary}
                >
                  {c.isActive ? "Deactivate" : "Reactivate"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
