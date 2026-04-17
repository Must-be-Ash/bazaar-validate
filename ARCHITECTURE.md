# Bazaar Validator — Architecture

Technical reference for `bazaar-validate`.

---

## Objective

Help x402 endpoint operators figure out **whether their endpoint is indexed in the CDP Bazaar — and if not, exactly why and how to fix it.** The defining design decision: split the failure modes into four explicit states (`indexed`, `awaiting_first_payment`, `implementation_invalid`, `never_tried`) instead of a binary found/not-found, so users get accurate guidance instead of a generic "not indexed" message.

---

## Deployments

| Service | Platform | URL |
|---------|----------|-----|
| Next.js app | Vercel (auto-deploy on push to `main`) | `https://bazaar-validate.vercel.app` |
| Go validation server | Fly.io (`cd go-validator && flyctl deploy`) | `https://bazaar-go-validator.fly.dev` |

**Environment variable:** `GO_VALIDATOR_URL` is set on Vercel to the Fly.io URL; locally defaults to `http://localhost:8080` (or set explicitly in `.env.local`).

---

## High-level diagram

```
                       ┌─────────────────────────┐
                       │      User's browser      │
                       │  (Next.js single page)   │
                       └────────────┬────────────┘
                                    │
            ┌───────────────────────┼─────────────────────────┐
            │                       │                         │
            ▼                       ▼                         ▼
     POST /api/check        POST /api/validate         GET /api/search
            │                       │                         │
            │             ┌─────────┴────────┐                │
            │             │ health cached    │                │
            │             │ (30s, stale-on-  │                │
            │             │  error)          │                │
            │             └────┬────────────┬┘                │
            ▼                  ▼            ▼                 ▼
     ┌─────────────┐   ┌──────────────┐ ┌──────────────┐  ┌─────────────┐
     │ CDP         │   │ Go validator │ │ /api/probe    │  │ CDP         │
     │ discovery   │   │ (Fly.io)      │ │ (Node TS port│  │ discovery   │
     │ /resources  │   │ /validate     │ │  fallback)   │  │ /resources  │
     │ + /merchant │   └──────┬───────┘ └──────┬───────┘  │ ?query=...  │
     └─────────────┘          │                │          └─────────────┘
                              ▼                ▼
                       ┌──────────────────────────┐
                       │  user's x402 endpoint    │
                       │  (HTTP 402 + JSON body)  │
                       └──────────────────────────┘
```

The Go server is the canonical validator (uses the real `github.com/coinbase/x402/go` SDK). The Node probe is a literal TS port that runs only when the Go server is unreachable — same pipeline structure, same check IDs, same `ValidationResult` shape, so the frontend never branches on `source`.

---

## The 3-stage validation pipeline

Both validators run the same 3 stages in order. If a stage's prerequisite fails, downstream checks are recorded as `Skipped: <reason>` so the diagnostic checklist always shows the full set.

### Stage 1: Preflight

Surface checks the SDK doesn't run — these catch issues the facilitator never sees because it never receives a payment in the first place.

| Check ID | What it verifies |
|---|---|
| `url_valid` | URL parses |
| `url_https` | scheme is `https` |
| `endpoint_reachable` | responds within 10s |
| `returns_402` | HTTP status is 402 |
| `valid_json` | response body is JSON, not HTML |
| `x402_version` | `x402Version === 2` (also detects v1 `paymentRequirements`) |
| `has_accepts` | non-empty `accepts` array |
| `accepts[0].scheme` | `"exact"` or `"upto"` |
| `accepts[0].network` | `eip155:8453` (Base mainnet) or `eip155:84532` (Base Sepolia) |
| `accepts[0].asset` | matches the USDC contract for the declared network |
| `accepts[0].amount` | atomic units ≥ 1000 (= $0.001 USDC); detects v1 `maxAmountRequired` |
| `accepts[0].payTo` | address present and well-formed |
| `accepts[0].maxTimeoutSeconds` | positive integer (warning, not blocking) |
| `has_resource` | top-level `resource.url` present |
| `has_bazaar_extension` | `extensions.bazaar` exists |
| `bazaar.info` | bazaar info block exists |
| `bazaar.info.output` | output metadata exists |
| `bazaar.info.output.example` | example provided (warning) |
| `bazaar.schema` | JSON Schema present (warning) |

