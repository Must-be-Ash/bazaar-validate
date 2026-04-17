import { NextRequest, NextResponse } from "next/server";
import type { ProbeRequest } from "@/lib/api-contract";
import {
  parseDiscoveryInfo,
  simulateSubmit,
  hasBazaarExtension as detectBazaarExtension,
  matchesRouteTemplate,
} from "@/lib/discovery-validate";

const PROBE_VALIDATOR_VERSION = "0.2.0-node";

interface DiagnosticCheck {
  check: string;
  passed: boolean;
  detail: string;
}

// Canonical check ids — kept in sync with go-validator/main.go.
// When you add an id here, also add it to lib/checks.ts.
const PAYMENT_STAGE_CHECK_IDS = [
  "valid_json",
  "x402_version",
  "has_accepts",
  "accepts[0].scheme",
  "accepts[0].network",
  "accepts[0].asset",
  "accepts[0].amount",
  "accepts[0].payTo",
  "accepts[0].maxTimeoutSeconds",
  "has_resource",
  "has_bazaar_extension",
  "bazaar.info",
  "bazaar.info.output",
  "bazaar.info.output.example",
  "bazaar.schema",
];

function pushSkipped(diagnostics: DiagnosticCheck[], reason: string, ids: string[]) {
  for (const id of ids) {
    diagnostics.push({ check: id, passed: false, detail: `Skipped: ${reason}` });
  }
}

