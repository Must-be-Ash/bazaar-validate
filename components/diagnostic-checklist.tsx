"use client";

import { motion } from "framer-motion";
import { DiagnosticCheck, CHECK_LABELS, getCheckSpec } from "@/lib/diagnostics";
import { FixCard } from "@/components/fix-card";

interface DiagnosticChecklistProps {
  diagnostics: DiagnosticCheck[];
  onJumpToWizard?: (step: number) => void;
}

function isSkipped(diag: DiagnosticCheck): boolean {
  return !diag.passed && diag.detail.startsWith("Skipped:");
}

export function DiagnosticChecklist({
  diagnostics,
  onJumpToWizard,
}: DiagnosticChecklistProps) {
  return (
    <div className="space-y-2">
      {diagnostics.map((diag, i) => {
        const spec = getCheckSpec(diag.check);
        const showFixCard = !diag.passed && !isSkipped(diag) && !!spec;
        return (
          <motion.div
            key={diag.check}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-muted border border-border rounded-lg p-3"
          >
            <div className="flex items-start gap-3">
              <span className="text-base mt-0.5">
                {diag.passed ? "\u2705" : isSkipped(diag) ? "\u23F8\uFE0F" : "\u274C"}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {CHECK_LABELS[diag.check] || diag.check}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {diag.detail}
                </p>
                {showFixCard && onJumpToWizard && (
                  <FixCard
                    checkId={diag.check}
                    detail={diag.detail}
                    onJumpToWizard={onJumpToWizard}
                  />
                )}
              </div>
            </div>
          </motion.div>
        );
      })}

      {/* Always show transaction info */}
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: diagnostics.length * 0.1 }}
        className="bg-muted border border-border rounded-lg p-3"
      >
        <div className="flex items-start gap-3">
          <span className="text-base mt-0.5">{"\u26A0\uFE0F"}</span>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              At least one successful transaction
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Your endpoint needs at least one successful paid request through
              the facilitator before it appears in the Bazaar. We cannot verify
              this automatically.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
