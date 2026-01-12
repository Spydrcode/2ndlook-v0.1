import "server-only";

import { createSnapshotResponse } from "@/lib/openai/client";
import {
  snapshotOutputSchema,
  snapshotOutputJsonSchema,
} from "@/lib/openai/schemas";
import { getMinMeaningfulEstimates, WINDOW_DAYS } from "@/lib/config/limits";
import type { SnapshotOutput } from "@/types/2ndlook";

export interface DecisionSnapshotInput {
  windowDays: 90;
  connectorTools: string[];
  estimateSignals?: {
    countsByStatus: Record<string, number>;
    totals?: { estimates?: number };
  };
  invoiceSignals?: {
    countsByStatus: Record<string, number>;
    totals?: { invoices?: number };
  };
}

function isSnapshotEnabled(): boolean {
  return process.env.OPENAI_SNAPSHOT_ENABLED !== "false";
}

function toStatusBreakdown(
  estimateSignals?: DecisionSnapshotInput["estimateSignals"],
  invoiceSignals?: DecisionSnapshotInput["invoiceSignals"]
): Record<string, number> | null {
  const breakdown: Record<string, number> = {};

  if (estimateSignals?.countsByStatus) {
    for (const [status, count] of Object.entries(estimateSignals.countsByStatus)) {
      if (typeof count === "number") {
        breakdown[status] = count;
      }
    }
  }

  if (invoiceSignals?.countsByStatus) {
    for (const [status, count] of Object.entries(invoiceSignals.countsByStatus)) {
      if (typeof count === "number") {
        breakdown[status] = count;
      }
    }
  }

  return Object.keys(breakdown).length > 0 ? breakdown : null;
}

function buildMockSnapshot(input: DecisionSnapshotInput): SnapshotOutput {
  const estimateCount = input.estimateSignals?.totals?.estimates ?? null;
  const invoiceCount = input.invoiceSignals?.totals?.invoices ?? null;

  return {
    kind: "snapshot",
    window_days: WINDOW_DAYS,
    signals: {
      source_tools: input.connectorTools,
      totals: {
        estimates: estimateCount,
        invoices: invoiceCount,
      },
      status_breakdown: toStatusBreakdown(input.estimateSignals, input.invoiceSignals),
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
    disclaimers: [
      "This is a low-confidence snapshot generated without the model.",
    ],
  };
}

function buildInsufficientDataResult(
  input: DecisionSnapshotInput,
  requiredMinimum: number
): SnapshotOutput {
  const estimateCount = input.estimateSignals?.totals?.estimates ?? null;
  const invoiceCount = input.invoiceSignals?.totals?.invoices ?? null;

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

function buildInstructions(): string {
  return [
    "You produce a business decision snapshot from aggregated operational signals.",
    "Hard rules:",
    "- Never include customer names, addresses, notes, line items, or any PII.",
    "- Do not guess beyond the provided signals.",
    "- If signals are insufficient, return the InsufficientDataResult only.",
    "- Output MUST match the schema exactly.",
    "- Keep language Quiet Founder: calm, direct, no hype.",
  ].join("\n");
}

export async function generateDecisionSnapshot(
  input: DecisionSnapshotInput
): Promise<SnapshotOutput> {
  if (!isSnapshotEnabled()) {
    return buildMockSnapshot(input);
  }

  const minRequired = getMinMeaningfulEstimates();
  const estimateCount = input.estimateSignals?.totals?.estimates ?? null;

  if (estimateCount === null || estimateCount < minRequired) {
    return buildInsufficientDataResult(input, minRequired);
  }

  const requestPayload = {
    window_days: input.windowDays,
    connector_tools: input.connectorTools,
    estimate_signals: input.estimateSignals,
    invoice_signals: input.invoiceSignals ?? null,
  };

  const response = await createSnapshotResponse<SnapshotOutput>({
    model: getModel(),
    instructions: buildInstructions(),
    input: JSON.stringify(requestPayload),
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
