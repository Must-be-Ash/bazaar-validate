import { NextRequest, NextResponse } from "next/server";
import { isRateLimited } from "@/lib/rate-limit";
import type { SearchResponse, SearchResultItem } from "@/lib/api-contract";
import { logApi } from "@/lib/api-log";

// CDP's semantic-search endpoint. This is distinct from /discovery/resources
// (which is a paginated browse and silently ignores `query`). See
// build-files/bazaar.md → "Semantic Search Endpoint".
const SEARCH_API =
  "https://api.cdp.coinbase.com/platform/v2/x402/discovery/search";

const DEFAULT_LIMIT = 10;
// /discovery/search is hard-capped at 20 server-side.
const MAX_LIMIT = 20;

interface DiscoverySearchItem {
  resource: string;
  type?: string;
  x402Version?: number;
  accepts?: Record<string, unknown>[];
  lastUpdated?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

// The search endpoint returns `{ resources, partialResults }` — not the
// `{ items, pagination }` shape used by /discovery/resources.
interface DiscoverySearchResponse {
  resources?: DiscoverySearchItem[];
  partialResults?: boolean;
}

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (isRateLimited(ip)) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a moment." },
        { status: 429 },
      );
    }

    const url = new URL(req.url);
    const query = url.searchParams.get("query")?.trim() ?? "";
    if (!query) {
      return NextResponse.json(
        { error: "query parameter is required" },
        { status: 400 },
      );
    }

    const limit = clampInt(url.searchParams.get("limit"), 1, MAX_LIMIT, DEFAULT_LIMIT);

    const params = new URLSearchParams();
    params.set("query", query);
    params.set("limit", String(limit));

    // Forward the optional filters the docs expose. Only include those the
    // caller actually set so we don't over-constrain the query.
    for (const key of ["network", "asset", "scheme", "payTo", "maxUsdPrice", "extensions"]) {
      const v = url.searchParams.get(key);
      if (v) params.set(key, v);
    }

    const upstream = await fetch(`${SEARCH_API}?${params.toString()}`, {
      headers: { Accept: "application/json" },
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Discovery search API returned ${upstream.status}` },
        { status: 502 },
      );
    }

    const data = (await upstream.json()) as DiscoverySearchResponse;
    const items: SearchResultItem[] = (data.resources ?? []).map((it) => ({
      resource: it.resource,
      type: it.type,
      x402Version: it.x402Version,
      accepts: it.accepts,
      lastUpdated: it.lastUpdated,
      description: it.description,
      metadata: it.metadata,
    }));

    const response: SearchResponse = {
      items,
      total: items.length,
      limit,
      offset: 0,
      partialResults: data.partialResults ?? false,
    };
    logApi({
      route: "/api/search",
      query,
      status: 200,
      durationMs: Date.now() - startedAt,
      itemsReturned: items.length,
    });
    return NextResponse.json(response);
  } catch (error) {
    console.error("Search route error:", error);
    logApi({
      route: "/api/search",
      durationMs: Date.now() - startedAt,
      status: 500,
      err: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

function clampInt(
  raw: string | null,
  min: number,
  max: number,
  fallback: number,
): number {
  if (raw === null || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
