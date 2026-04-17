// Canonical check catalog — single source of truth for every diagnostic check id
// emitted by either the Go validator or the Node fallback.
//
// When adding a check, add it here first. Both validators and the UI read from
// this catalog (via lib/diagnostics.ts re-exports) so labels, severities, fix
// guidance, and wizard deep-links stay in sync.

export type CheckSeverity = "blocking" | "warning";
export type CheckCategory = "transport" | "payment" | "bazaar" | "discovery";

export interface CheckSpec {
  id: string;
  label: string;
  severity: CheckSeverity;
  category: CheckCategory;
  // Wizard step (0-indexed) that, once completed, will fix this failure.
  // Undefined when the fix isn't reachable through the wizard (e.g. middleware
  // ordering, deployment URL).
  wizardStep?: number;
  // One-line plain-English explanation of how to fix it.
  fixMessage: string;
  // Optional key into a snippet excerpt map (added in Phase 6 with FixCard).
  snippetKey?: string;
}

// Stack pickers are step 0; endpoint config is step 1; metadata is step 2;
// generated code is step 3; deploy/test is step 4.
const STEP_STACK = 0;
const STEP_ENDPOINT = 1;
const STEP_METADATA = 2;

const checksList: CheckSpec[] = [
  // --- Transport / URL ---
  {
    id: "url_valid",
    label: "URL is well-formed",
    severity: "blocking",
    category: "transport",
    fixMessage: "Provide a valid absolute URL (including scheme).",
  },
  {
    id: "url_https",
    label: "URL uses HTTPS",
    severity: "blocking",
    category: "transport",
    wizardStep: STEP_ENDPOINT,
    fixMessage: "Deploy your endpoint over HTTPS — the facilitator rejects http:// resources.",
    snippetKey: "https",
  },
  {
    id: "endpoint_reachable",
    label: "Endpoint is reachable",
    severity: "blocking",
    category: "transport",
    fixMessage: "Make sure the endpoint is publicly accessible (no localhost, no firewall).",
  },
  {
    id: "returns_402",
    label: "Returns HTTP 402",
    severity: "blocking",
    category: "transport",
    // No wizard step: the fix is middleware ordering, not config.
    fixMessage:
      "Endpoint must return 402 to unauthenticated requests. Run x402 middleware before any auth middleware.",
    snippetKey: "middleware-order",
  },
  {
    id: "valid_json",
    label: "Valid JSON response",
    severity: "blocking",
    category: "transport",
    fixMessage:
      "402 response body must be JSON, not HTML. Check that x402 middleware is producing JSON, not your framework's default error page.",
  },

  // --- Payment requirements ---
  {
    id: "x402_version",
    label: "x402 version is 2",
    severity: "blocking",
    category: "payment",
    wizardStep: STEP_STACK,
    fixMessage: "Upgrade to x402 v2 packages. v1 fields like paymentRequirements / maxAmountRequired are deprecated.",
    snippetKey: "v2-upgrade",
  },
  {
    id: "has_accepts",
    label: "Accepts array present",
    severity: "blocking",
    category: "payment",
    wizardStep: STEP_ENDPOINT,
    fixMessage: "v2 responses must include a non-empty top-level `accepts` array.",
  },
  {
    id: "accepts[0].scheme",
    label: "Valid payment scheme",
    severity: "blocking",
    category: "payment",
    wizardStep: STEP_ENDPOINT,
    fixMessage: 'Set scheme to "exact" or "upto".',
    snippetKey: "scheme",
  },
  {
    id: "accepts[0].network",
    label: "Network is supported",
    severity: "blocking",
    category: "payment",
    wizardStep: STEP_ENDPOINT,
    fixMessage: "Use a supported network (eip155:8453 / eip155:84532 today).",
    snippetKey: "network",
  },
  {
    id: "accepts[0].asset",
    label: "Asset is USDC",
    severity: "blocking",
    category: "payment",
    wizardStep: STEP_ENDPOINT,
    fixMessage: "Asset must be the USDC contract address for the declared network.",
    snippetKey: "asset",
  },
  {
    id: "accepts[0].amount",
    label: "Price meets $0.001 USDC minimum",
    severity: "blocking",
    category: "payment",
    wizardStep: STEP_ENDPOINT,
    fixMessage: "Price must be at least $0.001 (1000 atomic USDC units).",
    snippetKey: "price",
  },
  {
    id: "accepts[0].payTo",
    label: "PayTo address present",
    severity: "blocking",
    category: "payment",
    wizardStep: STEP_ENDPOINT,
    fixMessage: "Set payTo to a valid wallet address (0x… for EVM).",
    snippetKey: "payTo",
  },
  {
    id: "accepts[0].maxTimeoutSeconds",
    label: "maxTimeoutSeconds is set",
    severity: "warning",
    category: "payment",
    wizardStep: STEP_ENDPOINT,
    fixMessage: "Set maxTimeoutSeconds to a positive integer (60 is a good default).",
  },

  // --- Resource ---
  {
    id: "has_resource",
    label: "Resource object present",
    severity: "blocking",
    category: "transport",
    wizardStep: STEP_METADATA,
    fixMessage: "Response must include a top-level `resource` object with the endpoint URL.",
  },

  // --- Bazaar extension ---
  {
    id: "has_bazaar_extension",
    label: "Bazaar extension present",
    severity: "blocking",
    category: "bazaar",
    wizardStep: STEP_STACK,
    fixMessage:
      "Add the bazaar extension under top-level `extensions.bazaar`. Register `bazaarResourceServerExtension` and call `declareDiscoveryExtension()`.",
    snippetKey: "bazaar-extension",
  },
  {
    id: "bazaar.info",
    label: "Bazaar info block",
    severity: "blocking",
    category: "bazaar",
    wizardStep: STEP_METADATA,
    fixMessage: "Bazaar extension must include an `info` block with discovery metadata.",
    snippetKey: "bazaar-info",
  },
  {
    id: "bazaar.info.output",
    label: "Output metadata",
    severity: "blocking",
    category: "bazaar",
    wizardStep: STEP_METADATA,
    fixMessage: "Add `info.output` describing what your endpoint returns.",
    snippetKey: "bazaar-output",
  },
  {
    id: "bazaar.info.output.example",
    label: "Output example provided",
    severity: "warning",
    category: "bazaar",
    wizardStep: STEP_METADATA,
    fixMessage: "Provide an `output.example` so consumers (and AI agents) can preview your response shape.",
    snippetKey: "bazaar-output",
  },
  {
    id: "bazaar.schema",
    label: "Bazaar schema present",
    severity: "warning",
    category: "bazaar",
    wizardStep: STEP_METADATA,
    fixMessage: "Add a JSON Schema under `bazaar.schema` to validate your output structure.",
    snippetKey: "bazaar-schema",
  },
];

export const CHECKS: Record<string, CheckSpec> = Object.fromEntries(
  checksList.map((c) => [c.id, c]),
);

// Backwards-compatible exports — the legacy lookups in lib/diagnostics.ts
// re-export these so existing call sites keep working.
export const CHECK_LABELS: Record<string, string> = Object.fromEntries(
  checksList.map((c) => [c.id, c.label]),
);

export const CHECK_WIZARD_STEP: Record<string, number> = Object.fromEntries(
  checksList
    .filter((c): c is CheckSpec & { wizardStep: number } => c.wizardStep !== undefined)
    .map((c) => [c.id, c.wizardStep]),
);

export function getCheckSpec(id: string): CheckSpec | undefined {
  return CHECKS[id];
}

export function getCheckLabel(id: string): string {
  return CHECKS[id]?.label ?? id;
}
