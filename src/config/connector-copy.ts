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
    heroTitle: "For Jobber users who already have the numbers — but still carry the decisions.",
    heroSubtitle: "2ndlook turns recent closed estimates into a clear snapshot of what's happening, without adding more tools.",
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
  servicetitan: {
    heroTitle: "ServiceTitan shows performance. 2ndlook shows patterns.",
    heroSubtitle: "A calm snapshot from closed estimates — so you can see decision timing and demand shifts earlier.",
    whatThisShows: [
      "Decision latency across price ranges",
      "Weekly demand signals (without reports)",
      "Where the business is tightening or loosening",
    ],
    whatItDoesntDo: [
      "Doesn't replace ServiceTitan",
      "Doesn't pull customer or line-item details",
      "No long-term connection required",
    ],
  },
  quickbooks: {
    heroTitle: "QuickBooks tracks money. 2ndlook shows decision pressure.",
    heroSubtitle: "A one-time snapshot from closed estimates — so you can see what's forming before it becomes a problem.",
    whatThisShows: [
      "Pricing bands that move fastest",
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
    heroTitle: "For Square users quoting fast — and trying to stay ahead of the week.",
    heroSubtitle: "2ndlook turns closed estimates into simple patterns: price, timing, and demand.",
    whatThisShows: [
      "What closes quickly vs what lingers",
      "Price patterns that repeat",
      "Weekly demand signals (simple and clear)",
    ],
    whatItDoesntDo: [
      "Doesn't change Square",
      "Doesn't use customer or line-item details",
      "No long-term connection required",
    ],
  },
  joist: {
    heroTitle: "For Joist users who live in estimates — and still don't get a clean picture.",
    heroSubtitle: "2ndlook gives you a snapshot of what's closing, how long it takes, and where demand is shifting.",
    whatThisShows: [
      "Which estimates convert reliably",
      "How long decisions take by price range",
      "Weekly demand signals you can trust",
    ],
    whatItDoesntDo: [
      "Doesn't change Joist",
      "Doesn't use customer or line-item details",
      "No long-term connection required",
    ],
  },
  "housecall-pro": {
    heroTitle: "For Housecall Pro users running the day — and still needing a step back.",
    heroSubtitle: "A snapshot from closed estimates that helps you see timing and demand without more dashboards.",
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
};

// Default fallback for unrecognized tools
export const defaultConnectorCopy: ConnectorCopy = {
  heroTitle: "Connect & See",
  heroSubtitle: "A decision snapshot from closed estimates.",
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
export const reassuranceLine = "Closed estimates only. No customer or line-item details.";