const USDC_ADDRESSES: Record<string, string> = {
  "eip155:8453": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "eip155:84532": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<ProbeRequest>;
    const { url, method = "GET" } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
    }

    const hostname = parsedUrl.hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
      return NextResponse.json(
        {
          error:
            "Cannot reach localhost from our server. Expose your endpoint with: ngrok http <port>",
        },
        { status: 400 },
      );
    }

    const validMethods = ["GET", "POST", "PUT", "DELETE"];
    const httpMethod = method.toUpperCase();
    if (!validMethods.includes(httpMethod)) {
      return NextResponse.json({ error: "Invalid HTTP method" }, { status: 400 });
    }

    const diagnostics: DiagnosticCheck[] = [];
    let statusCode = 0;
    const rawHeaders: Record<string, string> = {};
    let rawBody = "";
    let reachable = false;
    let returns402 = false;
    let paymentRequirements: Record<string, unknown> | null = null;
    let hasBazaarExtensionFlag = false;
    let bazaarExtensionData: Record<string, unknown> | null = null;
    let x402Version: number | null = null;

    // --- Stage 1: URL parse + HTTPS ---
    diagnostics.push({
      check: "url_valid",
      passed: true,
      detail: "URL is well-formed",
    });
    const httpsOK = parsedUrl.protocol === "https:";
    diagnostics.push({
      check: "url_https",
      passed: httpsOK,
      detail: httpsOK ? "Resource URL uses HTTPS" : "Resource URL must use HTTPS",
    });

    // --- Stage 2: Probe ---
    let probeError: string | null = null;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(url, {
        method: httpMethod,
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      clearTimeout(timeout);

      reachable = true;
      statusCode = res.status;
      res.headers.forEach((value, key) => {
        rawHeaders[key] = value;
      });
      rawBody = await res.text();

      diagnostics.push({
        check: "endpoint_reachable",
        passed: true,
        detail: `Endpoint responded with status ${statusCode}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const isTimeout = message.includes("abort") || message.includes("timeout");
      probeError = isTimeout
        ? "Endpoint timed out after 10 seconds"
        : `Could not reach endpoint: ${message}`;
      diagnostics.push({
        check: "endpoint_reachable",
        passed: false,
        detail: probeError,
      });
    }

    if (!reachable) {
      pushSkipped(diagnostics, "endpoint not reachable", ["returns_402"]);
      pushSkipped(diagnostics, "endpoint not reachable", PAYMENT_STAGE_CHECK_IDS);
      return finalize();
    }

    // --- Stage 3: returns_402 ---
    returns402 = statusCode === 402;
    let returns402Detail = "Endpoint correctly returns HTTP 402 Payment Required";
    if (!returns402) {
      if (statusCode === 200) {
        returns402Detail =
          "Endpoint returns 200 OK — it needs to return 402 for unauthenticated requests to be discoverable";
      } else if (statusCode === 401 || statusCode === 403) {
        returns402Detail = `Endpoint returns ${statusCode} — auth middleware may be running before x402 middleware`;
      } else {
        returns402Detail = `Endpoint returned HTTP ${statusCode} instead of 402`;
      }
    }
    diagnostics.push({ check: "returns_402", passed: returns402, detail: returns402Detail });

    if (!returns402) {
      pushSkipped(diagnostics, "endpoint did not return 402", PAYMENT_STAGE_CHECK_IDS);
      return finalize();
    }

    // --- Stage 4: parse JSON ---
    const contentType = (rawHeaders["content-type"] || "").toLowerCase();
    const htmlPaywall = contentType.includes("text/html");
    if (htmlPaywall) {
      diagnostics.push({
        check: "valid_json",
        passed: false,
        detail:
          "Endpoint returned HTML instead of JSON. The 402 response must be JSON with x402 payment requirements, not an HTML paywall page.",
      });
      pushSkipped(
        diagnostics,
        "response is HTML, not JSON",
        PAYMENT_STAGE_CHECK_IDS.filter((id) => id !== "valid_json"),
      );
      return finalize();
    }

    let parsed: Record<string, unknown> | null = null;
    try {
      const candidate = JSON.parse(rawBody);
      if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
        parsed = candidate as Record<string, unknown>;
      }
    } catch {
      // parsed stays null
    }
    if (!parsed) {
      diagnostics.push({
        check: "valid_json",
        passed: false,
        detail: "Response body is not valid JSON",
      });
      pushSkipped(
        diagnostics,
        "response body is not valid JSON",
        PAYMENT_STAGE_CHECK_IDS.filter((id) => id !== "valid_json"),
      );
      return finalize();
    }
    diagnostics.push({
      check: "valid_json",
      passed: true,
      detail: "Response body parsed as JSON",
    });

    // --- Stage 5: x402_version ---
    x402Version = typeof parsed.x402Version === "number" ? parsed.x402Version : null;
    const isV2 = x402Version === 2;
    let versionDetail = "x402 version is 2";
    if (!isV2) {
      if (parsed.paymentRequirements) {
        versionDetail = "Found v1 paymentRequirements field — upgrade to v2 (top-level accepts array)";
      } else if (x402Version === 1) {
        versionDetail = "x402Version is 1 — this tool validates v2 only";
      } else {
        versionDetail = `x402Version is ${x402Version ?? "missing"} — expected 2`;
      }
    }
    diagnostics.push({ check: "x402_version", passed: isV2, detail: versionDetail });

    // --- Stage 6: has_accepts + per-item ---
    const accepts = Array.isArray(parsed.accepts)
      ? (parsed.accepts as Record<string, unknown>[])
      : [];
    const hasValidAccepts = accepts.length > 0;
    diagnostics.push({
      check: "has_accepts",
      passed: hasValidAccepts,
      detail: hasValidAccepts
        ? `Found ${accepts.length} payment method(s) in accepts array`
        : "Missing or empty accepts array",
    });

    if (hasValidAccepts) {
      paymentRequirements = parsed;
      validateAcceptsItem(accepts[0], diagnostics);
    } else {
      pushSkipped(diagnostics, "accepts array is missing or empty", [
        "accepts[0].scheme",
        "accepts[0].network",
        "accepts[0].asset",
        "accepts[0].amount",
        "accepts[0].payTo",
        "accepts[0].maxTimeoutSeconds",
      ]);
    }

    // --- Stage 7: has_resource ---
    const resourceObj =
      parsed.resource && typeof parsed.resource === "object"
        ? (parsed.resource as Record<string, unknown>)
        : null;
    const resourceURL = typeof resourceObj?.url === "string" ? resourceObj.url : "";
    const hasResourceURL = resourceURL !== "";
    diagnostics.push({
      check: "has_resource",
      passed: hasResourceURL,
      detail: hasResourceURL
        ? `Resource URL: ${resourceURL}`
        : "Missing resource object or resource.url field",
    });

    // --- Stage 8: extensions.bazaar ---
    const extensions =
      parsed.extensions && typeof parsed.extensions === "object"
        ? (parsed.extensions as Record<string, unknown>)
        : null;
    const bazaar =
      extensions?.bazaar && typeof extensions.bazaar === "object"
        ? (extensions.bazaar as Record<string, unknown>)
        : null;
    if (bazaar) {
      hasBazaarExtensionFlag = true;
      bazaarExtensionData = bazaar;
    }
    diagnostics.push({
      check: "has_bazaar_extension",
      passed: hasBazaarExtensionFlag,
      detail: hasBazaarExtensionFlag
        ? "Bazaar extension found in response"
        : "No bazaar extension found in top-level extensions object",
    });

    if (bazaar) {
      validateBazaarExtension(bazaar, resourceURL, diagnostics);
    } else {
      pushSkipped(diagnostics, "bazaar extension is missing", [
        "bazaar.info",
        "bazaar.info.output",
        "bazaar.info.output.example",
        "bazaar.schema",
      ]);
    }

    return finalize();

    function finalize() {
      // --- Stages 2 + 3: parse / simulate via TS port of facilitator ---
      let parseStage: { ok: boolean; error?: string } = {
        ok: false,
        error: "Skipped: preflight checks failed",
      };
      let simulateStage: ReturnType<typeof simulateSubmit> = { outcome: "noop" };
      if (reachable && returns402) {
        let bodyParsed: unknown = null;
        try {
          bodyParsed = JSON.parse(rawBody);
        } catch {
          // bodyParsed stays null; parseDiscoveryInfo will surface the error
        }
        const bazaarPresent = detectBazaarExtension(bodyParsed);
        const parseResult = parseDiscoveryInfo(bodyParsed);
        if (parseResult.ok) {
          parseStage = { ok: true };
          simulateStage = simulateSubmit(parseResult.info, null, bazaarPresent);
        } else {
          parseStage = { ok: false, error: parseResult.error };
          simulateStage = simulateSubmit(null, parseResult.error, bazaarPresent);
        }
      }

      return NextResponse.json({
        reachable,
        statusCode,
        returns402,
        paymentRequirements,
        hasBazaarExtension: hasBazaarExtensionFlag,
        bazaarExtensionData,
        x402Version,
        rawHeaders,
        rawBody,
        diagnostics,
        preflight: diagnostics,
        parse: parseStage,
        simulate: simulateStage,
        meta: { validatorVersion: PROBE_VALIDATOR_VERSION },
      });
    }
  } catch (error) {
    console.error("Probe route error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function validateAcceptsItem(
  item: Record<string, unknown>,
  diagnostics: DiagnosticCheck[],
) {
  const scheme = typeof item.scheme === "string" ? item.scheme : "";
  const network = typeof item.network === "string" ? item.network : "";
  const amount = typeof item.amount === "string" ? item.amount : "";
  const asset = typeof item.asset === "string" ? item.asset : "";
  const payTo = typeof item.payTo === "string" ? item.payTo : "";
  const maxTimeout = item.maxTimeoutSeconds;

  // Scheme
  const validScheme = scheme === "exact" || scheme === "upto";
  diagnostics.push({
    check: "accepts[0].scheme",
    passed: validScheme,
    detail: validScheme
      ? `Scheme is "${scheme}"`
      : `Scheme is "${scheme || "missing"}" — must be "exact" or "upto"`,
  });

  // Network
  const knownNetwork = network in USDC_ADDRESSES;
  diagnostics.push({
    check: "accepts[0].network",
    passed: knownNetwork,
    detail: knownNetwork
      ? `Network ${network} is supported`
      : `Network "${network || "missing"}" is not a supported network`,
  });

  // Asset
  const expectedAsset = USDC_ADDRESSES[network] || "";
  const assetMatch = asset.toLowerCase() === expectedAsset.toLowerCase() && asset !== "";
  diagnostics.push({
    check: "accepts[0].asset",
    passed: assetMatch,
    detail: assetMatch
      ? "Asset is USDC"
      : `Asset ${asset || "missing"} does not match USDC for ${network}`,
  });

  // Amount — also detect v1 maxAmountRequired
  if (!amount && typeof item.maxAmountRequired !== "undefined") {
    diagnostics.push({
      check: "accepts[0].amount",
      passed: false,
      detail: 'Found maxAmountRequired (v1 field) — v2 uses "amount"',
    });
  } else {
    const amountNum = parseInt(amount || "0", 10);
    const amountOk = amountNum >= 1000;
    diagnostics.push({
      check: "accepts[0].amount",
      passed: amountOk,
      detail: amountOk
        ? `Amount ${amount} meets $0.001 USDC minimum`
        : amount === ""
          ? "Missing amount field"
          : `Amount ${amount} is below $0.001 minimum (1000 atomic units)`,
    });
  }

  // PayTo
  const validPayTo = payTo !== "" && (payTo.startsWith("0x") || payTo.length >= 32);
  diagnostics.push({
    check: "accepts[0].payTo",
    passed: validPayTo,
    detail: validPayTo ? "payTo address present" : "Missing or invalid payTo address",
  });

  // maxTimeoutSeconds
  const timeoutOk = typeof maxTimeout === "number" && maxTimeout > 0;
  diagnostics.push({
    check: "accepts[0].maxTimeoutSeconds",
    passed: timeoutOk,
    detail: timeoutOk
      ? "maxTimeoutSeconds is set"
      : "Missing or invalid maxTimeoutSeconds",
  });
}

function validateBazaarExtension(
  bazaar: Record<string, unknown>,
  resourceURL: string,
  diagnostics: DiagnosticCheck[],
) {
  const info =
    bazaar.info && typeof bazaar.info === "object"
      ? (bazaar.info as Record<string, unknown>)
      : null;
  diagnostics.push({
    check: "bazaar.info",
    passed: !!info,
    detail: info ? "Bazaar info block present" : "Missing bazaar info block",
  });

  if (info) {
    const output =
      info.output && typeof info.output === "object"
        ? (info.output as Record<string, unknown>)
        : null;
    diagnostics.push({
      check: "bazaar.info.output",
      passed: !!output,
      detail: output ? "Output metadata present in bazaar info" : "Missing info.output",
    });
    if (output) {
      const hasExample = "example" in output;
      diagnostics.push({
        check: "bazaar.info.output.example",
        passed: hasExample,
        detail: hasExample
          ? "Output example provided"
          : "Missing output example — helps consumers understand your response shape",
      });
    } else {
      diagnostics.push({
        check: "bazaar.info.output.example",
        passed: false,
        detail: "Skipped: bazaar info.output is missing",
      });
    }
  } else {
    diagnostics.push({
      check: "bazaar.info.output",
      passed: false,
      detail: "Skipped: bazaar info block is missing",
    });
    diagnostics.push({
      check: "bazaar.info.output.example",
      passed: false,
      detail: "Skipped: bazaar info block is missing",
    });
  }

  const schema =
    bazaar.schema && typeof bazaar.schema === "object" ? bazaar.schema : null;
  diagnostics.push({
    check: "bazaar.schema",
    passed: !!schema,
    detail: schema ? "Bazaar schema present" : "Missing bazaar schema",
  });

  // routeTemplate match — only emit when a template is actually declared.
  // Stricter than the facilitator (which just stores the concrete URL), but
  // a mismatch usually signals a developer bug.
  const routeTemplate =
    typeof bazaar.routeTemplate === "string" ? bazaar.routeTemplate : "";
  if (routeTemplate !== "") {
    const matches = matchesRouteTemplate(routeTemplate, resourceURL);
    diagnostics.push({
      check: "bazaar.routeTemplate.matches_resource",
      passed: matches,
      detail: matches
        ? `resource.url "${resourceURL}" matches routeTemplate "${routeTemplate}"`
        : `resource.url "${resourceURL}" does not match routeTemplate "${routeTemplate}"`,
    });
  }
}
