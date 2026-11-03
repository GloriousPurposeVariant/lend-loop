// Sends a signed request to the Convex endpoints that n8n uses, exactly as n8n will.
// Handy for trying the endpoints before n8n is set up, and for debugging later.
//
//   npm run n8n:request -- overdue             list overdue loans
//   npm run n8n:request -- reminder <loanId>   report a reminder as sent
//
// Needs N8N_INBOUND_SECRET (the same value as on the Convex deployment).
// CONVEX_SITE_URL defaults to the local backend, http://127.0.0.1:3211.

import { createHmac } from "node:crypto";

const [command, loanId] = process.argv.slice(2);
const secret = process.env.N8N_INBOUND_SECRET;
const siteUrl = process.env.CONVEX_SITE_URL ?? "http://127.0.0.1:3211";

if (!secret) {
  console.error("Set N8N_INBOUND_SECRET first.");
  process.exit(1);
}

let path;
let payload;
if (command === "overdue") {
  path = "/n8n/overdue-loans";
  payload = {};
} else if (command === "reminder" && loanId) {
  path = "/n8n/events";
  const today = new Date().toISOString().slice(0, 10);
  // One id per loan per day: sending this twice is recorded once.
  payload = { id: `reminder:${loanId}:${today}`, type: "reminder.sent", loanId };
} else {
  console.error("Usage: npm run n8n:request -- overdue | reminder <loanId>");
  process.exit(1);
}

const body = JSON.stringify(payload);
const timestamp = Math.floor(Date.now() / 1000).toString();
const signature = `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;

const response = await fetch(`${siteUrl}${path}`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-LendLoop-Timestamp": timestamp,
    "X-LendLoop-Signature": signature,
  },
  body,
});
console.log(`HTTP ${response.status}`);
console.log(JSON.stringify(await response.json(), null, 2));
