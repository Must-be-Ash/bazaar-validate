"use client";

import { Stack, generateTestPaymentCode } from "@/lib/code-templates";
import { CopyButton } from "@/components/wizard/copy-button";

interface StepDeployProps {
  stack: Stack;
  endpointUrl: string;
  method: string;
}

export function StepDeploy({ stack, endpointUrl, method }: StepDeployProps) {
  const testCode = generateTestPaymentCode(stack, endpointUrl, method);

  return (
    <div className="space-y-4">
      <h3 className="text-base font-medium">Post-deployment Checklist</h3>

      <div className="space-y-3">
        <div className="bg-muted border border-border rounded-lg p-4">
          <p className="text-sm font-medium mb-2">
            1. Deploy your updated endpoint
          </p>
          <p className="text-xs text-muted-foreground">
            Push your changes and ensure the endpoint is live and accessible via
            HTTPS.
          </p>
        </div>

        <div className="bg-muted border border-border rounded-lg p-4">
          <p className="text-sm font-medium mb-2">
            2. Make your first paid request
          </p>
          <p className="text-xs text-muted-foreground mb-3">
            Your endpoint needs at least one successful transaction through the
            CDP facilitator before it appears in the Bazaar. Use an x402 client
            to make a test payment:
          </p>
          <div className="relative">
            <pre className="bg-card border border-border rounded-md p-3 text-xs font-mono overflow-x-auto leading-relaxed">
              {testCode}
            </pre>
            <CopyButton text={testCode} className="absolute top-2 right-2" />
          </div>
        </div>

        <div className="bg-muted border border-border rounded-lg p-4">
          <p className="text-sm font-medium mb-2">3. Validate again</p>
          <p className="text-xs text-muted-foreground">
            After your first successful transaction, come back to this validator
            and check your endpoint again. It should now appear in the Bazaar.
          </p>
        </div>

        <div className="bg-warning/10 border border-warning/30 rounded-lg p-4">
          <p className="text-sm font-medium text-warning mb-1">
            Important: Auth Gating
          </p>
          <p className="text-xs text-muted-foreground">
            Your endpoint must return HTTP 402 to unauthenticated requests. If
            auth middleware runs before x402 middleware, the endpoint will return
            401/403 instead, preventing discovery.
          </p>
        </div>
      </div>
    </div>
  );
}
