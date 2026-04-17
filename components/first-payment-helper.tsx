"use client";

import { useState, useMemo } from "react";
import { ProbeResult } from "@/lib/diagnostics";
import { CopyButton } from "@/components/wizard/copy-button";

interface Props {
  validatedUrl: string;
  validatedMethod: string;
  probeResult: ProbeResult | null;
  onWatchForIndexing: () => void;
  watching?: boolean;
}

type Tab = "node" | "curl" | "manual";

const NETWORK_LABELS: Record<string, { label: string; mainnet: boolean; faucet?: string }> = {
  "eip155:8453": { label: "Base mainnet", mainnet: true },
  base: { label: "Base mainnet", mainnet: true },
  "eip155:84532": {
    label: "Base Sepolia (testnet)",
    mainnet: false,
    faucet: "https://faucet.circle.com",
  },
  "base-sepolia": {
    label: "Base Sepolia (testnet)",
    mainnet: false,
    faucet: "https://faucet.circle.com",
  },
};

// FirstPaymentHelper walks the user through triggering the verify+settle that
// the CDP facilitator needs to catalog the endpoint. Pre-fills the URL,
// method, and network-aware copy from the probe result.
export function FirstPaymentHelper({
  validatedUrl,
  validatedMethod,
  probeResult,
  onWatchForIndexing,
  watching,
}: Props) {
  const [tab, setTab] = useState<Tab>("node");

  const accepts0 =
    (probeResult?.paymentRequirements?.accepts as Record<string, unknown>[] | undefined)?.[0] ??
    null;
  const network = (accepts0?.network as string | undefined) ?? "eip155:84532";
  const networkInfo = NETWORK_LABELS[network] ?? {
    label: network,
    mainnet: false,
  };

  const nodeSnippet = useMemo(
    () => buildNodeSnippet(validatedUrl, validatedMethod, networkInfo.mainnet),
    [validatedUrl, validatedMethod, networkInfo.mainnet],
  );
  const curlSnippet = useMemo(
    () => buildCurlSnippet(validatedUrl, validatedMethod),
    [validatedUrl, validatedMethod],
  );

  return (
    <div className="bg-muted border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground uppercase tracking-wider">
          Trigger your first payment
        </span>
        <span
          className={`text-xs px-2 py-0.5 rounded font-mono ${
            networkInfo.mainnet
              ? "bg-warning/10 text-warning border border-warning/30"
              : "bg-success/10 text-success border border-success/30"
          }`}
        >
          {networkInfo.label}
        </span>
      </div>

      {networkInfo.mainnet && (
        <p className="text-xs text-warning">
          ⚠ This endpoint accepts payments on Base mainnet — running the snippet
          below will spend real USDC. Consider switching the endpoint to Base
          Sepolia (`eip155:84532`) just for the first-payment test.
        </p>
      )}
      {!networkInfo.mainnet && networkInfo.faucet && (
        <p className="text-xs text-muted-foreground">
          Need testnet USDC? Get some at{" "}
          <a
            href={networkInfo.faucet}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            {networkInfo.faucet}
          </a>
          .
        </p>
      )}

      <div className="flex gap-1 text-xs">
        <TabButton active={tab === "node"} onClick={() => setTab("node")}>
          @x402/fetch
        </TabButton>
        <TabButton active={tab === "curl"} onClick={() => setTab("curl")}>
          curl
        </TabButton>
        <TabButton active={tab === "manual"} onClick={() => setTab("manual")}>
          manual
        </TabButton>
      </div>

      {tab === "node" && (
        <SnippetBlock snippet={nodeSnippet} language="ts" />
      )}
      {tab === "curl" && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            curl on its own can&apos;t sign x402 payment payloads, so this just
            confirms the 402 response. Use the @x402/fetch tab for an actual
            settled payment.
          </p>
          <SnippetBlock snippet={curlSnippet} language="bash" />
        </div>
      )}
      {tab === "manual" && (
        <p className="text-xs text-muted-foreground">
          Make any successful payment to <span className="font-mono">{validatedUrl}</span>{" "}
          via the CDP facilitator (any x402 client pointed at{" "}
          <span className="font-mono">
            https://api.cdp.coinbase.com/platform/v2/x402/facilitator
          </span>
          ). We&apos;ll detect the indexing within ~30s of settle.
        </p>
      )}

      <button
        type="button"
        onClick={onWatchForIndexing}
        disabled={watching}
        className="text-xs px-3 py-1.5 rounded-md bg-accent/20 text-accent border border-accent/30 hover:bg-accent/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {watching
          ? "Watching for indexing…"
          : "I made the payment — watch for indexing"}
      </button>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2 py-1 rounded ${
        active
          ? "bg-accent/20 text-accent"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function SnippetBlock({ snippet, language }: { snippet: string; language: string }) {
  return (
    <div className="relative">
      <pre className="bg-card border border-border rounded-md p-3 text-xs overflow-x-auto pr-12">
        {snippet}
      </pre>
      <div className="absolute top-2 right-2">
        <CopyButton text={snippet} />
      </div>
      <span className="text-[10px] text-muted-foreground absolute bottom-1 right-3">
        {language}
      </span>
    </div>
  );
}

function buildNodeSnippet(url: string, method: string, mainnet: boolean): string {
  const facilitator = "https://api.cdp.coinbase.com/platform/v2/x402/facilitator";
  return `// npm install @x402/core @x402/extensions @x402/fetch @x402/evm viem
import { HTTPFacilitatorClient } from "@x402/core/http";
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

// ${mainnet ? "MAINNET — real USDC" : "Base Sepolia — test USDC"}
const signer = privateKeyToAccount(process.env.EVM_PRIVATE_KEY as \`0x\${string}\`);
const client = new x402Client();
registerExactEvmScheme(client, { signer });

const facilitator = new HTTPFacilitatorClient({ url: "${facilitator}" });
client.setFacilitator(facilitator);

const fetchWithPayment = wrapFetchWithPayment(fetch, client);
const res = await fetchWithPayment("${url}", { method: "${method}" });
console.log(res.status, await res.text());`;
}

function buildCurlSnippet(url: string, method: string): string {
  return `curl -i -X ${method} "${url}" -H "Accept: application/json"`;
}
