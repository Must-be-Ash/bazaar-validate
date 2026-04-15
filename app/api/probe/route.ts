import { NextRequest, NextResponse } from "next/server";

interface DiagnosticCheck {
  check: string;
  passed: boolean;
  detail: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, method = "GET" } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "URL is required" },
        { status: 400 }
      );
    }

    // Validate URL format
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return NextResponse.json(
        { error: "Invalid URL format" },
        { status: 400 }
      );
    }

    if (parsedUrl.protocol !== "https:") {
      return NextResponse.json(
        { error: "URL must use HTTPS" },
        { status: 400 }
      );
    }

    const validMethods = ["GET", "POST", "PUT", "DELETE"];
    const httpMethod = method.toUpperCase();
    if (!validMethods.includes(httpMethod)) {
      return NextResponse.json(
        { error: "Invalid HTTP method" },
        { status: 400 }
      );
    }

    const diagnostics: DiagnosticCheck[] = [];
    let statusCode = 0;
    let rawHeaders: Record<string, string> = {};
    let rawBody = "";
    let reachable = false;
    let returns402 = false;
    let paymentRequirements: Record<string, unknown> | null = null;
    let hasBazaarExtension = false;
    let bazaarExtensionData: Record<string, unknown> | null = null;
    let x402Version: number | null = null;

    // Probe the endpoint
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(url, {
        method: httpMethod,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
        },
      });

      clearTimeout(timeout);

      reachable = true;
      statusCode = res.status;

      // Capture headers
      res.headers.forEach((value, key) => {
        rawHeaders[key] = value;
      });

      // Capture body
      rawBody = await res.text();

      diagnostics.push({
        check: "endpoint_reachable",
        passed: true,
        detail: `Endpoint responded with status ${statusCode}`,
      });

      // Check for 402 status
      returns402 = statusCode === 402;
      diagnostics.push({
        check: "returns_402",
        passed: returns402,
        detail: returns402
          ? "Endpoint correctly returns HTTP 402 Payment Required"
          : `Endpoint returned HTTP ${statusCode} instead of 402. ${
              statusCode === 200
                ? "The endpoint returns 200 OK — it needs to return 402 for unauthenticated requests to be discoverable."
                : statusCode === 401 || statusCode === 403
                  ? "Auth middleware may be running before x402 middleware. The endpoint must return 402 to unauthenticated requests."
                  : "The endpoint must return 402 Payment Required for x402 discovery to work."
            }`,
      });

      // Parse body as JSON and check for v2 payment requirements
      if (returns402) {
        try {
          const parsed = JSON.parse(rawBody);

          // x402 v2 response: { x402Version: 2, accepts: [...], extensions: {...}, resource: {...} }
          x402Version = parsed.x402Version as number | null;

          const isV2 = x402Version === 2;
          const accepts = parsed.accepts as Record<string, unknown>[] | undefined;
          const hasValidPR = isV2 && Array.isArray(accepts) && accepts.length > 0;

          if (hasValidPR) {
            paymentRequirements = parsed;
          }

          diagnostics.push({
            check: "valid_payment_requirements",
            passed: hasValidPR,
            detail: hasValidPR
              ? `Valid x402 v2 payment requirements found with ${accepts!.length} payment method(s)`
              : !isV2
                ? `Response has x402Version ${x402Version ?? "missing"} — this tool validates v2 endpoints only. Expected x402Version: 2.`
                : "Response body does not contain a valid v2 accepts array. Expected JSON with { x402Version: 2, accepts: [...] }.",
          });

          // Check for bazaar extension — v2 has extensions at top level
          const extensions = parsed.extensions as Record<string, unknown> | undefined;
          if (extensions && typeof extensions === "object") {
            const bazaar = extensions.bazaar as Record<string, unknown> | undefined;
            if (bazaar) {
              hasBazaarExtension = true;
              bazaarExtensionData = bazaar;
            }
          }

          diagnostics.push({
            check: "has_bazaar_extension",
            passed: hasBazaarExtension,
            detail: hasBazaarExtension
              ? "Bazaar extension found in response"
              : "No bazaar extension found. Add a bazaar extension under the top-level extensions object to enable discovery.",
          });

          // Check for discovery metadata — v2 bazaar extension: { info: { output: { ... } }, schema: { ... } }
          let hasDiscoveryMetadata = false;
          if (hasBazaarExtension && bazaarExtensionData) {
            const bd = bazaarExtensionData;
            const info = bd.info as Record<string, unknown> | undefined;
            hasDiscoveryMetadata = !!(info?.output || info?.input);
          }

          diagnostics.push({
            check: "has_discovery_metadata",
            passed: hasDiscoveryMetadata,
            detail: hasDiscoveryMetadata
              ? "Discovery metadata found in bazaar extension info"
              : "No discovery metadata found. Add info.output (and optionally info.input) to your bazaar extension for discoverability.",
          });

          // Check output schema validity — v2: extensions.bazaar.schema
          let hasValidOutputSchema = false;
          if (hasBazaarExtension && bazaarExtensionData) {
            const bd = bazaarExtensionData;
            if (bd.schema && typeof bd.schema === "object") {
              hasValidOutputSchema = true;
            }
          }

          diagnostics.push({
            check: "valid_output_schema",
            passed: hasValidOutputSchema,
            detail: hasValidOutputSchema
              ? "Valid output schema found in bazaar extension"
              : "No valid output schema found. Define an output schema to help consumers understand your endpoint's response format.",
          });
        } catch {
          diagnostics.push({
            check: "valid_payment_requirements",
            passed: false,
            detail:
              "Response body is not valid JSON. x402 payment requirements must be returned as JSON.",
          });
          diagnostics.push({
            check: "has_bazaar_extension",
            passed: false,
            detail: "Cannot check for bazaar extension — response is not valid JSON.",
          });
          diagnostics.push({
            check: "has_discovery_metadata",
            passed: false,
            detail: "Cannot check for discovery metadata — response is not valid JSON.",
          });
          diagnostics.push({
            check: "valid_output_schema",
            passed: false,
            detail: "Cannot check for output schema — response is not valid JSON.",
          });
        }
      } else {
        // Not a 402 — skip further checks but note them
        diagnostics.push({
          check: "valid_payment_requirements",
          passed: false,
          detail: "Skipped — endpoint did not return 402.",
        });
        diagnostics.push({
          check: "has_bazaar_extension",
          passed: false,
          detail: "Skipped — endpoint did not return 402.",
        });
        diagnostics.push({
          check: "has_discovery_metadata",
          passed: false,
          detail: "Skipped — endpoint did not return 402.",
        });
        diagnostics.push({
          check: "valid_output_schema",
          passed: false,
          detail: "Skipped — endpoint did not return 402.",
        });
      }
    } catch (error) {
      reachable = false;
      const message =
        error instanceof Error ? error.message : "Unknown error";
      const isTimeout =
        message.includes("abort") || message.includes("timeout");

      diagnostics.push({
        check: "endpoint_reachable",
        passed: false,
        detail: isTimeout
          ? "Endpoint timed out after 10 seconds. Ensure the endpoint is publicly accessible."
          : `Could not reach endpoint: ${message}`,
      });
      diagnostics.push({
        check: "returns_402",
        passed: false,
        detail: "Skipped — endpoint is not reachable.",
      });
      diagnostics.push({
        check: "valid_payment_requirements",
        passed: false,
        detail: "Skipped — endpoint is not reachable.",
      });
      diagnostics.push({
        check: "has_bazaar_extension",
        passed: false,
        detail: "Skipped — endpoint is not reachable.",
      });
      diagnostics.push({
        check: "has_discovery_metadata",
        passed: false,
        detail: "Skipped — endpoint is not reachable.",
      });
      diagnostics.push({
        check: "valid_output_schema",
        passed: false,
        detail: "Skipped — endpoint is not reachable.",
      });
    }

    return NextResponse.json({
      reachable,
      statusCode,
      returns402,
      paymentRequirements,
      hasBazaarExtension,
      bazaarExtensionData,
      x402Version,
      rawHeaders,
      rawBody,
      diagnostics,
    });
  } catch (error) {
    console.error("Probe route error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
