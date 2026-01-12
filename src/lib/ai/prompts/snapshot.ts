/**
 * Snapshot analysis prompt builder
 *
 * Generates context-aware prompts for snapshot analysis,
 * optionally including tool-specific language when a connector
 * source tool is known.
 */

interface BucketedAggregates {
  source_id: string;
  source_tool?: string | null;
  estimate_count: number;
  date_range: {
    earliest: string;
    latest: string;
  };
  weekly_volume: Array<{ week: string; count: number }>;
  price_distribution: Array<{ band: string; count: number }>;
  decision_latency: Array<{ band: string; count: number }>;
}

interface SnapshotPromptOptions {
  tool?: string | null;
}

/**
 * Build snapshot analysis prompt with optional tool-aware wording
 *
 * When tool is provided (e.g., "jobber", "housecall-pro"), adjusts
 * language to match the connector context without changing schema.
 */
export function buildSnapshotPrompt(
  aggregates: BucketedAggregates,
  options: SnapshotPromptOptions = {}
): string {
  const { tool } = options;

  // Tool-aware intro (optional enhancement)
  const toolContext = tool
    ? `This data comes from ${formatToolName(tool)}, a field service management platform.`
    : "This data comes from a field service management system.";

  const prompt = `${toolContext}

Analyze the following bucketed estimate data and generate a SnapshotResult.

**Source Information:**
- Source ID: ${aggregates.source_id}
- Estimate Count: ${aggregates.estimate_count}
- Date Range: ${aggregates.date_range.earliest} to ${aggregates.date_range.latest}

**Weekly Volume:**
${formatWeeklyVolume(aggregates.weekly_volume)}

**Price Distribution:**
${formatPriceDistribution(aggregates.price_distribution)}

**Decision Latency Distribution:**
${formatDecisionLatency(aggregates.decision_latency)}

---

Generate a SnapshotResult with:
1. Complete meta section (snapshot_id, source_id, generated_at, estimate_count, confidence_level)
2. Demand patterns (weekly_volume, price_distribution - must match input exactly)
3. Decision latency analysis (distribution must match input exactly)

Confidence level guidelines:
- low: < 30 estimates
- medium: 30-100 estimates
- high: > 100 estimates

Ensure all arrays match the input data exactly - no filtering, no adjustments.`;

  return prompt;
}

// Helper: Format tool name for display
function formatToolName(tool: string): string {
  const toolNames: Record<string, string> = {
    jobber: "Jobber",
    "housecall-pro": "Housecall Pro",
    quickbooks: "QuickBooks",
    square: "Square",
    stripe: "Stripe",
    paypal: "PayPal",
    wave: "Wave",
    "zoho-invoice": "Zoho Invoice",
    paymo: "Paymo",
  };

  return toolNames[tool.toLowerCase()] || tool;
}

// Helper: Format weekly volume for prompt
function formatWeeklyVolume(
  weeklyVolume: Array<{ week: string; count: number }>
): string {
  return weeklyVolume.map((w) => `  ${w.week}: ${w.count} estimates`).join("\n");
}

// Helper: Format price distribution for prompt
function formatPriceDistribution(
  priceDistribution: Array<{ band: string; count: number }>
): string {
  return priceDistribution.map((p) => `  ${p.band}: ${p.count} estimates`).join("\n");
}

// Helper: Format decision latency for prompt
function formatDecisionLatency(
  decisionLatency: Array<{ band: string; count: number }>
): string {
  return decisionLatency.map((d) => `  ${d.band}: ${d.count} estimates`).join("\n");
}
