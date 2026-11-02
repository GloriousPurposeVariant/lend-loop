"use client";

import { api } from "@lendloop/core/convex/_generated/api";
import { useQuery } from "convex/react";

export function BackendStatus() {
  const status = useQuery(api.health.ping);

  return <p>Backend: {status ?? "connecting..."}</p>;
}
