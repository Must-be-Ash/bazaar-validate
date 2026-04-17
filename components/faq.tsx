"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const faqs = [
  {
    q: "Why isn't my endpoint showing up?",
    a: "Your endpoint needs to: (1) return HTTP 402 to unauthenticated requests, (2) include the bazaar extension in payment requirements, (3) have at least one successful paid transaction through the CDP facilitator. Use the validator above to pinpoint exactly what's missing.",
  },
  {
    q: "Why does my endpoint say 'awaiting first payment'?",
    a: "Your implementation passes every check (preflight + SDK parse + simulate-submit), but the CDP facilitator hasn't seen a paid request to it yet. The Bazaar only catalogs an endpoint after the first verify+settle. Trigger a payment via the helper on the awaiting screen and we'll detect indexing within ~30s.",
  },
  {
    q: "How do I trigger my first payment?",
    a: "When the validator shows 'awaiting first payment', it gives you three options: a copy-paste @x402/fetch Node snippet, a curl confirmation snippet, and manual instructions. The Node snippet is pre-filled with your URL, method, and network. Run it locally with a funded private key.",
  },
  {
    q: "How long after my first transaction until I appear?",
    a: "Typically within ~30 seconds of your first successful transaction through the CDP facilitator. Quality scores (which influence ranking) recalculate periodically — a brand-new endpoint may take a few minutes to reach its steady-state ranking.",
  },
  {
    q: "Do I need to use the CDP facilitator?",
    a: "Yes, to appear in the CDP Bazaar discovery you must use the CDP production facilitator at https://api.cdp.coinbase.com/platform/v2/x402/facilitator. Using other facilitators (like x402.org testnet) will not index you in the CDP Bazaar.",
  },
  {
    q: "Can I test on testnet first?",
    a: "Yes. You can develop and test on Base Sepolia (eip155:84532) using the CDP facilitator. Your testnet endpoint will appear in the Bazaar discovery once it has a successful transaction.",
  },
];

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
        FAQ
      </h3>
      {faqs.map((faq, i) => (
        <div
          key={i}
          className="border border-border rounded-lg overflow-hidden"
        >
          <button
            onClick={() => setOpenIndex(openIndex === i ? null : i)}
            className="w-full flex items-center justify-between px-4 py-3 bg-muted hover:bg-card transition-colors text-sm text-left"
          >
            <span className="text-foreground">{faq.q}</span>
            <span className="text-muted-foreground ml-2 shrink-0">
              {openIndex === i ? "\u2212" : "+"}
            </span>
          </button>
          <AnimatePresence>
            {openIndex === i && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <p className="px-4 py-3 text-sm text-muted-foreground bg-card">
                  {faq.a}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}
