"use client";

import { motion } from "framer-motion";
import { DiagnosticCheck, CHECK_LABELS, CHECK_WIZARD_STEP } from "@/lib/diagnostics";

interface DiagnosticChecklistProps {
  diagnostics: DiagnosticCheck[];
  onJumpToWizard?: (step: number) => void;
}

export function DiagnosticChecklist({
  diagnostics,
  onJumpToWizard,
}: DiagnosticChecklistProps) {
  return (
    <div className="space-y-2">
      {diagnostics.map((diag, i) => (
        <motion.div
          key={diag.check}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.1 }}
          className="bg-muted border border-border rounded-lg p-3"
        >
          <div className="flex items-start gap-3">
            <span className="text-base mt-0.5">
              {diag.passed ? "\u2705" : "\u274C"}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">
                {CHECK_LABELS[diag.check] || diag.check}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {diag.detail}
              </p>
              {!diag.passed &&
                diag.check in CHECK_WIZARD_STEP &&
                onJumpToWizard && (
                  <button
                    onClick={() =>
                      onJumpToWizard(CHECK_WIZARD_STEP[diag.check])
                    }
                    className="text-xs text-accent hover:underline mt-1"
                  >
                    Fix this in the Setup Wizard &rarr;
                  </button>
                )}
            </div>
          </div>
        </motion.div>
      ))}

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
