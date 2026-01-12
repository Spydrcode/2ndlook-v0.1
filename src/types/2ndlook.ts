// 2ndlook v0.1 TypeScript Types (LOCKED)

export type SourceType = "csv" | "salesforce" | "hubspot";

export type SourceStatus =
  | "pending"
  | "ingested"
  | "bucketed"
  | "snapshot_generated"
  | "insufficient_data";

export type EstimateStatus =
  | "draft"
  | "sent"
  | "accepted"
  | "declined"
  | "expired"
  | "cancelled"
  | "converted"
  | "unknown";

export type InvoiceStatus =
  | "draft"
  | "sent"
  | "void"
  | "paid"
  | "unpaid"
  | "overdue"
  | "refunded"
  | "partial"
  | "unknown";

export type ConfidenceLevel = "low" | "medium" | "high";

export type PriceBand = "<500" | "500-1500" | "1500-5000" | "5000+";

export type LatencyBand = "0-2d" | "3-7d" | "8-21d" | "22+d";

// Database Models
export interface Source {
  id: string;
  user_id: string;
  source_type: SourceType;
  source_name: string;
  created_at: string;
  status: SourceStatus;
  metadata?: {
    meaningful_estimates?: number;
    required_min?: number;
  } | null;
}

export interface EstimateNormalized {
  id: string;
  estimate_id: string;
  source_id: string;
  created_at: string;
  closed_at?: string | null;
  updated_at?: string | null;
  amount: number;
  status: EstimateStatus;
  job_type?: string;
}

export interface InvoiceNormalized {
  id: string;
  invoice_id: string;
  source_id: string;
  invoice_date: string; // ISO 8601
  invoice_total: number;
  invoice_status: InvoiceStatus;
  linked_estimate_id?: string | null;
}

export interface EstimateBucket {
  id: string;
  source_id: string;
  price_band_lt_500: number;
  price_band_500_1500: number;
  price_band_1500_5000: number;
  price_band_5000_plus: number;
  latency_band_0_2: number;
  latency_band_3_7: number;
  latency_band_8_21: number;
  latency_band_22_plus: number;
  weekly_volume: { week: string; count: number }[];
  created_at: string;
}

export interface InvoiceBucket {
  id: string;
  source_id: string;
  // Invoice totals by same price bands as estimates
  price_band_lt_500: number;
  price_band_500_1500: number;
  price_band_1500_5000: number;
  price_band_5000_plus: number;
  // Time from estimate to invoice (for linked invoices only)
  time_to_invoice_0_7: number;   // 0-7 days
  time_to_invoice_8_14: number;  // 8-14 days
  time_to_invoice_15_30: number; // 15-30 days
  time_to_invoice_31_plus: number; // 31+ days
  // Status distribution
  status_draft: number;
  status_sent: number;
  status_void: number;
  status_paid: number;
  status_unpaid: number;
  status_overdue: number;
  status_refunded: number;
  status_partial: number;
  status_unknown: number;
  // Volume over time
  weekly_volume: { week: string; count: number }[];
  created_at: string;
}

export interface Snapshot {
  id: string;
  source_id: string;
  user_id: string;
  estimate_count: number;
  confidence_level: ConfidenceLevel;
  result: SnapshotOutput;
  generated_at: string;
}

export interface SnapshotResult {
  kind: "snapshot";
  window_days: 90;
  signals: {
    source_tools: string[];
    totals: {
      estimates: number | null;
      invoices: number | null;
    };
    status_breakdown: Record<string, number> | null;
  };
  scores: {
    demand_signal: number;
    cash_signal: number;
    decision_latency: number;
    capacity_pressure: number;
    confidence: ConfidenceLevel;
  };
  findings: Array<{ title: string; detail: string }>;
  next_steps: Array<{ label: string; why: string }>;
  disclaimers: string[];
}

export interface InsufficientDataResult {
  kind: "insufficient_data";
  window_days: 90;
  required_minimum: {
    estimates: number | null;
    invoices: number | null;
  };
  found: {
    estimates: number | null;
    invoices: number | null;
  };
  what_you_can_do_next: Array<{ label: string; detail: string }>;
  confidence: "low";
  disclaimers: string[];
}

export type SnapshotOutput = SnapshotResult | InsufficientDataResult;

// API Request/Response Types
export interface IngestRequest {
  source_id: string;
  file: File;
}

export interface IngestResponse {
  received: number;
  kept: number;
  rejected: number;
  source_id: string;
}

export interface BucketRequest {
  source_id: string;
}

export interface BucketResponse {
  source_id: string;
  bucketed: boolean;
  status?: SourceStatus;
  metadata?: Source["metadata"];
}

export interface SnapshotRequest {
  source_id: string;
}

export interface SnapshotResponse {
  snapshot_id: string;
}

// CSV Row Type (before normalization)
export interface CSVEstimateRow {
  estimate_id: string;
  created_at: string;
  closed_at?: string | null;
  updated_at?: string | null;
  amount: string | number;
  status: string;
  job_type?: string;
}
