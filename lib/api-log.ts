// Tiny structured logger for API routes. Emits one JSON line per request so
// downstream tools (Vercel logs, future log drain) can grep by route, hostname,
// or duration. Keep this dependency-free.

interface LogFields {
  route: string;
  url?: string;
  hostname?: string;
  method?: string;
  status?: number;
  resultState?: string;
  durationMs: number;
  // Free-form extra context.
  [key: string]: unknown;
}

export function logApi(fields: LogFields): void {
  try {
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        ...fields,
      }),
    );
  } catch {
    // Swallow — logging must never throw.
  }
}

export function hostnameOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}
