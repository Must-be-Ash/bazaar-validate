"use client";

import { CheckSpec, getCheckSpec } from "@/lib/checks";

interface Props {
  checkId: string;
  detail: string;
  onJumpToWizard: (step: number) => void;
}

// Per-snippetKey excerpts shown in the FixCard. Kept short (2–4 lines) so the
// card stays scannable. Full code generation still happens in the wizard.
const SNIPPETS: Record<string, { language: string; code: string }> = {
  https: {
    language: "config",
    code: "# Deploy your endpoint behind https://\n# (Vercel, Cloudflare, Fly.io, etc. give you HTTPS by default)",
  },
  "middleware-order": {
    language: "ts",
    code: `// x402 middleware MUST run before auth middleware:
app.use(paymentMiddleware({ ... }));   // ✓ first
app.use(authMiddleware);                // ✓ second`,
  },
  "v2-upgrade": {
    language: "bash",
    code: `npm install @x402/express @x402/extensions @x402/core @x402/evm
# v1 fields like paymentRequirements / maxAmountRequired are deprecated.`,
  },
  scheme: {
    language: "ts",
    code: `accepts: { scheme: "exact", price: "$0.001", ... }
//        ^^^^^^^^^^^^^^^ must be "exact" or "upto"`,
  },
  network: {
    language: "ts",
    code: `accepts: { network: "eip155:84532", ... } // Base Sepolia
// or "eip155:8453" (Base mainnet)`,
  },
  asset: {
    language: "ts",
    code: `// USDC contracts:
// Base mainnet:  0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
// Base Sepolia:  0x036CbD53842c5426634e7929541eC2318f3dCF7e`,
  },
  price: {
    language: "ts",
    code: `accepts: { price: "$0.001", ... } // minimum
// Equivalent atomic units: 1000 (USDC has 6 decimals)`,
  },
  payTo: {
    language: "ts",
    code: `accepts: { payTo: "0xYourMerchantWallet", ... }
//        ^^^^^^^^ must be a valid 0x address (EVM)`,
  },
  "bazaar-extension": {
    language: "ts",
    code: `import { bazaarResourceServerExtension, declareDiscoveryExtension } from "@x402/extensions/bazaar";
server.registerExtension(bazaarResourceServerExtension);
// then add ...declareDiscoveryExtension({ output: { ... } }) to the route's extensions`,
  },
  "bazaar-info": {
    language: "ts",
    code: `extensions: {
  ...declareDiscoveryExtension({
    output: { example: { temperature: 72 }, schema: { ... } },
  }),
},`,
  },
  "bazaar-output": {
    language: "ts",
    code: `output: {
  example: { temperature: 72, conditions: "sunny" },
  schema: { properties: { temperature: { type: "number" } } },
},`,
  },
  "bazaar-schema": {
    language: "json",
    code: `{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": { "temperature": { "type": "number" } }
}`,
  },
};

export function FixCard({ checkId, detail, onJumpToWizard }: Props) {
  const spec: CheckSpec | undefined = getCheckSpec(checkId);
  if (!spec) return null;
  const snippet = spec.snippetKey ? SNIPPETS[spec.snippetKey] : undefined;

  return (
    <div className="bg-card border border-warning/30 rounded-md p-3 mt-2 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">{spec.label}</p>
          <p className="text-xs text-muted-foreground">{detail}</p>
        </div>
      </div>
      <p className="text-xs text-foreground/80">{spec.fixMessage}</p>
      {snippet && (
        <pre className="bg-muted border border-border rounded-md p-2 text-xs overflow-x-auto">
          {snippet.code}
        </pre>
      )}
      {typeof spec.wizardStep === "number" && (
        <button
          type="button"
          onClick={() => onJumpToWizard(spec.wizardStep!)}
          className="text-xs px-2 py-1 rounded bg-accent/20 text-accent hover:bg-accent/30 transition-colors"
        >
          Jump to wizard step {spec.wizardStep + 1} →
        </button>
      )}
    </div>
  );
}
