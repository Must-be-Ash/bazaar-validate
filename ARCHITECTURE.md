# Bazaar Validator — Architecture

## Objective

Help x402 v2 endpoint operators verify whether their endpoint is indexed in the CDP Bazaar, and if not, diagnose exactly what's wrong and guide them through fixing their implementation.

The tool has two core flows:
1. **Validate** — User pastes their endpoint URL. We check the CDP Bazaar discovery API. If indexed, show their listing. If not, probe their endpoint to run diagnostic checks and pinpoint the issue.
2. **Fix / Get Indexed** — An interactive wizard that walks them through adding Bazaar support for their stack (Node.js, Go, or Python), with tailored code snippets pre-filled with their endpoint details.

---

## Deployments

| Service | Platform | URL |
|---------|----------|-----|
| Next.js app | Vercel | `https://bazaar-validate.vercel.app` |
| Go validation server | Fly.io | `https://bazaar-go-validator.fly.dev` |

**Environment variable:** `GO_VALIDATOR_URL` is set on Vercel to point to the Fly.io Go server.

---

## Architecture

```
                         ┌─────────────────────────┐
                         │      User's Browser      │
                         └────────────┬────────────┘
                                      │
                         ┌────────────▼────────────┐
                         │   Next.js Frontend      │
                         │   app/page.tsx          │
                         │   (single page, client) │
                         └──┬──────────┬───────────┘
                            │          │
               ┌────────────▼──┐  ┌────▼──────────────┐
               │ POST /api/check│  │ POST /api/validate │
               │ (discovery     │  │ (endpoint          │
               │  lookup)       │  │  diagnostics)      │
               └──────┬────────┘  └──┬────────────┬───┘
                      │              │             │
         ┌────────────▼──┐   ┌──────▼─────┐  ┌───▼──────────┐
         │ CDP Discovery  │   │ Go Server   │  │ Node.js      │
         │ API (external) │   │ Fly.io      │  │ /api/probe   │
         │                │   │ /validate   │  │ (fallback)   │
         └────────────────┘   └──────┬─────┘  └──────┬───────┘
                                     │               │
                              ┌──────▼───────────────▼──┐
                              │   User's x402 Endpoint   │
                              └──────────────────────────┘
```

**Validation flow:**
1. `/api/check` queries the CDP Discovery API to see if the endpoint is already indexed
2. If not found, `/api/validate` checks if the Go server is healthy
3. If Go is available → proxies to the Go server for SDK-level validation (green "Validated with Go SDK" badge)
4. If Go is unavailable → falls back to `/api/probe` for Node.js-based checks (yellow "Approximate check" badge)

---

## File Structure

```
bazaar-validate/
├── app/
│   ├── layout.tsx                    # Root layout, fonts, metadata, OG tags
│   ├── page.tsx                      # Main page — orchestrates the full validation flow
│   ├── globals.css                   # Theme (dark, monospace), CSS variables
│   └── api/
│       ├── check/route.ts            # Discovery API lookup (is it indexed?)
│       ├── validate/route.ts         # Proxy to Go backend with Node.js fallback
│       └── probe/route.ts            # Node.js fallback endpoint diagnostics
│
├── components/
│   ├── url-input.tsx                 # URL + HTTP method input form
│   ├── results-found.tsx             # "Found on Bazaar" display with merchant data
│   ├── results-not-found.tsx         # "Not Found" display with diagnostics + wizard CTA
│   ├── diagnostic-checklist.tsx      # Pass/fail check items with wizard links
│   ├── raw-response-viewer.tsx       # Collapsible raw HTTP response panel
│   ├── faq.tsx                       # FAQ accordion
│   ├── ui/
│   │   ├── glow-button.tsx           # Primary CTA button (variants: default/success/muted)
│   │   ├── shimmer-button.tsx        # Secondary button with hover shimmer
│   │   ├── pixel-trail.tsx           # Mouse-following animated background
│   │   └── gooey-filter.tsx          # SVG blur filter for pixel trail
│   └── wizard/
│       ├── wizard-container.tsx      # 5-step wizard with navigation + state
│       ├── step-stack.tsx            # Step 1: Pick Node.js / Go / Python
│       ├── step-endpoint.tsx         # Step 2: Method, path, price, network, payTo
│       ├── step-metadata.tsx         # Step 3: Output/input examples → auto-gen schema
│       ├── step-code.tsx             # Step 4: Generated code for selected stack
│       ├── step-deploy.tsx           # Step 5: Deploy checklist + re-validate button
│       └── copy-button.tsx           # Reusable clipboard copy with feedback
│
├── lib/
│   ├── diagnostics.ts               # Types: ProbeResult, CheckResult, DiagnosticCheck, labels
│   ├── code-templates.ts             # Code generation for Node.js / Go / Python
│   ├── schemas.ts                    # JSON Schema inference from example JSON
│   ├── rate-limit.ts                 # In-memory rate limiter (20 req/min per IP)
│   └── utils.ts                      # cn() — clsx + tailwind-merge
│
├── hooks/
│   ├── use-screen-size.ts            # Responsive breakpoint detection
│   └── use-debounced-dimensions.ts   # Element dimension tracking with debounce
│
└── go-validator/
    ├── main.go                       # Go HTTP server with /health and /validate
    ├── go.mod                        # Go module definition
    ├── Dockerfile                    # Multi-stage build for Fly.io
    └── fly.toml                      # Fly.io deployment config
```

