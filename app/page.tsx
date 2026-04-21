"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { UrlInput } from "@/components/url-input";
import { ResultsFound } from "@/components/results-found";
import { ResultsImplementationInvalid } from "@/components/results-implementation-invalid";
import { ResultsNeverTried } from "@/components/results-never-tried";
import { ResultsAwaitingPayment } from "@/components/results-awaiting-payment";
import { WizardContainer } from "@/components/wizard/wizard-container";
import { PixelTrail } from "@/components/ui/pixel-trail";
import { GooeyFilter } from "@/components/ui/gooey-filter";
import { useScreenSize } from "@/hooks/use-screen-size";
import { CheckResult, ProbeResult, ResultState, ValidationResult, deriveResultState } from "@/lib/diagnostics";
import { ErrorBoundary } from "@/components/error-boundary";
import { CopyResultButton } from "@/components/copy-result-button";
import { FAQ } from "@/components/faq";

type Phase = "idle" | "checking" | "probing" | "done";
type FallbackReason = "go_unreachable" | "go_timeout" | "go_error" | null;

// extractProbedDefaults pulls the bits of the probed payment requirements
// the wizard can re-use, so the user doesn't re-type them.
//
// Note the field locations in the v2 payment-required envelope:
//   - payTo / network / amount  → accepts[0].*
//   - description               → resource.description (NOT accepts[0])
//   - output example / schema   → extensions.bazaar.info.output.{example, schema}
//   - input example             → extensions.bazaar.info.input.{queryParams|body}
function extractProbedDefaults(
  probe: ProbeResult | null,
):
  | {
      payTo?: string;
      network?: string;
      priceAtomic?: string;
      description?: string;
      outputExample?: string;
      outputSchema?: string;
      inputExample?: string;
      bodyType?: string;
    }
  | undefined {
  if (!probe?.paymentRequirements) return undefined;
  const pr = probe.paymentRequirements;
  const accepts = pr.accepts as Record<string, unknown>[] | undefined;
  const first = accepts?.[0];
  const resource = (pr.resource && typeof pr.resource === "object"
    ? (pr.resource as Record<string, unknown>)
    : null);

  // Reach into the probed bazaar extension (if present) for example data.
  const bazaar = probe.bazaarExtensionData ?? null;
  const info = bazaar && typeof bazaar.info === "object"
    ? (bazaar.info as Record<string, unknown>)
    : null;
  const output = info && typeof info.output === "object"
    ? (info.output as Record<string, unknown>)
    : null;
  const input = info && typeof info.input === "object"
    ? (info.input as Record<string, unknown>)
    : null;

  const stringify = (v: unknown): string | undefined => {
    if (v === undefined || v === null) return undefined;
    try {
      return JSON.stringify(v, null, 2);
    } catch {
      return undefined;
    }
  };

  return {
    payTo: typeof first?.payTo === "string" ? first.payTo : undefined,
    network: typeof first?.network === "string" ? first.network : undefined,
    priceAtomic: typeof first?.amount === "string" ? first.amount : undefined,
    description: typeof resource?.description === "string"
      ? resource.description
      : typeof first?.description === "string"
        ? first.description
        : undefined,
    outputExample: stringify(output?.example),
    outputSchema: stringify(output?.schema),
    inputExample: stringify(input?.queryParams ?? input?.body),
    bodyType: typeof input?.bodyType === "string" ? input.bodyType : undefined,
  };
}

function ValidationSourceBadge({
  source,
  fallbackReason,
  sdkVersion,
}: {
  source: "go" | "node";
  fallbackReason: FallbackReason;
  sdkVersion?: string;
}) {
  const isGo = source === "go";
  const tooltip = isGo
    ? sdkVersion
      ? `x402 Go SDK ${sdkVersion}`
      : undefined
    : fallbackReason
      ? `Go server fallback reason: ${fallbackReason.replace("go_", "")}`
      : undefined;
  return (
    <div
      className={`text-xs px-3 py-1.5 rounded-md inline-block ${
        isGo
          ? "bg-success/10 text-success border border-success/30"
          : "bg-warning/10 text-warning border border-warning/30"
      }`}
      title={tooltip}
    >
      {isGo
        ? "Validated with Go SDK"
        : `Approximate check — ${
            fallbackReason === "go_unreachable"
              ? "Go server unreachable"
              : fallbackReason === "go_timeout"
                ? "Go server timed out"
                : fallbackReason === "go_error"
                  ? "Go server error"
                  : "Go validation backend unavailable"
          }`}
    </div>
  );
}

