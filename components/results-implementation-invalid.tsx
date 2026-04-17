"use client";

import { motion } from "framer-motion";
import { ProbeResult, DomainSiblings } from "@/lib/diagnostics";
import { getCheckSpec } from "@/lib/checks";
import { DiagnosticChecklist } from "@/components/diagnostic-checklist";
import { RawResponseViewer } from "@/components/raw-response-viewer";
import { SimilarEndpoints } from "@/components/similar-endpoints";
import { GlowButton } from "@/components/ui/glow-button";

interface ResultsImplementationInvalidProps {
  probeResult: ProbeResult | null;
  probing: boolean;
  onOpenWizard: (step?: number) => void;
  domainSiblings?: DomainSiblings | null;
  validatedUrl?: string;
}

export function ResultsImplementationInvalid({
  probeResult,
  probing,
  onOpenWizard,
  domainSiblings,
  validatedUrl,
}: ResultsImplementationInvalidProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full space-y-4"
    >
      <div className="flex items-center gap-3 mb-2">
        <div className="w-3 h-3 rounded-full bg-warning animate-pulse" />
        <h2 className="text-lg font-medium text-warning">
          Implementation issues found
        </h2>
      </div>

      {probeResult && (() => {
        const blockers = probeResult.diagnostics.filter(
          (d) =>
            !d.passed &&
            !d.detail.startsWith("Skipped:") &&
            getCheckSpec(d.check)?.severity === "blocking",
        );
        if (blockers.length === 0) return null;
        const first = blockers[0];
        const firstLabel = getCheckSpec(first.check)?.label ?? first.check;
        return (
          <p className="text-sm text-muted-foreground mb-2">
            <span className="text-foreground font-medium">{blockers.length}</span>{" "}
            {blockers.length === 1 ? "issue" : "issues"} blocking indexing — start
            with: <span className="text-foreground">{firstLabel}</span>.
          </p>
        );
      })()}

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

          {validatedUrl && <SimilarEndpoints validatedUrl={validatedUrl} />}

          {domainSiblings && domainSiblings.count > 0 && (
            <div className="bg-muted border border-border rounded-lg p-4">
              <p className="text-sm">
                <span className="text-foreground font-medium">
                  {domainSiblings.count}
                </span>{" "}
                <span className="text-muted-foreground">
                  other endpoint{domainSiblings.count !== 1 ? "s" : ""} on{" "}
                </span>
                <span className="text-foreground font-mono text-xs">
                  {domainSiblings.hostname}
                </span>{" "}
                <span className="text-muted-foreground">
                  {domainSiblings.count !== 1 ? "are" : "is"} indexed.
                </span>
              </p>
              <div className="mt-2 space-y-1">
                {domainSiblings.resources.map((r) => (
                  <a
                    key={r.resource}
                    href={`/?url=${encodeURIComponent(r.resource)}`}
                    className="block text-xs font-mono text-foreground/70 hover:text-foreground truncate"
                  >
                    {r.resource}
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-center pt-2">
            {(() => {
              const blocking = probeResult.diagnostics.filter(
                (d) =>
                  !d.passed &&
                  !d.detail.startsWith("Skipped:") &&
                  getCheckSpec(d.check)?.severity === "blocking",
              );
              if (blocking.length === 1) {
                const spec = getCheckSpec(blocking[0].check);
                const step = spec?.wizardStep;
                return (
                  <GlowButton onClick={() => onOpenWizard(step)}>
                    Fix &ldquo;{spec?.label ?? blocking[0].check}&rdquo; →
                  </GlowButton>
                );
              }
              return (
                <GlowButton onClick={() => onOpenWizard()}>
                  Fix with Setup Wizard
                </GlowButton>
              );
            })()}
          </div>
        </>
      )}
    </motion.div>
  );
}
