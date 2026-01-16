import "server-only";

import { getMinMeaningfulEstimates, WINDOW_DAYS } from "@/lib/config/limits";
import type { BucketedAggregates } from "@/lib/mcp/client";
import { createSnapshotResponse } from "@/lib/openai/client";
import { snapshotOutputJsonSchema, snapshotOutputSchema } from "@/lib/openai/schemas";
import { buildSnapshotSystemPrompt, buildSnapshotUserPrompt } from "@/lib/prompts/snapshotPromptPack";
import type { SnapshotOutput } from "@/types/2ndlook";

export interface DecisionSnapshotInput {
  aggregates: BucketedAggregates;
}

function isSnapshotEnabled(): boolean {
  return process.env.OPENAI_SNAPSHOT_ENABLED !== "false";
}

function toStatusBreakdown(aggregates: BucketedAggregates): Record<string, number> | null {
  if (!aggregates.invoiceSignals) return null;
  const breakdown: Record<string, number> = {};
  for (const item of aggregates.invoiceSignals.status_distribution ?? []) {
    if (typeof item.count === "number") {
      breakdown[item.status] = item.count;
    }
  }
  return Object.keys(breakdown).length > 0 ? breakdown : null;
}

function buildMockSnapshot(input: DecisionSnapshotInput): SnapshotOutput {
  const estimateCount = input.aggregates.estimate_count ?? null;
  const invoiceCount = input.aggregates.invoiceSignals?.invoice_count ?? null;

  return {
    kind: "snapshot",
    window_days: WINDOW_DAYS,
    signals: {
      source_tools: input.aggregates.source_tool ? [input.aggregates.source_tool] : [],
      totals: {
        estimates: estimateCount,
        invoices: invoiceCount,
      },
      status_breakdown: toStatusBreakdown(input.aggregates),
    },
    scores: {
      demand_signal: 40,
      cash_signal: 40,
      decision_latency: 50,
      capacity_pressure: 40,
      confidence: "low",
    },
    findings: [
      {
        title: "Snapshot running in mock mode",
        detail: "Enable OpenAI to generate full findings from your signals.",
      },
    ],
    next_steps: [
      {
        label: "Enable OpenAI snapshots",
        why: "Set OPENAI_SNAPSHOT_ENABLED=true to turn on AI scoring.",
      },
    ],
    disclaimers: ["This is a low-confidence snapshot generated without the model."],
  };
}

function buildInsufficientDataResult(input: DecisionSnapshotInput, requiredMinimum: number): SnapshotOutput {
  const estimateCount = input.aggregates.estimate_count ?? null;
  const invoiceCount = input.aggregates.invoiceSignals?.invoice_count ?? null;

  return {
    kind: "insufficient_data",
    window_days: WINDOW_DAYS,
    required_minimum: {
      estimates: requiredMinimum,
      invoices: null,
    },
    found: {
      estimates: estimateCount,
      invoices: invoiceCount,
    },
    what_you_can_do_next: [
      {
        label: "Capture more recent estimates",
        detail: "We need a fuller 90-day window to calculate reliable signals.",
      },
      {
        label: "Reconnect once volume increases",
        detail: "Reconnect after you have more sent/accepted estimates.",
      },
    ],
    confidence: "low",
    disclaimers: ["Not enough signal yet to produce a full snapshot."],
  };
}

function getModel(): string {
  return process.env.OPENAI_MODEL || "gpt-4o-2024-08-06";
}

function getReasoningEffort(): "low" | "medium" | "high" {
  const effort = process.env.OPENAI_REASONING_EFFORT;
  if (effort === "medium" || effort === "high") {
    return effort;
  }
  return "low";
}

export async function generateDecisionSnapshot(input: DecisionSnapshotInput): Promise<SnapshotOutput> {
  if (!isSnapshotEnabled()) {
    return buildMockSnapshot(input);
  }

  const minRequired = getMinMeaningfulEstimates();
  const estimateCount = input.aggregates.estimate_count ?? null;

  if (estimateCount === null || estimateCount < minRequired) {
    return buildInsufficientDataResult(input, minRequired);
  }

  const systemPrompt = buildSnapshotSystemPrompt();
  const userPrompt = buildSnapshotUserPrompt({
    toolName: input.aggregates.source_tool ?? "2ndlook",
    windowDays: WINDOW_DAYS,
    bucketed: input.aggregates,
  });

  const response = await createSnapshotResponse<SnapshotOutput>({
    model: getModel(),
    instructions: systemPrompt,
    input: userPrompt,
    reasoning: { effort: getReasoningEffort() },
    text: {
      format: {
        type: "json_schema",
        name: "decision_snapshot",
        strict: true,
        schema: snapshotOutputJsonSchema,
      },
    },
    max_output_tokens: 800,
    temperature: 0.2,
  });

  return snapshotOutputSchema.parse(response);
}
