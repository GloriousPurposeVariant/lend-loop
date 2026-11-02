// Loan dates are "YYYY-MM-DD" calendar days with no time zone.

/** Today's date in the user's own time zone, for the date pickers' minimum. */
export function localToday(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

const formatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** "2026-11-10", "2026-11-12" -> "10 Nov 2026 – 12 Nov 2026" in the user's locale. */
export function formatDateRange(startDate: string, endDate: string): string {
  const start = formatter.format(new Date(`${startDate}T00:00:00Z`));
  if (startDate === endDate) {
    return start;
  }
  return `${start} – ${formatter.format(new Date(`${endDate}T00:00:00Z`))}`;
}
