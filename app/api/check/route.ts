import { NextRequest, NextResponse } from "next/server";
import type { CheckRequest, CheckResponse } from "@/lib/api-contract";
import type { QualitySignals } from "@/lib/diagnostics";
import { logApi, hostnameOf } from "@/lib/api-log";
import { isRateLimited } from "@/lib/rate-limit";

const DISCOVERY_API =
  "https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources";

const PAGE_SIZE = 1000;

interface DiscoveryResource {
  resource: string;
  accepts: Record<string, unknown>[];
  type?: string;
  x402Version?: number;
  lastUpdated?: string;
  [key: string]: unknown;
}

interface DiscoveryPagination {
  limit: number;
  offset: number;
  total: number;
}

interface DiscoveryResponse {
  items: DiscoveryResource[];
  pagination: DiscoveryPagination;
  x402Version?: number;
}

function matchesUrl(
  item: DiscoveryResource,
  normalizedInput: string,
  inputDomain: string,
  inputPath: string
): boolean {
  if (item.x402Version !== 2) return false;

  const normalizedResource = item.resource?.replace(/\/+$/, "").toLowerCase();
  if (!normalizedResource) return false;

  // Exact match
  if (normalizedResource === normalizedInput) return true;

  // Domain + path prefix match
  try {
    const resourceUrl = new URL(normalizedResource);
    if (
      resourceUrl.hostname === inputDomain &&
      (resourceUrl.pathname === inputPath ||
        inputPath.startsWith(resourceUrl.pathname + "/") ||
        resourceUrl.pathname.startsWith(inputPath + "/"))
    ) {
      return true;
    }
  } catch {
    // Skip malformed resource URLs
  }

  return false;
}

