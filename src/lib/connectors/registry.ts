import { jobberAdapter } from "@/lib/connectors/adapters/jobber";
import { quickbooksAdapter } from "@/lib/connectors/adapters/quickbooks";
import { squareAdapter } from "@/lib/connectors/adapters/square";
import { stripeAdapter } from "@/lib/connectors/adapters/stripe";
import type { ConnectorAdapter, ConnectorKind } from "@/lib/connectors/types";

const adapters: Record<ConnectorKind, ConnectorAdapter> = {
  jobber: jobberAdapter,
  square: squareAdapter,
  stripe: stripeAdapter,
  quickbooks: quickbooksAdapter,
  file: {
    kind: "file",
    async fetchPayload({ window_days, limits }) {
      return {
        kind: "file",
        generated_at: new Date().toISOString(),
        window_days,
        limits,
        clients: [],
        estimates: [],
        invoices: [],
        jobs: [],
      };
    },
  },
};

export function getAdapter(kind: ConnectorKind): ConnectorAdapter {
  return adapters[kind];
}
