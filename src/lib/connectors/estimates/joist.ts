/**
 * Joist estimate connector (stub).
 * OAuth integration not yet implemented.
 */

import type { UniversalConnector } from "../connector";
import type { EstimateCanonicalRow } from "../types";
import { NotImplementedError } from "../connector";

export class JoistConnector implements UniversalConnector {
  category = "estimates" as const;
  tool = "joist" as const;
  isImplemented = false;

  getDisplayName(): string {
    return "Joist";
  }

  async normalizeEstimatesFromFile(): Promise<EstimateCanonicalRow[]> {
    throw new NotImplementedError(this.tool, "normalizeEstimatesFromFile");
  }

  async fetchEstimates(): Promise<EstimateCanonicalRow[]> {
    throw new NotImplementedError(this.tool, "fetchEstimates");
  }
}
