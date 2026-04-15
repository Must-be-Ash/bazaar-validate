const requests = new Map<string, { count: number; resetAt: number }>();

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 20; // 20 requests per minute per IP

export function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = requests.get(ip);

  if (!entry || now > entry.resetAt) {
    requests.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }

  entry.count++;
  if (entry.count > MAX_REQUESTS) {
    return true;
  }

  return false;
}

// Clean up stale entries periodically
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of requests) {
      if (now > entry.resetAt) {
        requests.delete(ip);
      }
    }
  }, 60_000);
}
