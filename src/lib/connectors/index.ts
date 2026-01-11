/**
 * Connector registry initialization.
 * Imports and registers all available connectors.
 */

import { registerConnector } from "./connector";
import { FileEstimateConnector } from "./estimates/fileConnector";
import { ServiceTitanConnector } from "./estimates/servicetitan";
import { JobberConnector } from "./estimates/jobber";
import { QuickBooksConnector } from "./estimates/quickbooks";
import { SquareConnector } from "./estimates/square";
import { JoistConnector } from "./estimates/joist";
import { HousecallProConnector } from "./estimates/housecallpro";
import { FileInvoiceConnector } from "./invoices/fileConnector";
import { JobberInvoiceConnector } from "./invoices/jobber";
import { QuickBooksInvoiceConnector } from "./invoices/quickbooks";
import { ServiceTitanInvoiceConnector } from "./invoices/servicetitan";
import { SquareInvoiceConnector } from "./invoices/square";

// Register all estimate connectors
registerConnector(new FileEstimateConnector());
registerConnector(new ServiceTitanConnector());
registerConnector(new JobberConnector());
registerConnector(new QuickBooksConnector());
registerConnector(new SquareConnector());
registerConnector(new JoistConnector());
registerConnector(new HousecallProConnector());

// Register all invoice connectors
registerConnector(new FileInvoiceConnector());
registerConnector(new JobberInvoiceConnector());
registerConnector(new QuickBooksInvoiceConnector());
registerConnector(new ServiceTitanInvoiceConnector());
registerConnector(new SquareInvoiceConnector());

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
