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

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["minute", 60],
  ["hour", 60],
  ["day", 24],
  ["week", 7],
];

/**
 * A timestamp relative to now, in the user's locale: "just now", "5 minutes ago",
 * "yesterday", or for future times "in 2 minutes".
 */
export function formatTimeAgo(ms: number, now = Date.now()): string {
  const seconds = (ms - now) / 1000; // negative for the past
  let value = Math.abs(seconds);
  if (value < 60) {
    return "just now";
  }
  let unit: Intl.RelativeTimeFormatUnit = "second";
  for (const [next, size] of STEPS) {
    if (value < size) {
      break;
    }
    value /= size;
    unit = next;
  }
  return relative.format(Math.sign(seconds) * Math.floor(value), unit);
}
