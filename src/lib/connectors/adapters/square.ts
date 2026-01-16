import { WINDOW_DAYS } from "@/lib/config/limits";
import type { ConnectorAdapter, ConnectorPayload } from "@/lib/connectors/types";

/**
 * Square adapter.
 * Placeholder returning an empty canonical payload to keep the agentic ingest path consistent.
 * Replace the data fetch with real Square API mapping when available.
 */
export const squareAdapter: ConnectorAdapter = {
  kind: "square",
  async fetchPayload(args: {
    oauth_connection_id: string;
    window_days: number;
    limits: ConnectorPayload["limits"];
  }): Promise<ConnectorPayload> {
    const windowDays = args.window_days || WINDOW_DAYS;

    return {
      kind: "square",
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
