"use client";

import { api } from "@lendloop/core/convex/_generated/api";
import type { Id } from "@lendloop/core/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { useState, type FormEvent } from "react";
import { localToday } from "@/lib/dates";
import { getErrorMessage } from "@/lib/errors";

const inputClass = "mt-1 rounded-md border border-gray-300 px-2 py-1 text-sm";

/** Borrow request for one tool. The server re-checks every rule. */
export function RequestForm({ toolId }: { toolId: Id<"tools"> }) {
  const requestLoan = useMutation(api.loans.request);
  const today = localToday();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage(null);
    try {
      await requestLoan({ toolId, startDate, endDate });
      setMessage({ kind: "ok", text: "Request sent. Track it under My requests." });
    } catch (e) {
      setMessage({ kind: "error", text: getErrorMessage(e) });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 flex flex-wrap items-end gap-3">
      <label className="text-xs font-medium text-gray-600">
        From
        <input
          type="date"
          required
          min={today}
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className={`${inputClass} block`}
        />
      </label>
      <label className="text-xs font-medium text-gray-600">
        To
        <input
          type="date"
          required
          min={startDate}
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className={`${inputClass} block`}
        />
      </label>
      <button
        type="submit"
        disabled={isSaving}
        className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
      >
        {isSaving ? "Sending…" : "Request to borrow"}
      </button>
      {message !== null && (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={`w-full text-sm ${message.kind === "error" ? "text-red-600" : "text-green-700"}`}
        >
          {message.text}
        </p>
      )}
    </form>
  );
}
