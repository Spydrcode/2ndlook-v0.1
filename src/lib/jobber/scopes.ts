const DEFAULT_JOBBER_SCOPES = ["quotes:read", "invoices:read", "jobs:read", "clients:read", "payments:read"];

const REQUIRED_JOBBER_SCOPES = ["quotes:read", "invoices:read", "jobs:read", "clients:read"];

export function getRequestedJobberScopes(): string {
  const raw = process.env.JOBBER_SCOPES;
  if (raw && raw.trim().length > 0) {
    return raw.trim();
  }
  return DEFAULT_JOBBER_SCOPES.join(" ");
}

export function getRequiredJobberScopes(): string[] {
  return REQUIRED_JOBBER_SCOPES.slice();
}

export function parseScopes(scopesRaw?: string | null): Set<string> {
  if (!scopesRaw) return new Set();
  return new Set(
    scopesRaw
      .split(/\s+/)
      .map((scope) => scope.trim())
      .filter(Boolean),
  );
}
