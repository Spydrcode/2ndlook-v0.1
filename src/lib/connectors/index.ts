/**
 * Connector registry initialization.
 * Imports and registers all available connectors.
 */

import { registerConnector } from "./connector";
import { JobberConnector } from "./estimates/jobber";
import { HousecallProConnector } from "./estimates/housecallpro";
import { QuickBooksInvoiceConnector } from "./invoices/quickbooks";
import { SquareInvoiceConnector } from "./invoices/square";
import { StripeInvoiceConnector } from "./invoices/stripe";
import { PayPalInvoiceConnector } from "./invoices/paypal";
import { WaveInvoiceConnector } from "./invoices/wave";
import { ZohoInvoiceConnector } from "./invoices/zoho-invoice";
import { PaymoInvoiceConnector } from "./invoices/paymo";

// Register approved estimate connectors
registerConnector(new JobberConnector());
registerConnector(new HousecallProConnector());

// Register approved invoice connectors
registerConnector(new StripeInvoiceConnector());
registerConnector(new SquareInvoiceConnector());
registerConnector(new PayPalInvoiceConnector());
registerConnector(new WaveInvoiceConnector());
registerConnector(new ZohoInvoiceConnector());
registerConnector(new PaymoInvoiceConnector());
registerConnector(new QuickBooksInvoiceConnector());

// Re-export registry functions for convenience
export {
  getConnector,
  listConnectors,
  listConnectorsByCategory,
  isConnectorImplemented,
  NotImplementedError,
} from "./connector";
export type { UniversalConnector } from "./connector";
export type {
  ConnectorCategory,
  ConnectorTool,
  EstimateCanonicalRow,
  InvoiceCanonicalRow,
  CalendarSignals,
  CrmSignals,
} from "./types";
