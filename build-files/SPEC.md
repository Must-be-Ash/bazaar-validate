# Bazaar Validator — Technical Specification

## Objective

Build a web app that helps x402 endpoint operators (sellers) verify whether their endpoint is indexed in the Bazaar and, if not, diagnose why and guide them through fixing their implementation.

### The Problem

Users building x402-enabled endpoints consistently struggle to get indexed in the Bazaar. There is no way to confirm it worked, and when it doesn't work there's no way to figure out what went wrong. A user summarized it well:

> "you guys should make a UI site so we can confirm it worked! every time we've added bazaar support it's broken our x402 support"

### The Solution

A single-page Next.js web app with two core flows:

1. **Validate** — User pastes their endpoint URL. We check the CDP Bazaar discovery API to see if they're indexed. If they are, show their listing. If not, probe their endpoint to diagnose exactly what's wrong.
2. **Fix / Get Indexed** — An interactive wizard that walks them through adding Bazaar support based on their stack (Node.js Express, Go Gin, or Python FastAPI), with tailored code snippets and a diagnostic checklist.

---

## Scope

- **v2 x402 endpoints only** — this tool targets the current x402 v2 protocol
- **CDP facilitator only** — validation checks against `https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources`
- **Existing x402 endpoints** — the user already has a working x402 endpoint and wants to add Bazaar discoverability or debug why it's not showing up
- **CDP production facilitator** in generated code examples

---

## Architecture

```
┌─────────────────────────────────────────────┐
│              Next.js App (App Router)        │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │        Single Page Frontend          │    │
│  │                                      │    │
│  │  [URL Input] → [Results/Diagnostics] │    │
│  │              → [Setup Wizard]        │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │        API Routes (Backend)          │    │
│  │                                      │    │
│  │  POST /api/check    — search bazaar  │    │
│  │  POST /api/probe    — ping endpoint  │    │
│  └──────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
         │                      │
         ▼                      ▼
  CDP Discovery API      User's Endpoint
```

**No database. No auth. No external services beyond CDP discovery API and the user's own endpoint.**

---

## Tech Stack

- **Framework**: Next.js (App Router)
- **Styling**: Tailwind CSS v4
- **UI Components**: Custom components ported from x402splits (GlowButton, ShimmerButton, PixelTrail, GooeyFilter)
- **Design**: Dark theme, monospace aesthetic (Geist Mono), consistent with x402splits branding
- **Utilities**: `clsx` + `tailwind-merge` for class merging

---

## Implementation Checklist

### Phase 1: Project Setup

- [x] **1.1** Initialize Next.js project with App Router (`npx create-next-app@latest --app`)
- [x] **1.2** Configure Tailwind CSS v4 with PostCSS
- [x] **1.3** Set up global styles (`globals.css`) — copy CSS variables and theme from x402splits
  - Background: `#111111`, foreground: `#fafafa`, card: `#1a1a1a`, border: `#333333`, muted: `#242424`, muted-foreground: `#a0a0a0`, success: `#4ade80`
- [x] **1.4** Set up fonts — Geist Mono (primary), Jersey 25 (display title)
- [x] **1.5** Port reusable components from x402splits:
  - [x] `components/ui/glow-button.tsx` (primary CTA button with gradient glow)
  - [x] `components/ui/shimmer-button.tsx` (secondary button with shimmer hover)
  - [x] `components/ui/pixel-trail.tsx` (animated background)
  - [x] `components/ui/gooey-filter.tsx` (SVG blur effect for pixel trail)
  - [x] `lib/utils.ts` (`cn()` utility)
  - [x] `hooks/use-screen-size.ts` (responsive breakpoint helper)
  - [x] `hooks/use-debounced-dimensions.ts` (element sizing for pixel trail)
- [x] **1.6** Install required dependencies: `framer-motion`, `clsx`, `tailwind-merge`

### Phase 2: API Routes (Backend)

- [x] **2.1** `POST /api/check` — Bazaar lookup route
  - **Input**: `{ url: string }`
  - **Logic**:
    1. Query CDP discovery API: `GET https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources` with pagination
    2. Search results for a matching `resource` URL (exact match and partial/domain match)
    3. Return match status and full resource data if found
  - **Output**:
    ```json
    {
      "found": true|false,
      "resource": { ...full resource object from discovery API } | null,
      "totalIndexed": number
    }
    ```

