"use client";

import { useState } from "react";
import { Stack, EndpointConfig, generateCode } from "@/lib/code-templates";
import { ProbeResult } from "@/lib/diagnostics";
import { getCheckSpec } from "@/lib/checks";
import { CopyButton } from "@/components/wizard/copy-button";

interface StepPromptProps {
  // Optional — when set, the prompt names the user's stack and the
  // collapsed code template renders. When null, the prompt is stack-agnostic
  // and the code template section is hidden.
  stack: Stack | null;
  config: EndpointConfig;
  // The original probe result. Used to build the prompt's "current state"
  // context (failing checks + decoded payment-required envelope). When
  // missing, we still produce a useful prompt from `config` alone.
  probeResult: ProbeResult | null;
  endpointUrl: string;
}

const DOCS_URL = "https://bazaar-validate.vercel.app/bazaar-docs.md";

const STACK_LABELS: Record<Stack, string> = {
  node: "Node.js (Express, Fastify, etc.)",
  go: "Go (Gin, net/http)",
  python: "Python (FastAPI)",
};

export function StepPrompt({ stack, config, probeResult, endpointUrl }: StepPromptProps) {
  const [showCode, setShowCode] = useState(false);
  const prompt = buildPrompt(stack, config, probeResult, endpointUrl);
  const code = stack ? generateCode(stack, config) : null;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground leading-relaxed">
        Pass this prompt to your agent. It includes every
        bit of context the model needs to update your code: the protocol spec,
        a link to the full Bazaar docs, your endpoint&apos;s current 402
        response, and exactly what the corrected response should look like.
        You can also just read it as a plain-English checklist.
      </p>

      <div className="relative">
        <pre className="bg-muted border border-border rounded-lg p-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-[480px] overflow-y-auto">
          {prompt}
        </pre>
        <CopyButton text={prompt} className="absolute top-3 right-3" />
      </div>

      {stack && code && (
        <div className="border border-border rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setShowCode((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 bg-muted hover:bg-card transition-colors text-sm text-left"
          >
            <span className="text-foreground">
              Code template ({STACK_LABELS[stack]})
            </span>
            <span className="text-muted-foreground text-xs">
              {showCode ? "−" : "+"}
            </span>
          </button>
          {showCode && (
            <div className="bg-card p-4 space-y-2">
              <p className="text-xs text-muted-foreground">
                Reference scaffold for{" "}
                <span className="text-foreground">{STACK_LABELS[stack]}</span>.
                Most real codebases need adaptation — the prompt above usually
                produces better-fitting changes.
              </p>
              <div className="relative">
                <pre className="bg-muted border border-border rounded-lg p-4 text-xs font-mono overflow-x-auto leading-relaxed">
                  {code}
                </pre>
                <CopyButton text={code} className="absolute top-3 right-3" />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildPrompt(
  stack: Stack | null,
  config: EndpointConfig,
  probeResult: ProbeResult | null,
  endpointUrl: string,
): string {
  const lines: string[] = [];

  // -- Intro -----------------------------------------------------------------
  lines.push(
    "I'm trying to get my x402 endpoint indexed in the CDP Bazaar discovery, but the Bazaar Validator (https://bazaar-validate.vercel.app) shows it has issues that need fixing. Help me update my code.",
  );
  lines.push("");

  // -- Protocol explanation --------------------------------------------------
  lines.push("## What x402 + the Bazaar are");
  lines.push(
    "x402 v2 is an HTTP payment protocol where paid endpoints respond with `HTTP 402 Payment Required` plus a `payment-required` header (or body) containing a JSON envelope: `{ x402Version: 2, accepts: [...], resource: {...}, extensions: {...} }`. The CDP Bazaar is a discovery index that catalogs endpoints whose 402 responses include a properly-shaped `extensions.bazaar` object. An endpoint only gets cataloged after the CDP facilitator processes its first verify+settle.",
  );
  lines.push("");
  lines.push(
    `Full spec: ${DOCS_URL} — please reference the **"Quickstart for Sellers"** section, which shows the exact \`bazaarResourceServerExtension\` registration + \`declareDiscoveryExtension()\` helper usage for Node.js / Go / Python.`,
  );
  lines.push("");

  // -- Endpoint context ------------------------------------------------------
  lines.push("## My endpoint");
  lines.push(`URL: ${config.method} ${endpointUrl}`);
  if (stack) {
    lines.push(`Stack: ${STACK_LABELS[stack]}`);
  } else {
    lines.push("Stack: (not specified — adapt to whatever you can see in my code)");
  }
  lines.push("");

  // -- What's broken ---------------------------------------------------------
  const failing = collectFailingChecks(probeResult);
  if (failing.length > 0) {
    lines.push("## What's currently broken");
    lines.push(
      "The Bazaar Validator surfaced these blocking issues with my endpoint's 402 response:",
    );
    for (const f of failing) {
      lines.push(`- ❌ \`${f.id}\` — ${f.detail}`);
      if (f.fix) lines.push(`  - Fix: ${f.fix}`);
    }
    lines.push("");
  }

  // -- Current decoded 402 envelope -----------------------------------------
  if (probeResult?.paymentRequirements) {
    lines.push("## My current 402 response (decoded payment-required envelope)");
    lines.push("```json");
    lines.push(JSON.stringify(probeResult.paymentRequirements, null, 2));
    lines.push("```");
    lines.push("");
  }

  // -- What the corrected response should look like -------------------------
  lines.push("## What the corrected 402 response should look like");
  lines.push(
    "After your fix, the decoded `payment-required` envelope should match this shape (with my actual values, shown below):",
  );
  lines.push("```json");
  lines.push(JSON.stringify(buildCorrectedEnvelope(config, endpointUrl), null, 2));
  lines.push("```");
  lines.push("");

  // -- Action items ---------------------------------------------------------
  lines.push("## Please update my code to:");
  lines.push("1. Make sure I'm using the **CDP facilitator** at `https://api.cdp.coinbase.com/platform/v2/x402/facilitator` (not `x402.org`) — only CDP-settled endpoints get cataloged in the CDP Bazaar.");
  lines.push("2. Install/import `@x402/extensions/bazaar` (or the equivalent for my stack) and **register `bazaarResourceServerExtension`** on the resource server.");
  lines.push("3. Use the **`declareDiscoveryExtension()`** helper in my route config so my route's `extensions.bazaar` block matches the corrected shape above. The helper auto-generates `info.input.{type, method}` and the JSON Schema, so I should pass it `output: { example, schema }` (and optionally `input: {...}`).");
  lines.push("4. Make sure `accepts[0]` includes a valid USDC `asset` for the declared network, an `amount` ≥ 1000 atomic units ($0.001), and a `payTo` address.");
  lines.push("");
  lines.push(
    "If you need to see specific files (middleware, route handler, package.json, etc.), ask me to share them.",
  );

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface FailingCheck {
  id: string;
  detail: string;
  fix?: string;
}

function collectFailingChecks(probe: ProbeResult | null): FailingCheck[] {
  if (!probe?.diagnostics) return [];
  return probe.diagnostics
    .filter((d) => !d.passed && !d.detail.startsWith("Skipped:"))
    .map((d) => ({
      id: d.check,
      detail: d.detail,
      fix: getCheckSpec(d.check)?.fixMessage,
    }));
}

// buildCorrectedEnvelope synthesizes the "what your 402 SHOULD look like"
// JSON from the user-provided wizard config. Mirrors the v2 payment-required
// envelope shape (resource, accepts, extensions.bazaar).
function buildCorrectedEnvelope(
  config: EndpointConfig,
  endpointUrl: string,
): Record<string, unknown> {
  const network = config.network || "eip155:84532";
  const usdc = USDC_FOR_NETWORK[network] ?? "<USDC contract address for your network>";

  // Convert "$0.001" → "1000" (atomic USDC units).
  const amount = priceToAtomic(config.price) ?? "1000";

  const isQueryMethod = ["GET", "HEAD", "DELETE"].includes(config.method);
  const input: Record<string, unknown> = {
    type: "http",
    method: config.method,
  };
  if (isQueryMethod) {
    input.queryParams = safeParse(config.inputExample) ?? {};
  } else {
    input.body = safeParse(config.inputExample) ?? {};
    input.bodyType = config.bodyType || "json";
  }

  return {
    x402Version: 2,
    error: "Payment required",
    resource: {
      url: endpointUrl,
      description: config.description || undefined,
      mimeType: "application/json",
    },
    accepts: [
      {
        scheme: "exact",
        network,
        amount,
        asset: usdc,
        payTo: config.payTo || "<your merchant wallet address>",
        maxTimeoutSeconds: 300,
      },
    ],
    extensions: {
      bazaar: {
        info: {
          input,
          output: {
            type: "json",
            example: safeParse(config.outputExample) ?? "<example response>",
          },
        },
        schema: safeParse(config.outputSchema) ?? {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          type: "object",
        },
      },
    },
  };
}

const USDC_FOR_NETWORK: Record<string, string> = {
  "eip155:8453": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "eip155:84532": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
};

function priceToAtomic(price: string): string | null {
  const m = /^\$?([0-9]*\.?[0-9]+)$/.exec(price.trim());
  if (!m) return null;
  const dollars = parseFloat(m[1]);
  if (Number.isNaN(dollars) || dollars <= 0) return null;
  return String(Math.round(dollars * 1_000_000));
}

function safeParse(s: string): unknown {
  if (!s || !s.trim()) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
