// TypeScript port of the facilitator's discovery validation pipeline. Mirrors
// validate/parseDiscoveryInfo.md and validate/legacy.md so that when the Go
// validator is unavailable, the Node fallback still emits the same parse and
// simulate stages.
//
// We don't have the x402 SDK in TS, so this is a literal port of the markdown
// reference. When the Go server is reachable, the SDK-backed implementation
// in `go-validator/internal/discovery/` is authoritative.

export interface ParsedDiscoveryInfo {
  resource: { url: string; routeTemplate?: string };
  transportType: string; // "http", lowercased
  httpMethod: string; // populated when transportType === "http"
  rawDiscoveryInfo: Record<string, unknown>;
}

export type ParseOutcome =
  | { ok: true; info: ParsedDiscoveryInfo | null } // info=null → no bazaar extension
  | { ok: false; error: string };

// parseDiscoveryInfo extracts and validates the bazaar discovery info from
// a parsed 402 response body. Mirrors validate/parseDiscoveryInfo.md.
//
// Returns:
//   { ok: true, info: null }    → no bazaar extension present (silent no-op)
//   { ok: true, info: <data> }  → bazaar extension parsed successfully
//   { ok: false, error }        → bazaar extension present but malformed
export function parseDiscoveryInfo(body: unknown): ParseOutcome {
  if (!isObject(body)) {
    return { ok: false, error: "response body is not an object" };
  }

  const x402Version = body.x402Version;
  if (x402Version !== 2) {
    // v1 path is not part of this validator's scope; treat as no-op so the
    // x402_version preflight check is the one surfacing the problem.
    return { ok: true, info: null };
  }

  const extensions = isObject(body.extensions) ? body.extensions : null;
  const bazaar = extensions && isObject(extensions.bazaar) ? extensions.bazaar : null;
  if (!bazaar) {
    return { ok: true, info: null };
  }

  const info = isObject(bazaar.info) ? bazaar.info : null;
  if (!info) {
    return { ok: false, error: "bazaar extension missing info block" };
  }

  const input = isObject(info.input) ? info.input : null;
  if (!input) {
    return { ok: false, error: "[discover_resource] input not found in OutputSchema" };
  }

  const transportRaw = input.type;
  if (typeof transportRaw !== "string") {
    return { ok: false, error: "[discover_resource] type not found or not a string in input" };
  }
  const transportType = transportRaw.toLowerCase();

  let httpMethod = "";
  if (transportType === "http") {
    const methodRaw = input.method;
    if (typeof methodRaw !== "string") {
      return { ok: false, error: "[discover_resource] method not found or not a string in input" };
    }
    if (methodRaw === "") {
      return { ok: false, error: "HTTP method is required for http transport type" };
    }
    httpMethod = methodRaw.toLowerCase();
  }

  const resourceObj = isObject(body.resource) ? body.resource : null;
  const resourceURL = typeof resourceObj?.url === "string" ? resourceObj.url : "";
  const routeTemplate =
    typeof bazaar.routeTemplate === "string" ? bazaar.routeTemplate : undefined;

  return {
    ok: true,
    info: {
      resource: { url: resourceURL, routeTemplate },
      transportType,
      httpMethod,
      rawDiscoveryInfo: info as Record<string, unknown>,
    },
  };
}

// hasBazaarExtension returns true when the body has a top-level
// `extensions.bazaar` object — used to decide whether parse failures should
// be surfaced as user-actionable rejections (vs silently passed through).
export function hasBazaarExtension(body: unknown): boolean {
  if (!isObject(body)) return false;
  if (!isObject(body.extensions)) return false;
  return isObject(body.extensions.bazaar);
}

// --- legacy.ValidateDiscoveryRequest port ---------------------------------

const HTTP_PROTOCOL = "http";

export function validateDiscoveryRequest(
  resource: string,
  outputSchema: Record<string, unknown> | null,
  requireHTTPS: boolean,
): string | null {
  if (!resource) {
    return "[discover_resource] resource is required";
  }

  let parsed: URL;
  try {
    parsed = new URL(resource);
  } catch {
    return "resource URL is not parseable";
  }
  if (!parsed.host) {
    return "resource URL must include a host";
  }

  if (outputSchema) {
    const input = isObject(outputSchema.input) ? outputSchema.input : null;
    if (!input) return "input not found in OutputSchema";
    const protocolType = input.type;
    if (typeof protocolType !== "string") {
      return "type not found or not a string in input";
    }
    if (protocolType === HTTP_PROTOCOL && requireHTTPS && !resource.startsWith("https://")) {
      return "resource must start with 'https://' when protocol type is http";
    }
  }

  return null;
}

// --- simulate ---------------------------------------------------------------

export type SimulateOutcome = "processing" | "rejected" | "noop";

export interface SimulateResult {
  outcome: SimulateOutcome;
  rejectedReason?: string;
  workflowIdHint?: string;
}

export function simulateSubmit(
  info: ParsedDiscoveryInfo | null,
  parseErr: string | null,
  hasBazaar: boolean,
): SimulateResult {
  if (parseErr) {
    if (hasBazaar) {
      return { outcome: "rejected", rejectedReason: "invalid discovery configuration" };
    }
    return { outcome: "noop" };
  }

  if (!info) return { outcome: "noop" };

  if (info.transportType !== "http") {
    return {
      outcome: "rejected",
      rejectedReason: `unsupported transport type: ${info.transportType}`,
    };
  }

  const pseudoSchema: Record<string, unknown> = { input: { type: info.transportType } };
  const legacyErr = validateDiscoveryRequest(info.resource.url, pseudoSchema, true);
  if (legacyErr) {
    return { outcome: "rejected", rejectedReason: "discovery request validation failed" };
  }

  if (info.resource.routeTemplate && !info.resource.url) {
    return { outcome: "rejected", rejectedReason: "invalid discovery configuration" };
  }

  return {
    outcome: "processing",
    workflowIdHint: `discover-http-${info.httpMethod}-${info.resource.url}`,
  };
}

// --- routeTemplate matching -----------------------------------------------

// matchesRouteTemplate reports whether resourceURL conforms to a `:param`-style
// bazaar routeTemplate (e.g. "/users/:userId" matches "/users/123" but not
// "/products/abc"). Stricter than the facilitator: it just stores whichever
// concrete URL came in, but a mismatch usually signals a developer bug.
//
// Mirror of go-validator/internal/discovery/match.go.
export function matchesRouteTemplate(template: string, resourceURL: string): boolean {
  if (template === "") return true;
  const path = extractPath(resourceURL);
  if (path === null) return false;

  const tpl = normalizePath(template);
  const url = normalizePath(path);
  const segs = tpl.split("/").map((seg) => {
    if (seg.startsWith(":")) return "([^/]+)";
    return escapeRegex(seg);
  });
  const re = new RegExp("^" + segs.join("/") + "$");
  return re.test(url);
}

function extractPath(raw: string): string | null {
  if (!raw) return null;
  if (raw.startsWith("/")) return raw;
  try {
    const u = new URL(raw);
    return u.pathname || "/";
  } catch {
    return null;
  }
}

function normalizePath(p: string): string {
  if (p.length > 1 && p.endsWith("/")) {
    return p.replace(/\/+$/, "");
  }
  return p;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// --- helpers ----------------------------------------------------------------

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