- [x] **2.2** `POST /api/probe` — Endpoint probe route
  - **Input**: `{ url: string, method?: string }`
  - **Logic**:
    1. Validate URL format (must be https)
    2. Send a request to the user's endpoint URL (default GET, configurable method)
    3. Capture the full response: status code, headers, body
    4. Parse and analyze the response for x402 compliance
  - **Output**:
    ```json
    {
      "reachable": true|false,
      "statusCode": number,
      "returns402": true|false,
      "paymentRequirements": { ...parsed from response body } | null,
      "hasBazaarExtension": true|false,
      "bazaarExtensionData": { ...extension data } | null,
      "x402Version": number|null,
      "rawHeaders": { ... },
      "rawBody": string,
      "diagnostics": [
        { "check": "endpoint_reachable", "passed": true|false, "detail": "..." },
        { "check": "returns_402", "passed": true|false, "detail": "..." },
        { "check": "valid_payment_requirements", "passed": true|false, "detail": "..." },
        { "check": "has_bazaar_extension", "passed": true|false, "detail": "..." },
        { "check": "has_discovery_metadata", "passed": true|false, "detail": "..." },
        { "check": "valid_output_schema", "passed": true|false, "detail": "..." }
      ]
    }
    ```

- [x] **2.3** Input validation & error handling for both routes
  - URL must be a valid HTTPS URL
  - Timeout on probe requests (10 second max)
  - Rate limiting consideration (basic, no heavy infra)
  - Graceful handling of unreachable endpoints, non-JSON responses, timeouts

### Phase 3: Frontend — Validation Flow

- [x] **3.1** Page layout — single page with header, main content, footer
  - Title: "Bazaar Validator" (or similar) in Jersey 25 display font
  - Subtitle explaining what this tool does
  - PixelTrail animated background behind content
  - Centered content card on dark background

- [x] **3.2** URL input section
  - Text input for endpoint URL (e.g., `https://api.example.com/weather`)
  - HTTP method selector (GET, POST, PUT, DELETE) — defaults to GET
  - "Validate" GlowButton to trigger the check
  - Loading state while checking

- [x] **3.3** Results display — "Found on Bazaar" state
  - Green success indicator
  - Show resource details from discovery API:
    - Resource URL
    - x402 version
    - Payment methods accepted (scheme, network, amount, asset)
    - Last updated timestamp
    - Metadata (description, input/output schemas if present)
    - Quality signals info

