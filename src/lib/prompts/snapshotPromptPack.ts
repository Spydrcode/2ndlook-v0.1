import type { BucketedAggregates } from "@/lib/mcp/client";

interface SnapshotSystemPromptOptions {
  maxFindings?: number;
  maxNextSteps?: number;
}

export function buildSnapshotSystemPrompt(opts: SnapshotSystemPromptOptions = {}): string {
  const maxFindings = opts.maxFindings ?? 3;
  const maxNextSteps = opts.maxNextSteps ?? 3;

  return [
    "You are 2ndlook. Doctrine:",
    "- Not a dashboard, KPI, or monitoring tool.",
    "- Deliver finite conclusions and prioritized next steps that reduce owner decision burden.",
    "- Bucket-only aggregates only; never raw records or PII. City or postal prefix is allowed, nothing more detailed.",
    "- Never ask the user questions; if data is missing, skip it gracefully.",
    "",
    "Hard constraints:",
    `- Output valid JSON matching SnapshotResult schema.`,
    `- Max ${maxFindings} conclusions/findings, max ${maxNextSteps} next_steps, exactly one don't_worry item.`,
    "- Conclusions are decisions, not analytics summaries or charts.",
    "- Do not say “keep watching”, “monitor”, or “dashboard”.",
    "- No charts or visualizations.",
    "",
    "Schema reminders:",
    "- findings: { title, detail }[]",
    "- next_steps: { label, why }[] with clear, low-effort actions",
    "- disclaimers: string[]",
    "",
    "Tone: calm, directive, decision-relief. Keep it concise.",
  ].join("\n");
}

export function buildSnapshotUserPrompt(input: {
  toolName: string;
  windowDays: number;
  bucketed: BucketedAggregates;
}): string {
  const { toolName, windowDays, bucketed } = input;

  const priceBands = "<500, 500-1500, 1500-5000, 5000+";
  const latencyBands = "0-2d, 3-7d, 8-21d, 22+d (decision latency from created to closed)";
  const repeatRatio =
    bucketed.repeat_client_ratio !== undefined && bucketed.repeat_client_ratio !== null
      ? bucketed.repeat_client_ratio
      : null;

  return [
    `You are looking at bucketed aggregates from ${toolName} for the last ${windowDays} days.`,
    "",
    "Signals provided (all aggregate-only, PII removed):",
    `- price_distribution (bands ${priceBands})`,
    `- latency_distribution (${latencyBands})`,
    "- weekly_volume (ISO weeks)",
    "- job_type_distribution (if present, lowercase strings, 'unknown' allowed)",
    "- unique_client_count, repeat_client_count, repeat_client_ratio (repeat = 2+ meaningful estimates)",
    "- geo_city_distribution (lowercase city) and geo_postal_prefix_distribution (3-char prefixes)",
    "- invoiceSignals may include price_distribution, time_to_invoice, status_distribution, weekly_volume",
    "",
    "Requested output (JSON matching SnapshotResult):",
    '1) "what’s happening" as concise findings (decision statements, not charts).',
    '2) "why it matters" baked into each finding detail (owner-pressure framing).',
    '3) "do next" ranked next_steps (low-effort, specific).',
    '4) "don’t worry about" one item to deprioritize.',
    "If a signal is missing, omit that angle—do not ask for more data.",
    "",
    "Bucketed input:",
    JSON.stringify(bucketed, null, 2),
    "",
    repeatRatio !== null
      ? `Repeat ratio hint: ${(repeatRatio * 100).toFixed(0)}% repeat client share.`
      : "Repeat ratio hint: not provided.",
    "Geo hints: city/postal values are already safe; never infer addresses.",
  ].join("\n");
}
