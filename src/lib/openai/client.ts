import "server-only";
import OpenAI from "openai";

const MAX_RETRIES = 2;
const BASE_RETRY_DELAY_MS = 250;

export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export class OpenAISnapshotError extends Error {
  status?: number;
  code: string;
  requestId?: string;

  constructor(message: string, options?: { status?: number; code?: string; requestId?: string }) {
    super(message);
    this.name = "OpenAISnapshotError";
    this.status = options?.status;
    this.code = options?.code ?? "openai_error";
    this.requestId = options?.requestId;
  }
}

function isSnapshotEnabled(): boolean {
  return process.env.OPENAI_SNAPSHOT_ENABLED !== "false";
}

function isRetryableStatus(status?: number): boolean {
  return status === 429 || (status !== undefined && status >= 500);
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function createSnapshotResponse<T>(
  params: OpenAI.Responses.ResponseCreateParamsNonStreaming
): Promise<T> {
  if (!isSnapshotEnabled()) {
    throw new OpenAISnapshotError("OpenAI snapshot generation is disabled", {
      code: "snapshot_disabled",
    });
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new OpenAISnapshotError("OPENAI_API_KEY is not configured", {
      code: "missing_api_key",
    });
  }

  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const start = Date.now();
    try {
      const response = await openai.responses.create(params);
      const duration = Date.now() - start;
      const usage = response.usage
        ? {
            input_tokens: response.usage.input_tokens,
            output_tokens: response.usage.output_tokens,
            total_tokens: response.usage.total_tokens,
          }
        : undefined;

      console.log("[OpenAI] Snapshot response received:", {
        model: params.model,
        duration_ms: duration,
        usage,
        request_id: response._request_id,
      });

      const outputText = response.output_text?.trim();
      if (!outputText) {
        throw new OpenAISnapshotError("OpenAI response was empty", {
          code: "empty_response",
          requestId: response._request_id ?? undefined,
        });
      }

      return JSON.parse(outputText) as T;
    } catch (error) {
      lastError = error;

      if (error instanceof OpenAI.APIError) {
        const retryable = isRetryableStatus(error.status);
        if (retryable && attempt < MAX_RETRIES) {
          await delay(BASE_RETRY_DELAY_MS * (attempt + 1));
          continue;
        }

        throw new OpenAISnapshotError(error.message, {
          status: error.status,
          code: retryable ? "retry_exhausted" : "non_retryable",
          requestId: error.requestID ?? undefined,
        });
      }

      if (error instanceof OpenAISnapshotError) {
        throw error;
      }

      throw new OpenAISnapshotError(
        error instanceof Error ? error.message : "Unknown OpenAI error",
        { code: "unknown_error" }
      );
    }
  }

  throw new OpenAISnapshotError(
    lastError instanceof Error ? lastError.message : "OpenAI request failed",
    { code: "retry_exhausted" }
  );
}
