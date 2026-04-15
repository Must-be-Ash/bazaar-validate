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

- [x] Create `go-validator/` directory with a Go HTTP server (e.g. net/http or Gin)
- [x] `POST /validate` endpoint — accepts `{ url: string, method: string }`
- [x] `GET /health` endpoint — for Next.js to check availability
- [ ] Import the x402 Go SDK: `github.com/coinbase/x402/go/...`

### 1.2 Implement validation using the Go SDK

- [ ] **Get the actual bazaar validation code from teammate** — BLOCKED: waiting on teammate to share validation logic
- [x] Fetch the target URL, parse the 402 response using SDK types
- [ ] Run the same validation checks the Bazaar indexer runs (blocked on above)
- [x] Return structured results back to Next.js:
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

- [x] **HTTPS required** — resource URL must be HTTPS
- [x] **x402Version must be 2**
- [x] **`accepts` array present and non-empty**
- [x] **Each `accepts` item has required fields:** `scheme`, `network`, `amount`, `asset`, `payTo`, `maxTimeoutSeconds`
- [x] **Scheme is `"exact"` or `"upto"`**
- [x] **Network is supported** — `base` (`eip155:8453`), `base-sepolia` (`eip155:84532`)
- [x] **Asset is USDC** — correct contract address per network:
  - Base Mainnet: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
  - Base Sepolia: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- [x] **$0.001 USDC minimum** — `amount` must be >= 1000 (atomic units, 6 decimals)
- [x] **`payTo` is a valid address**
- [x] **`resource` object present** with `url` field
- [x] **Bazaar extension present** — `extensions.bazaar` exists at top level
- [x] **Discovery metadata** — `extensions.bazaar.info.output` exists
- [x] **Valid JSON Schema** — `extensions.bazaar.schema` is valid if present
- [ ] Whatever additional checks are in the teammate's validation code

### 1.4 Wire Next.js to Go backend

- [x] Add `POST /api/validate` in Next.js that proxies to Go server
- [x] Environment variable: `GO_VALIDATOR_URL` (e.g. `http://localhost:8080`)
- [x] On the frontend, replace the current two-step flow (check → probe) with a single validate call when Go backend is available
- [x] Fallback: if Go server is down, fall back to current Node.js probe with a banner: "Running approximate checks — Go validation backend is unavailable"

### 1.5 Discovery lookup (can stay in Node.js or move to Go)

- [x] The "are you indexed?" check stays in Node.js (Discovery API HTTP call)
- [ ] Move to Go if the teammate's code includes SDK-based discovery lookup
- [x] ~~Use `query` param~~ — tested, API filters don't work. Using parallel requests with `limit=1000` instead (14 concurrent requests covers full index in ~5s)
- [x] Filter for v2 only (`x402Version: 2`)

---

## Phase 2: Improve What We Have Now (while waiting on Go backend)

These are things we can ship immediately to make the current Node.js-only tool more useful as an interim solution.

### 2.1 Add the checks we can do from Node.js

- [x] $0.001 USDC minimum (check `amount` >= 1000 in `accepts` items)
- [x] HTTPS requirement on resource URL
- [x] USDC asset address validation per network
- [x] `scheme` must be `"exact"` or `"upto"`
- [x] All required `accepts` fields present
- [x] v2 structure: `x402Version: 2`, top-level `accepts` array, top-level `extensions`

### 2.2 Better v1-vs-v2 detection

- [x] If response has `x402Version: 1` or uses `maxAmountRequired` instead of `amount`, show specific "You're running v1 — this tool is for v2 endpoints" guidance
- [x] If response has `paymentRequirements` instead of `accepts`, flag as v1

### 2.3 Common pitfall detection

- [x] Auth middleware returning 401/403 before x402 can return 402
- [x] Endpoint returning 200 (not gated at all)
- [ ] Facilitator URL pointing to x402.org instead of CDP production (not detectable from 402 response — better handled by Go backend)
- [x] HTML paywall response instead of JSON (check Content-Type header)
- [x] Localhost/127.0.0.1 URL → show ngrok suggestion

### 2.4 Use Discovery API query param

- [x] ~~Use `?query=<url>` for semantic search~~ — tested, API query/filter params don't actually filter. Using parallel `limit=1000` requests instead (done in Phase 1.5)

---

## Phase 3: Code Templates

Fix the wizard's generated code to match the actual bazaar extension setup from `bazaar.md`.

