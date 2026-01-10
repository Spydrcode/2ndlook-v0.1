/**
 * Canonical types for the Universal Connector system.
 * These types define the normalized data shapes that all connectors must produce.
 */

export type ConnectorCategory = "estimates" | "calendar" | "crm";

export type EstimateConnectorTool =
  | "file"
  | "servicetitan"
  | "jobber"
  | "quickbooks"
  | "square"
  | "joist"
  | "housecallpro";

export type CalendarConnectorTool =
  | "google-calendar"
  | "outlook"
  | "apple-calendar"
  | "calendly"
  | "cal-com";

export type CrmConnectorTool = "hubspot" | "highlevel" | "pipedrive" | "salesforce";

export type ConnectorTool = EstimateConnectorTool | CalendarConnectorTool | CrmConnectorTool;

/**
 * Canonical estimate row.
 * All estimate connectors must normalize their data to this shape.
 */
export interface EstimateCanonicalRow {
  estimate_id: string;
  created_at: string; // ISO 8601
  closed_at: string; // ISO 8601
  amount: number;
  status: "closed" | "accepted";
  job_type?: string | null;
}

/**
 * Aggregated calendar signals (optional, for v0.2+).
 * Calendar connectors provide aggregated busy/free patterns, not individual events.
 */
export interface CalendarSignals {
  window_start: string; // ISO 8601
  window_end: string; // ISO 8601
  busy_blocks_by_week: Array<{
    week: string; // ISO week string
    blocks: number; // count of busy blocks
  }>;
  confidence: "low" | "medium" | "high";
}

/**
 * Aggregated CRM signals (optional, for v0.2+).
 * CRM connectors provide aggregated follow-up patterns, not individual contacts.
 */
export interface CrmSignals {
  window_start: string; // ISO 8601
  window_end: string; // ISO 8601
  followups_by_latency_band: Array<{
    band: "0-2" | "3-7" | "8-21" | "22+";
    count: number;
  }>;
  confidence: "low" | "medium" | "high";
}
