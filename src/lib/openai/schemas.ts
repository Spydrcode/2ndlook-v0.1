import { z } from "zod";

const confidenceSchema = z.enum(["low", "medium", "high"]);

const shortText = z.string().min(1).max(160);
const shortTitle = z.string().min(1).max(80);
const shortDetail = z.string().min(1).max(200);

export const snapshotResultSchema = z
  .object({
    kind: z.literal("snapshot"),
    window_days: z.literal(90),
    signals: z
      .object({
        source_tools: z.array(z.string().max(40)).max(12),
        totals: z
          .object({
            estimates: z.number().int().nonnegative().nullable(),
            invoices: z.number().int().nonnegative().nullable(),
          })
          .strict(),
        status_breakdown: z.record(z.number().int().nonnegative()).nullable(),
      })
      .strict(),
    scores: z
      .object({
        demand_signal: z.number().min(0).max(100),
        cash_signal: z.number().min(0).max(100),
        decision_latency: z.number().min(0).max(100),
        capacity_pressure: z.number().min(0).max(100),
        confidence: confidenceSchema,
      })
      .strict(),
    findings: z
      .array(
        z
          .object({
            title: shortTitle,
            detail: shortDetail,
          })
          .strict(),
      )
      .max(6),
    next_steps: z
      .array(
        z
          .object({
            label: shortTitle,
            why: shortDetail,
          })
          .strict(),
      )
      .max(6),
    disclaimers: z.array(shortText).max(6),
  })
  .strict();

export const insufficientDataResultSchema = z
  .object({
    kind: z.literal("insufficient_data"),
    window_days: z.literal(90),
    required_minimum: z
      .object({
        estimates: z.number().int().nonnegative().nullable(),
        invoices: z.number().int().nonnegative().nullable(),
      })
      .strict(),
    found: z
      .object({
        estimates: z.number().int().nonnegative().nullable(),
        invoices: z.number().int().nonnegative().nullable(),
      })
      .strict(),
    what_you_can_do_next: z
      .array(
        z
          .object({
            label: shortTitle,
            detail: shortDetail,
          })
          .strict(),
      )
      .max(6),
    confidence: z.literal("low"),
    disclaimers: z.array(shortText).max(6),
  })
  .strict();

export const snapshotOutputSchema = z.union([snapshotResultSchema, insufficientDataResultSchema]);

export const snapshotResultJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "window_days", "signals", "scores", "findings", "next_steps", "disclaimers"],
  properties: {
    kind: { const: "snapshot" },
    window_days: { const: 90 },
    signals: {
      type: "object",
      additionalProperties: false,
      required: ["source_tools", "totals", "status_breakdown"],
      properties: {
        source_tools: {
          type: "array",
          items: { type: "string", maxLength: 40 },
          maxItems: 12,
        },
        totals: {
          type: "object",
          additionalProperties: false,
          required: ["estimates", "invoices"],
          properties: {
            estimates: { type: ["integer", "null"], minimum: 0 },
            invoices: { type: ["integer", "null"], minimum: 0 },
          },
        },
        status_breakdown: {
          type: ["object", "null"],
          additionalProperties: { type: "integer", minimum: 0 },
        },
      },
    },
    scores: {
      type: "object",
      additionalProperties: false,
      required: ["demand_signal", "cash_signal", "decision_latency", "capacity_pressure", "confidence"],
      properties: {
        demand_signal: { type: "number", minimum: 0, maximum: 100 },
        cash_signal: { type: "number", minimum: 0, maximum: 100 },
        decision_latency: { type: "number", minimum: 0, maximum: 100 },
        capacity_pressure: { type: "number", minimum: 0, maximum: 100 },
        confidence: { type: "string", enum: ["low", "medium", "high"] },
      },
    },
    findings: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "detail"],
        properties: {
          title: { type: "string", maxLength: 80 },
          detail: { type: "string", maxLength: 200 },
        },
      },
    },
    next_steps: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "why"],
        properties: {
          label: { type: "string", maxLength: 80 },
          why: { type: "string", maxLength: 200 },
        },
      },
    },
    disclaimers: {
      type: "array",
      maxItems: 6,
      items: { type: "string", maxLength: 160 },
    },
  },
} as const;

export const insufficientDataResultJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "window_days", "required_minimum", "found", "what_you_can_do_next", "confidence", "disclaimers"],
  properties: {
    kind: { const: "insufficient_data" },
    window_days: { const: 90 },
    required_minimum: {
      type: "object",
      additionalProperties: false,
      required: ["estimates", "invoices"],
      properties: {
        estimates: { type: ["integer", "null"], minimum: 0 },
        invoices: { type: ["integer", "null"], minimum: 0 },
      },
    },
    found: {
      type: "object",
      additionalProperties: false,
      required: ["estimates", "invoices"],
      properties: {
        estimates: { type: ["integer", "null"], minimum: 0 },
        invoices: { type: ["integer", "null"], minimum: 0 },
      },
    },
    what_you_can_do_next: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "detail"],
        properties: {
          label: { type: "string", maxLength: 80 },
          detail: { type: "string", maxLength: 200 },
        },
      },
    },
    confidence: { const: "low" },
    disclaimers: {
      type: "array",
      maxItems: 6,
      items: { type: "string", maxLength: 160 },
    },
  },
} as const;

export const snapshotOutputJsonSchema = {
  oneOf: [snapshotResultJsonSchema, insufficientDataResultJsonSchema],
} as const;