---

## API Routes

### `POST /api/check` — Bazaar Discovery Lookup

Checks if a URL is indexed in the CDP Bazaar.

**Input:** `{ url: string }`

**How it works:**
1. Fetches the first page from the CDP Discovery API to get total count
2. Fires all remaining pages in parallel (`limit=1000`, ~14 concurrent requests for 13k+ items)
3. Matches by exact URL or domain + path prefix
4. Filters for `x402Version: 2` only
5. If found, also calls the merchant endpoint (`/discovery/merchant?payTo=<address>`) to show all endpoints registered to the same wallet

**Output:** `{ found, resource, totalIndexed, merchantResources }`

### `POST /api/validate` — Endpoint Validation (proxy)

Validates an x402 endpoint. Routes to Go backend or Node.js fallback.

**Input:** `{ url: string, method: string }`

**How it works:**
1. Checks Go server health (`GET /health`, 2s timeout)
2. If healthy → proxies request to Go server's `POST /validate`
3. If unhealthy → internally calls `/api/probe` for Node.js-based diagnostics
4. Appends `source: "go" | "node"` to the response

**Output:** Go format `{ valid, checks[], raw, source }` or Node.js format `{ reachable, statusCode, diagnostics[], ..., source }`

### `POST /api/probe` — Node.js Fallback Diagnostics

Direct endpoint probe with diagnostic checks. Used when Go backend is unavailable.

**Input:** `{ url: string, method: string }`

**Checks performed:**
- Localhost detection (returns error with ngrok suggestion)
- HTTPS required
- Endpoint reachable (10s timeout)
- Returns HTTP 402 (with auth-gating detection for 200/401/403)
- HTML paywall detection (Content-Type check)
- x402Version is 2 (with v1 detection: `paymentRequirements`, `maxAmountRequired`)
- Valid `accepts` array with required fields
- Scheme is `"exact"` or `"upto"`
- USDC minimum ($0.001 / 1000 atomic units)
- USDC asset address matches network
- Network is supported (Base Mainnet / Base Sepolia)
- PayTo address present
- Resource URL in response body
- Bazaar extension (`extensions.bazaar`) present
- Discovery metadata (`info.output`) present
- Bazaar schema present

**Output:** `{ reachable, statusCode, returns402, x402Version, diagnostics[], rawHeaders, rawBody, ... }`

---

## Go Validation Server

Standalone HTTP server deployed on Fly.io. Runs the same checks as the Node.js probe but from Go, positioned to integrate the actual x402 Go SDK and teammate's Bazaar validation logic when available.

**Endpoints:**
- `GET /health` → `{ status: "ok" }`
- `POST /validate` → Full validation with 17 checks

**Validation checks (in order):**
1. `url_https` — URL uses HTTPS
2. `endpoint_reachable` — Responds within 10s
3. `returns_402` — HTTP 402 status (with 200/401/403 detection)
4. `valid_json` — Response body is valid JSON
5. `x402_version` — x402Version is 2
6. `has_accepts` — Non-empty accepts array
7. `accepts[0].scheme` — "exact" or "upto"
8. `accepts[0].network` — Supported network
9. `accepts[0].asset` — USDC contract address matches network
10. `accepts[0].amount` — Meets $0.001 minimum (≥1000 atomic units)
11. `accepts[0].payTo` — Valid wallet address
12. `accepts[0].maxTimeoutSeconds` — Present and positive
13. `has_resource` — Resource object with URL
14. `has_bazaar_extension` — `extensions.bazaar` exists
15. `bazaar.info` — Info block present
16. `bazaar.info.output` — Output metadata with example
17. `bazaar.schema` — JSON Schema present

