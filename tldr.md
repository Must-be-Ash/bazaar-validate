# How the validation process works

## The three pieces

**`/api/check` — "is it on the Bazaar?"**
Pages through the CDP Discovery API (14 parallel requests of 1000 items each) and looks for a URL match. Pure lookup, no validation. If found → done. If not → it also collects "domain siblings" (other endpoints on the same hostname) so the UI can say "your domain has 3 indexed endpoints, just not this one."

**`/api/validate` — "why isn't it indexed?"**
The diagnostic step. This is the part with two backends.

**`/api/probe` — Node.js fallback for `/api/validate`.**

## What `/api/validate` actually does

It runs a 3-stage pipeline (`go-validator/main.go:186`):

1. **Preflight** — 17 surface checks: HTTPS? endpoint reachable? returns 402 (not 200/401/403)? valid JSON? `x402Version: 2`? `accepts[0]` has the right scheme/network/USDC asset/amount ≥ $0.001/payTo/timeout? `extensions.bazaar.info.output.example` present? `bazaar.schema` present? These are checks a human can describe — "did you wire it up correctly."

2. **Parse** — hands the raw response body to the official Coinbase x402 Go SDK's `discovery.ParseDiscoveryInfo`. This is the **same parser CDP's indexer uses internally** to ingest endpoints. If the SDK rejects it, CDP will too.

3. **Simulate** — calls the SDK's `discovery.SimulateSubmit`, which replays the facilitator's decision tree and returns one of `processing` / `rejected` / `noop` — i.e. "if CDP scraped you right now, here's what would happen."

The endpoint is `valid: true` only if all 17 preflight checks pass **and** SDK parse succeeds **and** simulate returns `processing`.

## Role of the Go server vs. the Go SDK

- **The Go SDK (`coinbase/x402/go`)** is the load-bearing piece. It's the official x402 implementation. Running validation through it (instead of a hand-rolled checker) is the whole point — your verdict matches CDP's actual behavior, not your interpretation of the spec.
- **The Go server** exists to host that SDK over HTTP so the Next.js app on Vercel can call it. The SDK is Go-only; Vercel runs Node — so Fly.io hosts a tiny Go HTTP wrapper. The server itself doesn't have much logic; it's a transport for the SDK.

## Role of the Node fallback (`/api/probe`)

`/api/validate` first hits Go's `/health` (cached 30s, `app/api/validate/route.ts:241`). If Go is down/timing out, it forwards to `/api/probe` instead. Probe **re-implements the same 17 preflight checks in TypeScript** and uses a TS port of parse/simulate (`lib/discovery-validate`). Same response shape, tagged `source: "node"` with a `fallbackReason`. It's a best-effort mirror — close to the SDK's behavior but not the actual SDK, which is why Go is preferred when available.

The asymmetry: Go gives you the **authoritative** answer (real SDK), Node gives you a **good-enough** answer (port of the SDK) when Go is unreachable. The frontend doesn't branch on which one ran — both produce the same `ValidationResult` shape.
