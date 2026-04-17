"use client";

import React from "react";

interface Props {
  // Human-readable label for the boundary, shown in the fallback so users
  // know which section blew up.
  label: string;
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  message?: string;
}

// ErrorBoundary catches render errors in any wrapped subtree so a single bad
// component doesn't blank the page. Use one per major result section.
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }

  componentDidCatch(error: unknown, info: unknown) {
    console.error(`[ErrorBoundary:${this.props.label}]`, error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-card border border-destructive/40 rounded-lg p-4 text-sm">
          <p className="font-medium text-destructive">
            Something went wrong rendering “{this.props.label}”.
          </p>
          {this.state.message && (
            <p className="text-xs text-muted-foreground mt-1 font-mono">
              {this.state.message}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-2">
            The rest of the page should still work — try a different URL or
            refresh.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
