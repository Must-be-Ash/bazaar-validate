"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { ProbeResult } from "@/lib/diagnostics";
import { GlowButton } from "@/components/ui/glow-button";

interface Props {
  probeResult: ProbeResult | null;
  validatedUrl?: string;
  onOpenWizard: (step?: number) => void;
  // When true (default), automatically open the wizard at step 0 on mount.
  autoOpen?: boolean;
}

// ResultsNeverTried is shown when the endpoint is reachable but has no x402
// markers at all (no 402, no x402Version, no payment requirements). This is
// the "user hasn't set up x402 yet" path — different from broken implementation.
export function ResultsNeverTried({
  probeResult,
  validatedUrl,
  onOpenWizard,
  autoOpen = true,
}: Props) {
  useEffect(() => {
    if (autoOpen) onOpenWizard(0);
    // intentionally only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full space-y-4"
    >
      <div className="space-y-5">
        <div className="space-y-2">
          <h2 className="text-lg font-medium text-foreground">
            No x402 configuration detected
          </h2>
          <p className="text-sm text-muted-foreground">
            {validatedUrl ? (
              <>
                <span className="font-mono text-foreground/70">{validatedUrl}</span>
                {" didn't return any x402 payment requirements"}
                {probeResult && (
                  <>
                    {" (status "}
                    <span className="font-mono text-foreground/70">
                      {probeResult.statusCode}
                    </span>
                    {", no "}
                    <span className="font-mono text-foreground/70">x402Version</span>
                    {")"}
                  </>
                )}
                {". The setup wizard will scaffold x402 and Bazaar discovery for your stack."}
              </>
            ) : (
              "The setup wizard will scaffold x402 and Bazaar discovery for your stack."
            )}
          </p>
        </div>

        <div className="flex justify-end">
          <GlowButton onClick={() => onOpenWizard(0)}>
            Open Setup Wizard
          </GlowButton>
        </div>
      </div>
    </motion.div>
  );
}
