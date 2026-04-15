"use client";

import { useState, useRef, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { UrlInput } from "@/components/url-input";
import { ResultsFound } from "@/components/results-found";
import { ResultsNotFound } from "@/components/results-not-found";
import { WizardContainer } from "@/components/wizard/wizard-container";
import { PixelTrail } from "@/components/ui/pixel-trail";
import { GooeyFilter } from "@/components/ui/gooey-filter";
import { useScreenSize } from "@/hooks/use-screen-size";
import { CheckResult, ProbeResult } from "@/lib/diagnostics";
import { FAQ } from "@/components/faq";

type Phase = "idle" | "checking" | "probing" | "done";
type ResultType = "found" | "not-found" | "error" | null;

export default function Home() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [resultType, setResultType] = useState<ResultType>(null);
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [probeResult, setProbeResult] = useState<ProbeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStartStep, setWizardStartStep] = useState(0);
  const [validatedUrl, setValidatedUrl] = useState("");
  const [validatedMethod, setValidatedMethod] = useState("GET");

  const resultsRef = useRef<HTMLDivElement>(null);
  const screenSize = useScreenSize();

  const scrollToResults = useCallback(() => {
    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  }, []);

  const handleValidate = async (url: string, method: string) => {
    setPhase("checking");
    setResultType(null);
    setCheckResult(null);
    setProbeResult(null);
    setError(null);
    setShowWizard(false);
    setValidatedUrl(url);
    setValidatedMethod(method);

    try {
      // Step 1: Check discovery API
      const checkRes = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      if (!checkRes.ok) {
        const err = await checkRes.json();
        throw new Error(err.error || "Failed to check Bazaar");
      }

      const checkData: CheckResult = await checkRes.json();
      setCheckResult(checkData);

      if (checkData.found) {
        setResultType("found");
        setPhase("done");
        scrollToResults();
        return;
      }

      // Step 2: Not found — probe the endpoint
      setPhase("probing");
      setResultType("not-found");
      scrollToResults();

      const probeRes = await fetch("/api/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, method }),
      });

      if (!probeRes.ok) {
        const err = await probeRes.json();
        throw new Error(err.error || "Failed to probe endpoint");
      }

      const probeData: ProbeResult = await probeRes.json();
      setProbeResult(probeData);
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setResultType("error");
      setPhase("done");
      scrollToResults();
    }
  };

  const handleOpenWizard = (step?: number) => {
    setShowWizard(true);
    setWizardStartStep(step ?? 0);
    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  return (
    <div className="relative min-h-screen flex flex-col">
      {/* Pixel trail background */}
      {screenSize.greaterThan("sm") && (
        <div className="fixed inset-0 z-0 opacity-30">
          <GooeyFilter id="pixel-goo" strength={6} />
          <div style={{ filter: "url(#pixel-goo)" }}>
            <PixelTrail
              pixelSize={40}
              fadeDuration={1200}
              pixelClassName="bg-[#222]"
            />
          </div>
        </div>
      )}

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center flex-1 px-4 py-12 md:py-20">
        {/* Header */}
        <header className="text-center mb-12">
          <h1 className="font-display text-5xl md:text-7xl tracking-tight text-foreground mb-3">
            Bazaar Validator
          </h1>
          <p className="text-sm md:text-base text-muted-foreground max-w-lg mx-auto">
            Check if your x402 endpoint is indexed in the Bazaar. If not,
            diagnose what&apos;s wrong and get step-by-step setup guidance.
          </p>
        </header>

        {/* Main card */}
        <div className="w-full max-w-2xl">
          <div className="bg-card/80 backdrop-blur-sm border border-border rounded-xl p-6 md:p-8 shadow-lg">
            <UrlInput
              onValidate={handleValidate}
              loading={phase === "checking" || phase === "probing"}
            />

            {/* Loading states */}
            <AnimatePresence mode="wait">
              {phase === "checking" && (
                <motion.div
                  key="checking"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-3 mt-6 text-sm text-muted-foreground"
                >
                  <div className="w-4 h-4 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
                  Checking Bazaar...
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Results */}
          <div ref={resultsRef} className="mt-6">
            <AnimatePresence mode="wait">
              {resultType === "found" && checkResult?.resource && (
                <motion.div
                  key="found"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="bg-card/80 backdrop-blur-sm border border-border rounded-xl p-6 md:p-8 shadow-lg">
                    <ResultsFound
                      resource={checkResult.resource}
                      totalIndexed={checkResult.totalIndexed}
                    />
                  </div>
                </motion.div>
              )}

              {resultType === "not-found" && (
                <motion.div
                  key="not-found"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="bg-card/80 backdrop-blur-sm border border-border rounded-xl p-6 md:p-8 shadow-lg">
                    <ResultsNotFound
                      probeResult={probeResult}
                      probing={phase === "probing"}
                      onOpenWizard={handleOpenWizard}
                    />
                  </div>
                </motion.div>
              )}

              {resultType === "error" && error && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="bg-card/80 backdrop-blur-sm border border-destructive/50 rounded-xl p-6 md:p-8 shadow-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-destructive" />
                      <h2 className="text-lg font-medium text-destructive">
                        Error
                      </h2>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      {error}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Wizard */}
          <AnimatePresence>
            {showWizard && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="mt-6"
              >
                <div className="bg-card/80 backdrop-blur-sm border border-border rounded-xl p-6 md:p-8 shadow-lg">
                  <WizardContainer
                    startStep={wizardStartStep}
                    defaultUrl={validatedUrl}
                    defaultMethod={validatedMethod}
                    onClose={() => setShowWizard(false)}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* FAQ */}
          <div className="mt-12">
            <FAQ />
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 text-center py-6 text-xs text-muted-foreground border-t border-border">
        Built for x402 endpoint operators
      </footer>
    </div>
  );
}
