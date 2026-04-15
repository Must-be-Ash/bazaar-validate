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

export interface MerchantData {
  payTo: string;
  count: number;
  resources: string[];
}

export interface CheckResult {
  found: boolean;
  resource: Record<string, unknown> | null;
  totalIndexed: number;
  merchantResources?: MerchantData | null;
}

export const CHECK_LABELS: Record<string, string> = {
  endpoint_reachable: "Endpoint is reachable",
  returns_402: "Returns HTTP 402",
  valid_payment_requirements: "Valid x402 v2 payment requirements",
  scheme_valid: "Valid payment scheme",
  amount_valid: "Price meets $0.001 USDC minimum",
  network_supported: "Network is supported",
  asset_usdc: "Asset is USDC",
  payto_valid: "PayTo address present",
  resource_url: "Resource URL in response",
  has_bazaar_extension: "Bazaar extension present",
  has_discovery_metadata: "Discovery metadata included",
  valid_output_schema: "Valid output schema defined",
  // Go backend checks
  url_https: "URL uses HTTPS",
  valid_json: "Valid JSON response",
  x402_version: "x402 version is 2",
  has_accepts: "Accepts array present",
  has_resource: "Resource object present",
  "bazaar.info": "Bazaar info block",
  "bazaar.info.output": "Output metadata",
  "bazaar.info.output.example": "Output example provided",
  "bazaar.schema": "Bazaar schema present",
};

export const CHECK_WIZARD_STEP: Record<string, number> = {
  has_bazaar_extension: 0,
  has_discovery_metadata: 2,
  valid_output_schema: 2,
};
