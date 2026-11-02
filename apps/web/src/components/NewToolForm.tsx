"use client";

import { api } from "@lendloop/core/convex/_generated/api";
import {
  TOOL_CATEGORIES,
  TOOL_CONDITIONS,
  TOOL_LIMITS,
  type ToolCategory,
  type ToolCondition,
} from "@lendloop/core/convex/lib/toolFields";
import { useMutation } from "convex/react";
import { useState, type FormEvent } from "react";
import { getErrorMessage } from "@/lib/errors";
import { CATEGORY_LABELS, CONDITION_LABELS } from "@/lib/labels";

const inputClass = "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm";

export function NewToolForm() {
  const createTool = useMutation(api.tools.create);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<ToolCategory>(TOOL_CATEGORIES[0]);
  const [condition, setCondition] = useState<ToolCondition>("good");
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      await createTool({ name, category, condition, description });
      setName("");
      setDescription("");
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-gray-200 p-4">
      <h2 className="text-lg font-semibold">List a tool</h2>
      <label className="block text-sm font-medium">
        Name
        <input
          required
          minLength={TOOL_LIMITS.nameMin}
          maxLength={TOOL_LIMITS.nameMax}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Category
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as ToolCategory)}
            className={inputClass}
          >
            {TOOL_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Condition
          <select
            value={condition}
            onChange={(e) => setCondition(e.target.value as ToolCondition)}
            className={inputClass}
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
          className={inputClass}
        />
      </label>
      {error !== null && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={isSaving}
        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
      >
        {isSaving ? "Saving…" : "List tool"}
      </button>
    </form>
  );
}