- [x] **3.4** Results display — "Not Found on Bazaar" state
  - Amber/yellow indicator
  - Automatic transition to probe diagnostics
  - Show probe results as a diagnostic checklist:
    - ✅/❌ Endpoint is reachable
    - ✅/❌ Returns HTTP 402 (not 200, 401, 403, etc.)
    - ✅/❌ Response contains valid x402 v2 payment requirements
    - ✅/❌ Payment requirements include Bazaar extension
    - ✅/❌ Bazaar extension contains discovery metadata (input/output schemas)
    - ⚠️ At least one successful transaction required (always show as informational — we can't verify this)
  - For each failed check, show:
    - What went wrong (clear explanation)
    - What they need to fix
    - Link/button to jump to the relevant wizard step
  - Expandable section showing raw response data (status, headers, body) for debugging

- [x] **3.5** Results display — "Auth-gated / Not returning 402" state
  - Specific messaging when endpoint returns 200 or 401/403 instead of 402
  - Explanation that the endpoint must return 402 to unauthenticated requests for indexing to work
  - Common pitfall callout: if auth middleware runs before x402 middleware, the endpoint won't return 402

- [x] **3.6** Results display — Error states
  - Endpoint unreachable (DNS failure, timeout, connection refused)
  - Invalid URL format
  - Non-HTTPS URL warning

### Phase 4: Frontend — Interactive Setup Wizard

- [x] **4.1** Wizard entry point
  - Accessible from: "Not Found" results (CTA button), or standalone via tab/section
  - Contextual: if we already probed and know what's wrong, pre-select the relevant steps

- [x] **4.2** Step 1: Select your stack
  - Three options with icons/logos:
    - **Node.js (Express)** — `@x402/extensions` package
    - **Go (Gin)** — `github.com/coinbase/x402/go/extensions/bazaar` package
    - **Python (FastAPI)** — `x402[fastapi]` package
  - Each shows the install command for the extension package

- [x] **4.3** Step 2: Describe your endpoint
  - HTTP method (GET, POST, PUT, DELETE)
  - Endpoint path (e.g., `/weather`)
  - Brief description of what it does (used to generate semantic description)
  - Price (e.g., `$0.001`)
  - Network (dropdown: Base Mainnet `eip155:8453`, Base Sepolia `eip155:84532`, etc.)
  - PayTo address (their wallet address)

- [x] **4.4** Step 3: Define discovery metadata
  - Output example (JSON editor/textarea — what the endpoint returns)
  - Output schema (auto-generated from example, editable)
  - Input example (optional — for endpoints that take query params or body)
  - Input schema (optional, auto-generated from example)
  - Body type toggle (for POST endpoints: `json`, `text`, `binary`)

- [x] **4.5** Step 4: Generated code
  - Show complete, copy-pasteable code for their selected stack
  - Code is pre-filled with their endpoint details from steps 2-3
  - Syntax-highlighted code block with copy button
  - Stack-specific code:
    - **Node.js**: Import `bazaarResourceServerExtension` and `declareDiscoveryExtension` from `@x402/extensions/bazaar`, register extension, add to route config with CDP facilitator
    - **Go**: Import `bazaar` and `types` packages, call `DeclareDiscoveryExtension()`, add to routes config with CDP facilitator
    - **Python**: Add `extensions` dict with bazaar info block to `RouteConfig`, add `description` and `mime_type` fields with CDP facilitator
  - Uses CDP production facilitator URL: `https://api.cdp.coinbase.com/platform/v2/x402/facilitator`

- [x] **4.6** Step 5: Post-deployment checklist
  - Reminder that the endpoint needs at least **one successful transaction** before it appears in the Bazaar
  - Explanation of how to trigger that first transaction (use x402 client, make a paid request)
  - Quick code snippet showing how to make a test payment to their own endpoint
  - Link back to the validator: "After your first transaction, come back and validate again"
  - Note about auth-gating: endpoint must return 402 to unauthenticated requests

- [x] **4.7** Wizard navigation
  - Step indicator (1/5, 2/5, etc.) with progress bar
  - Back/Next buttons
  - Ability to jump to any completed step
  - Persist wizard state in component state (no need for URL params or storage)

### Phase 5: UX Polish

- [x] **5.1** Loading states
  - Skeleton/shimmer loading while checking discovery API
  - Animated progress indicator while probing endpoint
  - Sequential feedback: "Checking Bazaar..." → "Probing endpoint..." → "Analyzing response..."

- [x] **5.2** Responsive design
  - Mobile-friendly layout (stacked on small screens)
  - Code blocks horizontally scrollable on mobile
  - Use `useScreenSize` hook for responsive breakpoints

- [x] **5.3** Copy-to-clipboard
  - Copy button on all code snippets
  - Copy button on install commands
  - Visual feedback on copy (checkmark animation)

- [x] **5.4** Error boundaries
  - Graceful error handling for API failures
  - User-friendly error messages (not raw stack traces)

- [x] **5.5** Transitions & animations
  - Framer Motion for section transitions (results appearing, wizard steps)
  - Smooth scroll to results after validation
  - Diagnostic checks appearing one-by-one (staggered animation)

### Phase 6: Common Pitfalls & Help Content

- [x] **6.1** Pitfalls reference content (displayed contextually based on diagnostic results)
  - **Auth middleware ordering**: If auth runs before x402 middleware, endpoint returns 401/403 instead of 402
  - **Missing bazaar extension registration**: `server.registerExtension(bazaarResourceServerExtension)` must be called
  - **Missing discovery metadata**: Route config must include `declareDiscoveryExtension()` in extensions
  - **No successful transaction**: Endpoint won't appear until at least one payment is processed through the facilitator
  - **Wrong facilitator**: If using x402.org testnet facilitator, endpoint won't appear on CDP discovery (and vice versa)
  - **Endpoint returns 200**: Endpoint must require payment (return 402) for unauthenticated requests

- [x] **6.2** FAQ section at bottom of page
  - "Why isn't my endpoint showing up?"
  - "How long after my first transaction until I appear?"
  - "Do I need to use the CDP facilitator?"
  - "Can I test on testnet first?"

---

## Key Implementation Notes

### Discovery API Integration

The CDP discovery endpoint is publicly accessible — no API key required:
```
GET https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources
```

For checking a specific endpoint, we can search by URL. The API supports `query` for semantic search and direct filtering. To find a specific resource, we should:
1. Try the `query` parameter with the full URL
2. Also paginate through results and do exact URL matching on `resource` field

### Merchant Discovery Endpoint

Can also look up by payTo address (not primary flow but useful):
```
GET https://api.cdp.coinbase.com/platform/v2/x402/discovery/merchant?payTo=<address>
```

### Endpoint Probing

When probing a user's endpoint, we expect a proper x402 v2 response:
- **Status**: `402 Payment Required`
- **Body**: JSON containing payment requirements with `x402Version: 2`
- **Bazaar extension**: Present under `extensions.bazaar` in the payment requirements

The probe should capture and display:
- Full HTTP status code
- Response headers (look for x402-related headers)
- Response body (parse as JSON, show structured + raw)
- Whether the bazaar extension block is present and well-formed

### Code Generation

Generated code must use the CDP production facilitator:
```
https://api.cdp.coinbase.com/platform/v2/x402/facilitator
```

Template variables to fill in from wizard inputs:
- `{{METHOD}}` — HTTP method
- `{{PATH}}` — endpoint path
- `{{PRICE}}` — price string
- `{{NETWORK}}` — network identifier
- `{{PAY_TO}}` — wallet address
- `{{OUTPUT_EXAMPLE}}` — JSON output example
- `{{OUTPUT_SCHEMA}}` — JSON Schema for output
- `{{INPUT_EXAMPLE}}` — JSON input example (optional)
- `{{INPUT_SCHEMA}}` — JSON Schema for input (optional)
- `{{DESCRIPTION}}` — endpoint description

---

## File Structure

```
bazaar-validate/
├── app/
│   ├── layout.tsx              # Root layout (fonts, metadata)
│   ├── page.tsx                # Single page (all UI)
│   ├── globals.css             # Theme variables, base styles
│   └── api/
│       ├── check/
│       │   └── route.ts        # POST /api/check — Bazaar lookup
│       └── probe/
│           └── route.ts        # POST /api/probe — Endpoint probe
├── components/
│   ├── ui/
│   │   ├── glow-button.tsx     # Primary CTA button (from x402splits)
│   │   ├── shimmer-button.tsx  # Secondary button (from x402splits)
│   │   ├── pixel-trail.tsx     # Animated background (from x402splits)
│   │   └── gooey-filter.tsx    # SVG filter effect (from x402splits)
│   ├── url-input.tsx           # URL input + method selector + validate button
│   ├── results-found.tsx       # "Found on Bazaar" display
│   ├── results-not-found.tsx   # "Not Found" + diagnostics display
│   ├── diagnostic-checklist.tsx # Individual check items with pass/fail
│   ├── raw-response-viewer.tsx # Expandable raw response data
│   ├── wizard/
│   │   ├── wizard-container.tsx # Wizard wrapper with step navigation
│   │   ├── step-stack.tsx      # Step 1: Pick your stack
│   │   ├── step-endpoint.tsx   # Step 2: Describe your endpoint
│   │   ├── step-metadata.tsx   # Step 3: Define discovery metadata
│   │   ├── step-code.tsx       # Step 4: Generated code
│   │   └── step-deploy.tsx     # Step 5: Post-deployment checklist
│   └── faq.tsx                 # FAQ section
├── lib/
│   ├── utils.ts                # cn() utility (from x402splits)
│   ├── code-templates.ts       # Code generation templates per stack
│   ├── diagnostics.ts          # Diagnostic check logic & types
│   └── schemas.ts              # Auto-generate JSON Schema from example JSON
├── hooks/
│   ├── use-screen-size.ts      # Responsive helper (from x402splits)
│   └── use-debounced-dimensions.ts # Element sizing (from x402splits)
├── public/
├── package.json
├── tsconfig.json
├── postcss.config.mjs
└── next.config.ts
```

---

## Dependencies

```json
{
  "dependencies": {
    "next": "latest",
    "react": "^19",
    "react-dom": "^19",
    "framer-motion": "^11",
    "clsx": "^2",
    "tailwind-merge": "^2"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "tailwindcss": "^4",
    "typescript": "^5",
    "@types/node": "^22",
    "@types/react": "^19",
    "@types/react-dom": "^19"
  }
}
```

---

## User Flow Summary

```
User visits site
    │
    ▼
Enters endpoint URL + selects HTTP method
    │
    ▼
Clicks "Validate"
    │
    ├── Step 1: Check CDP Discovery API
    │       │
    │       ├── FOUND → Show listing details (resource info, payment methods,
    │       │            metadata, quality signals) ✅
    │       │
    │       └── NOT FOUND → Continue to Step 2
    │
    ├── Step 2: Probe the endpoint
    │       │
    │       ▼
    │   Show diagnostic results:
    │       ├── ✅/❌ Endpoint reachable
    │       ├── ✅/❌ Returns 402
    │       ├── ✅/❌ Valid payment requirements
    │       ├── ✅/❌ Has bazaar extension
    │       ├── ✅/❌ Has discovery metadata
    │       └── ⚠️  Needs first transaction (informational)
    │
    │   For each failure → explain what's wrong + link to wizard step
    │
    └── CTA: "Fix with Setup Wizard" or "Get Indexed"
                │
                ▼
        Interactive Wizard:
            Step 1: Pick stack (Express / Gin / FastAPI)
            Step 2: Describe endpoint (method, path, price, network, payTo)
            Step 3: Define output/input examples & schemas
            Step 4: Copy generated code for your stack
            Step 5: Deploy + make first transaction + re-validate
```