**Response format:**
```json
{
  "valid": true,
  "checks": [
    { "check": "url_https", "passed": true, "detail": "Resource URL uses HTTPS", "expected": "https", "actual": "https" }
  ],
  "raw": { "statusCode": 402, "headers": {}, "body": "..." }
}
```

---

## Frontend Flow

```
page.tsx manages these states:
  phase: "idle" | "checking" | "probing" | "done"
  resultType: "found" | "not-found" | "error" | null
  validationSource: "go" | "node" | null

User enters URL + method → clicks Validate
  │
  ├─ phase="checking" → "Checking Bazaar..." spinner
  │  └─ /api/check returns
  │     ├─ found=true → ResultsFound (green, shows listing + merchant data)
  │     └─ found=false → phase="probing"
  │
  ├─ phase="probing" → "Probing endpoint..." spinner
  │  └─ /api/validate returns
  │     └─ ResultsNotFound shows:
  │        ├─ Validation source badge (green "Go SDK" or yellow "Approximate")
  │        ├─ Auth-gating warning (if 200/401/403)
  │        ├─ DiagnosticChecklist (animated pass/fail items)
  │        ├─ RawResponseViewer (collapsible)
  │        └─ "Fix with Setup Wizard" button
  │
  └─ WizardContainer (if opened)
     ├─ Step 1: StepStack → pick Node.js / Go / Python
     ├─ Step 2: StepEndpoint → configure method, path, price, network, payTo
     ├─ Step 3: StepMetadata → define output/input examples (auto-generates JSON Schema)
     ├─ Step 4: StepCode → copy generated code matching bazaar.md docs
     └─ Step 5: StepDeploy → deploy checklist + "Re-validate" button
```

---

## Code Generation

The wizard generates stack-specific code matching the official bazaar.md documentation:

**Node.js (Express):**
- `@x402/express` for payment middleware
- `@x402/extensions/bazaar` for `declareDiscoveryExtension()` and `bazaarResourceServerExtension`
- `@x402/core/server` for `x402ResourceServer` and `HTTPFacilitatorClient`
- Route config uses `accepts: { scheme, price, network, payTo }` + `extensions: { ...declareDiscoveryExtension({ output: { example, schema } }) }`

**Go (Gin):**
- `ginmw.X402Payment(ginmw.Config{...})` middleware
- `bazaar.DeclareDiscoveryExtension(method, queryParams, inputSchema, bodyType, outputConfig)` with positional args
- Routes config: `x402http.RoutesConfig{ "METHOD /path": { ... } }`

**Python (FastAPI):**
- `PaymentMiddlewareASGI` from `x402.http.middleware.fastapi`
- `x402ResourceServer` with `ExactEvmServerScheme`
- Bazaar extension via `extensions={"bazaar": {"info": {"output": {"type": "json", "example": {...}}}}}`

All templates use the CDP production facilitator: `https://api.cdp.coinbase.com/platform/v2/x402/facilitator`

---

## External APIs

| API | Purpose | Auth |
|-----|---------|------|
| `GET https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources` | Check if endpoint is indexed | None (public) |
| `GET https://api.cdp.coinbase.com/platform/v2/x402/discovery/merchant?payTo=<addr>` | List all endpoints for a wallet | None (public) |
| `GET/POST <user's endpoint>` | Probe to check 402 response | None |

---

## Known Limitations

- **Discovery API filters don't work** — The `query`, `network`, `scheme`, `extensions` params on the discovery endpoint don't actually filter results. We compensate with parallel fetching (14 concurrent requests with `limit=1000`).
- **Quality signals not exposed** — The discovery API doesn't return payer count, metadata richness, or domain reputation scores.
- **Facilitator URL not detectable** — Can't tell from the 402 response if the endpoint is using the CDP facilitator vs x402.org. This would need the Go SDK integration.
- **Go SDK not yet integrated** — The Go server runs its own validation logic, not the actual Bazaar indexer's code. When the teammate shares the validation logic, it replaces the `validate()` function in `go-validator/main.go`.
