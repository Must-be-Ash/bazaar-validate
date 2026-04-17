"use client";

import { motion } from "framer-motion";
import { MerchantData, QualitySignals } from "@/lib/diagnostics";

interface ResultsFoundProps {
  resource: Record<string, unknown>;
  totalIndexed: number;
  merchantResources?: MerchantData | null;
  qualitySignals?: QualitySignals | null;
}

export function ResultsFound({
  resource,
  totalIndexed,
  merchantResources,
  qualitySignals,
}: ResultsFoundProps) {
  const accepts = resource.accepts as
    | Record<string, unknown>[]
    | undefined;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full space-y-4"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="w-3 h-3 rounded-full bg-success animate-pulse" />
        <h2 className="text-lg font-medium text-success">Found on Bazaar</h2>
      </div>

      <div className="bg-muted border border-border rounded-lg p-4 space-y-3">
        <DetailRow label="Resource URL" value={resource.resource as string} />
        {resource.x402Version != null && (
          <DetailRow
            label="x402 Version"
            value={`v${String(resource.x402Version)}`}
          />
        )}
        {typeof resource.lastUpdated === "string" && (
          <DetailRow
            label="Last Updated"
            value={formatLastUpdated(resource.lastUpdated)}
          />
        )}

        {accepts && accepts.length > 0 && (
          <div className="space-y-2">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">
              Payment Methods
            </span>
            {accepts.map((pr, i) => {
              const scheme = pr.scheme as string | undefined;
              const network = pr.network as string | undefined;
              const amount = pr.amount as string | undefined;
              const asset = pr.asset as string | undefined;
              const description = pr.description as string | undefined;
              const payTo = pr.payTo as string | undefined;
              return (
                <div
                  key={i}
                  className="bg-card border border-border rounded-md p-3 text-sm space-y-1"
                >
                  {scheme && <DetailRow label="Scheme" value={scheme} />}
                  {network && <DetailRow label="Network" value={network} />}
                  {amount && <DetailRow label="Amount" value={amount} />}
                  {asset && <DetailRow label="Asset" value={asset} />}
                  {description && <DetailRow label="Description" value={description} />}
                  {payTo && <DetailRow label="Pay To" value={payTo} />}
                </div>
              );
            })}
          </div>
        )}

        {resource.extensions != null && (
          <div className="space-y-2">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">
              Extensions
            </span>
            <pre className="bg-card border border-border rounded-md p-3 text-xs overflow-x-auto">
              {JSON.stringify(resource.extensions, null, 2)}
            </pre>
          </div>
        )}

        {qualitySignals && (
          <div className="space-y-2">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">
              Quality Signals
            </span>
            <div className="bg-card border border-border rounded-md p-3 text-sm space-y-1">
              <SignalRow
                label="Description provided"
                value={qualitySignals.descriptionPresent}
              />
              <SignalRow
                label="Input schema present"
                value={qualitySignals.inputSchemaPresent}
              />
              <SignalRow
                label="Output schema present"
                value={qualitySignals.outputSchemaPresent}
              />
              <SignalRow
                label="Dedicated domain"
                value={qualitySignals.dedicatedDomain}
                unknownLabel="not yet exposed"
              />
              <SignalRow
                label="Payer count (30d)"
                value={qualitySignals.payerCount30d}
                unknownLabel="not yet exposed by API"
              />
            </div>
          </div>
        )}
      </div>

      {merchantResources && merchantResources.count > 1 && (
        <div className="bg-muted border border-border rounded-lg p-4">
          <p className="text-sm text-muted-foreground mb-2">
            {merchantResources.count} total endpoint{merchantResources.count !== 1 ? "s" : ""} registered to this wallet
          </p>
          <div className="space-y-1">
            {merchantResources.resources.map((r) => (
              <div key={r.resource} className="flex items-center gap-2 text-xs">
                <a
                  href={`/?url=${encodeURIComponent(r.resource)}`}
                  className="font-mono text-foreground/80 hover:text-foreground truncate flex-1"
                  title="Validate this endpoint"
                >
                  {r.resource}
                </a>
                {r.lastUpdated && (
                  <span className="text-muted-foreground whitespace-nowrap">
                    {ago(r.lastUpdated)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground text-center">
        {totalIndexed} total resources indexed in the Bazaar
      </p>
    </motion.div>
  );
}

function ago(iso: string): string {
  try {
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const min = Math.round(diffMs / 60_000);
    const hr = Math.round(diffMs / 3_600_000);
    const day = Math.round(diffMs / 86_400_000);
    if (diffMs < 60_000) return "just now";
    if (min < 60) return `${min}m ago`;
    if (hr < 24) return `${hr}h ago`;
    return `${day}d ago`;
  } catch {
    return iso;
  }
}

function formatLastUpdated(iso: string): string {
  try {
    const d = new Date(iso);
    const now = Date.now();
    const diffMs = now - d.getTime();
    const diffMin = Math.round(diffMs / 60_000);
    const diffH = Math.round(diffMs / 3_600_000);
    const diffD = Math.round(diffMs / 86_400_000);
    if (diffMs < 60_000) return `just now (${d.toISOString()})`;
    if (diffMin < 60) return `${diffMin}m ago (${d.toISOString()})`;
    if (diffH < 24) return `${diffH}h ago (${d.toISOString()})`;
    if (diffD < 30) return `${diffD}d ago (${d.toISOString()})`;
    return d.toISOString();
  } catch {
    return iso;
  }
}

function SignalRow({
  label,
  value,
  unknownLabel,
}: {
  label: string;
  value: boolean | number | null;
  unknownLabel?: string;
}) {
  let display: string;
  let cls = "text-foreground";
  if (value === null) {
    display = unknownLabel ?? "—";
    cls = "text-muted-foreground italic";
  } else if (typeof value === "number") {
    display = String(value);
  } else {
    display = value ? "yes" : "no";
    cls = value ? "text-success" : "text-warning";
  }
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm font-mono ${cls}`}>{display}</span>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-xs text-muted-foreground min-w-[100px]">
        {label}:
      </span>
      <span className="text-sm text-foreground break-all font-mono">
        {value}
      </span>
    </div>
  );
}
