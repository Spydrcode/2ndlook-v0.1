/**
 * Jobber estimate connector (stub).
 * OAuth integration not yet implemented.
 */

import type { UniversalConnector } from "../connector";
import type { EstimateCanonicalRow } from "../types";
import { NotImplementedError } from "../connector";

export class JobberConnector implements UniversalConnector {
  category = "estimates" as const;
  tool = "jobber" as const;
  isImplemented = false;

  getDisplayName(): string {
    return "Jobber";
  }

  async normalizeEstimatesFromFile(): Promise<EstimateCanonicalRow[]> {
    throw new NotImplementedError(this.tool, "normalizeEstimatesFromFile");
  }

  async fetchEstimates(): Promise<EstimateCanonicalRow[]> {
    throw new NotImplementedError(this.tool, "fetchEstimates");
  }
}