### Stage 2: Parse

Run the actual SDK extractor — the same code the facilitator uses on settle.

- Go: `bazaar.ExtractDiscoveredResourceFromPaymentRequired(body, validate=true)` from `github.com/coinbase/x402/go/extensions/bazaar`. Includes JSON-Schema validation of the bazaar extension's info against its schema.
- Node fallback: literal port in `lib/discovery-validate.ts` (no real SDK in TS). Same return semantics: `(nil, nil)` for no-bazaar, populated info on success, error on malformed.

### Stage 3: Simulate

Mirror the facilitator's `submitDiscoveryJobIfNeeded` decision tree without touching Temporal. Returns one of:

| Outcome | When |
|---|---|
| `processing` | Would be indexed on settle. |
| `rejected` + `rejectedReason` | One of: `invalid discovery configuration`, `unsupported transport type: <type>`, `discovery request validation failed` (legacy URL/HTTPS gate), or dynamic-route-without-concrete-URL. |
| `noop` | No bazaar extension present. |

The reference for both stages 2 and 3 lives in `validate/{parseDiscoveryInfo,helpers,submitDiscoveryJobIfNeeded,legacy}.md` — the markdown extracts of the actual facilitator code shared by the Bazaar team.

---

## Result-state model

`lib/diagnostics.ts` derives one of five states from the `/api/check` + `/api/validate` results:

```
                           ┌─────────────────┐
                           │  /api/check     │
                           │  found?         │
                           └────────┬────────┘
                                    │
                           yes      │      no
                                    │
                                    ▼
                              INDEXED       ┌─────────────────┐
                                            │ /api/validate    │
                                            │ (3-stage)        │
                                            └────────┬────────┘
                                                     │
                  ┌──────────────────────────────────┼──────────────────────────────────┐
                  │                                  │                                  │
        reachable, no x402 markers       all preflight pass +              any blocking check failed
        (200 OK with no x402Version,     parse OK +
         no accepts)                     simulate=processing
                  │                                  │                                  │
                  ▼                                  ▼                                  ▼
            NEVER_TRIED              AWAITING_FIRST_PAYMENT              IMPLEMENTATION_INVALID

                                                                ERROR (anything threw)
```

Helpers:
- `deriveResultState(checkResult, probeResult, hasError)` → returns the state.
- `isAwaitingFirstPayment(checkResult, validation)` → standalone predicate.
- `isNeverTried(probeResult)` → standalone predicate.

Each state renders a dedicated component (see "Components" below).

---

## API routes

### `POST /api/check`

Looks up the URL in the CDP discovery API.

**Request:** `{ url: string }`

**Behavior:**
1. Fetch first page of `/discovery/resources?limit=1000`. If matched, return.
2. Fire all remaining pages in parallel (~14 concurrent for the current ~14k entries).
3. If found anywhere → return the resource + merchant lookup + computed `qualitySignals`.
4. If not found → also scan the collected items for `domainSiblings` (other indexed endpoints on the same hostname) and return.

**Response:** `CheckResult` from `lib/diagnostics.ts`:
```ts
{
  found: boolean;
  resource: Record<string, unknown> | null;
  totalIndexed: number;
  merchantResources?: { payTo, count, resources: { resource, lastUpdated? }[] } | null;
  qualitySignals?: { descriptionPresent, inputSchemaPresent, outputSchemaPresent, dedicatedDomain | null, payerCount30d | null } | null;
  domainSiblings?: { hostname, count, resources: [...] } | null;
}
```

Rate limited: 20 req/min/IP.

### `POST /api/validate`

