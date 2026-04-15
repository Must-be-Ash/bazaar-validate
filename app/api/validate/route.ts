import { NextRequest, NextResponse } from "next/server";
import { isRateLimited } from "@/lib/rate-limit";

const GO_VALIDATOR_URL = process.env.GO_VALIDATOR_URL || "http://localhost:8080";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (isRateLimited(ip)) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a moment." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { url, method = "GET" } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "URL is required" },
        { status: 400 }
      );
    }

    // Check if Go backend is available
    const goAvailable = await checkGoHealth();

    if (goAvailable) {
      // Proxy to Go backend
      const goRes = await fetch(`${GO_VALIDATOR_URL}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, method }),
      });

      if (!goRes.ok) {
        const err = await goRes.text();
        return NextResponse.json(
          { error: `Go validator returned ${goRes.status}: ${err}` },
          { status: 502 }
        );
      }

      const result = await goRes.json();
      return NextResponse.json({
        ...result,
        source: "go",
      });
    }

    // Fallback: proxy to the existing Node.js probe
    const probeRes = await fetch(new URL("/api/probe", req.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, method }),
    });

    const probeResult = await probeRes.json();
    return NextResponse.json({
      ...probeResult,
      source: "node",
    });
  } catch (error) {
    console.error("Validate route error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

async function checkGoHealth(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${GO_VALIDATOR_URL}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}
