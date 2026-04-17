"use client";

import { useEffect, useRef, useState } from "react";
import type { CheckResult } from "@/lib/diagnostics";

const DEFAULT_INTERVAL_MS = 10_000;
const DEFAULT_MAX_DURATION_MS = 5 * 60 * 1000;

export type PollStatus = "idle" | "polling" | "found" | "timeout" | "error";

export interface PollState {
  status: PollStatus;
  attempts: number;
  result: CheckResult | null;
  errorMessage?: string;
}

interface Options {
  intervalMs?: number;
  maxDurationMs?: number;
}

// useDiscoveryPoll polls /api/check repeatedly until either (a) the endpoint
// shows up as indexed, (b) the time budget runs out, or (c) the caller calls
// stop(). Used after the user triggers their first payment to detect the
// "we got it" moment without forcing them to refresh.
export function useDiscoveryPoll(
  url: string | null,
  active: boolean,
  options: Options = {},
): { state: PollState; stop: () => void } {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const maxDurationMs = options.maxDurationMs ?? DEFAULT_MAX_DURATION_MS;
  const [state, setState] = useState<PollState>({
    status: "idle",
    attempts: 0,
    result: null,
  });
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!active || !url) {
      setState({ status: "idle", attempts: 0, result: null });
      return;
    }

    cancelledRef.current = false;
    const startedAt = Date.now();
    let attempts = 0;
    setState({ status: "polling", attempts: 0, result: null });

    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelledRef.current) return;
      if (Date.now() - startedAt > maxDurationMs) {
        setState((s) => ({ ...s, status: "timeout" }));
        return;
      }
      attempts += 1;
      try {
        const res = await fetch("/api/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        if (!res.ok) {
          throw new Error(`/api/check returned ${res.status}`);
        }
        const data = (await res.json()) as CheckResult;
        if (cancelledRef.current) return;
        if (data.found) {
          setState({ status: "found", attempts, result: data });
          return;
        }
        setState({ status: "polling", attempts, result: null });
        timeoutId = setTimeout(tick, intervalMs);
      } catch (err) {
        if (cancelledRef.current) return;
        const message = err instanceof Error ? err.message : "poll failed";
        setState({ status: "error", attempts, result: null, errorMessage: message });
      }
    };

    // Fire first poll immediately, then schedule on interval.
    tick();

    return () => {
      cancelledRef.current = true;
      if (timeoutId !== null) clearTimeout(timeoutId);
    };
  }, [url, active, intervalMs, maxDurationMs]);

  function stop() {
    cancelledRef.current = true;
    setState((s) => ({ ...s, status: "idle" }));
  }

  return { state, stop };
}
