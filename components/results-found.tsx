"use client";

import { motion } from "framer-motion";

interface ResultsFoundProps {
  resource: Record<string, unknown>;
  totalIndexed: number;
}

export function ResultsFound({ resource, totalIndexed }: ResultsFoundProps) {
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

        {resource.qualitySignals != null && (
          <div className="space-y-2">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">
              Quality Signals
            </span>
            <pre className="bg-card border border-border rounded-md p-3 text-xs overflow-x-auto">
              {JSON.stringify(resource.qualitySignals, null, 2)}
            </pre>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground text-center">
        {totalIndexed} total resources indexed in the Bazaar
      </p>
    </motion.div>
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