Validates an x402 endpoint. Proxies to the Go server with Node fallback.

**Request:** `{ url: string, method?: string }`

**Behavior:**
1. Check Go server health. Result cached in module scope for 30s (stale-on-error) so we don't pay 2s per call when Go is up.
2. If healthy → forward to Go's `/validate`, adapt the response to `ValidationResult`.
3. If unhealthy → call `/api/probe` internally and tag the response with `source: "node"` and `fallbackReason` (`go_unreachable` / `go_timeout` / `go_error`).

**Response:** `ValidationResult` (extends `ProbeResult`):
```ts
{
  source: "go" | "node";
  fallbackReason?: "go_unreachable" | "go_timeout" | "go_error" | null;
  reachable: boolean;
  statusCode: number;
  returns402: boolean;
  paymentRequirements: object | null;
  hasBazaarExtension: boolean;
  bazaarExtensionData: object | null;
  x402Version: number | null;
  rawHeaders: Record<string, string>;
  rawBody: string;
  diagnostics: DiagnosticCheck[];   // alias for preflight; the UI renders this
  preflight: DiagnosticCheck[];
  parse: { ok: boolean; error?: string };
  simulate: { outcome: "processing" | "rejected" | "noop"; rejectedReason?: string; workflowIdHint?: string };
  meta: { sdkVersion?: string; validatorVersion?: string };
}
```

Rate limited: 20 req/min/IP.

### `POST /api/probe`

Internal endpoint. Same 3-stage pipeline as the Go server but in TS, using `lib/discovery-validate.ts` for parse + simulate. Called only by `/api/validate` when Go is down. Emits the same shape as `ValidationResult` minus `source` / `fallbackReason` / `meta.sdkVersion` (the proxy adds those).

### `GET /api/search`

Proxies the CDP discovery semantic-search endpoint.

**Request:** query params `query` (required), `limit` (default 10, max 50), `offset` (default 0).

**Response:** `SearchResponse`:
```ts
{
  items: { resource, type?, x402Version?, accepts?, lastUpdated?, metadata? }[];
  total: number;
  limit: number;
  offset: number;
}
```

Used by the `<SimilarEndpoints>` panel. Rate limited: 20 req/min/IP.

---

## Frontend orchestration

`app/page.tsx` is the only client component with state. Flow:

```
phase: "idle" | "checking" | "probing" | "done"
resultState: ResultState | null

User enters URL + method → handleValidate()
  │
  ├─ phase = "checking" → "Checking Bazaar..." spinner
  │  └─ POST /api/check
  │     ├─ found=true → resultState = "indexed"
  │     └─ found=false → continue
  │
  ├─ phase = "probing" → "Validating with x402 SDK..." spinner
  │  └─ POST /api/validate
  │     └─ resultState = deriveResultState(checkData, validateData, false)
  │        → indexed | awaiting_first_payment | implementation_invalid | never_tried
  │
  └─ phase = "done" → render the right component for resultState
```

Additional behaviors:
- **Shareable URLs:** on mount, reads `?url=...&method=...` and auto-runs `handleValidate`. Used by every internal "validate this one" link in the app.
- **Wizard re-validate:** `WizardContainer.onRevalidate` re-runs `handleValidate` with `{ fromWizard: true }`, which causes the awaiting-payment view to auto-start polling.
- **Error boundaries:** every result section + the wizard is wrapped in `<ErrorBoundary>` so a render bug in one section doesn't blank the page.

---

## Components

