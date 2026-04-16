Bazaar Discovery Validation — How It Works

The flow is triggered on settle when a payment includes a Bazaar extension. Here's the full call chain:
Entry point: parseDiscoveryInfo Called first to extract and structurally validate the discovery data from the payment payload. It:
Calls the x402 SDK's ExtractDiscoveredResourceFromPaymentPayload to pull out the DiscoveredResource
Transforms the raw discovery info into an outputSchema map
Validates that a transportType exists in outputSchema.input.type
For HTTP resources, validates that a method exists in outputSchema.input.method — an HTTP resource without a method is rejected
Returns (nil, nil) if no Bazaar extension is present (no-op), or an error if it's malformed
Gating check: containsBazaarExtension A quick probe that checks whether a Bazaar extension is actually present before running full validation. It looks for:
v2: extensions.bazaar in the payment payload
v1: outputSchema in the payment requirements
Core post-settle handler: submitDiscoveryJobIfNeeded After parsing, this function decides whether to submit the resource to the Bazaar index and what response to return. In order, it checks:
ConditionResponseDiscovery globally disabled
Rejected: "discovery not enabled"
Parse failed (malformed Bazaar data)
Rejected: "invalid discovery configuration"
No discovery info (no Bazaar extension)
nil (silent pass)
transportType != "http"
Rejected: "unsupported transport type: <type>"
Legacy URL/schema validation fails
Rejected: "discovery request validation failed"
Temporal client not configured
Rejected: "discovery service unavailable"
Dynamic route but can't extract concrete URL
Rejected: "invalid discovery configuration"
Workflow submit fails
Rejected: "failed to submit discovery job"
Success
BazaarResponse{Status: "processing"}
Legacy validation (legacy.ValidateDiscoveryRequest) The URL/schema pre-filter before touching Temporal. It checks:
Resource URL is non-empty and parseable
If an outputSchema is present: validates input.type is a string
If type == "http" and SecureValidationsEnabled is true: enforces https:// prefix on the resource URL



1. We follow a flow that first calls this validation function: /Users/ashnouruzi/bazaar-validate/validate/parseDiscoveryInfo.md
2. This file contains some of the helpers used there: /Users/ashnouruzi/bazaar-validate/validate/helpers.md
3. Then we call this function, which performs some more validation: /Users/ashnouruzi/bazaar-validate/validate/submitDiscoveryJobIfNeeded.md
4. And this is one of the dependencies of that: /Users/ashnouruzi/bazaar-validate/validate/legacy.md