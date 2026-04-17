# Bazaar Validator — Overview

A web tool that helps x402 endpoint operators figure out **why their endpoint isn't appearing in the CDP Bazaar discovery index — and what to do about it.**

Live at `bazaar-validate.vercel.app` (frontend) + `bazaar-go-validator.fly.dev` (Go validation backend).

---

## What it does

A user pastes their endpoint URL → the tool tells them which of these five states they're in, and walks them out of it:

| State | What it means | What we show |
|---|---|---|
| **Indexed** | Endpoint is already in the Bazaar | Resource details, `lastUpdated`, quality signals, other endpoints by the same wallet |
| **Awaiting first payment** | Implementation is correct but the facilitator hasn't seen a verify+settle yet | First-payment helper (curl / `@x402/fetch` snippet pre-filled with their URL + network) + auto-poll for indexing |
| **Implementation invalid** | At least one blocking check failed | Per-check fix cards with snippet excerpts + deep-link into the wizard pre-filled with what we already probed |
| **Never tried** | Endpoint is reachable but has no x402 markers at all | Friendly empty state that auto-opens the setup wizard |
| **Error** | Couldn't reach our APIs | Plain error card |

The Bazaar's "endpoint is cataloged on first verify+settle" rule is the source of most "why isn't my endpoint showing up?" confusion — splitting **awaiting first payment** from **implementation invalid** is the single biggest UX improvement.

---

## How it works

### Request flow

```
       ┌──────────────────────────────┐
       │     User's browser            │
       │     (Next.js single page)     │
       └──────────────┬───────────────┘
                      │
   ┌──────────────────┼─────────────────────┐
   │                  │                     │
   ▼                  ▼                     ▼
POST /api/check   POST /api/validate    GET /api/search
   │                  │                     │
   │     ┌────────────┼─────────┐           │
   │     │            │         │           │
   ▼     ▼            ▼         ▼           ▼
CDP   Go server    Node /api/probe       CDP discovery
discovery (Fly.io)  (fallback)            (semantic search)
                ▲      ▲
                │      │
                └──────┴── User's x402 endpoint
```

### The 3-stage validation pipeline

Both validators (Go primary, Node fallback) run the same 3 stages and emit the same `ValidationResult` shape:

1. **Preflight** — Surface checks the SDK doesn't run: HTTPS, reachable, returns 402, valid JSON, x402 v2, `accepts[0]` schema, USDC contract match, $0.001 minimum, payTo present, `maxTimeoutSeconds`, resource URL, `extensions.bazaar` present, `bazaar.info`, `bazaar.info.output`, output example, `bazaar.schema`.
2. **Parse** — Run the actual `bazaar.ExtractDiscoveredResourceFromPaymentRequired` from the x402 Go SDK on the 402 response. Surfaces the same error strings the facilitator would log on settle.
3. **Simulate** — Mirror the facilitator's `submitDiscoveryJobIfNeeded` decision tree without touching Temporal. Returns `processing` (would index), `rejected_<reason>` (one of: discovery not enabled / invalid configuration / unsupported transport / validation failed / dynamic-route-no-concrete-URL), or `noop` (no bazaar extension).

The Go server uses the **real x402 Go SDK** as a direct dep, so the parse stage is byte-for-byte the facilitator's behavior. The Node fallback is a literal TS port of the same logic for when the Go server is down.

### Result-state derivation

```
                       ┌─────────────┐
discovery API ────────▶│  /api/check │
                       └──────┬──────┘
                              │  found?
                       ┌──────┴──────┐
                       │             │
                  yes  ▼             ▼  no
                  INDEXED     ┌─────────────────┐
                              │  /api/validate  │
                              │  (3-stage)      │
                              └──────┬──────────┘
                                     │
              ┌──────────────────────┼──────────────────────┐
              │                      │                      │
   reachable, no x402 markers   all preflight pass +    any blocking check
                                parse OK + simulate=     failed
                                processing
              │                      │                      │
              ▼                      ▼                      ▼
        NEVER_TRIED         AWAITING_FIRST_PAYMENT   IMPLEMENTATION_INVALID
```

This logic is centralized in `lib/diagnostics.ts` (`deriveResultState`, `isAwaitingFirstPayment`, `isNeverTried`).

---

## Key features

