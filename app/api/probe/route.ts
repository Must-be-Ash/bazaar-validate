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

    // Localhost detection
    const hostname = parsedUrl.hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
      return NextResponse.json(
        {
          error: "Cannot reach localhost from our server. Expose your endpoint with: ngrok http <port>",
        },
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

      // Check for HTML paywall instead of JSON
      const contentType = res.headers.get("content-type") || "";
      if (returns402 && contentType.includes("text/html")) {
        diagnostics.push({
          check: "valid_payment_requirements",
          passed: false,
          detail: "Endpoint returned HTML instead of JSON. The 402 response must be JSON with x402 payment requirements, not an HTML paywall page. Check that your x402 middleware is sending JSON responses.",
        });
        // Skip further checks — can't parse HTML as payment requirements
        return NextResponse.json({
          reachable, statusCode, returns402, paymentRequirements,
          hasBazaarExtension, bazaarExtensionData, x402Version,
          rawHeaders, rawBody, diagnostics,
        });
      }

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

          // Detect v1 patterns
          if (!isV2) {
            if (parsed.paymentRequirements) {
              diagnostics.push({
                check: "valid_payment_requirements",
                passed: false,
                detail: "Response uses paymentRequirements (v1 pattern). v2 uses top-level accepts array. Upgrade to v2.",
              });
            } else if (x402Version === 1) {
              diagnostics.push({
                check: "valid_payment_requirements",
                passed: false,
                detail: "x402Version is 1 — this tool validates v2 endpoints only. Upgrade your x402 middleware to v2.",
              });
            } else {
              diagnostics.push({
                check: "valid_payment_requirements",
                passed: false,
                detail: `x402Version is ${x402Version ?? "missing"} — expected 2.`,
              });
            }
          } else {
            diagnostics.push({
              check: "valid_payment_requirements",
              passed: hasValidPR,
              detail: hasValidPR
                ? `Valid x402 v2 payment requirements with ${accepts!.length} payment method(s)`
                : "Missing or empty accepts array in v2 response.",
            });
          }

          // Validate accepts items (USDC, price, scheme, etc.)
          if (hasValidPR && accepts) {
            const USDC_ADDRESSES: Record<string, string> = {
              "eip155:8453": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
              "eip155:84532": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
              "base": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
              "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
            };

            const first = accepts[0] as Record<string, unknown>;
            const scheme = first.scheme as string;
            const network = first.network as string;
            const amount = first.amount as string;
            const asset = first.asset as string;
            const payTo = first.payTo as string;

            // Scheme check
            const validScheme = scheme === "exact" || scheme === "upto";
            diagnostics.push({
              check: "scheme_valid",
              passed: validScheme,
              detail: validScheme
                ? `Scheme is "${scheme}"`
                : `Scheme is "${scheme}" — must be "exact" or "upto"`,
            });

            // Detect v1 amount field
            if (!amount && first.maxAmountRequired) {
              diagnostics.push({
                check: "amount_valid",
                passed: false,
                detail: 'Found maxAmountRequired (v1 field name). v2 uses "amount".',
              });
            } else {
              const amountNum = parseInt(amount || "0", 10);
              diagnostics.push({
                check: "amount_valid",
                passed: amountNum >= 1000,
                detail: amountNum >= 1000
                  ? `Amount ${amount} meets $0.001 USDC minimum`
                  : `Amount ${amount || "missing"} is below $0.001 minimum (1000 atomic units)`,
              });
            }

            // Network check
            const knownNetwork = network in USDC_ADDRESSES;
            diagnostics.push({
              check: "network_supported",
              passed: knownNetwork,
              detail: knownNetwork
                ? `Network ${network} is supported`
                : `Network "${network}" is not a supported network`,
            });

            // Asset is USDC
            const expectedAsset = USDC_ADDRESSES[network] || "";
            const assetMatch = asset?.toLowerCase() === expectedAsset.toLowerCase();
            diagnostics.push({
              check: "asset_usdc",
              passed: assetMatch,
              detail: assetMatch
                ? "Asset is USDC"
                : `Asset ${asset || "missing"} does not match USDC for ${network} (expected ${expectedAsset})`,
            });

            // PayTo present
            const hasPayTo = !!payTo && (payTo.startsWith("0x") || payTo.length >= 32);
            diagnostics.push({
              check: "payto_valid",
              passed: hasPayTo,
              detail: hasPayTo
                ? "payTo address present"
                : "Missing or invalid payTo address",
            });

            // Resource URL check
            const resourceObj = parsed.resource as Record<string, unknown> | undefined;
            const resourceUrl = resourceObj?.url as string | undefined;
            const hasResourceUrl = !!resourceUrl;
            diagnostics.push({
              check: "resource_url",
              passed: hasResourceUrl,
              detail: hasResourceUrl
                ? `Resource URL: ${resourceUrl}`
                : "Missing resource.url in response body",
            });
          }

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
