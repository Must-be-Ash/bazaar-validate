import { NextRequest, NextResponse } from "next/server";
import { isRateLimited } from "@/lib/rate-limit";
import type { SearchResponse, SearchResultItem } from "@/lib/api-contract";
import { logApi } from "@/lib/api-log";

const DISCOVERY_API =
  "https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

interface DiscoveryItem {
  resource: string;
  type?: string;
  x402Version?: number;
  accepts?: Record<string, unknown>[];
  lastUpdated?: string;
  metadata?: Record<string, unknown>;
}

interface DiscoveryResponse {
  items: DiscoveryItem[];
  pagination: { limit: number; offset: number; total: number };
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

    const limitRaw = url.searchParams.get("limit");
    const offsetRaw = url.searchParams.get("offset");
    const limit = clampInt(limitRaw, 1, MAX_LIMIT, DEFAULT_LIMIT);
    const offset = clampInt(offsetRaw, 0, 100_000, 0);

    const params = new URLSearchParams();
    params.set("query", query);
    params.set("limit", String(limit));
    params.set("offset", String(offset));

    const upstream = await fetch(`${DISCOVERY_API}?${params.toString()}`, {
      headers: { Accept: "application/json" },
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Discovery API returned ${upstream.status}` },
        { status: 502 },
      );
    }

    const data = (await upstream.json()) as DiscoveryResponse;
    const items: SearchResultItem[] = (data.items ?? []).map((it) => ({
      resource: it.resource,
      type: it.type,
      x402Version: it.x402Version,
      accepts: it.accepts,
      lastUpdated: it.lastUpdated,
      metadata: it.metadata,
    }));

    const response: SearchResponse = {
      items,
      total: data.pagination?.total ?? items.length,
      limit: data.pagination?.limit ?? limit,
      offset: data.pagination?.offset ?? offset,
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
