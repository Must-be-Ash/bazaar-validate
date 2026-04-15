"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface CopyButtonProps {
  text: string;
  className?: string;
}

export function CopyButton({ text, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className={cn(
        "px-2 py-1 rounded text-xs bg-card border border-border hover:bg-muted transition-colors",
        className
      )}
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}
