"use client";

import { useEffect, useState } from "react";
import type { SearchResponse, SearchResultItem } from "@/lib/api-contract";

interface Props {
  // The user's URL — we derive a search query from its path segments.
  validatedUrl: string;
  // Optional supplemental hint (e.g. keys from output.example) appended to query.
  hint?: string;
  limit?: number;
}

// SimilarEndpoints fetches a handful of indexed endpoints whose semantic
// description matches the user's path/output. Used on awaiting/invalid result
// states to give "here are working examples to compare against".
export function SimilarEndpoints({ validatedUrl, hint, limit = 5 }: Props) {
  const [items, setItems] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const query = deriveQuery(validatedUrl, hint);

  useEffect(() => {
    if (!query) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/search?query=${encodeURIComponent(query)}&limit=${limit}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Search failed (${res.status})`);
        const data = (await res.json()) as SearchResponse;
        if (!cancelled) setItems(data.items ?? []);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Search failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, limit]);

  if (!query) return null;

  return (
    <div className="bg-muted border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground uppercase tracking-wider">
          Similar indexed endpoints
        </span>
        <span className="text-xs text-muted-foreground italic">
          query: &quot;{query}&quot;
        </span>
      </div>
      {loading && <p className="text-xs text-muted-foreground">Searching…</p>}
      {error && <p className="text-xs text-warning">{error}</p>}
      {!loading && !error && items.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No similar endpoints found in the Bazaar.
        </p>
      )}
      {!loading && items.length > 0 && (
        <div className="space-y-1">
          {items.map((item) => (
            <a
              key={item.resource}
              href={`/?url=${encodeURIComponent(item.resource)}`}
              className="block text-xs font-mono text-foreground/80 hover:text-foreground truncate"
              title={describeItem(item)}
            >
              {item.resource}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function deriveQuery(validatedUrl: string, hint?: string): string {
  const parts: string[] = [];
  try {
    const u = new URL(validatedUrl);
    const pathTerms = u.pathname
      .split("/")
      .filter(Boolean)
      .filter((seg) => !/^\d+$/.test(seg) && !seg.startsWith(":") && seg.length < 30)
      .slice(0, 4);
    parts.push(...pathTerms);
  } catch {
    // ignore
  }
  if (hint) parts.push(hint);
  const cleaned = parts
    .join(" ")
    .replace(/[-_]+/g, " ")
    .trim();
  return cleaned;
}

function describeItem(item: SearchResultItem): string {
  const meta = item.metadata as { description?: string } | undefined;
  return meta?.description ?? item.resource;
}