- **Per-check fix cards** — every failing check renders an inline card with a 2–4 line code snippet + "jump to wizard step N" button. Catalog of every check (label, severity, category, wizard step, fix message) lives in `lib/checks.ts`.
- **Wizard pre-fill** — when the user opens the wizard from a failed validation, we pre-fill URL → path, `accepts[0].payTo` → config.payTo, network, atomic amount → dollar price. They don't re-type what we already probed.
- **First-payment helper** — three tabs (`@x402/fetch` Node snippet, curl, manual). Network-aware: Sepolia shows the faucet link, mainnet shows a "real money" warning. After the user clicks "I made the payment", we poll `/api/check` every 10s for up to 5 min and auto-promote to `INDEXED` when it appears.
- **Discovery enrichment** — `/api/check` surfaces `lastUpdated`, quality signals (description / input / output schema present), domain siblings ("3 other endpoints on this domain are indexed"), and merchant data ("this wallet has N indexed endpoints").
- **Similar endpoints** — when not indexed, we semantic-search the Bazaar for endpoints with similar paths so the user can compare configs.
- **Shareable links** — `/?url=…&method=…` auto-runs validation. Used by every internal "validate this one" link in the merchant + sibling + similar panels.
- **Setup wizard** — 5-step flow (stack → endpoint config → metadata → generated code → deploy + re-validate) supports Node.js Express, Go Gin, Python FastAPI.

---

## Repository layout

```
app/
├── page.tsx                     # 5-state switch, shareable URLs, all orchestration
├── api/
│   ├── check/route.ts          # discovery lookup + quality signals + domain siblings
│   ├── validate/route.ts       # proxy to Go (with Node fallback), cached health
│   ├── probe/route.ts          # Node fallback (TS port of the 3-stage pipeline)
│   └── search/route.ts         # semantic-search proxy

components/
├── url-input.tsx
├── results-found.tsx                    # INDEXED state
├── results-awaiting-payment.tsx         # AWAITING_FIRST_PAYMENT state
├── results-implementation-invalid.tsx   # IMPLEMENTATION_INVALID state
├── results-never-tried.tsx              # NEVER_TRIED state
├── first-payment-helper.tsx             # 3-tab payment trigger UI
├── similar-endpoints.tsx                # semantic-search panel
├── diagnostic-checklist.tsx             # renders preflight checks + inline fix cards
├── fix-card.tsx                         # per-check fix UI with snippet excerpt
├── error-boundary.tsx                   # wraps every result section
├── faq.tsx
└── wizard/                              # 5-step setup wizard

lib/
├── diagnostics.ts                       # ResultState, ValidationResult, helpers
├── checks.ts                            # canonical check catalog
├── api-contract.ts                      # typed request/response shapes
├── discovery-validate.ts                # TS port of parseDiscoveryInfo / legacy.ValidateDiscoveryRequest
├── code-templates.ts                    # wizard code generation per stack
├── api-log.ts                           # structured JSON logging
├── rate-limit.ts                        # in-memory IP rate limiter
└── schemas.ts                           # JSON Schema inference

hooks/
└── use-discovery-poll.ts                # post-payment poll loop

go-validator/
├── main.go                              # 3-stage pipeline, /health + /validate
├── internal/
│   ├── sdkadapter/                      # thin wrapper around x402 Go SDK
│   ├── legacy/                          # ported legacy.ValidateDiscoveryRequest
│   └── discovery/                       # ported parseDiscoveryInfo + simulate
└── *_test.go                            # 23 unit tests
```

---

## Running locally

```bash
# Frontend
npm install
npm run dev               # http://localhost:3000

# Go validator (optional — Node fallback works without it)
cd go-validator && go run main.go    # http://localhost:8080
go test ./...                         # 23 tests

# Point the frontend at your local Go server
echo 'GO_VALIDATOR_URL=http://localhost:8080' >> .env.local
```

Fly.io deploys the Go server (`flyctl deploy` from `go-validator/`); Vercel deploys the Next.js app and sets `GO_VALIDATOR_URL` to the Fly.io URL.

---

## Operational

- **Rate limit:** 20 requests/min/IP on `/api/check`, `/api/validate`, `/api/search` (in-memory, per Vercel function instance).
- **Health caching:** Go server health is cached for 30s in module scope (stale-on-error) — avoids paying ~2s per validate call when Go is up.
- **Logging:** Each API request emits one JSON line to stdout (`{ts, route, hostname, durationMs, …}`) — surfaces in Vercel logs.
- **Error boundaries:** Every result section is wrapped so a render bug in one component doesn't blank the page.
- **Fallback transparency:** When the Go server is down, the badge tells the user *why* (`go_unreachable` / `go_timeout` / `go_error`).

---

## What's not built yet

- **Authenticated CDP validation endpoint** — the "perfect" fix would be calling a CDP-side validator that runs the literal facilitator code path. Not yet exposed; we'd swap stages 2–3 for a thin proxy when it lands.
- **Solana support** — only EVM Base mainnet/sepolia today.
- **MCP discovery preview** — show what the endpoint looks like to an AI agent via the Bazaar MCP server.
- **Webhook on indexing** — email/webhook when the endpoint finally appears (so users don't have to keep the page open).

Full task history in `SPEC.md` (v1, shipped) and `SPEC-v2.md` (v2, mostly done).
