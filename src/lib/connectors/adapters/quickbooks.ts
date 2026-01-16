import { WINDOW_DAYS } from "@/lib/config/limits";
import type { ConnectorAdapter, ConnectorPayload } from "@/lib/connectors/types";

/**
 * QuickBooks adapter.
 * Returns an empty canonical payload for now; swap in real API mapping when available.
 */
export const quickbooksAdapter: ConnectorAdapter = {
  kind: "quickbooks",
  async fetchPayload(args: {
    oauth_connection_id: string;
    window_days: number;
    limits: ConnectorPayload["limits"];
  }): Promise<ConnectorPayload> {
    const windowDays = args.window_days || WINDOW_DAYS;

    return {
      kind: "quickbooks",
      generated_at: new Date().toISOString(),
      window_days: windowDays,
      limits: args.limits,
      clients: [],
      estimates: [],
      invoices: [],
      jobs: [],
    };
  },
};
