"use client";

import { motion } from "framer-motion";
import { ProbeResult, ValidationResult, DomainSiblings } from "@/lib/diagnostics";
import { getCheckSpec } from "@/lib/checks";
import { DiagnosticChecklist } from "@/components/diagnostic-checklist";
import { RawResponseViewer } from "@/components/raw-response-viewer";
import { SimilarEndpoints } from "@/components/similar-endpoints";
import { GlowButton } from "@/components/ui/glow-button";

interface ResultsImplementationInvalidProps {
  probeResult: ProbeResult | ValidationResult | null;
  probing: boolean;
  onOpenWizard: (step?: number) => void;
  domainSiblings?: DomainSiblings | null;
  validatedUrl?: string;
}

// Parse the Go SDK's discovery-extension validation error into discrete items.
// Format looks like:
//   v2 discovery extension validation failed: [(root).input.method: input.method must be one of ... "DELETE" (root).output.example: airports is required]
// Returns one entry per (root).<path>: <message> chunk so we can render them
// individually in the UI.
function parseDiscoveryParseError(
  error: string,
): { path: string; message: string }[] {
  const bracketed = error.match(/\[(.*)\]\s*$/);
  const inner = bracketed ? bracketed[1] : error;
  const parts = inner.split(/\s*\(root\)\./).filter((p) => p.trim().length > 0);
  if (parts.length === 0) return [{ path: "", message: error }];
  return parts.map((part) => {
    const colon = part.indexOf(":");
    if (colon === -1) return { path: part.trim(), message: "" };
    return {
      path: part.slice(0, colon).trim(),
      message: part.slice(colon + 1).trim(),
    };
  });
}

function hasValidation(
  probeResult: ProbeResult | ValidationResult | null,
): probeResult is ValidationResult {
  return !!probeResult && "source" in probeResult;
}

// Wizard step indices — kept in sync with lib/checks.ts.
const WIZARD_STEP_METADATA = 2;

// Map a parse-error path (e.g. "input.method", "output.example") to the wizard
// step that owns that field. The bazaar discovery extension's input/output
// shape is configured in the metadata step.
function wizardStepForPath(path: string): number | undefined {
  const head = path.split(".")[0];
  if (head === "input" || head === "output" || head === "info") {
    return WIZARD_STEP_METADATA;
  }
  return undefined;
}

// The Go SDK picks one of two input schemas based on whether `input.bodyType`
// is present:
//   - QueryInput (no bodyType): method ∈ [GET, HEAD, DELETE]
//   - BodyInput  (bodyType set): method ∈ [POST, PUT, PATCH]
//
// When the user mixes them up, the SDK's enum error is technically correct
// but misleading because it doesn't mention the other shape. Detect each
// direction so we can render an actionable hint.
function methodEnumDirection(
  message: string,
): "query-only" | "body-only" | null {
  if (/must be one of[^"]*"GET"[^"]*"HEAD"[^"]*"DELETE"/.test(message)) {
    return "query-only";
  }
  if (/must be one of[^"]*"POST"[^"]*"PUT"[^"]*"PATCH"/.test(message)) {
    return "body-only";
  }
  return null;
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
        const validation = hasValidation(probeResult) ? probeResult : null;
        const parseFailed = validation?.parse?.ok === false;
        const sdkIssueCount = parseFailed
          ? parseDiscoveryParseError(validation!.parse!.error ?? "").length
          : 0;
        const totalIssues = blockers.length + sdkIssueCount;
        if (totalIssues === 0) return null;
        const firstLabel = blockers.length > 0
          ? getCheckSpec(blockers[0].check)?.label ?? blockers[0].check
          : "discovery extension schema";
        return (
          <p className="text-sm text-muted-foreground mb-2">
            <span className="text-foreground font-medium">{totalIssues}</span>{" "}
            {totalIssues === 1 ? "issue" : "issues"} blocking indexing — start
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

          {hasValidation(probeResult) && probeResult.parse?.ok === false && (
            <div className="bg-destructive/10 border border-destructive/40 rounded-lg p-4 space-y-3">
              <div className="flex items-start gap-3">
                <span className="text-base mt-0.5">{"\u274C"}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-destructive">
                    Bazaar discovery extension is invalid
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    The Coinbase Go SDK rejected the{" "}
                    <code className="font-mono">extensions.bazaar</code> block.
                    The Bazaar will not catalog this endpoint until these are
                    fixed — even after a paid request goes through.
                  </p>
                </div>
              </div>
              <ul className="space-y-3 pl-9">
                {parseDiscoveryParseError(
                  probeResult.parse?.error ?? "",
                ).map((issue, i) => {
                  const step = wizardStepForPath(issue.path);
                  const direction = methodEnumDirection(issue.message);
                  return (
                    <li
                      key={`${issue.path}-${i}`}
                      className="text-xs space-y-1.5"
                    >
                      <div>
                        {issue.path && (
                          <code className="font-mono text-foreground bg-background/40 px-1.5 py-0.5 rounded">
                            {issue.path}
                          </code>
                        )}{" "}
                        <span className="text-muted-foreground">
                          {issue.message}
                        </span>
                      </div>
                      {direction === "query-only" && (
                        <div className="text-muted-foreground italic">
                          For{" "}
                          <code className="font-mono not-italic">POST</code>,{" "}
                          <code className="font-mono not-italic">PUT</code>, or{" "}
                          <code className="font-mono not-italic">PATCH</code>,
                          switch <code className="font-mono not-italic">input</code>{" "}
                          to the body shape (add{" "}
                          <code className="font-mono not-italic">bodyType</code>{" "}
                          and <code className="font-mono not-italic">body</code>{" "}
                          fields) — the SDK only allows query methods when{" "}
                          <code className="font-mono not-italic">bodyType</code>{" "}
                          is absent.
                        </div>
                      )}
                      {direction === "body-only" && (
                        <div className="text-muted-foreground italic">
                          You declared{" "}
                          <code className="font-mono not-italic">bodyType</code>{" "}
                          on <code className="font-mono not-italic">input</code>,
                          which selects the body schema (POST / PUT / PATCH only).
                          For{" "}
                          <code className="font-mono not-italic">GET</code>,{" "}
                          <code className="font-mono not-italic">HEAD</code>, or{" "}
                          <code className="font-mono not-italic">DELETE</code>,
                          drop{" "}
                          <code className="font-mono not-italic">bodyType</code>{" "}
                          and <code className="font-mono not-italic">body</code>{" "}
                          and use{" "}
                          <code className="font-mono not-italic">queryParams</code>{" "}
                          instead.
                        </div>
                      )}
                      {step !== undefined && (
                        <button
                          type="button"
                          onClick={() => onOpenWizard(step)}
                          className="text-xs text-foreground underline-offset-2 underline decoration-dotted hover:decoration-solid"
                        >
                          Fix in setup wizard →
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
              {probeResult.simulate?.rejectedReason && (
                <p className="text-xs text-muted-foreground pl-9">
                  Simulated indexing outcome:{" "}
                  <span className="text-destructive">
                    rejected ({probeResult.simulate.rejectedReason})
                  </span>
                </p>
              )}
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