async function fetchPage(
  offset: number
): Promise<DiscoveryResponse | null> {
  const params = new URLSearchParams();
  params.set("offset", String(offset));
  params.set("limit", String(PAGE_SIZE));

  const res = await fetch(`${DISCOVERY_API}?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) return null;
  return res.json();
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (isRateLimited(ip)) {
      logApi({
        route: "/api/check",
        durationMs: Date.now() - startedAt,
        status: 429,
        rateLimited: true,
      });
      return NextResponse.json(
        { error: "Too many requests. Please wait a moment." },
        { status: 429 },
      );
    }

    const body = (await req.json()) as Partial<CheckRequest>;
    const { url } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "URL is required" },
        { status: 400 }
      );
    }

    const normalizedInput = url.replace(/\/+$/, "").toLowerCase();
    let inputUrl: URL;
    try {
      inputUrl = new URL(normalizedInput);
    } catch {
      return NextResponse.json(
        { error: "Invalid URL format" },
        { status: 400 }
      );
    }

    const inputDomain = inputUrl.hostname;
    const inputPath = inputUrl.pathname;

    // First request to get the total count
    const firstPage = await fetchPage(0);
    if (!firstPage) {
      return NextResponse.json(
        { error: "Discovery API is unavailable" },
        { status: 502 }
      );
    }

    const totalIndexed = firstPage.pagination?.total ?? 0;

    // Check first page immediately
    const match = firstPage.items?.find((item) =>
      matchesUrl(item, normalizedInput, inputDomain, inputPath)
    );

    if (match) {
      const merchantData = await lookupMerchant(match);
      const response: CheckResponse = {
        found: true,
        resource: match,
        totalIndexed,
        merchantResources: merchantData,
        qualitySignals: computeQualitySignals(match),
      };
      logApi({
        route: "/api/check",
        url,
        hostname: hostnameOf(url),
        status: 200,
        durationMs: Date.now() - startedAt,
        found: true,
      });
      return NextResponse.json(response);
    }

    // Fire all remaining pages in parallel and collect every item so we can
    // also scan for domain-siblings on the not-found path.
    const allItems: DiscoveryResource[] = [...(firstPage.items ?? [])];
    const remainingPages = Math.ceil(totalIndexed / PAGE_SIZE) - 1;
    if (remainingPages > 0) {
      const offsets = Array.from(
        { length: remainingPages },
        (_, i) => (i + 1) * PAGE_SIZE
      );

      const pages = await Promise.all(offsets.map((o) => fetchPage(o)));

      for (const page of pages) {
        if (!page?.items) continue;
        const found = page.items.find((item) =>
          matchesUrl(item, normalizedInput, inputDomain, inputPath)
        );
        if (found) {
          const merchantData = await lookupMerchant(found);
          const response: CheckResponse = {
            found: true,
            resource: found,
            totalIndexed,
            merchantResources: merchantData,
            qualitySignals: computeQualitySignals(found),
          };
          logApi({
            route: "/api/check",
            url,
            hostname: hostnameOf(url),
            status: 200,
            durationMs: Date.now() - startedAt,
            found: true,
          });
          return NextResponse.json(response);
        }
        allItems.push(...page.items);
      }
    }

    const notFound: CheckResponse = {
      found: false,
      resource: null,
      totalIndexed,
      merchantResources: null,
      domainSiblings: collectDomainSiblings(allItems, inputDomain),
    };
    logApi({
      route: "/api/check",
      url,
      hostname: hostnameOf(url),
      status: 200,
      durationMs: Date.now() - startedAt,
      found: false,
      siblingCount: notFound.domainSiblings?.count ?? 0,
    });
    return NextResponse.json(notFound);
  } catch (error) {
    console.error("Check route error:", error);
    logApi({
      route: "/api/check",
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

// collectDomainSiblings scans the indexed items for resources whose hostname
// matches the input hostname, so we can tell users "your domain has N other
// indexed endpoints — partial coverage."
function collectDomainSiblings(
  items: DiscoveryResource[],
  inputDomain: string,
): { hostname: string; count: number; resources: { resource: string; lastUpdated?: string }[] } | null {
  if (!inputDomain) return null;
  const matches: { resource: string; lastUpdated?: string }[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    if (it.x402Version !== 2) continue;
    if (typeof it.resource !== "string") continue;
    let host: string;
    try {
      host = new URL(it.resource).hostname;
    } catch {
      continue;
    }
    if (host !== inputDomain) continue;
    if (seen.has(it.resource)) continue;
    seen.add(it.resource);
    matches.push({ resource: it.resource, lastUpdated: it.lastUpdated });
  }
  if (matches.length === 0) return null;
  return { hostname: inputDomain, count: matches.length, resources: matches.slice(0, 10) };
}

// computeQualitySignals derives the lightweight signals the UI shows for
// indexed resources. Heuristics only; payerCount30d and dedicatedDomain are
// nullable until the discovery API exposes them or we add a domain-grouping
// pass.
function computeQualitySignals(item: DiscoveryResource): QualitySignals {
  const meta = (item.metadata ?? {}) as Record<string, unknown>;
  const extensions = (item.extensions ?? {}) as Record<string, unknown>;
  const bazaar =
    extensions.bazaar && typeof extensions.bazaar === "object"
      ? (extensions.bazaar as Record<string, unknown>)
      : null;
  const bazaarInfo =
    bazaar?.info && typeof bazaar.info === "object"
      ? (bazaar.info as Record<string, unknown>)
      : null;

  const description =
    typeof meta.description === "string" && meta.description.trim() !== "";
  const inputSchemaPresent =
    !!meta.input || !!(bazaarInfo && bazaarInfo.input);
  const outputSchemaPresent =
    !!meta.output || !!(bazaarInfo && bazaarInfo.output);

  return {
    descriptionPresent: description,
    inputSchemaPresent,
    outputSchemaPresent,
    dedicatedDomain: null, // would need a per-domain rollup; not exposed today
    payerCount30d: null, // not exposed by the discovery API today
  };
}

async function lookupMerchant(
  resource: DiscoveryResource
): Promise<{
  payTo: string;
  count: number;
  resources: { resource: string; lastUpdated?: string }[];
} | null> {
  try {
    // Extract payTo from the first accepts item
    const payTo = resource.accepts?.[0]?.payTo as string | undefined;
    if (!payTo) return null;

    const res = await fetch(
      `https://api.cdp.coinbase.com/platform/v2/x402/discovery/merchant?payTo=${payTo}`,
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) return null;

    const data = await res.json();
    const resources = (data.resources || []) as { resource: string; lastUpdated?: string }[];
    return {
      payTo,
      count: resources.length,
      resources: resources.map((r) => ({ resource: r.resource, lastUpdated: r.lastUpdated })),
    };
  } catch {
    return null;
  }
}
