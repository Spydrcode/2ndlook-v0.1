import OpenAI from "openai";
import type { SnapshotResult, ConfidenceLevel } from "@/types/2ndlook";
import { buildSystemPrompt, buildSnapshotPrompt } from "./prompts";

/**
 * OpenAI client wrapper for 2ndlook v0.1
 * Enforces structured JSON output matching SnapshotResult schema
 * Server-only module - never import on client
 */

// Allowlist of supported OpenAI models
const ALLOWED_MODELS = [
  "gpt-4o-2024-08-06", // Default - supports structured outputs
  "gpt-4.1",           // Future compatibility
  "gpt-4.1-mini",      // Cost-effective option
] as const;

type AllowedModel = (typeof ALLOWED_MODELS)[number];

/**
 * Get configured OpenAI model with validation
 * Falls back to default if invalid model specified
 */
function getConfiguredModel(): AllowedModel {
  const configuredModel = process.env.OPENAI_MODEL;
  const defaultModel: AllowedModel = "gpt-4o-2024-08-06";

  if (!configuredModel) {
    return defaultModel;
  }

  if (ALLOWED_MODELS.includes(configuredModel as AllowedModel)) {
    return configuredModel as AllowedModel;
  }

  // Invalid model - log warning but don't crash
  console.warn(
    `[OpenAI] Invalid OPENAI_MODEL="${configuredModel}". ` +
      `Allowed: ${ALLOWED_MODELS.join(", ")}. ` +
      `Using default: ${defaultModel}`
  );

  return defaultModel;
}

interface AgentInput {
  source_id: string;
  source_tool?: string | null;
  demand: {
    weekly_volume: { week: string; count: number }[];
    price_distribution: { band: string; count: number }[];
  };
  decision_latency: {
    distribution: { band: string; count: number }[];
  };
  estimate_count: number;
  confidence_level: ConfidenceLevel;
  date_range: {
    earliest: string;
    latest: string;
  };
  // Optional: invoice signals (present when invoices are available)
  invoiceSignals?: {
    invoice_count: number;
    price_distribution: { band: string; count: number }[];
    time_to_invoice: { band: string; count: number }[];
    status_distribution: { status: string; count: number }[];
    weekly_volume: { week: string; count: number }[];
  };
}

/**
 * Initialize OpenAI client with server environment variables
 */
function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY environment variable is required. " +
        "Add it to your .env.local file."
    );
  }

  return new OpenAI({ apiKey });
}

/**
 * JSON Schema for SnapshotResult structured output
 * This enforces the locked v0.1 schema at the OpenAI API level
 */
const SNAPSHOT_RESULT_SCHEMA = {
  type: "object",
  properties: {
    meta: {
      type: "object",
      properties: {
        snapshot_id: { type: "string" },
        source_id: { type: "string" },
        generated_at: { type: "string" },
        estimate_count: { type: "number" },
        confidence_level: {
          type: "string",
          enum: ["low", "medium", "high"],
        },
      },
      required: [
        "snapshot_id",
        "source_id",
        "generated_at",
        "estimate_count",
        "confidence_level",
      ],
      additionalProperties: false,
    },
    demand: {
      type: "object",
      properties: {
        weekly_volume: {
          type: "array",
          items: {
            type: "object",
            properties: {
              week: { type: "string" },
              count: { type: "number" },
            },
            required: ["week", "count"],
            additionalProperties: false,
          },
        },
        price_distribution: {
          type: "array",
          items: {
            type: "object",
            properties: {
              band: { type: "string" },
              count: { type: "number" },
            },
            required: ["band", "count"],
            additionalProperties: false,
          },
        },
      },
      required: ["weekly_volume", "price_distribution"],
      additionalProperties: false,
    },
    decision_latency: {
      type: "object",
      properties: {
        distribution: {
          type: "array",
          items: {
            type: "object",
            properties: {
              band: { type: "string" },
              count: { type: "number" },
            },
            required: ["band", "count"],
            additionalProperties: false,
          },
        },
      },
      required: ["distribution"],
      additionalProperties: false,
    },
  },
  required: ["meta", "demand", "decision_latency"],
  additionalProperties: false,
} as const;

/**
 * Generate a SnapshotResult using OpenAI with structured JSON output
 *
 * SAFETY RULES:
 * - Input contains only bucketed aggregates (no raw estimates)
 * - Output must match SnapshotResult schema exactly
 * - Single agent call per snapshot (v0.1 constraint)
 *
 * @param input - Bucketed aggregates only
 * @param options - Source/snapshot metadata
 * @returns SnapshotResult conforming to locked schema
 * @throws Error if output is invalid or API fails
 */
export async function generateSnapshotResult(
  input: AgentInput
): Promise<SnapshotResult> {
  const client = getOpenAIClient();
  const model = getConfiguredModel();

  // Use prompt pack for consistent messaging
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildSnapshotPrompt(
    {
      source_id: input.source_id,
      source_tool: input.source_tool,
      estimate_count: input.estimate_count,
      date_range: input.date_range,
      weekly_volume: input.demand.weekly_volume,
      price_distribution: input.demand.price_distribution,
      decision_latency: input.decision_latency.distribution,
    },
    { tool: input.source_tool }
  );

  try {
    // Call OpenAI with structured output enforcement
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "snapshot_result",
          strict: true,
          schema: SNAPSHOT_RESULT_SCHEMA,
        },
      },
      temperature: 0.1, // Low temperature for consistency
      max_tokens: 2000,
    });

    const completion = response.choices[0]?.message?.content;

    if (!completion) {
      throw new Error("OpenAI returned empty response");
    }

    // Parse and validate
    let result: SnapshotResult;
    try {
      result = JSON.parse(completion) as SnapshotResult;
    } catch (parseError) {
      throw new Error(
        `OpenAI returned invalid JSON: ${parseError instanceof Error ? parseError.message : "parse failed"}`
      );
    }

    // Runtime validation of critical fields
    if (!result.meta || !result.demand || !result.decision_latency) {
      throw new Error("OpenAI output missing required top-level fields");
    }

    // Log minimal metadata (server console only)
    if (process.env.NODE_ENV !== "production") {
      console.log("[OpenAI] Snapshot generated:", {
        snapshot_id: result.meta.snapshot_id,
        estimate_count: result.meta.estimate_count,
        confidence_level: result.meta.confidence_level,
        usage: response.usage,
      });
    } else {
      console.log("[OpenAI] Snapshot generated:", {
        snapshot_id: result.meta.snapshot_id,
        estimate_count: result.meta.estimate_count,
        confidence_level: result.meta.confidence_level,
      });
    }

    return result;
  } catch (error) {
    // Enhanced error logging
    if (error instanceof OpenAI.APIError) {
      console.error("[OpenAI] API Error:", {
        status: error.status,
        message: error.message,
        type: error.type,
      });
      throw new Error(`OpenAI API error (${error.status}): ${error.message}`);
    }

    throw error;
  }
}
