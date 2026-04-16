# Bazaar Validator

Check if your x402 endpoint is indexed in the [CDP Bazaar](https://docs.cdp.coinbase.com), diagnose what's wrong if it's not, and get step-by-step setup guidance for your stack.

**Live at [bazaar-validate.vercel.app](https://bazaar-validate.vercel.app)**

## What it does

1. **Paste your endpoint URL** — we check the CDP Discovery API to see if you're indexed
2. **If not found** — we probe your endpoint and run 17 validation checks against the x402 v2 spec (HTTPS, 402 status, accepts array, USDC minimum, bazaar extension, discovery metadata, and more)
3. **See exactly what's wrong** — each check shows pass/fail with expected vs actual values
4. **Fix it with the wizard** — pick your stack (Node.js/Go/Python), describe your endpoint, and get copy-paste code matching the [bazaar.md](https://github.com/coinbase/x402) docs

## Architecture

```
Next.js (Vercel)                    Go Server (Fly.io)
┌──────────────────┐                ┌──────────────────┐
│ /api/check       │──► CDP API     │ /validate        │
│ /api/validate ───┼──────────────► │ (17 checks)      │──► user's endpoint
│ /api/probe       │  (fallback)    │ /health           │
└──────────────────┘                └──────────────────┘
```

The Next.js backend proxies validation requests to the Go server. If the Go server is unavailable, it falls back to Node.js-based checks. The frontend shows which backend performed the validation.

## Running locally

```bash
# Next.js app
npm install
npm run dev
```

```bash
# Go validation server (optional — Node.js fallback works without it)
cd go-validator
go run main.go
```

The Go server runs on `:8080` by default. Set `GO_VALIDATOR_URL=http://localhost:8080` in `.env.local` to connect them.

## Validation checks

The Go server (and Node.js fallback) validates:

- URL is HTTPS
- Endpoint returns 402 (not 200, 401, 403)
- Response is JSON (not HTML paywall)
- `x402Version` is 2
- `accepts` array with valid payment methods
- Scheme is `exact` or `upto`
- Network is supported (Base Mainnet / Base Sepolia)
- Asset is USDC at the correct contract address
- Amount meets $0.001 minimum (1000 atomic units)
- `payTo` is a valid address
- `resource` object with URL
- `extensions.bazaar` present with `info.output` and `schema`

## Deployments

| Component | Platform | Config |
|-----------|----------|--------|
| Next.js app | Vercel | Auto-deploys on push to `main` |
| Go server | Fly.io | `cd go-validator && flyctl deploy` |

Set `GO_VALIDATOR_URL` in Vercel env vars to point to the Fly.io URL.

## Project structure

See [ARCHITECTURE.md](./ARCHITECTURE.md) for a full breakdown of every file, data flow, and how the components connect.
