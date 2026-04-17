// Versioned request/response contracts for every API route in this app.
// Both the Next.js route handlers and the frontend import from here so the
// shapes can't drift.
//
// When you change a route's payload, change it here first.

import type {
  CheckResult,
  ProbeResult,
  ValidationResult,
} from "@/lib/diagnostics";

export const API_CONTRACT_VERSION = 1;

export interface ApiError {
  error: string;
}

// --- POST /api/check -------------------------------------------------------
export interface CheckRequest {
  url: string;
}
export type CheckResponse = CheckResult;

// --- POST /api/validate ----------------------------------------------------
export interface ValidateRequest {
  url: string;
  method?: string;
}
export type ValidateResponse = ValidationResult;

// --- POST /api/probe -------------------------------------------------------
// Internal endpoint hit by /api/validate when the Go backend is down. Same
// request shape as /api/validate; emits ProbeResult (which is the body of
// ValidationResult minus the source/fallback envelope).
export interface ProbeRequest {
  url: string;
  method?: string;
}
export type ProbeResponse = ProbeResult;

// --- GET /api/search -------------------------------------------------------
// Proxies the CDP semantic-search endpoint (/discovery/search). Unlike
// /discovery/resources, this actually honors the `query` param. The upstream
// response is shaped as { resources, partialResults } and is hard-capped at
// 20 items with no offset pagination — we normalize that into the shape below.
export interface SearchRequest {
  query: string;
  limit?: number;
  network?: string;
  asset?: string;
  scheme?: string;
  payTo?: string;
  maxUsdPrice?: number;
  extensions?: string;
}
export interface SearchResultItem {
  resource: string;
  type?: string;
  x402Version?: number;
  accepts?: Record<string, unknown>[];
  lastUpdated?: string;
  // Top-level description is returned directly by /discovery/search.
  // metadata.description is kept for legacy compatibility.
  description?: string;
  metadata?: Record<string, unknown>;
}
export interface SearchResponse {
  items: SearchResultItem[];
  total: number;
  limit: number;
  offset: number;
  partialResults?: boolean;
}
