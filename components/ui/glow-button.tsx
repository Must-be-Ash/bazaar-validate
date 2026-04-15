"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface GlowButtonProps {
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  variant?: "default" | "success" | "muted";
  children: ReactNode;
  className?: string;
}

const variants = {
  default: {
    gradient: "from-[#555555] to-[#333333]",
    border: "#2A2A2A",
    text: "#FFFFFF",
  },
  success: {
    gradient: "from-[#22c55e] to-[#16a34a]",
    border: "#166534",
    text: "#FFFFFF",
  },
  muted: {
    gradient: "from-[#2a2a2a] to-[#1f1f1f]",
    border: "#333333",
    text: "#a0a0a0",
  },
};

export function GlowButton({
  onClick,
  href,
  disabled = false,
  variant = "default",
  children,
  className,
}: GlowButtonProps) {
  const v = variants[variant];

  const sharedClassName = cn(
    "relative z-10 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full font-medium text-sm transition-transform duration-200 hover:scale-95 active:scale-90 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100",
    className
  );

  const inner = (
    <div
      className={cn(
        "absolute inset-0 rounded-full bg-gradient-to-b -z-10",
        "shadow-[0_2px_8px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.1)]",
        v.gradient
      )}
    />
  );

  if (href) {
    return (
      <div className="relative inline-flex items-center justify-center rounded-full">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={sharedClassName}
          style={{ color: v.text }}
        >
          {inner}
          {children}
        </a>
      </div>
    );
  }

  return (
    <div className="relative inline-flex items-center justify-center rounded-full">
      <button
        onClick={onClick}
        disabled={disabled}
        className={sharedClassName}
        style={{ color: v.text }}
      >
        {inner}
        {children}
      </button>
    </div>
  );
}
