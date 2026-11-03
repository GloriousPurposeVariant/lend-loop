"use client";

import { api } from "@lendloop/core/convex/_generated/api";
import type { Id } from "@lendloop/core/convex/_generated/dataModel";
import {
  TOOL_CONDITIONS,
  TOOL_LIMITS,
  type ToolCondition,
} from "@lendloop/core/convex/lib/toolFields";
import { useMutation, useQuery } from "convex/react";
import { useState, type FormEvent } from "react";
import { getErrorMessage } from "@/lib/errors";
import { CONDITION_LABELS } from "@/lib/labels";
import {
  buttonStyles,
  cardStyles,
  EmptyState,
  ErrorText,
  inputStyles,
  ListSkeleton,
} from "@/components/ui";

export function NewToolForm() {
  const categories = useQuery(api.categories.listActive);
  const createTool = useMutation(api.tools.create);
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<Id<"categories"> | "">("");
  const [condition, setCondition] = useState<ToolCondition>("good");
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (categoryId === "") {
      setError("Choose a category.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await createTool({ name, categoryId, condition, description });
      setName("");
      setDescription("");
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setIsSaving(false);
    }
  }

  if (categories === undefined) {
    return <ListSkeleton rows={1} />;
  }

  if (categories.length === 0) {
    return (
      <EmptyState title="No categories yet. An admin needs to add some before tools can be listed." />
    );
  }

  return (
    <form onSubmit={handleSubmit} className={`${cardStyles} space-y-4 p-5`}>
      <h2 className="text-lg font-semibold">List a tool</h2>
      <label className="block text-sm font-medium">
        Name
        <input
          required
          minLength={TOOL_LIMITS.nameMin}
          maxLength={TOOL_LIMITS.nameMax}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputStyles}
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Category
          <select
            required
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value as Id<"categories">)}
            className={inputStyles}
          >
            <option value="" disabled>
              Choose a category
            </option>
            {categories.map((c) => (
              <option key={c._id} value={c._id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Condition
          <select
            value={condition}
            onChange={(e) => setCondition(e.target.value as ToolCondition)}
            className={inputStyles}
          >
            {TOOL_CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {CONDITION_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-sm font-medium">
        Description
        <textarea
          rows={3}
          maxLength={TOOL_LIMITS.descriptionMax}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={inputStyles}
        />
      </label>
      <ErrorText message={error} />
      <button type="submit" disabled={isSaving} className={buttonStyles.primary}>
        {isSaving ? "Saving…" : "List tool"}
      </button>
    </form>
  );
}
