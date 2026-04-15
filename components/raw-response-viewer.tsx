"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface RawResponseViewerProps {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export function RawResponseViewer({
  statusCode,
  headers,
  body,
}: RawResponseViewerProps) {
  const [expanded, setExpanded] = useState(false);

  let formattedBody = body;
  try {
    formattedBody = JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    // keep raw
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted hover:bg-card transition-colors text-sm"
      >
        <span className="text-muted-foreground">Raw Response Data</span>
        <span className="text-muted-foreground">
          {expanded ? "\u25B2" : "\u25BC"}
        </span>
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-4 space-y-4 bg-card">
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider">
                  Status
                </span>
                <p className="text-sm font-mono mt-1">{statusCode}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider">
                  Headers
                </span>
                <pre className="text-xs font-mono mt-1 overflow-x-auto bg-muted p-2 rounded">
                  {Object.entries(headers)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join("\n")}
                </pre>
              </div>
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider">
                  Body
                </span>
                <pre className="text-xs font-mono mt-1 overflow-x-auto bg-muted p-2 rounded max-h-96 overflow-y-auto">
                  {formattedBody || "(empty)"}
                </pre>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
