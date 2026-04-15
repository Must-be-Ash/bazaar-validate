# Bazaar Validator — TODO

A tool for x402 v2 endpoint operators to check if they're indexed in the Bazaar, and if not, diagnose exactly why and guide them through fixing it.

**Core constraint (from teammate):** To truly match the Bazaar's validation, the validation check needs to use the Go SDK. The webapp alone cannot give a full guarantee — only the facilitator can do that. The pragmatic path is a Go server running alongside the webapp that uses the actual SDK and validation logic.

**Target architecture:**
```
User → Next.js frontend → Next.js backend (/api/validate) → Go backend (/validate) → user's endpoint
                                                          → CDP Discovery API (lookup)
```

---

## Phase 1: Go Validation Backend (the core)

This is what makes the tool actually trustworthy. Without this, we're just checking HTTP response shape from Node.js — useful for basic diagnostics but cannot guarantee Bazaar will accept the endpoint.

### 1.1 Scaffold the Go server

- [ ] Create `go-validator/` directory with a Go HTTP server (e.g. net/http or Gin)
- [ ] `POST /validate` endpoint — accepts `{ url: string, method: string }`
- [ ] `GET /health` endpoint — for Next.js to check availability
- [ ] Import the x402 Go SDK: `github.com/coinbase/x402/go/...`

### 1.2 Implement validation using the Go SDK

- [ ] **Get the actual bazaar validation code from teammate** — this is the critical dependency. The teammate said they'd share the validation logic so the Go server can accurately reflect it.
- [ ] Fetch the target URL, parse the 402 response using SDK types
- [ ] Run the same validation checks the Bazaar indexer runs
- [ ] Return structured results back to Next.js:
  ```json
  {
    "valid": true|false,
    "checks": [
      { "check": "...", "passed": true|false, "detail": "...", "expected": "...", "actual": "..." }
    ],
    "raw": { "statusCode": 402, "body": "...", "headers": {} }
  }
  ```

### 1.3 Validation checks the Go server must perform

Per teammate: "extra validation, which is basically a $0.001 min when using USDC, and requiring HTTPS urls"

- [ ] **HTTPS required** — resource URL must be HTTPS
- [ ] **x402Version must be 2**
- [ ] **`accepts` array present and non-empty**
- [ ] **Each `accepts` item has required fields:** `scheme`, `network`, `amount`, `asset`, `payTo`, `maxTimeoutSeconds`
- [ ] **Scheme is `"exact"`**
- [ ] **Network is supported** — `base` (`eip155:8453`), `base-sepolia` (`eip155:84532`)
- [ ] **Asset is USDC** — correct contract address per network:
  - Base Mainnet: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
  - Base Sepolia: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- [ ] **$0.001 USDC minimum** — `amount` must be >= 1000 (atomic units, 6 decimals)
- [ ] **`payTo` is a valid address**
- [ ] **`resource` object present** with `url` field
- [ ] **Bazaar extension present** — `extensions.bazaar` exists at top level
- [ ] **Discovery metadata** — `extensions.bazaar.info.output` exists
- [ ] **Valid JSON Schema** — `extensions.bazaar.schema` is valid if present
- [ ] Whatever additional checks are in the teammate's validation code

### 1.4 Wire Next.js to Go backend

- [ ] Add `POST /api/validate` in Next.js that proxies to Go server
- [ ] Environment variable: `GO_VALIDATOR_URL` (e.g. `http://localhost:8080`)
- [ ] On the frontend, replace the current two-step flow (check → probe) with a single validate call when Go backend is available
- [ ] Fallback: if Go server is down, fall back to current Node.js probe with a banner: "Running approximate checks — Go validation backend is unavailable"

### 1.5 Discovery lookup (can stay in Node.js or move to Go)

