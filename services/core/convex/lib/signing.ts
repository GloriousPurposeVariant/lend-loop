// HMAC-SHA256 signatures for requests between Convex and n8n, in both directions.
//
// The sender signs "<timestamp>.<body>" with a shared secret and sends:
//   X-LendLoop-Timestamp: 1793620800            (Unix seconds)
//   X-LendLoop-Signature: sha256=<64 hex chars>
// The receiver recomputes the signature. A match proves the body came from someone
// with the secret and was not changed. The timestamp is signed too, so an old request
// cannot be replayed later with a fresh timestamp.

export const TIMESTAMP_HEADER = "X-LendLoop-Timestamp";
export const SIGNATURE_HEADER = "X-LendLoop-Signature";

/** How far a request's timestamp may be from our clock before we refuse it. */
export const MAX_CLOCK_SKEW_SECONDS = 5 * 60;

const encoder = new TextEncoder();

function importKey(secret: string, usage: "sign" | "verify") {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** The X-LendLoop-Signature value for this timestamp and body. */
export async function sign(secret: string, timestamp: string, body: string): Promise<string> {
  const key = await importKey(secret, "sign");
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${body}`));
  return `sha256=${toHex(mac)}`;
}

/**
 * Checks a signed request. "stale" means the timestamp is too far from `nowMs`;
 * "invalid" means a missing or wrong signature.
 */
export async function verify(args: {
  secret: string;
  timestamp: string | null;
  signature: string | null;
  body: string;
  nowMs: number;
}): Promise<"ok" | "stale" | "invalid"> {
  const { timestamp, signature } = args;
  if (timestamp === null || !/^\d{1,12}$/.test(timestamp)) {
    return "invalid";
  }
  if (Math.abs(args.nowMs / 1000 - Number(timestamp)) > MAX_CLOCK_SKEW_SECONDS) {
    return "stale";
  }
  const match = signature === null ? null : /^sha256=([0-9a-f]{64})$/.exec(signature);
  if (match === null) {
    return "invalid";
  }
  const key = await importKey(args.secret, "verify");
  // crypto.subtle.verify compares in constant time, so response timing reveals nothing.
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    fromHex(match[1]),
    encoder.encode(`${timestamp}.${args.body}`),
  );
  return valid ? "ok" : "invalid";
}
