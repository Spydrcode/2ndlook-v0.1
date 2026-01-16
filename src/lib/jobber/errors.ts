export class JobberRateLimitedError extends Error {
  retryAfterSeconds: number;
  cost?: { requested?: number; max?: number; available?: number };
  event_id?: string;

  constructor(
    message: string,
    options?: { retryAfterSeconds?: number; cost?: JobberRateLimitedError["cost"]; event_id?: string },
  ) {
    super(message);
    this.name = "JobberRateLimitedError";
    this.retryAfterSeconds = options?.retryAfterSeconds ?? 60;
    this.cost = options?.cost;
    this.event_id = options?.event_id;
  }
}

export class JobberMissingScopesError extends Error {
  missing: string[];

  constructor(message: string, missing: string[] = []) {
    super(message);
    this.name = "JobberMissingScopesError";
    this.missing = missing;
  }
}

export class JobberAPIError extends Error {
  code?: string;
  event_id?: string;

  constructor(message: string, options?: { code?: string; event_id?: string }) {
    super(message);
    this.name = "JobberAPIError";
    this.code = options?.code;
    this.event_id = options?.event_id;
  }
}
