export interface DiagnosticCheck {
  check: string;
  passed: boolean;
  detail: string;
}

export interface ProbeResult {
  reachable: boolean;
  statusCode: number;
  returns402: boolean;
  paymentRequirements: Record<string, unknown> | null;
  hasBazaarExtension: boolean;
  bazaarExtensionData: Record<string, unknown> | null;
  x402Version: number | null;
  rawHeaders: Record<string, string>;
  rawBody: string;
  diagnostics: DiagnosticCheck[];
}

// Why a fallback engaged when the Go validator wasn't used.
export type FallbackReason = "go_unreachable" | "go_timeout" | "go_error" | null;

// Canonical validation response — emitted verbatim by /api/validate regardless
// of whether the Go server or the Node fallback ran the checks. The frontend
// stores this directly with no reshaping.
//
// Phase 1 will add `preflight`, `parse`, `simulate`, and `meta` fields populated
// by the Go SDK pipeline. For now they are optional and unset.
export interface ValidationResult extends ProbeResult {
  source: "go" | "node";
  fallbackReason?: FallbackReason;
  // Forward-compatible fields populated once the Go SDK pipeline lands.
  preflight?: DiagnosticCheck[];
  parse?: { ok: boolean; error?: string };
  simulate?: {
    outcome: "processing" | "rejected" | "noop";
    rejectedReason?: string;
    workflowIdHint?: string;
  };
  meta?: { sdkVersion?: string; validatorVersion?: string };
}

export interface MerchantResourceEntry {
  resource: string;
  lastUpdated?: string;
}

export interface MerchantData {
  payTo: string;
  count: number;
  resources: MerchantResourceEntry[];
}

// QualitySignals are heuristic indicators of how well-described a resource is
// in the Bazaar. These are surfaced on the indexed-resource view as a "what
// makes this listing strong vs weak" panel.
//
// payerCount30d is null until the discovery API exposes it; descriptionPresent
// / inputSchemaPresent / outputSchemaPresent / dedicatedDomain are computed
// heuristically from the discovery item.
export interface QualitySignals {
  descriptionPresent: boolean;
  inputSchemaPresent: boolean;
  outputSchemaPresent: boolean;
  dedicatedDomain: boolean | null;
  payerCount30d: number | null;
}

export interface DomainSiblings {
  hostname: string;
  count: number;
  resources: MerchantResourceEntry[];
}

export interface CheckResult {
  found: boolean;
  resource: Record<string, unknown> | null;
  totalIndexed: number;
  merchantResources?: MerchantData | null;
  qualitySignals?: QualitySignals | null;
  domainSiblings?: DomainSiblings | null;
}

export type ResultState =
  | "indexed"
  | "awaiting_first_payment"
  | "implementation_invalid"
  | "never_tried"
  | "error";

// isNeverTried is true when the endpoint is reachable but shows no signs of
// being an x402 endpoint at all — no 402, no x402Version, no payment
// requirements. We treat this as "user has never tried to set up x402" and
// route them to the onboarding wizard instead of the bug-fix UI.
export function isNeverTried(probeResult: ProbeResult | null): boolean {
  if (!probeResult) return false;
  if (!probeResult.reachable) return false;
  if (probeResult.returns402) return false;
  if (probeResult.x402Version !== null && probeResult.x402Version !== undefined) {
    return false;
  }
  if (probeResult.paymentRequirements) return false;
  return true;
}

// isAwaitingFirstPayment is true when discovery missed the endpoint but the
// implementation looks valid: every preflight check passes, parse succeeded,
// and simulate would have produced "processing". The endpoint is just waiting
// for its first verify+settle to be cataloged.
export function isAwaitingFirstPayment(
  checkResult: CheckResult | null,
  validation: ValidationResult | ProbeResult | null,
): boolean {
  if (!validation) return false;
  if (checkResult?.found) return false;
  const asUnknown = validation as unknown as Record<string, unknown>;
  if (!("source" in asUnknown)) {
    // ProbeResult-only: fall back to all-checks-pass.
    return validation.diagnostics.every((d) => d.passed);
  }
  const v = validation as ValidationResult;
  const allPreflightPassed = (v.preflight ?? v.diagnostics).every((d) => d.passed);
  const parseOK = v.parse ? v.parse.ok : allPreflightPassed;
  const simulateProcessing = v.simulate
    ? v.simulate.outcome === "processing"
    : allPreflightPassed;
  return allPreflightPassed && parseOK && simulateProcessing;
}

export function deriveResultState(
  checkResult: CheckResult | null,
  probeResult: ProbeResult | null,
  hasError: boolean,
): ResultState {
  if (hasError) return "error";
  if (checkResult?.found) return "indexed";
  if (!probeResult) return "error";

  // Never-tried: endpoint is reachable but shows no sign of x402 at all.
  if (isNeverTried(probeResult)) return "never_tried";

  // Awaiting-first-payment: every blocking check passes AND (when available)
  // parse succeeded AND simulate would index → discovery just missed it.
  if (isAwaitingFirstPayment(checkResult, probeResult)) {
    return "awaiting_first_payment";
  }

  return "implementation_invalid";
}

// Re-exports from the canonical check catalog. See lib/checks.ts for the
// authoritative list of checks, labels, severities, categories, fix messages,
// and wizard mappings.
export { CHECK_LABELS, CHECK_WIZARD_STEP, CHECKS, getCheckSpec, getCheckLabel } from "@/lib/checks";
export type { CheckSpec, CheckSeverity, CheckCategory } from "@/lib/checks";
