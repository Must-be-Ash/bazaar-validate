"use client";

import { motion } from "framer-motion";
import { ProbeResult } from "@/lib/diagnostics";
import { DiagnosticChecklist } from "@/components/diagnostic-checklist";
import { RawResponseViewer } from "@/components/raw-response-viewer";
import { GlowButton } from "@/components/ui/glow-button";

interface ResultsNotFoundProps {
  probeResult: ProbeResult | null;
  probing: boolean;
  onOpenWizard: (step?: number) => void;
}

export function ResultsNotFound({
  probeResult,
  probing,
  onOpenWizard,
}: ResultsNotFoundProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full space-y-4"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="w-3 h-3 rounded-full bg-warning animate-pulse" />
        <h2 className="text-lg font-medium text-warning">
          Not Found on Bazaar
        </h2>
      </div>

      {probing && (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <div className="w-4 h-4 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
          Probing endpoint...
        </div>
      )}

      {probeResult && (
        <>
          {/* Auth-gated warning */}
          {probeResult.reachable &&
            !probeResult.returns402 &&
            (probeResult.statusCode === 200 ||
              probeResult.statusCode === 401 ||
              probeResult.statusCode === 403) && (
              <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 text-sm">
                <p className="font-medium text-warning mb-1">
                  {probeResult.statusCode === 200
                    ? "Endpoint returns 200 OK"
                    : `Endpoint returns ${probeResult.statusCode}`}
                </p>
                <p className="text-muted-foreground">
                  {probeResult.statusCode === 200
                    ? "Your endpoint must return 402 Payment Required to unauthenticated requests for indexing to work. It currently returns 200 (OK) without requiring payment."
                    : "Auth middleware may be running before x402 middleware. The endpoint must return 402 to unauthenticated requests, but it's returning an auth error instead. Ensure x402 middleware runs first."}
                </p>
              </div>
            )}

          <DiagnosticChecklist
            diagnostics={probeResult.diagnostics}
            onJumpToWizard={(step) => onOpenWizard(step)}
          />

          {probeResult.reachable && (
            <RawResponseViewer
              statusCode={probeResult.statusCode}
              headers={probeResult.rawHeaders}
              body={probeResult.rawBody}
            />
          )}

          <div className="flex justify-center pt-2">
            <GlowButton onClick={() => onOpenWizard()}>
              Fix with Setup Wizard
            </GlowButton>
          </div>
        </>
      )}
    </motion.div>
  );
}
