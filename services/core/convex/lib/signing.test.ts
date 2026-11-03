import { describe, expect, test } from "vitest";
import { sign, verify } from "./signing";

const secret = "test-secret";
const timestamp = "1793620800"; // 2026-11-02 12:00:00 UTC
const nowMs = 1793620800 * 1000;
const body = '{"hello":"world"}';

// Computed independently with Node's crypto, the library n8n's Code node uses:
// createHmac("sha256", "test-secret").update('1793620800.{"hello":"world"}').digest("hex")
const expected = "sha256=574f68d76e70f69a2956d5463adff4be8af31d4419394fd7484214745882bb36";

describe("sign", () => {
  test("matches a signature computed with Node's crypto", async () => {
    expect(await sign(secret, timestamp, body)).toBe(expected);
  });
});

describe("verify", () => {
  const valid = { secret, timestamp, signature: expected, body, nowMs };

  test("accepts a correct signature", async () => {
    expect(await verify(valid)).toBe("ok");
  });

  test("rejects a changed body, a wrong secret or a changed timestamp", async () => {
    expect(await verify({ ...valid, body: '{"hello":"there"}' })).toBe("invalid");
    expect(await verify({ ...valid, secret: "other-secret" })).toBe("invalid");
    expect(await verify({ ...valid, timestamp: "1793620801" })).toBe("invalid");
  });

  test("rejects missing or malformed headers", async () => {
    expect(await verify({ ...valid, signature: null })).toBe("invalid");
    expect(await verify({ ...valid, timestamp: null })).toBe("invalid");
    expect(await verify({ ...valid, signature: expected.slice("sha256=".length) })).toBe("invalid");
    expect(await verify({ ...valid, timestamp: "soon" })).toBe("invalid");
  });

  test("rejects requests more than 5 minutes old or ahead", async () => {
    expect(await verify({ ...valid, nowMs: nowMs + 5 * 60_000 })).toBe("ok");
    expect(await verify({ ...valid, nowMs: nowMs + 5 * 60_000 + 1000 })).toBe("stale");
    expect(await verify({ ...valid, nowMs: nowMs - 5 * 60_000 - 1000 })).toBe("stale");
  });
});
