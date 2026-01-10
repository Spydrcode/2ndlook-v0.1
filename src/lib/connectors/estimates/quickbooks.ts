/**
 * QuickBooks estimate connector (stub).
 * OAuth integration not yet implemented.
 */

import type { UniversalConnector } from "../connector";
import type { EstimateCanonicalRow } from "../types";
import { NotImplementedError } from "../connector";

export class QuickBooksConnector implements UniversalConnector {
  category = "estimates" as const;
  tool = "quickbooks" as const;
  isImplemented = false;

  getDisplayName(): string {
    return "QuickBooks";
  }

  async normalizeEstimatesFromFile(): Promise<EstimateCanonicalRow[]> {
    throw new NotImplementedError(this.tool, "normalizeEstimatesFromFile");
  }

  async fetchEstimates(): Promise<EstimateCanonicalRow[]> {
    throw new NotImplementedError(this.tool, "fetchEstimates");
  }
}
