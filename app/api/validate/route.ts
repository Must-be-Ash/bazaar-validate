import { NextRequest, NextResponse } from "next/server";
import { isRateLimited } from "@/lib/rate-limit";
import type { ValidationResult, FallbackReason } from "@/lib/diagnostics";
import type { ValidateRequest, ValidateResponse } from "@/lib/api-contract";
import { logApi, hostnameOf } from "@/lib/api-log";

const GO_VALIDATOR_URL = process.env.GO_VALIDATOR_URL || "http://localhost:8080";

interface GoCheck {
  check: string;
  passed: boolean;
  detail: string;
  expected?: string;
  actual?: string;
}

interface GoStage {
  ok: boolean;
  error?: string;
}

interface GoSimulate {
  outcome: "processing" | "rejected" | "noop";
  rejectedReason?: string;
  workflowIdHint?: string;
}

interface GoMeta {
  sdkVersion?: string;
  validatorVersion?: string;
}

interface GoValidateResponse {
  valid: boolean;
  preflight: GoCheck[];
  parse: GoStage;
  simulate: GoSimulate;
  raw: { statusCode: number; headers: Record<string, string>; body: string };
  meta: GoMeta;
}

// Adapt the Go server's three-stage response into the canonical ValidationResult
// shape so the frontend never branches on `source`.
function fromGoResponse(go: GoValidateResponse): ValidationResult {
  const preflight = go.preflight ?? [];
  const get = (id: string) => preflight.find((c) => c.check === id);
  const reachable = !!get("endpoint_reachable")?.passed;
  const returns402 = !!get("returns_402")?.passed;
  const hasBazaarExtension = !!get("has_bazaar_extension")?.passed;
  const x402v = get("x402_version");
  const x402Version = x402v?.passed ? 2 : null;

  const diagnostics = preflight.map((c) => ({
    check: c.check,
    passed: c.passed,
    detail:
      c.detail +
      (c.expected && !c.passed ? ` (expected: ${c.expected}, got: ${c.actual})` : ""),
  }));

  // Extract the parsed paymentRequirements from the v2 `payment-required`
  // header (preferred) or the body (v1 / direct-body endpoints). Lets
  // downstream UI (FirstPaymentHelper, wizard pre-fill) read accepts[0].
  const headers = go.raw?.headers ?? {};
  const body = go.raw?.body ?? "";
  const paymentRequirements = extractPaymentRequirements(headers, body);
  const bazaarExtensionData = extractBazaarExtensionData(paymentRequirements);

  return {
    source: "go",
    reachable,
    statusCode: go.raw?.statusCode ?? 0,
    returns402,
    paymentRequirements,
    hasBazaarExtension,
    bazaarExtensionData,
    x402Version,
    rawHeaders: headers,
    rawBody: body,
    diagnostics,
    preflight: diagnostics,
    parse: { ok: !!go.parse?.ok, error: go.parse?.error },
    simulate: {
      outcome: (go.simulate?.outcome ?? "noop") as
        | "processing"
        | "rejected"
        | "noop",
      rejectedReason: go.simulate?.rejectedReason,
      workflowIdHint: go.simulate?.workflowIdHint,
    },
    meta: {
      sdkVersion: go.meta?.sdkVersion,
      validatorVersion: go.meta?.validatorVersion,
    },
  };
}

// extractPaymentRequirements decodes the v2 `payment-required` header (base64
// JSON) if present, else parses the response body. Returns null if neither
// yields a valid object. Mirrors the precedence in go-validator/main.go and
// app/api/probe/route.ts.
function extractPaymentRequirements(
  headers: Record<string, string>,
  body: string,
): Record<string, unknown> | null {
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === "payment-required") {
      try {
        const decoded = Buffer.from(v, "base64").toString("utf8");
        const parsed = JSON.parse(decoded);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        // fall through to body
      }
    }
  }
  if (body) {
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

function extractBazaarExtensionData(
  pr: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!pr) return null;
  const ext = pr.extensions;
  if (!ext || typeof ext !== "object") return null;
  const bazaar = (ext as Record<string, unknown>).bazaar;
  if (!bazaar || typeof bazaar !== "object") return null;
  return bazaar as Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (isRateLimited(ip)) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a moment." },
        { status: 429 }
      );
    }

    const body = (await req.json()) as Partial<ValidateRequest>;
    const { url, method = "GET" } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "URL is required" },
        { status: 400 }
      );
    }

    // Check if Go backend is available
    const health = await checkGoHealth();

    if (health.ok) {
      const goRes = await fetch(`${GO_VALIDATOR_URL}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, method }),
      });

      if (!goRes.ok) {
        const err = await goRes.text();
        return NextResponse.json(
          { error: `Go validator returned ${goRes.status}: ${err}` },
          { status: 502 }
        );
      }

      const goJson = (await goRes.json()) as GoValidateResponse;
      const result: ValidateResponse = fromGoResponse(goJson);
      logApi({
        route: "/api/validate",
        url,
        method,
        hostname: hostnameOf(url),
        status: 200,
        durationMs: Date.now() - startedAt,
        source: "go",
        valid: goJson.valid,
        simulateOutcome: goJson.simulate?.outcome,
      });
      return NextResponse.json(result);
    }

    // Fallback: Node probe. Adapt its existing ProbeResult shape into ValidationResult
    // by tagging source/fallbackReason.
    const probeRes = await fetch(new URL("/api/probe", req.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, method }),
    });

    const probeJson = await probeRes.json();
    const result: ValidateResponse = {
      ...(probeJson as ValidationResult),
      source: "node",
      fallbackReason: health.reason,
    };
    logApi({
      route: "/api/validate",
      url,
      method,
      hostname: hostnameOf(url),
      status: 200,
      durationMs: Date.now() - startedAt,
      source: "node",
      fallbackReason: health.reason,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Validate route error:", error);
    logApi({
      route: "/api/validate",
      durationMs: Date.now() - startedAt,
      status: 500,
      err: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Cache Go health for 30s (stale-on-error). Avoids paying ~2s per /api/validate
// call for the health probe when the Go server is healthy. Module-scoped so it
// persists across requests within the same Next.js process.
const HEALTH_CACHE_MS = 30_000;
let healthCache: { ok: boolean; reason: FallbackReason; cachedAt: number } | null =
  null;

async function checkGoHealth(): Promise<{ ok: boolean; reason: FallbackReason }> {
  const now = Date.now();
  if (healthCache && now - healthCache.cachedAt < HEALTH_CACHE_MS) {
    return { ok: healthCache.ok, reason: healthCache.reason };
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${GO_VALIDATOR_URL}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const result = res.ok
      ? { ok: true, reason: null as FallbackReason }
      : { ok: false, reason: "go_error" as FallbackReason };
    healthCache = { ...result, cachedAt: now };
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    const reason: FallbackReason =
      msg.includes("abort") || msg.includes("timeout")
        ? "go_timeout"
        : "go_unreachable";
    const result = { ok: false, reason };
    // Stale-on-error: keep returning failure for the cache window so we don't
    // hammer the Go server when it's down.
    healthCache = { ...result, cachedAt: now };
    return result;
  }
}
