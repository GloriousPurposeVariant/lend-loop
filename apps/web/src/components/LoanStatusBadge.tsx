import type { Doc } from "@lendloop/core/convex/_generated/dataModel";

type Loan = Pick<Doc<"loans">, "status" | "declineReason">;

const STYLES: Record<Loan["status"], string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-800",
  declined: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-600",
  returned: "bg-blue-100 text-blue-800",
};

const LABELS: Record<Loan["status"], string> = {
  pending: "Pending",
  approved: "Approved",
  declined: "Declined",
  cancelled: "Cancelled",
  returned: "Returned",
};

const DECLINE_REASONS: Record<NonNullable<Loan["declineReason"]>, string> = {
  conflict: "dates taken",
  toolRemoved: "tool removed",
};

export function LoanStatusBadge({ status, declineReason }: Loan) {
  const reason = declineReason ? ` (${DECLINE_REASONS[declineReason]})` : "";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[status]}`}>
      {LABELS[status]}
      {reason}
    </span>
  );
}