| Component | When rendered | Purpose |
|---|---|---|
| `ResultsFound` | `resultState === "indexed"` | Resource details, `lastUpdated`, quality signals, merchant panel |
| `ResultsAwaitingPayment` | `resultState === "awaiting_first_payment"` | Green "implementation looks correct" card + `<FirstPaymentHelper>` + auto-poll |
| `ResultsImplementationInvalid` | `resultState === "implementation_invalid"` | Failure-summary line + `<DiagnosticChecklist>` (with inline `<FixCard>`s) + `<SimilarEndpoints>` + domain siblings + tailored CTA |
| `ResultsNeverTried` | `resultState === "never_tried"` | Empty-state copy that auto-opens the wizard at step 0 |
| `DiagnosticChecklist` | inside `ResultsImplementationInvalid` + collapsed view in `ResultsAwaitingPayment` | Renders each preflight check with ✅/❌/⏸; failed (non-skipped) checks expand to a `<FixCard>` |
| `FixCard` | inline in `DiagnosticChecklist` | Per-check fix UI: label, fix message, 2–4 line snippet excerpt, "Jump to wizard step N" button |
| `FirstPaymentHelper` | inside `ResultsAwaitingPayment` | Three tabs (`@x402/fetch` / `curl` / manual) with network-aware copy |
| `SimilarEndpoints` | inside `ResultsImplementationInvalid` | Calls `/api/search` for similar paths; shows up to 5 click-to-validate links |
| `WizardContainer` | when user opens the setup wizard | 5-step flow (stack → endpoint → metadata → code → deploy); accepts `probedDefaults` to skip re-typing |
| `ErrorBoundary` | wraps every result section + wizard | Catches render errors, shows a destructive card |
| `ValidationSourceBadge` | inside `app/page.tsx` | "Validated with Go SDK" (green) or "Approximate check — Go server <reason>" (yellow); SDK version in tooltip |

---

## Repository layout

```
bazaar-validate/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                                 # 5-state switch + orchestration
│   ├── globals.css
│   └── api/
│       ├── check/route.ts                       # discovery + quality signals + domain siblings
│       ├── validate/route.ts                    # proxy w/ cached health + fallback
│       ├── probe/route.ts                       # Node TS-port fallback
│       └── search/route.ts                      # semantic-search proxy
│
├── components/
│   ├── url-input.tsx
│   ├── results-found.tsx                        # INDEXED
│   ├── results-awaiting-payment.tsx             # AWAITING_FIRST_PAYMENT
│   ├── results-implementation-invalid.tsx       # IMPLEMENTATION_INVALID
│   ├── results-never-tried.tsx                  # NEVER_TRIED
│   ├── first-payment-helper.tsx
│   ├── similar-endpoints.tsx
│   ├── diagnostic-checklist.tsx
│   ├── fix-card.tsx
│   ├── error-boundary.tsx
│   ├── raw-response-viewer.tsx
│   ├── faq.tsx
│   ├── ui/                                      # GlowButton, ShimmerButton, PixelTrail, GooeyFilter
│   └── wizard/
│       ├── wizard-container.tsx                 # accepts probedDefaults to pre-fill
│       ├── step-stack.tsx
│       ├── step-endpoint.tsx
│       ├── step-metadata.tsx
│       ├── step-code.tsx
│       ├── step-deploy.tsx
│       └── copy-button.tsx
│
├── lib/
│   ├── diagnostics.ts                           # ResultState, ValidationResult, helpers
│   ├── checks.ts                                # canonical check catalog (single source of truth)
│   ├── api-contract.ts                          # typed request/response shapes for all routes
│   ├── discovery-validate.ts                    # TS port of parseDiscoveryInfo + legacy.ValidateDiscoveryRequest
│   ├── code-templates.ts                        # wizard code generation per stack
│   ├── api-log.ts                               # structured JSON logger
│   ├── rate-limit.ts                            # in-memory IP rate limiter (20/min)
│   ├── schemas.ts                               # JSON Schema inference from example JSON
│   └── utils.ts
│
├── hooks/
│   ├── use-discovery-poll.ts                    # post-payment poll loop (10s × 5min)
│   ├── use-screen-size.ts
│   └── use-debounced-dimensions.ts
│
├── go-validator/
│   ├── main.go                                  # 3-stage pipeline, /health + /validate
│   ├── main_test.go                             # unit tests for preflight + e2e validate()
│   ├── go.mod / go.sum
│   ├── Dockerfile / fly.toml                    # Fly.io deployment
│   ├── .gitignore                               # excludes the local `go-validator` binary
│   └── internal/
│       ├── sdkadapter/                          # thin wrapper around x402 Go SDK
│       │   └── sdkadapter.go
│       ├── legacy/                              # ported legacy.ValidateDiscoveryRequest
│       │   ├── validate.go
│       │   └── validate_test.go
│       └── discovery/                           # ported parseDiscoveryInfo + simulate
│           ├── parse.go
│           ├── parse_test.go
│           ├── simulate.go
│           └── simulate_test.go
│
├── validate/                                    # markdown reference of facilitator code
│   ├── overview.md
│   ├── parseDiscoveryInfo.md
│   ├── helpers.md
│   ├── submitDiscoveryJobIfNeeded.md
│   └── legacy.md
│
├── SPEC.md                                      # v1 spec (shipped)
├── SPEC-v2.md                                   # v2 working checklist
├── CHANGES-v2.md                                # v1 → v2 changelog
├── OVERVIEW.md                                  # high-level skim doc
├── ARCHITECTURE.md                              # this file
└── README.md
```

