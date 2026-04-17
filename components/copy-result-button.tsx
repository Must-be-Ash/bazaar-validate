"use client";

import { useState } from "react";
import {
  CheckResult,
  ProbeResult,
  ResultState,
  ValidationResult,
} from "@/lib/diagnostics";

interface Props {
  validatedUrl: string;
  validatedMethod: string;
  resultState: ResultState;
  validationSource: "go" | "node" | null;
  sdkVersion?: string;
  fallbackReason?: "go_unreachable" | "go_timeout" | "go_error" | null;
  probeResult: ProbeResult | null;
  checkResult: CheckResult | null;
}

// CopyResultButton serializes the entire result panel to a markdown-friendly
// text block and copies it to the clipboard, so testers can paste exactly
// what they're seeing into a chat / issue tracker.
export function CopyResultButton(props: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const text = serialize(props);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback: log so a tester can grab from devtools if clipboard fails.
      console.log(text);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="text-xs px-2.5 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
      title="Copy a structured summary of this result to clipboard"
    >
      {copied ? "Copied ✓" : "Copy result"}
    </button>
  );
}

function serialize(p: Props): string {
  const lines: string[] = [];
  lines.push("[bazaar-validate result]");
  lines.push(`URL: ${p.validatedMethod} ${p.validatedUrl}`);
  lines.push(`State: ${p.resultState}`);
  if (p.validationSource) {
    const source =
      p.validationSource === "go"
        ? `Go SDK${p.sdkVersion ? ` (${p.sdkVersion})` : ""}`
        : `Node fallback${p.fallbackReason ? ` (${p.fallbackReason})` : ""}`;
    lines.push(`Source: ${source}`);
  }

  // /api/check summary
  if (p.checkResult) {
    lines.push("");
    lines.push("--- /api/check ---");
    lines.push(`found: ${p.checkResult.found}`);
    lines.push(`totalIndexed: ${p.checkResult.totalIndexed}`);
    if (p.checkResult.merchantResources) {
      lines.push(
        `merchant ${p.checkResult.merchantResources.payTo}: ${p.checkResult.merchantResources.count} endpoint(s)`,
      );
    }
    if (p.checkResult.domainSiblings) {
      lines.push(
        `domainSiblings on ${p.checkResult.domainSiblings.hostname}: ${p.checkResult.domainSiblings.count}`,
      );
    }
    if (p.checkResult.qualitySignals) {
      const q = p.checkResult.qualitySignals;
      lines.push(
        `qualitySignals: description=${q.descriptionPresent}, inputSchema=${q.inputSchemaPresent}, outputSchema=${q.outputSchemaPresent}, dedicatedDomain=${q.dedicatedDomain}, payerCount30d=${q.payerCount30d}`,
      );
    }
  }

  // /api/validate summary (probeResult)
  if (p.probeResult) {
    const v = p.probeResult as ValidationResult & ProbeResult;
    lines.push("");
    lines.push("--- /api/validate ---");
    lines.push(
      `reachable=${v.reachable} statusCode=${v.statusCode} returns402=${v.returns402} x402Version=${v.x402Version}`,
    );
    if (v.parse) {
      lines.push(`parse: ok=${v.parse.ok}${v.parse.error ? ` error="${v.parse.error}"` : ""}`);
    }
    if (v.simulate) {
      const sim = v.simulate;
      lines.push(
        `simulate: outcome=${sim.outcome}${sim.rejectedReason ? ` rejectedReason="${sim.rejectedReason}"` : ""}${sim.workflowIdHint ? ` hint="${sim.workflowIdHint}"` : ""}`,
      );
    }

    if (v.diagnostics?.length) {
      lines.push("");
      lines.push(`Checks (${v.diagnostics.length}):`);
      for (const d of v.diagnostics) {
        const icon = d.passed ? "✅" : d.detail.startsWith("Skipped:") ? "⏸ " : "❌";
        lines.push(`${icon} ${d.check} — ${d.detail}`);
      }
    }
  }

  return lines.join("\n");
}
