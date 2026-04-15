"use client";

import { cn } from "@/lib/utils";

interface StepEndpointProps {
  method: string;
  path: string;
  description: string;
  price: string;
  network: string;
  payTo: string;
  onChange: (field: string, value: string) => void;
}

const METHODS = ["GET", "POST", "PUT", "DELETE"];

const NETWORKS = [
  { label: "Base Mainnet", value: "eip155:8453" },
  { label: "Base Sepolia", value: "eip155:84532" },
];

const inputClass = cn(
  "w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm font-mono text-foreground",
  "placeholder:text-muted-foreground",
  "focus:outline-none focus:ring-1 focus:ring-accent"
);

export function StepEndpoint({
  method,
  path,
  description,
  price,
  network,
  payTo,
  onChange,
}: StepEndpointProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-base font-medium">Describe your endpoint</h3>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            HTTP Method
          </label>
          <select
            value={method}
            onChange={(e) => onChange("method", e.target.value)}
            className={inputClass}
          >
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            Endpoint Path
          </label>
          <input
            type="text"
            value={path}
            onChange={(e) => onChange("path", e.target.value)}
            placeholder="/weather"
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-muted-foreground mb-1 block">
          Description
        </label>
        <input
          type="text"
          value={description}
          onChange={(e) => onChange("description", e.target.value)}
          placeholder="Returns current weather data for a given location"
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            Price (USD)
          </label>
          <input
            type="text"
            value={price}
            onChange={(e) => onChange("price", e.target.value)}
            placeholder="$0.001"
            className={inputClass}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            Network
          </label>
          <select
            value={network}
            onChange={(e) => onChange("network", e.target.value)}
            className={inputClass}
          >
            {NETWORKS.map((n) => (
              <option key={n.value} value={n.value}>
                {n.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="text-xs text-muted-foreground mb-1 block">
          PayTo Address (your wallet)
        </label>
        <input
          type="text"
          value={payTo}
          onChange={(e) => onChange("payTo", e.target.value)}
          placeholder="0x..."
          className={inputClass}
        />
      </div>
    </div>
  );
}
