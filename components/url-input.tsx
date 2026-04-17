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

const METHODS = ["GET", "POST", "PUT", "DELETE"];

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
    if (url.trim()) {
      onValidate(url.trim(), method);
    }
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
