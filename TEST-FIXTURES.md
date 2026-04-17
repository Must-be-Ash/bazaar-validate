# Bazaar Validator — Test Fixtures

Permanent test endpoints for verifying that `bazaar-validate` is working end-to-end. Each URL below is a deliberately-shaped fixture that should drive the validator into a specific result state.

**Validator:** [https://bazaar-validate.vercel.app](https://bazaar-validate.vercel.app)
**Fixtures live at:** [https://test-bazaar.vercel.app](https://test-bazaar.vercel.app)
**Fixtures repo:** [github.com/Must-be-Ash/x402-bazaar-validation-test](https://github.com/Must-be-Ash/x402-bazaar-validation-test)

## How to test

Paste any of the URLs below into the validator's input and click **Validate**. Or click the shareable `?url=...` link directly — the validator auto-runs.

Each fixture lists the expected **result state** and the **key signals** you should see in the result card. If you want the raw structured output, hit the **Copy result** button (top-right of the result card) and compare against the expected output noted below.

---

## Fixture 1 — `never_tried`

**URL:** [`https://test-bazaar.vercel.app/`](https://bazaar-validate.vercel.app/?url=https://test-bazaar.vercel.app/)

A plain Next.js homepage with no x402 setup at all.

**You should see:**
- Header: **"No x402 configuration detected"**
- Copy: mentions the endpoint returned status `200` with no `x402Version` field
- The Setup Wizard auto-opens at step 1
- Validation source badge: green **"Validated with Go SDK"** (hover for SDK version tooltip)

**Why this matters:** confirms the validator can recognize a non-x402 URL and route the user to the onboarding flow instead of the bug-fix flow.

---

## Fixture 2 — `implementation_invalid` (no bazaar extension)

**URL:** [`https://test-bazaar.vercel.app/api/random`](https://bazaar-validate.vercel.app/?url=https://test-bazaar.vercel.app/api/random)

A working x402 v2 endpoint, but with no bazaar extension declared at all.

**You should see:**
- Header: **"Implementation issues found"**
- Failure-summary line: **"1 issue blocking indexing — start with: Bazaar extension present"**
- Tailored CTA button: **"Fix &ldquo;Bazaar extension present&rdquo; →"** (single-failure case)
- 14 ✅ checks, 1 ❌ on `has_bazaar_extension`, 4 ⏸ on the `bazaar.*` checks (skipped because parent is missing)
- Inline FixCard appears under the failed check with a code-snippet excerpt + a "Jump to wizard step 1" button

**Why this matters:** confirms the validator correctly identifies the most common issue (no bazaar extension), surfaces a tailored single-failure CTA, and that the FixCard + wizard deep-link works.

---

## Fixture 3 — `implementation_invalid` (bazaar extension present but missing `info.output`)

**URL:** [`https://test-bazaar.vercel.app/api/half`](https://bazaar-validate.vercel.app/?url=https://test-bazaar.vercel.app/api/half)

The bazaar extension is declared, with `info.input` and `schema`, but no `info.output`.

**You should see:**
- Header: **"Implementation issues found"**
- Failure-summary line: **"1 issue blocking indexing — start with: Output metadata"**
- Tailored CTA: **"Fix &ldquo;Output metadata&rdquo; →"**
- ✅ on `has_bazaar_extension`, `bazaar.info`, `bazaar.schema`
- ❌ on `bazaar.info.output`
- ⏸ on `bazaar.info.output.example` (skipped because parent is missing)
- "Jump to wizard step 3" button on the FixCard opens the wizard at the metadata step

**Why this matters:** confirms the validator distinguishes *different* bazaar-extension failure modes — not just "missing entirely" vs "present" but specifically *which sub-field* is broken — and that each routes to the correct wizard step.

> **Note about parse / simulate:** the SDK's `parse` stage returns `ok: true` and `simulate` returns `processing` for this fixture, because the SDK itself doesn't strictly require `info.output`. Our preflight check is intentionally stricter than the facilitator on this point — that's a dev-tool feature, not a bug.

---

## Fixture 4 — `awaiting_first_payment` (fully valid, never paid)

**URL:** [`https://test-bazaar.vercel.app/api/correct`](https://bazaar-validate.vercel.app/?url=https://test-bazaar.vercel.app/api/correct)

A bazaar extension with everything correct: input, output (with example + schema), and the bazaar JSON schema. The endpoint is on the CDP facilitator, but no payment has been settled through it yet — so it isn't in the discovery index.

**You should see:**
- **Green** dot + Header: **"Implementation looks correct"** (not the warning yellow)
- Body copy mentions: *"endpoint will be indexed after the CDP facilitator processes its first verify+settle"*
- Embedded **First payment helper** with:
  - Network badge in green: **"Base Sepolia (testnet)"** (auto-detected from `accepts[0].network`)
  - Faucet link: `https://faucet.circle.com`
  - Three tabs: `@x402/fetch` / `curl` / `manual`
  - The `@x402/fetch` Node snippet pre-filled with the URL + method `GET` + Sepolia network
  - A button: **"I made the payment — watch for indexing"**
- All 19 checks ✅ when you toggle "Show validation details"

**Why this matters:** confirms the validator distinguishes *correct-but-unindexed* (`awaiting_first_payment`) from *broken* (`implementation_invalid`). The first-payment helper is the primary thing this state exists to surface.

> **Network-aware copy:** the helper reads `accepts[0].network` from the actual response. On Sepolia (this fixture) you see green badge + faucet link. On a Base mainnet endpoint, you'd see a yellow warning badge + "real USDC will be spent" copy + a suggestion to switch to Sepolia for testing.

---

## Fixture 5 — `indexed` (after a real payment)

**Same URL as Fixture 4** once it has been paid at least once via the CDP facilitator.

**To trigger:** click "I made the payment — watch for indexing" on Fixture 4 after running the pre-filled `@x402/fetch` snippet locally with a Sepolia-funded wallet (~$0.001 USDC per call). The helper polls `/api/check` every 10s for up to 5 minutes; it should auto-flip the page to the indexed view within ~30s of a successful settle.

**You should see (post-payment):**
- **Green** dot + Header: **"Found on Bazaar"**
- Resource details: URL, x402 Version, **Last Updated** (e.g. "just now")
- Payment methods card: scheme/network/amount/asset/payTo
- **Quality signals** panel:
  - ✅ Description provided
  - ✅ Output schema present
  - Input schema / dedicated domain / payer count: italicized **"not yet exposed by API"**
- Footer: **"15,XXX total resources indexed in the Bazaar"**

**Why this matters:** confirms the entire end-to-end indexing loop — from "we don't see you yet" to a real settle to auto-poll detection — works.

---

## Operational sanity checks

A few things to spot-check separately:

- **Copy result button** — top-right of every result card; click it and paste somewhere to confirm a structured text dump (URL, state, source, all checks with ✅/❌/⏸ icons) lands on your clipboard.
- **Validation source tooltip** — hover the green "Validated with Go SDK" badge → tooltip shows the exact SDK version (`x402 Go SDK v0.0.0-…`).
- **Fallback badge** — if the Go validator on Fly.io is ever down, the badge turns yellow and reads *"Approximate check — Go server unreachable / timed out / error"* (and the result is still computed via the Node TS-port fallback).
- **Shareable URLs** — every internal link in result panels (merchant siblings, domain siblings, similar endpoints) uses the `?url=…` format; clicking any of them should auto-run validation on the new URL.
- **Rate limiting** — hammer `/api/check` more than 20 times in a minute from the same IP → 429.

---

## Quick reference

| Fixture URL | Expected state | What it exercises |
|---|---|---|
| [`/`](https://bazaar-validate.vercel.app/?url=https://test-bazaar.vercel.app/) | `never_tried` | onboarding flow for non-x402 endpoints |
| [`/api/random`](https://bazaar-validate.vercel.app/?url=https://test-bazaar.vercel.app/api/random) | `implementation_invalid` | "no bazaar extension" failure + tailored single-failure CTA |
| [`/api/half`](https://bazaar-validate.vercel.app/?url=https://test-bazaar.vercel.app/api/half) | `implementation_invalid` | "missing `info.output`" failure + per-check FixCard routing to the correct wizard step |
| [`/api/correct`](https://bazaar-validate.vercel.app/?url=https://test-bazaar.vercel.app/api/correct) | `awaiting_first_payment` | fully valid implementation; surfaces the network-aware First Payment Helper |
| `/api/correct` after payment | `indexed` | end-to-end indexing detection via auto-poll |
