/**
 * Field-diet sanitizers shared by all connector adapters.
 * These enforce non-PII rules before normalization.
 */

export function sanitizeCity(value?: string | null): string | null {
  if (!value) return null;
  const city = value.trim().toLowerCase();
  return city.length ? city : null;
}

export function sanitizePostal(value?: string | null): string | null {
  if (!value) return null;
  const postal = value.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return postal.length ? postal : null;
}

export function sanitizeMoney(value?: number | string | null): number {
  const cleaned = Number.parseFloat(String(value ?? "").replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(cleaned) || cleaned < 0) return 0;
  return cleaned;
}
