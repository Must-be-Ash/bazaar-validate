"use client";

import { Stack, STACK_LABELS, INSTALL_COMMANDS } from "@/lib/code-templates";
import { cn } from "@/lib/utils";
import { CopyButton } from "@/components/wizard/copy-button";

interface StepStackProps {
  selected: Stack | null;
  onSelect: (stack: Stack) => void;
}

const stacks: { id: Stack; desc: string }[] = [
  { id: "node", desc: "x402-express middleware" },
  { id: "go", desc: "github.com/coinbase/x402/go/pkg/gin middleware" },
  { id: "python", desc: "x402[fastapi] middleware" },
];

export function StepStack({ selected, onSelect }: StepStackProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-base font-medium">Select your stack</h3>
      <div className="grid gap-3">
        {stacks.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            className={cn(
              "text-left border rounded-lg p-4 transition-all",
              selected === s.id
                ? "border-accent bg-accent/10"
                : "border-border bg-muted hover:border-muted-foreground"
            )}
          >
            <p className="font-medium text-sm">{STACK_LABELS[s.id]}</p>
            <p className="text-xs text-muted-foreground mt-1">{s.desc}</p>
          </button>
        ))}
      </div>

      {selected && (
        <div className="mt-4">
          <p className="text-xs text-muted-foreground mb-2">Install command:</p>
          <div className="relative bg-muted border border-border rounded-md p-3">
            <code className="text-sm font-mono text-foreground">
              {INSTALL_COMMANDS[selected]}
            </code>
            <CopyButton
              text={INSTALL_COMMANDS[selected]}
              className="absolute top-2 right-2"
            />
          </div>
        </div>
      )}
    </div>
  );
}
