import { WINDOW_DAYS } from "@/lib/config/limits";
import type { ConnectorAdapter, ConnectorPayload } from "@/lib/connectors/types";

/**
 * Stripe adapter.
 * Placeholder for future invoice/estimate fetching; currently returns an empty, canonical payload.
 * Keeps the ingest pipeline unified so Stripe can plug in without hand-written logic later.
 */
export const stripeAdapter: ConnectorAdapter = {
  kind: "stripe",
  async fetchPayload(args: {
    oauth_connection_id: string;
    window_days: number;
    limits: ConnectorPayload["limits"];
  }): Promise<ConnectorPayload> {
    const windowDays = args.window_days || WINDOW_DAYS;

    return {
      kind: "stripe",
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