---

## Canonical check catalog

`lib/checks.ts` is the single source of truth for every check ID. Each entry has:

```ts
{
  id: string;                    // e.g. "accepts[0].amount"
  label: string;                 // human-readable, shown in UI
  severity: "blocking" | "warning";
  category: "transport" | "payment" | "bazaar" | "discovery";
  wizardStep?: number;           // 0–4; omitted if no wizard target
  fixMessage: string;            // one-line plain-English fix
  snippetKey?: string;           // key into FixCard's snippet map
}
```

When you add a new check to either validator:
1. Add it to `lib/checks.ts` first.
2. Emit it from both Go (`go-validator/main.go`) and Node (`app/api/probe/route.ts`).
3. (Optional) add a snippet excerpt for it in `components/fix-card.tsx`'s `SNIPPETS` map.

---

## External APIs

| API | Method | Purpose | Auth |
|---|---|---|---|
| `https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources` | GET | List indexed resources (paginated, supports `?query=`) | None |
| `https://api.cdp.coinbase.com/platform/v2/x402/discovery/merchant?payTo=<addr>` | GET | List endpoints by merchant wallet | None |
| `<user's endpoint>` | GET/POST | Probe to capture 402 + body | None |

Generated wizard code uses the CDP **production facilitator** at `https://api.cdp.coinbase.com/platform/v2/x402/facilitator`.

---

## Operational

- **Rate limiting:** in-memory, 20 req/min/IP, applied to `/api/check`, `/api/validate`, `/api/search`. Resets per Vercel function instance.
- **Health caching:** `/api/validate` caches Go server health for 30s in module scope (stale-on-error). Trades freshness for ~2s saved per request.
- **Structured logging:** every API request emits one JSON line via `lib/api-log.ts` — `{ts, route, hostname, durationMs, …}`. Surfaces in Vercel logs.
- **Error boundaries:** every result section + wizard wrapped in `<ErrorBoundary>`; render errors fall back to a destructive-themed card with the message instead of blanking the page.
- **Fallback transparency:** when the Node probe runs (Go down), the badge tells the user *why* (`go_unreachable` / `go_timeout` / `go_error`).

---

## What's not built yet

See the "Stretch / Future" phase in `SPEC-v2.md`:

- **Authenticated CDP validation endpoint** — when CDP exposes one, replace stages 2 + 3 with a thin proxy.
- **Solana support** — only EVM Base mainnet/sepolia today (USDC contract addresses + network IDs need expanding in `go-validator/main.go` + `app/api/probe/route.ts`).
- **MCP discovery preview** — show what the endpoint looks like to an AI agent via the Bazaar MCP server.
- **Webhook on indexing** — email/webhook so users don't have to keep the page open.
- **Sentry / log drain** — deferred until traffic warrants it; structured logs already feed Vercel.
