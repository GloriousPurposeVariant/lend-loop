import { useEffect, useState } from "react";

/** `value`, but only once it has stopped changing for `delayMs`. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    // A new value before the delay is up cancels the pending update.
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
