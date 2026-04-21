"use client";

import { useState } from "react";
import { GlowButton } from "@/components/ui/glow-button";
import { cn } from "@/lib/utils";

interface UrlInputProps {
  onValidate: (url: string, method: string) => void;
  loading: boolean;
  initialUrl?: string;
  initialMethod?: string;
}

const METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"];

// normalizeUrl accepts bare hosts like "exa.ai" or "exa.ai/api/search" and
// prepends "https://" when no scheme is present. If the input already has any
// scheme (http://, https://, etc.) it is returned unchanged. A leading
// protocol-relative "//host" is also upgraded to "https://host".
function normalizeUrl(input: string): string {
  if (/^[a-z][a-z0-9+\-.]*:\/\//i.test(input)) return input;
  if (input.startsWith("//")) return `https:${input}`;
  return `https://${input}`;
}

export function UrlInput({
  onValidate,
  loading,
  initialUrl = "",
  initialMethod = "GET",
}: UrlInputProps) {
  const [url, setUrl] = useState(initialUrl);
  const [method, setMethod] = useState(initialMethod);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    onValidate(normalizeUrl(trimmed), method);
  };

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-4">
      <div className="flex gap-2">
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          className={cn(
            "bg-muted border border-border rounded-lg px-3 py-3 text-sm font-mono text-foreground",
            "focus:outline-none focus:ring-1 focus:ring-accent",
            "appearance-none cursor-pointer"
          )}
        >
          {METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://api.example.com/weather"
          className={cn(
            "flex-1 bg-muted border border-border rounded-lg px-4 py-3 text-sm font-mono text-foreground",
            "placeholder:text-muted-foreground",
            "focus:outline-none focus:ring-1 focus:ring-accent"
          )}
        />
      </div>
      <div className="flex justify-center">
        <GlowButton
          disabled={loading || !url.trim()}
        >
          {loading ? "Validating..." : "Validate"}
        </GlowButton>
      </div>
    </form>
  );
}
