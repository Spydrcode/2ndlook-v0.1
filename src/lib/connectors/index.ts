/**
 * Connector registry initialization.
 * Imports and registers all available connectors.
 */

import { registerConnector } from "./connector";
import { HousecallProConnector } from "./estimates/housecallpro";
import { JobberConnector } from "./estimates/jobber";
import { JobberInvoiceConnector } from "./invoices/jobber";
import { PaymoInvoiceConnector } from "./invoices/paymo";
import { PayPalInvoiceConnector } from "./invoices/paypal";
import { QuickBooksInvoiceConnector } from "./invoices/quickbooks";
import { SquareInvoiceConnector } from "./invoices/square";
import { StripeInvoiceConnector } from "./invoices/stripe";
import { WaveInvoiceConnector } from "./invoices/wave";
import { ZohoInvoiceConnector } from "./invoices/zoho-invoice";

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
registerConnector(new JobberInvoiceConnector());

export type { UniversalConnector } from "./connector";
// Re-export registry functions for convenience
export {
  getConnector,
  isConnectorImplemented,
  listConnectors,
  listConnectorsByCategory,
  NotImplementedError,
} from "./connector";
export type {
  CalendarSignals,
  ConnectorCategory,
  ConnectorTool,
  CrmSignals,
  EstimateCanonicalRow,
  InvoiceCanonicalRow,
} from "./types";
