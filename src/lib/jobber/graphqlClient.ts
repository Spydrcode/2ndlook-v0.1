import { JobberAPIError, JobberMissingScopesError, JobberRateLimitedError } from "@/lib/jobber/errors";

type CostInfo = {
  requestedQueryCost?: number;
  throttleStatus?: {
    maximumAvailable?: number;
    currentlyAvailable?: number;
  };
};

function parseCost(extensions?: { cost?: CostInfo }) {
  const cost = extensions?.cost;
  if (!cost) return undefined;
  return {
    requested: cost.requestedQueryCost ?? 0,
    max: cost.throttleStatus?.maximumAvailable ?? 0,
    available: cost.throttleStatus?.currentlyAvailable,
  };
}

function readErrorMessage(err: unknown): string {
  if (!err || typeof err !== "object") return "";
  if ("message" in err && typeof (err as { message?: unknown }).message === "string") {
    return (err as { message: string }).message.toLowerCase();
  }
  return "";
}

function isThrottleError(errors: unknown[] | undefined): boolean {
  if (!errors) return false;
  return errors.some((err) => {
    const msg = readErrorMessage(err);
    return msg.includes("throttle") || msg.includes("throttled") || msg.includes("rate limit");
  });
}

function isMissingScopeError(errors: unknown[] | undefined): string[] {
  if (!errors) return [];
  const missing: string[] = [];
  for (const err of errors) {
    const msg = readErrorMessage(err);
    if (
      msg.includes("permission") ||
      msg.includes("scope") ||
      msg.includes("forbidden") ||
      msg.includes("unauthorized") ||
      msg.includes("not authorized") ||
      msg.includes("access denied")
    ) {
      missing.push(msg || "missing required scopes");
    }
  }
  return missing;
}

function getPrimaryErrorMessage(errors: unknown[] | undefined): string | null {
  if (!errors || errors.length === 0) return null;
  const first = errors[0];
  if (
    first &&
    typeof first === "object" &&
    "message" in first &&
    typeof (first as { message?: unknown }).message === "string"
  ) {
    return (first as { message: string }).message;
  }
  return null;
}

function getActionHint(message: string | null): string | null {
  if (!message) return null;
  const lower = message.toLowerCase();
  if (
    lower.includes("doesn't accept argument") ||
    lower.includes("unknown argument") ||
    lower.includes("unknown field")
  ) {
    return "schema mismatch: query/filter field not supported";
  }
  if (lower.includes("declared by") && lower.includes("not used")) {
    return "query variable declared but not used";
  }
  return null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withJitter(base: number) {
  const jitter = Math.random() * 0.25 * base;
  return base + jitter;
}

export async function jobberGraphQL<T>(
  query: string,
  variables: Record<string, unknown>,
  accessToken: string,
  opts?: { maxRetries?: number; baseBackoffMs?: number; targetMaxCost?: number },
): Promise<{ data: T; cost?: { requested: number; max: number; available?: number } }> {
  const maxRetries = opts?.maxRetries ?? 3;
  const baseBackoffMs = opts?.baseBackoffMs ?? 1000;

  let attempt = 0;
  let lastError: unknown;

  while (attempt <= maxRetries) {
    try {
      const response = await fetch("https://api.getjobber.com/api/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          "X-JOBBER-GRAPHQL-VERSION": process.env.JOBBER_GQL_VERSION ?? "2025-04-16",
        },
        body: JSON.stringify({ query, variables }),
      });

      const text = await response.text();
      let json: { data?: T; errors?: unknown[]; extensions?: { cost?: CostInfo } };
      try {
        json = JSON.parse(text);
      } catch (_err) {
        throw new JobberAPIError("Jobber API returned non-JSON response", {
          responseText: text.slice(0, 2000),
        });
      }

      const cost = parseCost(json.extensions);

      if (!response.ok) {
        // Treat as throttle or permission
        if (isThrottleError(json.errors)) {
          throw new JobberRateLimitedError("Jobber throttled the request", {
            cost,
          });
        }
        const missing = isMissingScopeError(json.errors);
        if (missing.length > 0) {
          throw new JobberMissingScopesError("Missing required Jobber scopes", missing);
        }
        const msg = (json.errors?.[0] as { message?: string } | undefined)?.message ?? `HTTP ${response.status}`;
        throw new JobberAPIError(msg, {
          responseText: text.slice(0, 2000),
          graphqlErrors: json.errors,
        });
      }

      if (isThrottleError(json.errors)) {
        throw new JobberRateLimitedError("Jobber throttled the request", { cost });
      }

      const missing = isMissingScopeError(json.errors);
      if (missing.length > 0) {
        throw new JobberMissingScopesError("Missing required Jobber scopes", missing);
      }

      const primaryError = getPrimaryErrorMessage(json.errors);
      if (primaryError) {
        const actionHint = getActionHint(primaryError) ?? undefined;
        throw new JobberAPIError(primaryError, {
          responseText: text.slice(0, 2000),
          graphqlErrors: json.errors,
          action_hint: actionHint,
        });
      }

      if (!json.data) {
        // If errors hint at permission issues, surface a scopes error explicitly
        const missing = isMissingScopeError(json.errors);
        if (missing.length > 0) {
          throw new JobberMissingScopesError("Missing required Jobber scopes", missing);
        }
        let event_id: string | undefined;
        if (typeof json === "object" && json !== null && "event_id" in json) {
          event_id = (json as { event_id?: string }).event_id;
        }
        throw new JobberAPIError("Jobber API returned empty data", {
          event_id,
          responseText: text.slice(0, 2000),
          graphqlErrors: json.errors,
        });
      }

      if (cost) {
        console.debug("[JOBBER] Cost", {
          requested: cost.requested,
          max: cost.max,
          available: cost.available,
        });
      }

      return { data: json.data, cost };
    } catch (err) {
      lastError = err;
      attempt += 1;

      const isRateLimited = err instanceof JobberRateLimitedError;

      if (!isRateLimited || attempt > maxRetries) {
        if (isRateLimited) {
          throw new JobberRateLimitedError(err.message, {
            retryAfterSeconds: err.retryAfterSeconds ?? 60,
            cost: (err as JobberRateLimitedError).cost,
          });
        }
        if (err instanceof JobberMissingScopesError) {
          throw err;
        }
        throw err;
      }

      const backoff = withJitter(baseBackoffMs * 2 ** (attempt - 1));
      console.warn(`[JOBBER] Throttled, retrying in ${Math.round(backoff)}ms (attempt ${attempt}/${maxRetries})`);
      await sleep(backoff);
    }
  }

  throw lastError instanceof Error ? lastError : new JobberAPIError("Unknown Jobber error");
}
