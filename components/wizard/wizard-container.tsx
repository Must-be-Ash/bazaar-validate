"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Stack, EndpointConfig } from "@/lib/code-templates";
import { StepStack } from "@/components/wizard/step-stack";
import { StepEndpoint } from "@/components/wizard/step-endpoint";
import { StepMetadata } from "@/components/wizard/step-metadata";
import { StepCode } from "@/components/wizard/step-code";
import { StepDeploy } from "@/components/wizard/step-deploy";
import { GlowButton } from "@/components/ui/glow-button";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { cn } from "@/lib/utils";

const STEPS = [
  "Select Stack",
  "Describe Endpoint",
  "Define Metadata",
  "Generated Code",
  "Deploy & Test",
];

interface WizardContainerProps {
  startStep?: number;
  defaultUrl?: string;
  defaultMethod?: string;
  onClose: () => void;
}

export function WizardContainer({
  startStep = 0,
  defaultUrl = "",
  defaultMethod = "GET",
  onClose,
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
    description: "",
    price: "$0.001",
    network: "eip155:84532",
    payTo: "",
    outputExample: "",
    outputSchema: "",
    inputExample: "",
    inputSchema: "",
    bodyType: "json",
  });

  const updateConfig = useCallback((field: string, value: string) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  }, []);

  const canNext = () => {
    switch (step) {
      case 0:
        return stack !== null;
      case 1:
        return config.path && config.payTo;
      case 2:
        return config.outputExample.trim() !== "";
      default:
        return true;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Setup Wizard</h2>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground text-sm"
        >
          Close
        </button>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-1">
        {STEPS.map((label, i) => (
          <button
            key={i}
            onClick={() => i <= step && setStep(i)}
            className={cn(
              "flex-1 text-center py-2 text-xs transition-colors rounded",
              i === step
                ? "bg-accent/20 text-accent"
                : i < step
                  ? "bg-success/10 text-success cursor-pointer"
                  : "bg-muted text-muted-foreground"
            )}
          >
            {label}
          </button>
        ))}
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
              onChange={updateConfig}
            />
          )}
          {step === 3 && stack && (
            <StepCode stack={stack} config={config} />
          )}
          {step === 4 && stack && (
            <StepDeploy
              stack={stack}
              endpointUrl={defaultUrl}
              method={config.method}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <div>
          {step > 0 && (
            <ShimmerButton onClick={() => setStep(step - 1)}>
              Back
            </ShimmerButton>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {step + 1} / {STEPS.length}
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
