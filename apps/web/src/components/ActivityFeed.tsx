"use client";

import { api } from "@lendloop/core/convex/_generated/api";
import { usePaginatedQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { buttonStyles, cardStyles, EmptyState, ListSkeleton } from "@/components/ui";
import { formatDateRange, formatTimeAgo } from "@/lib/dates";

const PAGE_SIZE = 20;

type Activity = FunctionReturnType<typeof api.activity.listMine>["page"][number];

/** One line in the feed, written from the reader's side of the loan. */
function describe(entry: Activity): string {
  const { otherName: other, toolName: tool } = entry;
  const isLender = entry.role === "lender";
  switch (entry.kind) {
    case "loan.requested":
      return isLender
        ? `${other} asked to borrow your ${tool}`
        : `You asked ${other} to borrow the ${tool}`;
    case "loan.approved":
      return isLender
        ? `You approved ${other}'s request for your ${tool}`
        : `${other} approved your request for the ${tool}`;
    case "loan.declined":
      if (entry.declineReason === "conflict") {
        return isLender
          ? `${other}'s request for your ${tool} was declined: those dates went to someone else`
          : `Your request for the ${tool} was declined: someone else was approved for those dates`;
      }
      if (entry.declineReason === "toolRemoved") {
        return isLender
          ? `${other}'s request for your ${tool} was declined: the tool was removed`
          : `Your request for the ${tool} was declined: the tool was removed`;
      }
      return isLender
        ? `You declined ${other}'s request for your ${tool}`
        : `${other} declined your request for the ${tool}`;
    case "loan.cancelled":
      return isLender
        ? `${other} cancelled their request for your ${tool}`
        : `You cancelled your request for the ${tool}`;
    case "loan.returned":
      return isLender
        ? `You marked your ${tool} as returned by ${other}`
        : `${other} marked the ${tool} as returned`;
    case "email.sent":
      return `We emailed you about the ${tool}`;
    case "reminder.sent":
      return isLender
        ? `We reminded ${other} to return your ${tool}`
        : `We emailed you a reminder to return the ${tool} to ${other}`;
  }
}

/** Entries n8n reported, as opposed to things people did. */
function isAutomated(entry: Activity) {
  return entry.kind === "email.sent" || entry.kind === "reminder.sent";
}

/** The caller's activity feed, newest first. Convex pushes new entries as they happen. */
export function ActivityFeed() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.activity.listMine,
    {},
    { initialNumItems: PAGE_SIZE },
  );

  if (status === "LoadingFirstPage") {
    return <ListSkeleton />;
  }
  if (results.length === 0) {
    return (
      <EmptyState title="Nothing here yet. Borrow or lend something and it shows up here.">
        <Link href="/tools" className={buttonStyles.primary}>
          Browse tools
        </Link>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <ul className={`${cardStyles} divide-y divide-gray-100`}>
        {results.map((entry) => (
          <li key={entry._id} className="flex items-start gap-3 px-4 py-3">
            <span
              aria-hidden="true"
              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                isAutomated(entry) ? "bg-gray-300" : "bg-emerald-500"
              }`}
            />
            <div className="min-w-0 flex-1">
              <p className={isAutomated(entry) ? "text-gray-600" : "font-medium"}>
                {describe(entry)}
                {isAutomated(entry) && (
                  <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 align-middle text-xs font-normal text-gray-500">
                    Email
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-sm text-gray-500">
                {formatDateRange(entry.startDate, entry.endDate)} ·{" "}
                <time dateTime={new Date(entry._creationTime).toISOString()}>
                  {formatTimeAgo(entry._creationTime)}
                </time>
              </p>
            </div>
          </li>
        ))}
      </ul>
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
