export const ESTIMATE_STATUSES = [
  "draft",
  "sent",
  "accepted",
  "declined",
  "expired",
  "cancelled",
  "converted",
  "unknown",
] as const;

export const INVOICE_STATUSES = [
  "draft",
  "sent",
  "void",
  "paid",
  "unpaid",
  "overdue",
  "refunded",
  "partial",
  "unknown",
] as const;

export type EstimateStatus = (typeof ESTIMATE_STATUSES)[number];
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

const ESTIMATE_STATUS_ALIASES: Record<string, EstimateStatus> = {
  closed: "accepted",
  approved: "accepted",
  won: "converted",
  converted: "converted",
  accepted: "accepted",
  declined: "declined",
  expired: "expired",
  canceled: "cancelled",
  cancelled: "cancelled",
  draft: "draft",
  sent: "sent",
};

const INVOICE_STATUS_ALIASES: Record<string, InvoiceStatus> = {
  voided: "void",
  partially_paid: "partial",
  partial_payment: "partial",
  partially_paid_off: "partial",
  paid: "paid",
  unpaid: "unpaid",
  overdue: "overdue",
  refunded: "refunded",
  draft: "draft",
  sent: "sent",
};

export function normalizeEstimateStatus(input?: string | null): EstimateStatus {
  if (!input) return "unknown";
  const normalized = input.trim().toLowerCase();
  if (ESTIMATE_STATUSES.includes(normalized as EstimateStatus)) {
    return normalized as EstimateStatus;
  }
  return ESTIMATE_STATUS_ALIASES[normalized] ?? "unknown";
}

export function normalizeInvoiceStatus(input?: string | null): InvoiceStatus {
  if (!input) return "unknown";
  const normalized = input.trim().toLowerCase();
  if (INVOICE_STATUSES.includes(normalized as InvoiceStatus)) {
    return normalized as InvoiceStatus;
  }
  return INVOICE_STATUS_ALIASES[normalized] ?? "unknown";
}

export const MEANINGFUL_ESTIMATE_STATUSES: EstimateStatus[] = ["sent", "accepted", "converted"];
