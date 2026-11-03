import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, verify } from "./lib/signing";

// HTTP endpoints, served on the Convex site URL (http://127.0.0.1:3211 locally).
// Only n8n calls these, and every request must be signed with N8N_INBOUND_SECRET.

const http = httpRouter();

/** Reads the body and checks the signature. Returns the body, or the error response to send. */
async function readSignedBody(
  request: Request,
): Promise<{ body: string; error?: undefined } | { error: Response }> {
  const secret = process.env.N8N_INBOUND_SECRET;
  if (!secret) {
    return { error: Response.json({ error: "Not configured." }, { status: 503 }) };
  }
  // Verify the exact bytes that were signed, before parsing anything.
  const body = await request.text();
  const result = await verify({
    secret,
    timestamp: request.headers.get(TIMESTAMP_HEADER),
    signature: request.headers.get(SIGNATURE_HEADER),
    body,
    nowMs: Date.now(),
  });
  if (result === "stale") {
    return { error: Response.json({ error: "Request expired." }, { status: 401 }) };
  }
  if (result === "invalid") {
    return { error: Response.json({ error: "Invalid signature." }, { status: 401 }) };
  }
  return { body };
}

/** Checks and trims the fields of a workflow.failed event, or returns null if they are wrong. */
function workflowFailureFields(fields: Record<string, unknown>) {
  const { workflowName, nodeName, message, executionId, executionUrl } = fields;
  if (
    typeof workflowName !== "string" ||
    typeof message !== "string" ||
    typeof executionId !== "string" ||
    (nodeName !== undefined && typeof nodeName !== "string") ||
    (executionUrl !== undefined && typeof executionUrl !== "string")
  ) {
    return null;
  }
  return {
    workflowName: workflowName.slice(0, 200),
    nodeName: nodeName?.slice(0, 200),
    // Error messages can be long; the admin page only needs the start.
    message: message.slice(0, 2000),
    executionId: executionId.slice(0, 100),
    // Shown as a link, so only ever an http(s) address.
    executionUrl: executionUrl?.startsWith("http") ? executionUrl.slice(0, 500) : undefined,
  };
}

/** Overdue loans that still need a reminder today. n8n calls this on a schedule. */
http.route({
  path: "/n8n/overdue-loans",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const signed = await readSignedBody(request);
    if (signed.error) {
      return signed.error;
    }
    const loans = await ctx.runQuery(internal.n8n.overdueLoans, {});
    return Response.json({ loans });
  }),
});

/**
 * n8n reports something it did. Body: { "id": "...", "type": ..., ... }
 *   reminder.sent    an overdue reminder went to the borrower of "loanId"
 *   email.sent       an email about "loanId" went to "recipient": "lender" | "borrower"
 *   workflow.failed  a run of "workflowName" failed (sent by n8n's Error Workflow)
 */

http.route({
  path: "/n8n/events",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const signed = await readSignedBody(request);
    if (signed.error) {
      return signed.error;
    }
    let event: unknown;
    try {
      event = JSON.parse(signed.body);
    } catch {
      return Response.json({ error: "Body must be JSON." }, { status: 400 });
    }
    const fields = (event ?? {}) as Record<string, unknown>;
    const { id, type, loanId, recipient } = fields;
    if (typeof id !== "string" || id.length === 0 || id.length > 200) {
      return Response.json({ error: "id must be a non-empty string." }, { status: 400 });
    }
    if (type === "workflow.failed") {
      const failure = workflowFailureFields(fields);
      if (failure === null) {
        return Response.json({ error: "Invalid workflow.failed event." }, { status: 400 });
      }
      const status = await ctx.runMutation(internal.n8n.recordWorkflowFailure, {
        eventId: id,
        ...failure,
      });
      return Response.json({ status });
    }
    if (typeof loanId !== "string") {
      return Response.json({ error: "loanId must be a string." }, { status: 400 });
    }
    if (type === "reminder.sent") {
      const status = await ctx.runMutation(internal.n8n.recordReminderSent, {
        eventId: id,
        loanId,
      });
      return Response.json({ status });
    }
    if (type === "email.sent" && (recipient === "lender" || recipient === "borrower")) {
      const status = await ctx.runMutation(internal.n8n.recordEmailSent, {
        eventId: id,
        loanId,
        recipient,
      });
      return Response.json({ status });
    }
    return Response.json({ error: "Unknown event type." }, { status: 400 });
  }),
});
export default http;
