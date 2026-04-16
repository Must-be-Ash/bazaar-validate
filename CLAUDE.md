# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm install            # install dependencies
npm run dev            # start Next.js dev server (localhost:3000)
npm run build          # production build
npm run lint           # ESLint check

# Go validation server (optional — Node.js fallback works without it)
cd go-validator && go run main.go   # starts on :8080

# Deploy Go server to Fly.io
cd go-validator && flyctl deploy
```

No test suite is configured.

## Environment Variables

- `GO_VALIDATOR_URL` — URL of the Go validation server. Set to `http://localhost:8080` locally (in `.env.local`), or `https://bazaar-go-validator.fly.dev` on Vercel.

## Architecture

This is a validation tool for x402 v2 payment endpoints. It checks whether an endpoint is indexed in the CDP Bazaar and diagnoses issues if not.

**Two deployments:**
- **Next.js frontend + API routes** on Vercel (`app/` directory, App Router)
- **Go validation server** on Fly.io (`go-validator/`)

**Core flow:**
1. `POST /api/check` — looks up endpoint in CDP Discovery API (14 concurrent paginated requests)
2. `POST /api/validate` — proxies to Go server for 17 validation checks; falls back to `POST /api/probe` (Node.js) if Go is unreachable
3. Frontend orchestrates: `idle → checking → probing → done`

**Key directories:**
- `app/api/` — three API routes: `check`, `validate`, `probe`
- `components/wizard/` — 5-step setup wizard that generates code for Node.js/Go/Python stacks
- `lib/code-templates.ts` — code generation templates for all 3 stacks
- `lib/diagnostics.ts` — TypeScript types for validation results (`ProbeResult`, `CheckResult`)
- `lib/schemas.ts` — JSON Schema inference from user-provided examples
- `lib/rate-limit.ts` — in-memory IP-based rate limiting (20 req/min)

**Go server** (`go-validator/main.go`) runs the same 17 validation checks as the Node.js fallback. Both must stay in sync when adding/changing checks.

## x402 Validation Checks (17)

Both Go and Node.js backends validate: HTTPS URL, endpoint reachable, returns 402 (not 200/401/403), valid JSON, `x402Version: 2`, non-empty `accepts` array, scheme is `exact` or `upto`, supported network (Base Mainnet/Sepolia), USDC contract address, amount ≥ 1000 atomic units ($0.001), valid `payTo` address, `maxTimeoutSeconds` present, `resource` with URL, `extensions.bazaar` present, `bazaar.info` block, `bazaar.info.output` with example, `bazaar.schema` present.

## External APIs

- **CDP Discovery API** (no auth): `https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources`
- **CDP Facilitator** (referenced in code templates): `https://api.cdp.coinbase.com/platform/v2/x402/facilitator`
