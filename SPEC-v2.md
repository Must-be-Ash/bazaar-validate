# Bazaar Validator v2 — Technical Specification

A working checklist for evolving `bazaar-validate` from "approximate validator + setup wizard" into a complete validator that mirrors the actual Bazaar facilitator pipeline. The original v1 spec (built and shipped) lives in `SPEC.md`; this is the next iteration.

Each item is small enough to be picked up and marked done individually. Items marked **[REFACTOR]** modify or replace existing code; items marked **[NEW]** add something that doesn't exist yet.

---

## Goals (the three jobs of this site)

1. **Tell builders if their endpoint is indexed** — current `/api/check` does this; expand to surface `lastUpdated`, quality signals, sibling endpoints, and merchant data.
2. **If they tried to index but it's broken — pinpoint the exact problem and fix.** Today the diagnostics list pass/fail, but only 3 checks deep-link to the wizard. Expand so every failure has tailored fix copy + a wizard deep-link pre-filled with what we already know.
3. **If there's no evidence they tried — guide them from zero.** Today both "broken" and "never tried" land in the same `Not Found` state. Split them.

---

## Guiding decisions (locked from clarifying Q&A)

- **Validation parity:** Rewrite `go-validator/main.go` around the real `github.com/coinbase/x402/go` SDK. The Go server runs the same flow the facilitator uses at settle time: `parseDiscoveryInfo` → `legacy.ValidateDiscoveryRequest` → simulated `submitDiscoveryJobIfNeeded`. The current 17 surface-level checks become a *pre-flight* layer that runs first and catches issues the facilitator never sees (HTTPS, USDC min, etc.).
- **Result states:** Replace today's binary `found | not-found` with four explicit states: `indexed`, `awaiting_first_payment` (implementation looks valid but no settle has happened yet), `implementation_invalid` (one or more checks failed), `never_tried` (not even an x402 endpoint).
- **Node fallback parity:** The Node probe stays as a fallback when the Go server is down, but its check ids, ordering, and error strings must match the Go server check-for-check. Today they've drifted (Go uses `accepts[0].scheme`; Node uses `scheme_valid`).
- **Fix guidance:** Every failing check renders a tailored fix card (1–4 line code snippet excerpt + plain-English explanation) and a deep-link into the wizard pre-filled with everything already known from the probe (URL, method, payTo, network, amount).
- **Discovery expansion:** Surface `lastUpdated` and quality signals; add a merchant panel (already partially built) and a "similar endpoints" semantic-search panel.
- **First-payment helper + re-validate loop:** Guide the user through triggering their first payment (self-pay curl, `@x402/fetch` snippet, or manual) and poll `/api/check` after deploy until the endpoint appears.
- **Scope of action:** Spec only; we'll implement task-by-task in follow-up turns.

---

## Phase 0 — Foundations & cleanup

- [ ] **[REFACTOR] Unify the result-state model.** In `app/page.tsx`, replace `ResultType = "found" | "not-found" | "error"` with `"indexed" | "awaiting_first_payment" | "implementation_invalid" | "never_tried" | "error"`. Add `deriveResultState(checkResult, validateResult): ResultState` in `lib/diagnostics.ts`.
- [ ] **[NEW] Canonical check catalog (`lib/checks.ts`).** Single source of truth for every check id with: human label, severity (`blocking | warning`), category (`transport | payment | bazaar | discovery`), wizard step that fixes it, one-line fix message, and snippet excerpt key. Replace `CHECK_LABELS` and `CHECK_WIZARD_STEP` in `lib/diagnostics.ts` with re-exports from this file.
- [ ] **[REFACTOR] Stable `ValidationResult` shape.** Define one TS type in `lib/diagnostics.ts` that both the Go backend and the Node fallback emit verbatim — no client-side mapping. The lossy mapping at `app/page.tsx:92–114` (Go response → `ProbeResult`) goes away.
- [ ] **[NEW] Versioned API contract (`lib/api-contract.ts`).** Documenting `/api/check`, `/api/validate`, `/api/probe`, `/api/search` request/response types. Imported by both API routes and the frontend.
- [ ] **[REFACTOR] Stop early-returning in validators.** Today both `go-validator/main.go` and `app/api/probe/route.ts` short-circuit when `url_https` / `endpoint_reachable` / `returns_402` / `valid_json` fails, hiding downstream check results. Change to *record* failures and continue (mark dependent checks `skipped` with a reason). The diagnostic checklist always shows the full set.

