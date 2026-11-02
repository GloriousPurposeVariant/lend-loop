import { appError } from "./errors";

// Loan dates are calendar days stored as "YYYY-MM-DD" strings. They have no time
// zone, sort correctly as plain strings, and read the same everywhere.

export const MAX_LOAN_DAYS = 30;
export const MAX_DAYS_AHEAD = 180;

const DAY_MS = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar date such as "2026-11-02". "2026-02-30" is false. */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** The UTC calendar date of a timestamp, e.g. Date.now() -> "2026-11-02". */
export function toIsoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return toIsoDate(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS);
}

/** Number of calendar days a loan covers, counting both ends: Mon to Mon is 1. */
export function loanLengthInDays(startDate: string, endDate: string): number {
  return (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / DAY_MS + 1;
}

/**
 * The earliest start date we accept. The server only knows UTC, so we allow one
 * day of grace: at 02:00 UTC it is still "yesterday" for someone in New York.
 */
export function earliestStartDate(now: number): string {
  return addDays(toIsoDate(now), -1);
}

export type DateRange = { startDate: string; endDate: string };

/** Inclusive ranges: a loan ending on the 5th overlaps one starting on the 5th. */
export function rangesOverlap(a: DateRange, b: DateRange): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}

/** Rejects malformed, reversed, past, too long or too distant date ranges. */
export function validateLoanDates(range: DateRange, now: number): void {
  if (!isIsoDate(range.startDate) || !isIsoDate(range.endDate)) {
    throw appError("INVALID_INPUT", "Dates must be real dates in YYYY-MM-DD format.");
  }
  if (range.startDate > range.endDate) {
    throw appError("INVALID_INPUT", "The start date must be on or before the end date.");
  }
  if (range.startDate < earliestStartDate(now)) {
    throw appError("INVALID_INPUT", "The start date cannot be in the past.");
  }
  if (loanLengthInDays(range.startDate, range.endDate) > MAX_LOAN_DAYS) {
    throw appError("INVALID_INPUT", `A loan can last at most ${MAX_LOAN_DAYS} days.`);
  }
  if (range.startDate > addDays(toIsoDate(now), MAX_DAYS_AHEAD)) {
    throw appError("INVALID_INPUT", `You can book at most ${MAX_DAYS_AHEAD} days ahead.`);
  }
}
