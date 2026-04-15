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

export interface CheckResult {
  found: boolean;
  resource: Record<string, unknown> | null;
  totalIndexed: number;
}

export const CHECK_LABELS: Record<string, string> = {
  endpoint_reachable: "Endpoint is reachable",
  returns_402: "Returns HTTP 402",
  valid_payment_requirements: "Valid x402 v2 payment requirements",
  has_bazaar_extension: "Bazaar extension present",
  has_discovery_metadata: "Discovery metadata included",
  valid_output_schema: "Valid output schema defined",
};

export const CHECK_WIZARD_STEP: Record<string, number> = {
  has_bazaar_extension: 0,
  has_discovery_metadata: 2,
  valid_output_schema: 2,
};