---

## Phase 1 — Go validator rewrite (real SDK + facilitator parity)

- [ ] **[REFACTOR] Add the x402 Go SDK to `go-validator/go.mod`.** `go get github.com/coinbase/x402/go@latest`. Pin the version. Vendor if needed for the Fly.io Docker build.
- [ ] **[REFACTOR] Pull discovery helpers.** Import `github.com/coinbase/x402/go/extensions/bazaar` plus the discovery helpers used by the facilitator (`ExtractDiscoveredResourceFromPaymentPayload`, `TransformDiscoveryInfoToOutputSchema`, `ExtractResourceTransportType`, `ExtractHTTPResourceMethod`). If any aren't exported by the public SDK, port them into `go-validator/internal/discovery/` from `validate/helpers.md`.
- [ ] **[NEW] Port `legacy.ValidateDiscoveryRequest`.** New file `go-validator/internal/legacy/validate.go` matching `validate/legacy.md`: URL normalization, protocol-type extraction, and the HTTPS gate when `requireHTTPS` is true.
- [ ] **[NEW] `parseDiscoveryInfo` equivalent.** New file `internal/discovery/parse.go` mirroring `validate/parseDiscoveryInfo.md`: extract the `DiscoveredResource` from the 402 response (synthesizing payment requirements bytes from `accepts[0]` + the body's `extensions.bazaar`), validate `transportType`, validate `method` for HTTP transport, return `ParsedDiscoveryInfo`.
- [ ] **[NEW] `submitDiscoveryJobIfNeeded` simulator.** New file `internal/discovery/simulate.go` mirroring the decision tree in `validate/submitDiscoveryJobIfNeeded.md` *without* touching Temporal. Returns one of: `processing` (would index), `rejected_<reason>` for each of the rejection branches in that doc, or `noop` (no Bazaar extension present).
- [ ] **[REFACTOR] Three-stage validation pipeline.** Replace `validate()` in `main.go` with:
  1. **Pre-flight** — existing surface checks (HTTPS, reachable, 402, JSON, x402Version=2, accepts schema, USDC min, network, payTo, maxTimeoutSeconds, etc.). Catches issues the facilitator never sees.
  2. **Bazaar parse** — synthesize requirements bytes, run the SDK extractor, then `parseDiscoveryInfo`. Surface the exact error strings the facilitator would log.
  3. **Submit simulation** — run the simulated decision tree from step 5 above and emit one outcome.
- [ ] **[REFACTOR] New `/validate` response shape.** `{ valid, preflight: Check[], parse: { ok, error? }, simulate: { outcome, rejectedReason?, workflowIdHint? }, raw: { statusCode, headers, body }, meta: { sdkVersion, validatorVersion } }`.
- [ ] **[REFACTOR] `/health` returns SDK version.** `{ status: "ok", sdkVersion, validatorVersion }`. Lets the frontend show the exact SDK version in the validation badge tooltip.
- [ ] **[NEW] Unit tests in Go.** Cover: missing bazaar extension, malformed extension, http-without-method, non-https when secure mode on, dynamic-route template detection, USDC-min boundary at 999/1000, network mismatch, v1 `paymentRequirements` and `maxAmountRequired` detection, valid happy path → `processing`.

---

## Phase 2 — Node fallback parity

- [ ] **[REFACTOR] Mirror the 3-stage pipeline in TS.** Restructure `app/api/probe/route.ts` into pre-flight / parse / simulate, emitting the same `ValidationResult` shape so the frontend never branches on `source`.
- [ ] **[NEW] TS port of facilitator semantics (`lib/discovery-validate.ts`).** Re-implement `parseDiscoveryInfo` and `legacy.ValidateDiscoveryRequest` directly from the markdown specs (no real SDK in TS).
- [ ] **[REFACTOR] Align check ids.** Audit `go-validator/main.go` and `app/api/probe/route.ts` so every check id is identical. Today: Go has `accepts[0].scheme`, Node has `scheme_valid`; Go has `valid_json`, Node has none. Pick one set, update both, update `lib/checks.ts`.
- [ ] **[REFACTOR] Surface fallback reason in the badge.** `validationSource: "go" | "node"` should also include `fallbackReason: "go_unreachable" | "go_timeout" | "go_error" | null` so debugging is easy when the Fly.io server is down.

---

## Phase 3 — Discovery lookup expansion (`/api/check`)

- [ ] **[REFACTOR] Surface `lastUpdated`.** Already in the discovery API response — propagate through `CheckResult.resource` and render on `ResultsFound`.
- [ ] **[NEW] Quality signals.** Add to `CheckResult.resource`: `descriptionPresent`, `inputSchemaPresent`, `outputSchemaPresent`, `dedicatedDomain`, `payerCount30d`. Compute heuristically from the discovery item; payer count is `null` until the API exposes it (document this in the FAQ).
- [ ] **[REFACTOR] Merchant panel display.** `components/results-found.tsx` already receives `merchantResources: string[]`. Widen to `{ resource: string; lastUpdated: string }[]` and render as a clickable list with each endpoint's age and a "validate this one" link.
- [ ] **[NEW] Domain-sibling check.** When a single URL isn't found, also check the same domain (no path) and surface "We found N other endpoints on this domain that are indexed." Helps users spot partial indexing.
- [ ] **[NEW] `/api/search` route.** Proxy `GET /discovery/resources?query=...&limit=10`. Rate-limited.
- [ ] **[NEW] Comparison panel.** When in `awaiting_first_payment` or `implementation_invalid`, query `/api/search` with a query derived from the user's path or `bazaar.info.output.example` keys and show 3–5 indexed similar endpoints so the user can compare configs.

---

## Phase 4 — Awaiting-first-payment state

- [ ] **[NEW] Detection logic.** Add `isAwaitingFirstPayment(checkResult, validateResult): boolean` to `lib/diagnostics.ts`. True when discovery returns `found=false` AND pre-flight all-pass AND parse succeeded AND simulate outcome is `processing`.
- [ ] **[NEW] `components/results-awaiting-payment.tsx`.** Shown when `resultState === "awaiting_first_payment"`. Renders:
  - Green "Implementation looks correct" header.
  - Summary card: "Your endpoint will be indexed after the CDP facilitator processes its first verify+settle."
  - Embedded "First payment helper" (Phase 5).
  - Collapsed all-green checklist.
- [ ] **[REFACTOR] Wire into `app/page.tsx`.** Replace the `resultType === "not-found"` branch with a switch on `resultState` rendering `ResultsFound`, `ResultsAwaitingPayment`, `ResultsImplementationInvalid`, or `ResultsNeverTried`.
- [ ] **[REFACTOR] Rename `ResultsNotFound` → `ResultsImplementationInvalid`.** Update copy from "Not Found on Bazaar" to "Implementation issues found"; remove first-payment fallback messaging from this component (it now lives in `ResultsAwaitingPayment`).

---

## Phase 5 — First-payment helper + re-validate loop

- [ ] **[NEW] `components/first-payment-helper.tsx`.** Three options:
  1. **Self-pay** — copy-paste `curl` or `x402` CLI command using the user's URL and a small testnet wallet (mention USDC balance on Base Sepolia).
  2. **`@x402/fetch` Node snippet** — pre-filled with the user's URL; user runs locally with their funded private key.
  3. **Manual** — "Make any successful payment via the CDP facilitator and we'll detect it within ~30s."
- [ ] **[NEW] Network-aware copy.** Detect network from probed `accepts[0].network`. Base Sepolia → mention faucet. Base Mainnet → warn that real money will be spent and suggest temporarily switching to Sepolia for the indexing test.
- [ ] **[NEW] `hooks/use-discovery-poll.ts`.** Poll `/api/check` every 10s for up to 5 minutes after the user clicks "I made the payment, watch for indexing". Stop on first hit; transition `resultState` to `indexed`.
- [ ] **[REFACTOR] Re-validate loop after wizard deploy.** `WizardContainer.onRevalidate` already re-runs `handleValidate`. Extend so that when the result is `awaiting_first_payment`, the first-payment helper auto-opens and polling starts.

---

## Phase 6 — Per-check fix guidance & wizard deep-links

- [ ] **[REFACTOR] Expand `CHECK_WIZARD_STEP`.** Today only 3 checks deep-link. Map every blocking check (canonical ids from Phase 0):
  - `url_https` → step 1 (use https URL)
  - `returns_402` → no wizard step; show middleware-ordering fix card
  - `x402_version` → step 0 (stack picker — explain v2 packages)
  - `accepts[0].scheme` → step 1
  - `accepts[0].network` → step 1
  - `accepts[0].asset` → step 1
  - `accepts[0].amount` → step 1
  - `accepts[0].payTo` → step 1
  - `accepts[0].maxTimeoutSeconds` → step 1
  - `has_resource` → step 3 (already in generated code)
  - `has_bazaar_extension` → step 0
  - `bazaar.info` → step 2
  - `bazaar.info.output` → step 2
  - `bazaar.info.output.example` → step 2
  - `bazaar.schema` → step 2
- [ ] **[NEW] `components/fix-card.tsx`.** Takes a failed check; renders title, explanation, 2–4 line code snippet excerpt (sourced from `lib/code-templates.ts`), and "Jump to wizard step N" button.
- [ ] **[REFACTOR] Inline fix cards in `DiagnosticChecklist`.** Failing items expand to show their fix card; passing items stay compact.
- [ ] **[REFACTOR] Pre-fill the wizard from probe results.** Pass through everything we already know: URL → path; `accepts[0].payTo` → `config.payTo`; `accepts[0].network` → `config.network`; `accepts[0].amount` (atomic units) → `config.price` (formatted). Today `WizardContainer` only inherits URL and method.
- [ ] **[NEW] Tailored CTA when there's a single failure.** Replace the generic "Fix with Setup Wizard" with "Fix `<check label>` →" when exactly one blocking check failed.

---

## Phase 7 — Onboarding flow for never-tried endpoints

When `/api/check` returns `found=false` AND pre-flight shows the endpoint isn't even an x402 endpoint (200 OK or no `x402Version` and no `accepts`), this is "user has never tried" — different flow from "user tried and broke it."

- [ ] **[NEW] Detect "never tried" state.** `isNeverTried(validateResult): boolean` — true when `returns402=false` AND `x402Version` is null AND no `accepts` array.
- [ ] **[NEW] `components/results-never-tried.tsx`.** Friendly empty state: "We didn't see any x402 setup on this endpoint. Let's set one up." Auto-opens the wizard at step 0 with the URL pre-filled.
- [ ] **[REFACTOR] `app/page.tsx` switch.** Add the never-tried branch.

---

## Phase 8 — UX polish

- [ ] **[REFACTOR] Loading copy.** Today: "Checking Bazaar..." then "Probing endpoint...". Add: "Validating with x402 SDK..." while the Go pipeline runs (parse + simulate stages).
- [ ] **[NEW] Validation source tooltip.** Hover on the "Validated with Go SDK" badge shows the SDK version returned from `/health`.
- [ ] **[NEW] Shareable result URLs.** `app/page.tsx` reads `?url=...&method=...` query params and auto-runs validation. Lets users share validation links in Discord/issues.
- [ ] **[NEW] Failure-summary line.** When `implementation_invalid`, render one sentence above the checklist: "3 issues blocking indexing — start with: returns 200 instead of 402."
- [ ] **[REFACTOR] FAQ updates (`components/faq.tsx`).** Add:
  - "Why does my endpoint say 'awaiting first payment'?"
  - "How do I trigger my first payment?"
  - "What's the difference between Go SDK validation and approximate check?"
  - "Why doesn't indexing happen instantly after my first payment?" (Reference quality-score recalculation.)
  - "Why is payer count `null`?" (Discovery API doesn't expose it yet.)

---

## Phase 9 — Operational

- [ ] **[REFACTOR] Cache `GO_VALIDATOR_URL` health.** Today every `/api/validate` call does a fresh 2s health probe. Cache for 30s in module scope (stale-on-error). Cuts ~2s off the happy path.
- [ ] **[NEW] Structured logging.** Both routes log JSON lines: `{ts, route, url, hostname, resultState, durationMs}`. Helps debug user reports.
- [ ] **[REFACTOR] Rate limit per-route.** Currently only `/api/validate` is rate-limited (20/min/IP). Add the same to `/api/check` (it does ~14 parallel discovery requests) and `/api/search`.
- [ ] **[NEW] Error boundaries.** Wrap `ResultsFound`, `ResultsAwaitingPayment`, `ResultsImplementationInvalid`, `ResultsNeverTried`, and `WizardContainer` so a render bug doesn't blank the page.
- [ ] **[NEW] Sentry / log drain.** (Optional) 5xx + unhandled rejection telemetry. Defer until real traffic.

---

## Phase 10 — Stretch / future

- [ ] **[NEW] CDP authenticated validation endpoint.** Per the co-worker's note, the "perfect" solution is calling a CDP-side validation endpoint that runs the exact facilitator path. When that endpoint exists, replace Phase 1 stages 2–3 with a thin authenticated proxy.
- [ ] **[NEW] MCP discovery preview.** Show what the endpoint would look like to an AI agent via the Bazaar MCP server (`search_resources` tool output).
- [ ] **[NEW] Solana support.** Today only EVM Base mainnet/sepolia in the validators and wizard. Add Solana mainnet/devnet networks + USDC mint addresses everywhere.
- [ ] **[NEW] Webhook on indexing.** Optional email/webhook when the user's endpoint finally appears in discovery — avoids the "I keep refreshing" problem.

---

## Files that will be created

```
lib/
  checks.ts                    # canonical check catalog
  api-contract.ts              # request/response types
  discovery-validate.ts        # TS port of parseDiscoveryInfo + legacy.ValidateDiscoveryRequest

components/
  results-awaiting-payment.tsx
  results-never-tried.tsx
  first-payment-helper.tsx
  fix-card.tsx

hooks/
  use-discovery-poll.ts

app/api/
  search/route.ts              # /api/search proxy

go-validator/
  internal/discovery/parse.go
  internal/discovery/simulate.go
  internal/legacy/validate.go
  *_test.go                    # (in their respective packages)
```

## Files that will be substantially refactored

```
go-validator/main.go                       # rewritten around SDK pipeline
app/api/probe/route.ts                     # restructured into 3 stages, ids aligned
app/api/validate/route.ts                  # new response shape, cached health
app/api/check/route.ts                     # surface lastUpdated + signals + domain siblings
app/page.tsx                               # 5-state resultState switch, shareable URL params
components/results-not-found.tsx           # → renamed results-implementation-invalid.tsx
components/results-found.tsx               # merchant list + signals
components/diagnostic-checklist.tsx        # inline fix cards
components/wizard/wizard-container.tsx     # accept full pre-fill from probe
lib/diagnostics.ts                         # ValidationResult + state derivation helpers
```