export default function Home() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [resultState, setResultState] = useState<ResultState | null>(null);
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [probeResult, setProbeResult] = useState<ValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStartStep, setWizardStartStep] = useState(0);
  const [validatedUrl, setValidatedUrl] = useState("");
  const [validatedMethod, setValidatedMethod] = useState("GET");
  const [validationSource, setValidationSource] = useState<"go" | "node" | null>(null);
  const [fallbackReason, setFallbackReason] = useState<FallbackReason>(null);
  const [sdkVersion, setSdkVersion] = useState<string | undefined>(undefined);
  const [autoWatchAfterRevalidate, setAutoWatchAfterRevalidate] = useState(false);

  const resultsRef = useRef<HTMLDivElement>(null);
  const wizardRef = useRef<HTMLDivElement>(null);
  const screenSize = useScreenSize();

  const scrollToResults = useCallback(() => {
    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  }, []);

  const handleValidate = async (url: string, method: string, opts?: { fromWizard?: boolean }) => {
    setPhase("checking");
    setResultState(null);
    setCheckResult(null);
    setProbeResult(null);
    setError(null);
    setShowWizard(false);
    setValidatedUrl(url);
    setValidatedMethod(method);
    setValidationSource(null);
    setFallbackReason(null);
    setAutoWatchAfterRevalidate(!!opts?.fromWizard);

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
        setResultState(deriveResultState(checkData, null, false));
        setPhase("done");
        scrollToResults();
        return;
      }

      // Step 2: Not found — validate the endpoint (Go backend with Node.js fallback).
      // Don't pick a tentative resultState yet; we'd flicker into "implementation_invalid"
      // for the duration of the probe even when the user is heading to "indexed-after-poll".
      setPhase("probing");
      scrollToResults();

      const validateRes = await fetch("/api/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, method }),
      });

      if (!validateRes.ok) {
        const err = await validateRes.json();
        throw new Error(err.error || "Failed to validate endpoint");
      }

      const validateData: ValidationResult = await validateRes.json();
      setValidationSource(validateData.source ?? "node");
      setFallbackReason(validateData.fallbackReason ?? null);
      setSdkVersion(validateData.meta?.sdkVersion);
      setProbeResult(validateData);
      setResultState(deriveResultState(checkData, validateData, false));
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setResultState("error");
      setPhase("done");
      scrollToResults();
    }
  };

  // Auto-run validation when ?url=... is in the URL on first render. Lets users
  // share validation links (e.g. in Discord / issues / docs).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const urlParam = params.get("url");
    if (!urlParam) return;
    const methodParam = (params.get("method") ?? "GET").toUpperCase();
    handleValidate(urlParam, methodParam);
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOpenWizard = (step?: number) => {
    setShowWizard(true);
    setWizardStartStep(step ?? 0);
    // Scroll is triggered by the effect below once the wizard has mounted,
    // otherwise the scroll target's position is unknown / stale on tall results cards.
  };

  // Scroll the wizard into view after it mounts. Using rAF + a small delay lets
  // the AnimatePresence enter animation and layout settle before we measure.
  useEffect(() => {
    if (!showWizard) return;
    const id = window.setTimeout(() => {
      requestAnimationFrame(() => {
        wizardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }, 80);
    return () => window.clearTimeout(id);
  }, [showWizard, wizardStartStep]);

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
              initialUrl={validatedUrl}
              initialMethod={validatedMethod}
            />

            {/* Loading states */}
            <AnimatePresence mode="wait">
              {(phase === "checking" || phase === "probing") && (
                <motion.div
                  key={phase}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.2 }}
                  className="mt-4 flex items-center justify-center gap-2.5 text-xs text-muted-foreground"
                >
                  <div className="w-3 h-3 border-2 border-muted-foreground/60 border-t-transparent rounded-full animate-spin" />
                  <span className="tabular-nums">
                    {phase === "checking"
                      ? "Checking Bazaar"
                      : "Validating with x402 SDK"}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Results */}
          <div ref={resultsRef} className="mt-6">
            <AnimatePresence mode="wait">
              {resultState === "indexed" && checkResult?.resource && (
                <motion.div
                  key="found"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="bg-card/80 backdrop-blur-sm border border-border rounded-xl p-6 md:p-8 shadow-lg">
                    <div className="flex items-start justify-end mb-4">
                      {phase === "done" && resultState && (
                        <CopyResultButton
                          validatedUrl={validatedUrl}
                          validatedMethod={validatedMethod}
                          resultState={resultState}
                          validationSource={validationSource}
                          sdkVersion={sdkVersion}
                          fallbackReason={fallbackReason}
                          probeResult={probeResult}
                          checkResult={checkResult}
                        />
                      )}
                    </div>
                    <ErrorBoundary label="Indexed Result">
                      <ResultsFound
                        resource={checkResult.resource}
                        totalIndexed={checkResult.totalIndexed}
                        merchantResources={checkResult.merchantResources}
                        qualitySignals={checkResult.qualitySignals}
                      />
                    </ErrorBoundary>
                  </div>
                </motion.div>
              )}

              {resultState === "awaiting_first_payment" && (
                <motion.div
                  key="awaiting"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="bg-card/80 backdrop-blur-sm border border-border rounded-xl p-6 md:p-8 shadow-lg">
                    <div className="flex items-start justify-between gap-2 flex-wrap mb-4">
                      <div>
                        {validationSource && phase === "done" && (
                          <ValidationSourceBadge
                            source={validationSource}
                            fallbackReason={fallbackReason} sdkVersion={sdkVersion}
                          />
                        )}
                      </div>
                      {phase === "done" && resultState && (
                        <CopyResultButton
                          validatedUrl={validatedUrl}
                          validatedMethod={validatedMethod}
                          resultState={resultState}
                          validationSource={validationSource}
                          sdkVersion={sdkVersion}
                          fallbackReason={fallbackReason}
                          probeResult={probeResult}
                          checkResult={checkResult}
                        />
                      )}
                    </div>
                    <ErrorBoundary label="Awaiting First Payment">
                      <ResultsAwaitingPayment
                        probeResult={probeResult}
                        validatedUrl={validatedUrl}
                        validatedMethod={validatedMethod}
                        onIndexed={() => handleValidate(validatedUrl, validatedMethod)}
                        autoWatch={autoWatchAfterRevalidate}
                      />
                    </ErrorBoundary>
                  </div>
                </motion.div>
              )}

              {resultState === "never_tried" && (
                <motion.div
                  key="never-tried"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="bg-card/80 backdrop-blur-sm border border-border rounded-xl p-6 md:p-8 shadow-lg">
                    <div className="flex items-start justify-between gap-2 flex-wrap mb-4">
                      <div>
                        {validationSource && phase === "done" && (
                          <ValidationSourceBadge
                            source={validationSource}
                            fallbackReason={fallbackReason} sdkVersion={sdkVersion}
                          />
                        )}
                      </div>
                      {phase === "done" && resultState && (
                        <CopyResultButton
                          validatedUrl={validatedUrl}
                          validatedMethod={validatedMethod}
                          resultState={resultState}
                          validationSource={validationSource}
                          sdkVersion={sdkVersion}
                          fallbackReason={fallbackReason}
                          probeResult={probeResult}
                          checkResult={checkResult}
                        />
                      )}
                    </div>
                    <ErrorBoundary label="Never Tried">
                      <ResultsNeverTried
                        probeResult={probeResult}
                        validatedUrl={validatedUrl}
                        onOpenWizard={handleOpenWizard}
                      />
                    </ErrorBoundary>
                  </div>
                </motion.div>
              )}

              {resultState === "implementation_invalid" && (
                <motion.div
                  key="not-found"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="bg-card/80 backdrop-blur-sm border border-border rounded-xl p-6 md:p-8 shadow-lg">
                    <div className="flex items-start justify-between gap-2 flex-wrap mb-4">
                      <div>
                        {validationSource && phase === "done" && (
                          <ValidationSourceBadge
                            source={validationSource}
                            fallbackReason={fallbackReason} sdkVersion={sdkVersion}
                          />
                        )}
                      </div>
                      {phase === "done" && resultState && (
                        <CopyResultButton
                          validatedUrl={validatedUrl}
                          validatedMethod={validatedMethod}
                          resultState={resultState}
                          validationSource={validationSource}
                          sdkVersion={sdkVersion}
                          fallbackReason={fallbackReason}
                          probeResult={probeResult}
                          checkResult={checkResult}
                        />
                      )}
                    </div>
                    <ErrorBoundary label="Implementation Invalid">
                      <ResultsImplementationInvalid
                        probeResult={probeResult}
                        probing={phase === "probing"}
                        onOpenWizard={handleOpenWizard}
                        domainSiblings={checkResult?.domainSiblings}
                        validatedUrl={validatedUrl}
                      />
                    </ErrorBoundary>
                  </div>
                </motion.div>
              )}

              {resultState === "error" && error && (
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
                ref={wizardRef}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="mt-6 scroll-mt-4"
              >
                <div className="bg-card/80 backdrop-blur-sm border border-border rounded-xl p-6 md:p-8 shadow-lg">
                  <ErrorBoundary label="Setup Wizard">
                    <WizardContainer
                      startStep={wizardStartStep}
                      defaultUrl={validatedUrl}
                      defaultMethod={validatedMethod}
                      probedDefaults={extractProbedDefaults(probeResult)}
                      probeResult={probeResult}
                      onClose={() => setShowWizard(false)}
                      onRevalidate={() => {
                        setShowWizard(false);
                        handleValidate(validatedUrl, validatedMethod, { fromWizard: true });
                      }}
                    />
                  </ErrorBoundary>
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
