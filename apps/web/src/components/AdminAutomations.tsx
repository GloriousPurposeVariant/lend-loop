"use client";

import { api } from "@lendloop/core/convex/_generated/api";
import type { Id } from "@lendloop/core/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { buttonStyles, cardStyles, EmptyState, ErrorText, ListSkeleton } from "@/components/ui";
import { formatTimeAgo } from "@/lib/dates";
import { getErrorMessage } from "@/lib/errors";

type Delivery = FunctionReturnType<typeof api.automations.listProblemDeliveries>[number];

const STATUS_STYLES: Record<Delivery["status"], { label: string; className: string }> = {
  failed: { label: "Failed", className: "bg-red-100 text-red-800" },
  pending: { label: "Retrying", className: "bg-amber-100 text-amber-800" },
  skipped: { label: "Skipped", className: "bg-gray-100 text-gray-700" },
  delivered: { label: "Delivered", className: "bg-emerald-100 text-emerald-800" },
};

function DeliveryRow({
  delivery,
  onRetry,
}: {
  delivery: Delivery;
  onRetry: (id: Id<"outboundEvents">) => void;
}) {
  const style = STATUS_STYLES[delivery.status];
  const canRetry = delivery.status === "failed" || delivery.status === "skipped";
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          {delivery.type} · {delivery.toolName}
          <span className={`rounded-full px-2 py-0.5 text-xs ${style.className}`}>
            {style.label}
          </span>
        </p>
        <p className="mt-0.5 text-sm text-gray-500">
          {formatTimeAgo(delivery._creationTime)} · {delivery.attempts} attempt
          {delivery.attempts === 1 ? "" : "s"}
          {delivery.nextAttemptAt && ` · next try ${formatTimeAgo(delivery.nextAttemptAt)}`}
        </p>
        {delivery.lastError && (
          <p className="mt-1 font-mono text-xs break-all text-gray-600">{delivery.lastError}</p>
        )}
      </div>
      {canRetry && (
        <button
          type="button"
          onClick={() => onRetry(delivery._id)}
          className={buttonStyles.secondary}
        >
          Retry
        </button>
      )}
    </li>
  );
}

/** Deliveries to n8n that need attention, and n8n runs that failed. */
export function AdminAutomations() {
  const deliveries = useQuery(api.automations.listProblemDeliveries);
  const failures = useQuery(api.automations.listWorkflowFailures);
  const retryDelivery = useMutation(api.automations.retryDelivery);
  const [error, setError] = useState<string | null>(null);

  function handleRetry(eventId: Id<"outboundEvents">) {
    setError(null);
    retryDelivery({ eventId }).catch((e: unknown) => setError(getErrorMessage(e)));
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Deliveries to n8n</h2>
          <p className="text-sm text-gray-600">
            Events Convex could not hand to n8n. Failed ones gave up after 6 attempts; skipped ones
            were recorded while n8n was not configured.
          </p>
        </div>
        <ErrorText message={error} />
        {deliveries === undefined ? (
          <ListSkeleton />
        ) : deliveries.length === 0 ? (
          <EmptyState title="Every event reached n8n." />
        ) : (
          <ul className={`${cardStyles} divide-y divide-gray-100`}>
            {deliveries.map((delivery) => (
              <DeliveryRow key={delivery._id} delivery={delivery} onRetry={handleRetry} />
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Failed n8n runs</h2>
          <p className="text-sm text-gray-600">
            Reported by the n8n Error Workflow whenever a LendLoop workflow fails.
          </p>
        </div>
        {failures === undefined ? (
          <ListSkeleton />
        ) : failures.length === 0 ? (
          <EmptyState title="No failed runs." />
        ) : (
          <ul className={`${cardStyles} divide-y divide-gray-100`}>
            {failures.map((failure) => (
              <li key={failure._id} className="px-4 py-3">
                <p className="font-medium">
                  {failure.workflowName}
                  {failure.nodeName && (
                    <span className="font-normal text-gray-500"> · at “{failure.nodeName}”</span>
                  )}
                </p>
                <p className="mt-1 font-mono text-xs break-all text-gray-600">{failure.message}</p>
                <p className="mt-1 text-sm text-gray-500">
                  {formatTimeAgo(failure._creationTime)}
                  {failure.executionUrl && (
                    <>
                      {" · "}
                      <a
                        href={failure.executionUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-700 underline hover:text-emerald-800"
                      >
                        Open run in n8n
                      </a>
                    </>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
