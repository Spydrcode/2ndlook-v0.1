import OpenAI from "openai";
import type { SnapshotResult, ConfidenceLevel } from "@/types/2ndlook";

/**
 * OpenAI client wrapper for 2ndlook v0.1
 * Enforces structured JSON output matching SnapshotResult schema
 * Server-only module - never import on client
 */

interface AgentInput {
  demand: {
    weekly_volume: { week: string; count: number }[];
    price_distribution: { band: string; count: number }[];
  };
  decision_latency: {
    distribution: { band: string; count: number }[];
  };
  estimate_count: number;
  confidence_level: ConfidenceLevel;
}

interface GenerateSnapshotOptions {
  source_id: string;
  snapshot_id?: string;
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
  input: AgentInput,
  options: GenerateSnapshotOptions
): Promise<SnapshotResult> {
  const client = getOpenAIClient();
  const now = new Date().toISOString();

  // Build system prompt (no raw data, aggregates only)
  const systemPrompt = `You are a business insights analyst for 2ndlook.
Your task is to analyze bucketed estimate data and return a structured JSON snapshot.

RULES:
1. You receive ONLY aggregated buckets - never raw estimate rows.
2. You must return valid JSON matching the exact schema provided.
3. Your output should reflect the patterns in the bucketed data.
4. Use the provided metadata (source_id, snapshot_id, confidence_level) as-is.
5. Do not invent data - use the exact counts from the input buckets.

The output format is strictly enforced by the JSON schema.`;

  // Build user prompt with bucketed data only
  const userPrompt = `Analyze this bucketed estimate data and return a structured snapshot:

SOURCE METADATA:
- source_id: ${options.source_id}
- snapshot_id: ${options.snapshot_id || "pending"}
- generated_at: ${now}
- estimate_count: ${input.estimate_count}
- confidence_level: ${input.confidence_level}

BUCKETED DATA (aggregates only):

Weekly Volume:
${input.demand.weekly_volume.map((w) => `  ${w.week}: ${w.count} estimates`).join("\n")}

Price Distribution:
${input.demand.price_distribution.map((p) => `  ${p.band}: ${p.count} estimates`).join("\n")}

Decision Latency:
${input.decision_latency.distribution.map((d) => `  ${d.band}: ${d.count} estimates`).join("\n")}

Return a JSON snapshot that includes this exact data in the required schema.`;

  try {
    // Call OpenAI with structured output enforcement
    const response = await client.chat.completions.create({
      model: "gpt-4o-2024-08-06", // Supports structured outputs
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
