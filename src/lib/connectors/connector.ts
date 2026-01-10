/**
 * Universal Connector Interface and Registry.
 * Provides a contract for all data connectors (estimates, calendar, CRM).
 */

import type {
  ConnectorCategory,
  ConnectorTool,
  EstimateCanonicalRow,
  CalendarSignals,
  CrmSignals,
} from "./types";

/**
 * Custom error for unimplemented connector methods.
 */
export class NotImplementedError extends Error {
  constructor(tool: string, method: string) {
    super(`Connector "${tool}" does not implement method "${method}".`);
    this.name = "NotImplementedError";
  }
}

/**
 * Universal Connector interface.
 * All connectors must implement this contract.
 */
export interface UniversalConnector {
  category: ConnectorCategory;
  tool: string;
  isImplemented: boolean;

  /**
   * Human-readable display name for UI purposes.
   */
  getDisplayName(): string;

  /**
   * For v0.1: Normalize estimates from an uploaded file.
   * Only file-based connectors implement this.
   */
  normalizeEstimatesFromFile?(file: File | Blob | Buffer): Promise<EstimateCanonicalRow[]>;

  /**
   * For v0.2+: Fetch estimates from API.
   * OAuth-based connectors will implement this.
   */
  fetchEstimates?(): Promise<EstimateCanonicalRow[]>;

  /**
   * For v0.2+: Fetch aggregated calendar signals.
   */
  fetchCalendarSignals?(): Promise<CalendarSignals>;

  /**
   * For v0.2+: Fetch aggregated CRM signals.
   */
  fetchCrmSignals?(): Promise<CrmSignals>;
}

/**
 * Internal connector registry.
 * Stores all available connectors.
 */
const connectorRegistry = new Map<string, UniversalConnector>();

/**
 * Register a connector in the global registry.
 */
export function registerConnector(connector: UniversalConnector): void {
  const key = `${connector.category}:${connector.tool}`;
  connectorRegistry.set(key, connector);
}

/**
 * Get a specific connector by category and tool.
 * @throws Error if connector not found
 */
export function getConnector(category: ConnectorCategory, tool: ConnectorTool): UniversalConnector {
  const key = `${category}:${tool}`;
  const connector = connectorRegistry.get(key);

  if (!connector) {
    throw new Error(`Connector not found: ${category}:${tool}`);
  }

  return connector;
}

/**
 * List all registered connectors.
 */
export function listConnectors(): UniversalConnector[] {
  return Array.from(connectorRegistry.values());
}

/**
 * List connectors by category.
 */
export function listConnectorsByCategory(category: ConnectorCategory): UniversalConnector[] {
  return listConnectors().filter((c) => c.category === category);
}

/**
 * Check if a connector is implemented.
 */
export function isConnectorImplemented(category: ConnectorCategory, tool: ConnectorTool): boolean {
  try {
    const connector = getConnector(category, tool);
    return connector.isImplemented;
  } catch {
    return false;
  }
}
