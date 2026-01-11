// 2ndlook v0.1 TypeScript Types (LOCKED)
// Copied from src/types/2ndlook.ts for MCP server use

export type SourceType = "csv" | "salesforce" | "hubspot";

export type SourceStatus = "pending" | "ingested" | "bucketed" | "snapshot_generated";

export type EstimateStatus = "closed" | "accepted";

export type InvoiceStatus = "draft" | "sent" | "void" | "paid" | "unpaid" | "overdue";

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
}

export interface EstimateNormalized {
  id: string;
  estimate_id: string;
  source_id: string;
  created_at: string;
  closed_at: string;
  amount: number;
  status: EstimateStatus;
  job_type?: string;
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

export interface Snapshot {
  id: string;
  source_id: string;
  user_id: string;
  estimate_count: number;
  confidence_level: ConfidenceLevel;
  result: SnapshotResult;
  generated_at: string;
}

// Snapshot Result Schema (LOCKED)
export interface SnapshotResult {
  meta: {
    snapshot_id: string;
    source_id: string;
    generated_at: string;
    estimate_count: number;
    confidence_level: ConfidenceLevel;
    invoice_count?: number;
  };
  demand: {
    weekly_volume: { week: string; count: number }[];
    price_distribution: { band: string; count: number }[];
  };
  decision_latency: {
    distribution: { band: string; count: number }[];
  };
  invoiceSignals?: {
    price_distribution: { band: string; count: number }[];
    time_to_invoice: { band: string; count: number }[];
    status_distribution: { status: string; count: number }[];
    weekly_volume: { week: string; count: number }[];
  };
}
