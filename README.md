# Bazaar Validator

Figure out whether your x402 endpoint is indexed in the [CDP Bazaar](https://docs.cdp.coinbase.com/x402/x402-bazaar) — and if not, exactly why and how to fix it.

**Live at [bazaar-validate.vercel.app](https://bazaar-validate.vercel.app)**

## What it does

Paste your endpoint URL → we put you in one of five explicit states:

| State | What it means |
|---|---|
| **Indexed** | Already in the Bazaar — shows resource details, `lastUpdated`, quality signals, sibling endpoints by the same wallet |
| **Awaiting first payment** | Implementation is correct, but the facilitator hasn't processed a verify+settle yet. Ships with a pre-filled first-payment helper (`@x402/fetch` snippet / curl / manual) and auto-polls for indexing |
| **Implementation invalid** | One or more checks failed. Each failure renders a fix card with a code-snippet excerpt and a deep-link into the wizard, pre-filled with what we already probed |
| **Never tried** | Endpoint isn't even an x402 endpoint. Auto-opens the setup wizard |
| **Error** | Couldn't reach our APIs |

The "awaiting first payment" state — distinguishing "your code is right, just needs a settle" from "your code is broken" — is the single biggest UX improvement and the source of most "why isn't my endpoint indexed?" confusion.

## How validation works

A 3-stage pipeline that mirrors what the CDP facilitator actually runs on settle:

1. **Preflight** — surface checks the SDK doesn't run (HTTPS, USDC contract match, $0.001 minimum, payTo present, bazaar extension shape, etc.)
2. **Parse** — `bazaar.ExtractDiscoveredResourceFromPaymentRequired` from the real `github.com/coinbase/x402/go` SDK
3. **Simulate** — port of the facilitator's `submitDiscoveryJobIfNeeded` decision tree (returns `processing` / `rejected_<reason>` / `noop` without touching Temporal)

The Go validator runs these stages with the actual SDK; if it's unreachable, a Node TS port runs the same logic as fallback (with the badge clearly indicating which ran and why).

## Running locally

```bash
# Frontend
npm install
npm run dev                                    # http://localhost:3000

# Go validator (recommended — without it, the Node fallback runs)
cd go-validator && go run main.go              # http://localhost:8080
go test ./...                                  # 23 unit tests
```

Add to `.env.local`:
```
GO_VALIDATOR_URL=http://localhost:8080
```

(That's already the default, but explicit is nice.)

## Deployments

| Component | Platform | How to deploy |
|---|---|---|
| Next.js app | Vercel | Auto-deploys on push to `main` |
| Go validator | Fly.io | `cd go-validator && flyctl deploy` |

`GO_VALIDATOR_URL` is set in Vercel env vars to the Fly.io URL.

## Project structure

- `app/` — Next.js App Router pages and API routes (`/api/check`, `/api/validate`, `/api/probe`, `/api/search`)
- `components/` — one component per result state, plus the setup wizard
- `lib/` — `diagnostics.ts` (state model), `checks.ts` (canonical check catalog), `discovery-validate.ts` (TS port of facilitator pipeline), `api-contract.ts` (typed request/response shapes)
- `hooks/use-discovery-poll.ts` — post-payment auto-poll
- `go-validator/` — Go HTTP server + `internal/{sdkadapter,legacy,discovery}` packages

For a full breakdown — file-by-file, request flows, contract shapes, and operational notes — see [ARCHITECTURE.md](./ARCHITECTURE.md).
