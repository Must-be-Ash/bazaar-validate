"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Stack, EndpointConfig } from "@/lib/code-templates";
import { ProbeResult } from "@/lib/diagnostics";
import { StepStack } from "@/components/wizard/step-stack";
import { StepEndpoint } from "@/components/wizard/step-endpoint";
import { StepMetadata } from "@/components/wizard/step-metadata";
import { StepPrompt } from "@/components/wizard/step-prompt";
import { StepDeploy } from "@/components/wizard/step-deploy";
import { GlowButton } from "@/components/ui/glow-button";

const STEPS = [
  "Select Stack (optional)",
  "Describe Endpoint",
  "Define Metadata",
  "Fix-it Prompt",
  "Deploy & Test",
];

interface WizardContainerProps {
  startStep?: number;
  defaultUrl?: string;
  defaultMethod?: string;
  // Probed values from the user's existing endpoint, if we already validated it.
  // Used to pre-fill the wizard so the user doesn't re-type things we already
  // know.
  probedDefaults?: {
    payTo?: string;
    network?: string;
    priceAtomic?: string; // amount in USDC atomic units (6 decimals)
    description?: string;
    outputExample?: string; // pretty-printed JSON, when present in probed bazaar
    outputSchema?: string;  // pretty-printed JSON, when present in probed bazaar
    inputExample?: string;  // pretty-printed JSON, when present in probed bazaar
  };
  // The full probe result. Threaded into step 4's LLM-prompt so it can
  // enumerate the failing checks and show the decoded payment-required envelope
  // verbatim. Optional — wizard works without it (just produces a less-rich
  // prompt).
  probeResult?: ProbeResult | null;
  onClose: () => void;
  onRevalidate?: () => void;
}

// formatAtomicUSDCPrice converts an atomic USDC amount string (6 decimals)
// into the "$X.YYY" format the wizard config uses. Example: "1000" → "$0.001".
function formatAtomicUSDCPrice(atomic?: string): string | null {
  if (!atomic) return null;
  const n = parseInt(atomic, 10);
  if (Number.isNaN(n) || n <= 0) return null;
  return `$${(n / 1_000_000).toFixed(6).replace(/\.?0+$/, "")}`;
}

export function WizardContainer({
  startStep = 0,
  defaultUrl = "",
  defaultMethod = "GET",
  probedDefaults,
  probeResult,
  onClose,
  onRevalidate,
}: WizardContainerProps) {
  const [step, setStep] = useState(startStep);
  const [stack, setStack] = useState<Stack | null>(null);

  // Parse default path from URL
  let defaultPath = "/";
  try {
    if (defaultUrl) {
      defaultPath = new URL(defaultUrl).pathname;
    }
  } catch {
    // keep default
  }

  const [config, setConfig] = useState<EndpointConfig>({
    method: defaultMethod,
    path: defaultPath,
    description: probedDefaults?.description ?? "",
    price: formatAtomicUSDCPrice(probedDefaults?.priceAtomic) ?? "$0.001",
    network: probedDefaults?.network ?? "eip155:8453",
    payTo: probedDefaults?.payTo ?? "",
    outputExample: probedDefaults?.outputExample ?? "",
    outputSchema: probedDefaults?.outputSchema ?? "",
    inputExample: probedDefaults?.inputExample ?? "",
    inputSchema: "",
    bodyType: "json",
  });

  const updateConfig = useCallback((field: string, value: string) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  }, []);

  const canNext = () => {
    switch (step) {
      case 0:
        // Stack is now optional — the LLM-prompt-primary step 4 works
        // without a selected stack. Picking one just gives the prompt
        // (and the collapsed code template) extra context.
        return true;
      case 1:
        return config.path && config.payTo;
      case 2:
        return config.outputExample.trim() !== "";
      default:
        return true;
    }
  };

  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <div className="space-y-6">
      {/* Progress */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-medium text-foreground truncate">
            {STEPS[step]}
          </span>
          <div className="flex items-baseline gap-4 shrink-0">
            <span className="text-xs text-muted-foreground tabular-nums">
              {String(step + 1).padStart(2, "0")}
              <span className="text-muted-foreground/50">
                {" / "}
                {String(STEPS.length).padStart(2, "0")}
              </span>
            </span>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground text-sm"
            >
              Close
            </button>
          </div>
        </div>
        <div
          className="h-px w-full bg-border overflow-hidden"
          role="progressbar"
          aria-valuenow={step + 1}
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
        >
          <motion.div
            className="h-full bg-foreground/70"
            initial={false}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.35, ease: "easeOut" }}
          />
        </div>
      </div>

      {/* Step content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
        >
          {step === 0 && (
            <StepStack selected={stack} onSelect={setStack} />
          )}
          {step === 1 && (
            <StepEndpoint
              method={config.method}
              path={config.path}
              description={config.description}
              price={config.price}
              network={config.network}
              payTo={config.payTo}
              onChange={updateConfig}
            />
          )}
          {step === 2 && (
            <StepMetadata
              outputExample={config.outputExample}
              outputSchema={config.outputSchema}
              inputExample={config.inputExample}
              inputSchema={config.inputSchema}
              bodyType={config.bodyType}
              method={config.method}
              probedDescription={probedDefaults?.description}
              endpointUrl={defaultUrl}
              onChange={updateConfig}
            />
          )}
          {step === 3 && (
            <StepPrompt
              stack={stack}
              config={config}
              probeResult={probeResult ?? null}
              endpointUrl={defaultUrl}
            />
          )}
          {step === 4 && (
            <StepDeploy
              stack={stack}
              endpointUrl={defaultUrl}
              method={config.method}
              onRevalidate={onRevalidate}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <div>
          {step > 0 && (
            <GlowButton variant="muted" onClick={() => setStep(step - 1)}>
              Back
            </GlowButton>
          )}
        </div>
        <div>
          {step < STEPS.length - 1 ? (
            <GlowButton
              onClick={() => setStep(step + 1)}
              disabled={!canNext()}
            >
              Next
            </GlowButton>
          ) : (
            <GlowButton variant="success" onClick={onClose}>
              Done
            </GlowButton>
          )}
        </div>
      </div>
    </div>
  );
}

