"use client";

import React, { useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface ShimmerButtonProps {
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function ShimmerButton({
  href,
  onClick,
  disabled,
  icon,
  children,
  className,
}: ShimmerButtonProps) {
  const [isHovered, setIsHovered] = useState(false);
  const isExternal = href?.startsWith("http") || href?.startsWith("//");

  const sharedClassName = cn(
    "relative flex items-center justify-center gap-2 px-5 py-2.5 rounded-md transition-all duration-300 overflow-hidden",
    !disabled && "hover:scale-105",
    disabled && "opacity-50 cursor-not-allowed",
    className
  );

  const sharedStyle = {
    backgroundColor: isHovered && !disabled ? "#fafafa" : "#1f1f1f",
    color: isHovered && !disabled ? "#0a0a0a" : "#fafafa",
  };

  const shimmer = isHovered && !disabled && (
    <motion.div
      className="absolute z-0"
      initial={{ x: "-150%", y: "-50%" }}
      animate={{ x: "150%", y: "50%" }}
      transition={{
        duration: 2.5,
        repeat: 0,
        ease: "easeInOut",
      }}
      style={{
        width: "200%",
        height: "200%",
        background:
          "linear-gradient(120deg, transparent 20%, rgba(180,180,180,0.7) 50%, transparent 80%)",
      }}
    />
  );

  const content = (
    <>
      {shimmer}
      {icon && (
        <span className="relative z-10 transition-colors duration-300">
          {icon}
        </span>
      )}
      <span className="relative z-10 font-medium transition-colors duration-300">
        {children}
      </span>
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        className={sharedClassName}
        style={sharedStyle}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={sharedClassName}
      style={sharedStyle}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {content}
    </button>
  );
}
