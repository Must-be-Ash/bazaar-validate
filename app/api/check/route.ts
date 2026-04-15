import { NextRequest, NextResponse } from "next/server";

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
  try {
    const body = await req.json();
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
      return NextResponse.json({
        found: true,
        resource: match,
        totalIndexed,
      });
    }

    // Fire all remaining pages in parallel
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
          return NextResponse.json({
            found: true,
            resource: found,
            totalIndexed,
          });
        }
      }
    }

    return NextResponse.json({
      found: false,
      resource: null,
      totalIndexed,
    });
  } catch (error) {
    console.error("Check route error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
