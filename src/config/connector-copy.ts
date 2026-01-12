/**
 * Copy map for connector-specific landing pages
 * Used by /connectors/[tool] dynamic route
 *
 * RULES:
 * - No AI/LLM/agent mentions
 * - Quiet Founder tone
 * - Consistent structure
 */

export interface ConnectorCopy {
  heroTitle: string;
  heroSubtitle: string;
  whatThisShows: string[];
  whatItDoesntDo: string[];
}

export const connectorLandingCopy: Record<string, ConnectorCopy> = {
  jobber: {
    heroTitle: "For Jobber users who already have the numbers but still carry the decisions.",
    heroSubtitle: "2ndlook turns recent estimates into a clear snapshot of what's happening, without adding more tools.",
    whatThisShows: [
      "Which price ranges close fastest",
      "How long decisions really take",
      "Weekly demand signals you can plan around",
    ],
    whatItDoesntDo: [
      "Doesn't change Jobber",
      "Doesn't use customer or line-item details",
      "Doesn't stay connected",
    ],
  },
  quickbooks: {
    heroTitle: "QuickBooks tracks money. 2ndlook shows decision pressure.",
    heroSubtitle: "A one-time snapshot from recent invoices so you can see what's forming before it becomes a problem.",
    whatThisShows: [
      "Invoice amounts that move fastest",
      "Decision timelines you can finally see",
      "Weeks where demand is building or thinning",
    ],
    whatItDoesntDo: [
      "Doesn't change QuickBooks",
      "Doesn't use customer or line-item details",
      "No long-term connection required",
    ],
  },
  square: {
    heroTitle: "For Square users moving payments fast and trying to stay ahead of the week.",
    heroSubtitle: "2ndlook turns recent invoices into simple patterns: price, timing, and demand.",
    whatThisShows: [
      "What gets paid quickly vs what lingers",
      "Price patterns that repeat",
      "Weekly demand signals (simple and clear)",
    ],
    whatItDoesntDo: [
      "Doesn't change Square",
      "Doesn't use customer or line-item details",
      "No long-term connection required",
    ],
  },
  "housecall-pro": {
    heroTitle: "For Housecall Pro users running the day and still needing a step back.",
    heroSubtitle: "A snapshot from recent estimates that helps you see timing and demand without more dashboards.",
    whatThisShows: [
      "Decision timing you can plan around",
      "Price bands that behave differently",
      "Weekly demand signals (clear, not noisy)",
    ],
    whatItDoesntDo: [
      "Doesn't change Housecall Pro",
      "Doesn't use customer or line-item details",
      "No long-term connection required",
    ],
  },
  stripe: {
    heroTitle: "Stripe handles payments. 2ndlook shows the patterns forming behind them.",
    heroSubtitle: "A calm snapshot from recent invoices so you can see demand and decision timing without extra dashboards.",
    whatThisShows: [
      "Invoice amounts that move quickly",
      "Decision timing by size",
      "Weekly demand signals you can plan around",
    ],
    whatItDoesntDo: [
      "Doesn't change Stripe",
      "Doesn't use customer or line-item details",
      "No long-term connection required",
    ],
  },
  paypal: {
    heroTitle: "PayPal moves the money. 2ndlook shows the pressure behind it.",
    heroSubtitle: "One snapshot from recent invoices so you can see pricing and timing patterns clearly.",
    whatThisShows: [
      "What gets paid fast vs slow",
      "Price bands that behave differently",
      "Weekly demand signals (simple and clear)",
    ],
    whatItDoesntDo: [
      "Doesn't change PayPal",
      "Doesn't use customer or line-item details",
      "No long-term connection required",
    ],
  },
  wave: {
    heroTitle: "Wave tracks invoices. 2ndlook shows the patterns.",
    heroSubtitle: "A snapshot from recent invoices so you can see decision timing and demand shifts earlier.",
    whatThisShows: [
      "Which invoice amounts convert reliably",
      "How long payments take by size",
      "Weekly demand signals",
    ],
    whatItDoesntDo: [
      "Doesn't change Wave",
      "Doesn't use customer or line-item details",
      "No long-term connection required",
    ],
  },
  "zoho-invoice": {
    heroTitle: "Zoho Invoice keeps records. 2ndlook shows decision pressure.",
    heroSubtitle: "A one-time snapshot from recent invoices to see pricing and timing patterns without extra dashboards.",
    whatThisShows: [
      "Amounts that move quickly",
      "Decision timelines you can actually see",
      "Weekly demand signals",
    ],
    whatItDoesntDo: [
      "Doesn't change Zoho Invoice",
      "Doesn't use customer or line-item details",
      "No long-term connection required",
    ],
  },
  paymo: {
    heroTitle: "Paymo helps you bill. 2ndlook shows the patterns behind each bill.",
    heroSubtitle: "A snapshot from recent invoices so you can see where demand is tightening or loosening.",
    whatThisShows: [
      "Amounts that clear quickly",
      "Decision timing by invoice size",
      "Weekly demand signals (quiet, not noisy)",
    ],
    whatItDoesntDo: [
      "Doesn't change Paymo",
      "Doesn't use customer or line-item details",
      "No long-term connection required",
    ],
  },
};

// Default fallback for unrecognized tools
export const defaultConnectorCopy: ConnectorCopy = {
  heroTitle: "Connect & See",
  heroSubtitle: "A decision snapshot from recent estimates.",
  whatThisShows: [
    "Which price ranges close fastest",
    "How long decisions really take",
    "Weekly demand signals you can plan around",
  ],
  whatItDoesntDo: [
    "Doesn't change your existing tool",
    "Doesn't use customer or line-item details",
    "No long-term connection required",
  ],
};

// Reassurance line (same for all pages)
export const reassuranceLine = "Signal-only. No customer or line-item details.";
