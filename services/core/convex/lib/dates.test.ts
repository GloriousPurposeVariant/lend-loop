import { describe, expect, test } from "vitest";
import { ConvexError } from "convex/values";
import {
  earliestStartDate,
  isIsoDate,
  loanLengthInDays,
  rangesOverlap,
  validateLoanDates,
} from "./dates";

// 2026-11-02 at 12:00 UTC.
const NOW = Date.parse("2026-11-02T12:00:00Z");

function errorCode(fn: () => void): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof ConvexError ? (e.data as { code: string }).code : "NOT_APP_ERROR";
  }
}

describe("isIsoDate", () => {
  test("accepts real dates and rejects everything else", () => {
    expect(isIsoDate("2026-11-02")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-1-2")).toBe(false);
    expect(isIsoDate("02/11/2026")).toBe(false);
  });
});

describe("loanLengthInDays", () => {
  test("counts both ends", () => {
    expect(loanLengthInDays("2026-11-02", "2026-11-02")).toBe(1);
    expect(loanLengthInDays("2026-11-02", "2026-11-04")).toBe(3);
    expect(loanLengthInDays("2026-12-31", "2027-01-01")).toBe(2);
  });
});

describe("earliestStartDate", () => {
  test("allows one day of grace for time zones behind UTC", () => {
    expect(earliestStartDate(NOW)).toBe("2026-11-01");
  });
});

describe("rangesOverlap", () => {
  const a = { startDate: "2026-11-10", endDate: "2026-11-12" };

  test("touching on one day counts as overlapping", () => {
    expect(rangesOverlap(a, { startDate: "2026-11-12", endDate: "2026-11-15" })).toBe(true);
    expect(rangesOverlap(a, { startDate: "2026-11-05", endDate: "2026-11-10" })).toBe(true);
  });

  test("a range inside another overlaps", () => {
    expect(rangesOverlap(a, { startDate: "2026-11-11", endDate: "2026-11-11" })).toBe(true);
  });

  test("ranges that only meet at the next day do not overlap", () => {
    expect(rangesOverlap(a, { startDate: "2026-11-13", endDate: "2026-11-14" })).toBe(false);
    expect(rangesOverlap(a, { startDate: "2026-11-01", endDate: "2026-11-09" })).toBe(false);
  });
});

describe("validateLoanDates", () => {
  const check = (startDate: string, endDate: string) =>
    errorCode(() => validateLoanDates({ startDate, endDate }, NOW));

  test("accepts today, yesterday (grace) and a one-day loan", () => {
    expect(check("2026-11-02", "2026-11-02")).toBeNull();
    expect(check("2026-11-01", "2026-11-03")).toBeNull();
  });

  test("rejects malformed, reversed, past, too long and too distant ranges", () => {
    expect(check("2026-11-31", "2026-12-01")).toBe("INVALID_INPUT");
    expect(check("2026-11-05", "2026-11-04")).toBe("INVALID_INPUT");
    expect(check("2026-10-31", "2026-11-02")).toBe("INVALID_INPUT");
    expect(check("2026-11-02", "2026-12-02")).toBe("INVALID_INPUT");
    expect(check("2027-06-01", "2027-06-02")).toBe("INVALID_INPUT");
  });

  test("allows exactly the maximum length", () => {
    expect(check("2026-11-02", "2026-12-01")).toBeNull();
  });
});
