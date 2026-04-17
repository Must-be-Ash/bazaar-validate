# Bazaar Validator — v1 → v2 TL;DR

A high-level summary of what changed in this round. Full task list lives in `SPEC-v2.md`.

## The big idea

v1 was an "approximate validator + setup wizard." v2 is **the same checks the CDP facilitator actually runs** at settle time, plus a UI that splits "you're broken" from "you're correct but unindexed" from "you've never tried."

## Three things that now work

1. **Tell builders if their endpoint is indexed** — same as v1, but now also surfaces `lastUpdated`, quality signals, sibling endpoints on the same domain, and other endpoints by the same merchant.
2. **Pinpoint exactly what's broken and how to fix it** — every failing check renders an inline fix card with a 2–4 line code snippet and a "jump to wizard step N" button pre-filled with what we already probed (URL, payTo, network, amount).
3. **Onboard from zero** — endpoints that aren't x402 at all get a friendly "let's set this up" path instead of being dumped into the bug-fix UI.

## What changed under the hood

### Go validator: real SDK, real facilitator pipeline

- Pulled in `github.com/coinbase/x402/go` SDK as a direct dep.
- Replaced the custom `validate()` with a **3-stage pipeline** that mirrors what the facilitator does on settle:
  1. **Preflight** — surface checks the SDK doesn't run (HTTPS, USDC min, etc.).
  2. **Parse** — `bazaar.ExtractDiscoveredResourceFromPaymentRequired` from the SDK.
  3. **Simulate** — full port of the facilitator's `submitDiscoveryJobIfNeeded` decision tree, returning `processing | rejected_<reason> | noop` without actually touching Temporal.
- New `/validate` shape: `{ valid, preflight, parse, simulate, raw, meta }`.
- `/health` now returns the SDK version baked into the binary.
- 23 Go unit tests cover the new pipeline.

### Node fallback: structurally identical

- TS port of `parseDiscoveryInfo` + `legacy.ValidateDiscoveryRequest` in `lib/discovery-validate.ts`.
- Probe restructured into the same 3 stages so the frontend never branches on `source: "go" | "node"`.
- All check IDs aligned to Go's canonical names (e.g. `accepts[0].scheme`, not `scheme_valid`).
- When fallback engages, the badge tells the user *why* (`go_unreachable | go_timeout | go_error`).

### Result-state model

v1 had `found | not-found`. v2 has **five explicit states**:
- `indexed` — show listing.
- `awaiting_first_payment` — implementation is correct, just needs a verify+settle.
- `implementation_invalid` — at least one blocking check failed; show fix cards.
- `never_tried` — no x402 markers at all; auto-open the wizard.
- `error` — something blew up.

Derivation lives in `lib/diagnostics.ts` (`deriveResultState`, `isAwaitingFirstPayment`, `isNeverTried`).

### Discovery / search

- New `/api/search` proxies the CDP semantic-search endpoint.
- New `<SimilarEndpoints>` panel shows 3–5 indexed endpoints with similar paths so the user can compare.
- `/api/check` now also computes `qualitySignals` (description / input / output schema present) and `domainSiblings` (other indexed endpoints on the same domain).
- Merchant data widened from `string[]` to `{ resource, lastUpdated }[]` and rendered as click-to-validate links.

### First-payment helper + auto-poll

- New `<FirstPaymentHelper>` with three tabs: pre-filled `@x402/fetch` Node snippet, `curl` confirmation, and manual instructions. Network-aware copy (Sepolia → faucet link; mainnet → spend warning).
- New `useDiscoveryPoll` hook polls `/api/check` every 10s for up to 5 min after the user clicks "I made the payment" — auto-promotes to `indexed` on first hit.
- After a wizard re-validate, polling auto-starts so the user doesn't have to click again.

### Per-check fix UX

- New `lib/checks.ts` is the single source of truth for every check ID: human label, severity, category, wizard step, fix message, snippet key.
- New `<FixCard>` component renders a 2–4 line code excerpt + "jump to wizard step N" button for every failing check.
- Wizard now pre-fills from probe results (URL → path, accepts[0].payTo → config.payTo, network, atomic amount → dollar price).
- When exactly one blocking check failed, the CTA says `Fix "<check label>" →` instead of the generic "Fix with Setup Wizard".

### Operational

- Go health check is cached for 30s in module scope (stale-on-error) — saves ~2s per `/api/validate` call when the Go server is up.
- Structured JSON logging on `/api/check`, `/api/validate`, `/api/search` — one line per request with route, hostname, durationMs, result.
- Rate limiting (20 req/min/IP) extended from `/api/validate` to all three public routes.
- New `<ErrorBoundary>` wraps every result section + the wizard so a render bug doesn't blank the page.

### Other UX polish

- Shareable result URLs: `?url=…&method=…` auto-runs validation. The merchant panel and similar-endpoints links now use this format end-to-end.
- "Validating with x402 SDK..." spinner during the validate phase.
- Hover tooltip on the validation badge shows the exact SDK version.
- Failure-summary line on `implementation_invalid`: "3 issues blocking indexing — start with: …"
- FAQ updated with awaiting-first-payment / how-to-trigger-first-payment / quality-score timing entries.

## What's intentionally not done (yet)

The "Stretch / Future" phase in `SPEC-v2.md`:

- **Authenticated CDP validation endpoint** — the "perfect" fix is to call a CDP-side validator that runs the literal facilitator code path. Out of scope until that endpoint exists; we'd then replace stages 2–3 with a thin proxy.
- **MCP discovery preview** — show what the endpoint looks like to an AI agent via the Bazaar MCP server.
- **Solana support** — today we only validate EVM Base mainnet/sepolia.
- **Webhook on indexing** — email/webhook when the endpoint finally appears so the user doesn't have to keep the page open.
- **Sentry / log drain** — deferred until real traffic warrants it; structured logs already feed Vercel.

## Files at a glance

**New:**
```
lib/checks.ts                                # canonical check catalog
lib/api-contract.ts                          # request/response types
lib/discovery-validate.ts                    # TS port of facilitator parse/simulate
lib/api-log.ts                               # structured logger
hooks/use-discovery-poll.ts                  # post-payment poll loop
components/results-awaiting-payment.tsx
components/results-never-tried.tsx
components/first-payment-helper.tsx
components/fix-card.tsx
components/similar-endpoints.tsx
components/error-boundary.tsx
app/api/search/route.ts
go-validator/internal/sdkadapter/            # SDK wrapper
go-validator/internal/legacy/                # ported ValidateDiscoveryRequest
go-validator/internal/discovery/             # ported parseDiscoveryInfo + simulate
```

**Substantially refactored:**
```
go-validator/main.go                         # 3-stage pipeline around SDK
app/api/validate/route.ts                    # new shape, cached health, fallbackReason
app/api/probe/route.ts                       # mirrors Go pipeline structure
app/api/check/route.ts                       # quality signals, domain siblings
app/page.tsx                                 # 5-state switch, shareable URLs
components/results-not-found.tsx             # → renamed results-implementation-invalid.tsx
components/results-found.tsx                 # merchant list + signals + lastUpdated
components/diagnostic-checklist.tsx          # inline fix cards
components/wizard/wizard-container.tsx       # accepts probedDefaults
lib/diagnostics.ts                           # ResultState + ValidationResult + helpers
```