- [ ] The "are you indexed?" check can stay in Node.js (it's just a Discovery API HTTP call)
- [ ] Or move it to Go if the teammate's code includes SDK-based discovery lookup
- [ ] Use the `query` param for faster lookup instead of paginating all 13k+ items
- [ ] Filter for v2 only (`x402Version: 2`)

---

## Phase 2: Improve What We Have Now (while waiting on Go backend)

These are things we can ship immediately to make the current Node.js-only tool more useful as an interim solution.

### 2.1 Add the checks we can do from Node.js

- [ ] $0.001 USDC minimum (check `amount` >= 1000 in `accepts` items)
- [ ] HTTPS requirement on resource URL
- [ ] USDC asset address validation per network
- [ ] `scheme` must be `"exact"`
- [ ] All required `accepts` fields present
- [ ] v2 structure: `x402Version: 2`, top-level `accepts` array, top-level `extensions`

### 2.2 Better v1-vs-v2 detection

- [ ] If response has `x402Version: 1` or uses `maxAmountRequired` instead of `amount`, show specific "You're running v1 — this tool is for v2 endpoints" guidance
- [ ] If response has `paymentRequirements` instead of `accepts`, flag as v1

### 2.3 Common pitfall detection

- [ ] Auth middleware returning 401/403 before x402 can return 402
- [ ] Endpoint returning 200 (not gated at all)
- [ ] Facilitator URL pointing to x402.org instead of CDP production
- [ ] HTML paywall response instead of JSON (check Content-Type header)
- [ ] Localhost/127.0.0.1 URL → show ngrok suggestion

### 2.4 Use Discovery API query param

- [ ] Use `?query=<url>` for semantic search instead of paginating through all items
- [ ] Much faster lookup, especially as the index grows past 13k items

---

## Phase 3: Code Templates

Fix the wizard's generated code to match the actual bazaar extension setup from `bazaar.md`.

### 3.1 Node.js (Express)

- [ ] Install: `npm install x402-express @x402/extensions`
- [ ] Show `x402-express` `paymentMiddleware` for the route gating
- [ ] Show `declareDiscoveryExtension` from `@x402/extensions/bazaar` with correct args:
  ```ts
  declareDiscoveryExtension({
    output: { example: {...}, schema: {...} },
    // POST endpoints: bodyType: "json", input: {...}, inputSchema: {...}
  })
  ```
- [ ] Show `bazaarResourceServerExtension` registration
- [ ] Route config `extensions` spreads `declareDiscoveryExtension()` result

### 3.2 Go (Gin)

- [ ] Install: `go get github.com/coinbase/x402/go/extensions/bazaar`
- [ ] Show `x402gin.PaymentMiddleware()` for the per-route gating
- [ ] Show `bazaar.DeclareDiscoveryExtension()` with positional args per bazaar.md:
  ```go
  bazaar.DeclareDiscoveryExtension(types.MethodGET, nil, nil, "", &types.OutputConfig{...})
  ```

### 3.3 Python (FastAPI)

- [ ] Install: `pip install "x402[fastapi]"`
- [ ] Show `require_payment()` from `x402.fastapi.middleware`
- [ ] Bazaar extension via `extensions` dict:
  ```python
  extensions={"bazaar": {"info": {"output": {"type": "json", "example": {...}}}}}
  ```

### 3.4 Test payment / first transaction code

- [ ] Verify against actual buyer quickstart from bazaar.md per stack
- [ ] If SDK client APIs are unstable, just link to the docs instead of generating potentially wrong code

---

## Phase 4: UI/UX Polish

### 4.1 Validation confidence indicator

- [ ] Show "Validated with Go SDK" (green, high confidence) vs "Approximate check" (yellow, Node.js only)
- [ ] When Node.js fallback: "For full validation accuracy, the Go validation backend needs to be running"

### 4.2 Re-validate flow

- [ ] After wizard: prominent "Re-validate" button with the same URL pre-filled
- [ ] Flow: diagnose → fix with wizard → deploy → re-validate

### 4.3 Expected vs actual values

- [ ] For each failed check, show what was expected and what was found
- [ ] e.g. "Expected `amount` (v2), found `maxAmountRequired` (v1)"
- [ ] e.g. "Expected USDC asset `0x833...`, found `0xabc...`"

### 4.4 Localhost handling

- [ ] Detect localhost/127.0.0.1 URLs before making the request
- [ ] Show: "We can't reach localhost. Expose your endpoint with `ngrok http <port>`"

### 4.5 Quality signals (if indexed)

- [ ] If endpoint IS found on Bazaar, show quality ranking info from the discovery response
- [ ] Help operators understand metadata richness, payer count, domain reputation

### 4.6 Merchant lookup

- [ ] Support optional payTo address lookup via `/discovery/merchant?payTo=<address>` endpoint
- [ ] If the user's endpoint is found, show: "We also found N other endpoints registered to this wallet"
- [ ] Useful for operators managing multiple endpoints — lets them see their full Bazaar footprint

---

## Phase 5: Deployment

### 5.1 Go server

- [ ] Dockerfile for the Go validation server
- [ ] Health check endpoint
- [ ] Deploy on same host or internal network as Next.js app

### 5.2 Configuration

- [ ] `GO_VALIDATOR_URL` — Go backend URL
- [ ] Rate limiting on the probe/validate endpoints (basic, prevent abuse)

---

## Future: CDP Validation Endpoint (the "perfect solution")

Per teammate: "The perfect solution would require us creating some CDP validation endpoint, and have the webapp request the CDP Facilitator validate it directly. That would be the only way to give a full guarantee."

- [ ] Work with the team to create an authenticated (or unauthenticated) CDP endpoint that validates an x402 endpoint for Bazaar eligibility
- [ ] Replace the Go backend proxy with a direct call to this CDP endpoint
- [ ] This gives the strongest guarantee: "the Bazaar itself says your endpoint is valid"

This is the highest lift but eliminates all ambiguity about whether our validation matches theirs.
