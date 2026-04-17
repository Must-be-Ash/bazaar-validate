"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ProbeResult } from "@/lib/diagnostics";
import { DiagnosticChecklist } from "@/components/diagnostic-checklist";
import { RawResponseViewer } from "@/components/raw-response-viewer";
import { FirstPaymentHelper } from "@/components/first-payment-helper";
import { useDiscoveryPoll } from "@/hooks/use-discovery-poll";

interface Props {
  probeResult: ProbeResult | null;
  validatedUrl?: string;
  validatedMethod?: string;
  onIndexed?: () => void;
  // When true, automatically start polling on mount. Used after a wizard
  // re-validate so the user doesn't have to click "watch for indexing" again.
  autoWatch?: boolean;
}

// ResultsAwaitingPayment is shown when validation passed end-to-end but the
// discovery API hasn't cataloged the endpoint yet — almost always because no
// payment has been processed by the CDP facilitator.
export function ResultsAwaitingPayment({
  probeResult,
  validatedUrl,
  validatedMethod,
  onIndexed,
  autoWatch,
}: Props) {
  const [showChecks, setShowChecks] = useState(false);
  const [watching, setWatching] = useState(!!autoWatch);
  const { state: pollState, stop } = useDiscoveryPoll(validatedUrl ?? null, watching);

  // Promote to indexed when the poll catches it.
  if (pollState.status === "found" && watching) {
    setWatching(false);
    onIndexed?.();
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full space-y-4"
    >
      <div className="flex items-center gap-3 mb-2">
        <div className="w-3 h-3 rounded-full bg-success animate-pulse" />
        <h2 className="text-lg font-medium text-success">
          Implementation looks correct
        </h2>
      </div>

      <div className="bg-muted border border-border rounded-lg p-4 text-sm space-y-2">
        <p className="text-foreground">
          Every check passed and the bazaar extension parses cleanly.
        </p>
        <p className="text-muted-foreground">
          The CDP facilitator catalogs endpoints the first time it processes
          a verify + settle. Trigger one payment from a funded wallet against{" "}
          {validatedUrl ? (
            <span className="font-mono text-xs text-foreground/80">
              {validatedMethod ?? "GET"} {validatedUrl}
            </span>
          ) : (
            "your endpoint"
          )}
          {" "}and your endpoint will appear in the Bazaar within ~30 seconds.
        </p>
      </div>

      {validatedUrl && (
        <FirstPaymentHelper
          validatedUrl={validatedUrl}
          validatedMethod={validatedMethod ?? "GET"}
          probeResult={probeResult}
          onWatchForIndexing={() => setWatching(true)}
          watching={watching && pollState.status === "polling"}
        />
      )}

      {watching && pollState.status === "polling" && (
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <div className="w-3 h-3 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
          Polling /api/check (attempt {pollState.attempts})…{" "}
          <button
            type="button"
            onClick={stop}
            className="underline hover:text-foreground"
          >
            cancel
          </button>
        </div>
      )}
      {pollState.status === "timeout" && (
        <div className="text-xs text-warning">
          Stopped polling after 5 minutes. The endpoint hasn&apos;t appeared
          yet. Make sure the payment settled successfully via the CDP
          facilitator and try again.
        </div>
      )}
      {pollState.status === "error" && (
        <div className="text-xs text-warning">
          Polling failed: {pollState.errorMessage}
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowChecks((v) => !v)}
        className="text-xs text-muted-foreground hover:text-foreground underline"
      >
        {showChecks ? "Hide" : "Show"} validation details (all checks passed)
      </button>

      {showChecks && probeResult && (
        <>
          <DiagnosticChecklist
            diagnostics={probeResult.diagnostics}
            onJumpToWizard={() => {
              /* no-op — implementation is correct */
            }}
          />
          <RawResponseViewer
            statusCode={probeResult.statusCode}
            headers={probeResult.rawHeaders}
            body={probeResult.rawBody}
          />
        </>
      )}
    </motion.div>
  );
}
