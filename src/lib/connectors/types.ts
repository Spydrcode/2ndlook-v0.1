/**
 * Tool-agnostic canonical connector shapes.
 * All adapters must produce these payloads so ingest stays unified.
 */

export type ConnectorKind = "jobber" | "square" | "stripe" | "quickbooks" | "file";

export type CanonicalClient = {
  client_id: string;
  created_at?: string | null;
  geo_city?: string | null;
  geo_postal?: string | null;
};

export type CanonicalEstimate = {
  estimate_id: string;
  created_at: string;
  updated_at?: string | null;
  closed_at?: string | null;
  status: string;
  amount: number;
  currency?: string | null;
  client_id?: string | null;
  job_id?: string | null;
  geo_city?: string | null;
  geo_postal?: string | null;
  job_type?: string | null;
};

export type CanonicalInvoice = {
  invoice_id: string;
  created_at: string;
  paid: boolean;
  paid_at?: string | null;
  amount: number;
  currency?: string | null;
  client_id?: string | null;
  geo_city?: string | null;
  geo_postal?: string | null;
};

export type CanonicalJob = {
  job_id: string;
  created_at?: string | null;
  completed_at?: string | null;
  client_id?: string | null;
  geo_city?: string | null;
  geo_postal?: string | null;
  job_type?: string | null;
  job_status?: string | null;
};

export type ConnectorPayload = {
  kind: ConnectorKind;
  generated_at: string;
  window_days: number;
  limits: {
    max_estimates: number;
    max_invoices: number;
    max_clients: number;
    max_jobs: number;
  };
  clients: CanonicalClient[];
  estimates: CanonicalEstimate[];
  invoices: CanonicalInvoice[];
  jobs: CanonicalJob[];
};

export type ConnectorAdapter = {
  kind: ConnectorKind;
  fetchPayload(args: {
    oauth_connection_id: string;
    window_days: number;
    limits: ConnectorPayload["limits"];
  }): Promise<ConnectorPayload>;
};

// Legacy aliases kept for backward compatibility with existing connectors.
export type ConnectorCategory = "estimates" | "invoices";
export type EstimateConnectorTool = "jobber" | "housecall-pro";
export type InvoiceConnectorTool = "stripe" | "square" | "paypal" | "wave" | "zoho-invoice" | "paymo" | "quickbooks";
export type ConnectorTool = EstimateConnectorTool | InvoiceConnectorTool;
export type EstimateCanonicalRow = CanonicalEstimate;
export type InvoiceCanonicalRow = CanonicalInvoice & {
  invoice_status?: string;
  linked_estimate_id?: string | null;
};
