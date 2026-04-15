"use client";

import { Stack, EndpointConfig, generateCode } from "@/lib/code-templates";
import { CopyButton } from "@/components/wizard/copy-button";

interface StepCodeProps {
  stack: Stack;
  config: EndpointConfig;
}

export function StepCode({ stack, config }: StepCodeProps) {
  const code = generateCode(stack, config);

  return (
    <div className="space-y-4">
      <h3 className="text-base font-medium">Generated Code</h3>
      <p className="text-xs text-muted-foreground">
        Copy and paste this into your project. It&apos;s pre-filled with your
        endpoint details.
      </p>

      <div className="relative">
        <pre className="bg-muted border border-border rounded-lg p-4 text-xs font-mono overflow-x-auto leading-relaxed">
          {code}
        </pre>
        <CopyButton text={code} className="absolute top-3 right-3" />
      </div>
    </div>
  );
}