### 3.1 Node.js (Express)

- [x] Install: `npm install @x402/express @x402/core @x402/evm @x402/extensions`
- [x] Show `@x402/express` `paymentMiddleware` with `x402ResourceServer` setup
- [x] Show `declareDiscoveryExtension` from `@x402/extensions/bazaar` with correct args:
  ```ts
  declareDiscoveryExtension({
    output: { example: {...}, schema: {...} },
    // POST endpoints: bodyType: "json", input: {...}, inputSchema: {...}
  })
  ```
- [x] Show `bazaarResourceServerExtension` registration
- [x] Route config `extensions` spreads `declareDiscoveryExtension()` result

### 3.2 Go (Gin)

- [x] Install: `go get github.com/coinbase/x402/go/...`
- [x] Show `ginmw.X402Payment(ginmw.Config{...})` middleware with routes config
- [x] Show `bazaar.DeclareDiscoveryExtension()` with positional args per bazaar.md:
  ```go
  bazaar.DeclareDiscoveryExtension(types.MethodGET, nil, nil, "", &types.OutputConfig{...})
  ```

### 3.3 Python (FastAPI)

- [x] Install: `pip install "x402[fastapi]"`
- [x] Show `PaymentMiddlewareASGI` from `x402.http.middleware.fastapi` with `x402ResourceServer` setup
- [x] Bazaar extension via `extensions` dict:
  ```python
  extensions={"bazaar": {"info": {"output": {"type": "json", "example": {...}}}}}
  ```

### 3.4 Test payment / first transaction code

- [x] Verify against actual buyer quickstart from bazaar.md per stack
- [x] Link to docs + show code patterns from bazaar.md examples

---

## Phase 4: UI/UX Polish

### 4.1 Validation confidence indicator

- [x] Show "Validated with Go SDK" (green, high confidence) vs "Approximate check" (yellow, Node.js only)
- [x] When Node.js fallback: "Approximate check (Go validation backend unavailable)"

### 4.2 Re-validate flow

- [x] After wizard: prominent "Re-validate Endpoint" button on step 5 (deploy)
- [x] Flow: diagnose → fix with wizard → deploy → re-validate (closes wizard, re-runs validation)

### 4.3 Expected vs actual values

- [x] Go backend returns `expected` and `actual` fields for each check
- [x] Node.js probe includes specific messages like "Found maxAmountRequired (v1) — v2 uses amount"
- [x] Asset mismatch shows expected vs actual USDC address

### 4.4 Localhost handling

- [x] Detect localhost/127.0.0.1/::1 URLs before making the request
- [x] Returns error: "Cannot reach localhost from our server. Expose your endpoint with: ngrok http <port>"

### 4.5 Quality signals (if indexed)

- [x] Display all available fields from discovery response (accepts, lastUpdated, type, x402Version)
- [ ] Quality signals (payer count, metadata richness) are not exposed in the public discovery API — would need CDP internal endpoint

### 4.6 Merchant lookup

- [x] Support optional payTo address lookup via `/discovery/merchant?payTo=<address>` endpoint
- [x] If the user's endpoint is found, show: "N total endpoints registered to this wallet" with full list
- [x] Useful for operators managing multiple endpoints — lets them see their full Bazaar footprint

---

## Phase 5: Deployment

### 5.1 Go server

- [x] Dockerfile for the Go validation server
- [x] Health check endpoint (`GET /health`)
- [x] Deployed to Fly.io: `https://bazaar-go-validator.fly.dev`

### 5.2 Configuration

- [x] `GO_VALIDATOR_URL` — Go backend URL (defaults to `http://localhost:8080`)
- [x] Rate limiting on the validate endpoint (20 req/min per IP, in-memory)

---

## Future: CDP Validation Endpoint (the "perfect solution")

Per teammate: "The perfect solution would require us creating some CDP validation endpoint, and have the webapp request the CDP Facilitator validate it directly. That would be the only way to give a full guarantee."

- [ ] Work with the team to create an authenticated (or unauthenticated) CDP endpoint that validates an x402 endpoint for Bazaar eligibility
- [ ] Replace the Go backend proxy with a direct call to this CDP endpoint
- [ ] This gives the strongest guarantee: "the Bazaar itself says your endpoint is valid"

This is the highest lift but eliminates all ambiguity about whether our validation matches theirs.
