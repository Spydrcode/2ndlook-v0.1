/**
 * Housecall Pro estimate connector.
 * OAuth connect is available; data fetch will be implemented later.
 */

import type { UniversalConnector } from "../connector";
import { NotImplementedError } from "../connector";
import type { EstimateCanonicalRow } from "../types";

export class HousecallProConnector implements UniversalConnector {
  category = "estimates" as const;
  tool = "housecall-pro" as const;
  isImplemented = true;

  getDisplayName(): string {
    return "Housecall Pro";
  }

  async normalizeEstimatesFromFile(): Promise<EstimateCanonicalRow[]> {
    throw new NotImplementedError(this.tool, "normalizeEstimatesFromFile");
  }

  async fetchEstimates(): Promise<EstimateCanonicalRow[]> {
    throw new NotImplementedError(this.tool, "fetchEstimates");
  }
}
