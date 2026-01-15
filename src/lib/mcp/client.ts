/**
 * MCP Client for server-side tool calls
 * Communicates with the 2ndlook MCP server to fetch bucketed data
 * and write snapshot results.
 *
 * Server-only module - never import on client
 *
 * SAFETY:
 * - All tool calls scoped by installation_id
 * - Timeouts prevent hanging
 * - No payload logging in production
 */

export interface MCPToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface MCPToolResponse {
  content: Array<{
    type: "text";
    text: string;
  }>;
  isError?: boolean;
}

export interface BucketedAggregates {
  source_id: string;
  source_tool?: string | null;
  estimate_count: number;
  date_range?: {
    earliest: string;
    latest: string;
  };
  weekly_volume: { week: string; count: number }[];
  price_distribution: { band: string; count: number }[];
  latency_distribution: { band: string; count: number }[];
  job_type_distribution?: { job_type: string; count: number }[];
  // Optional: invoice signals (present when invoices are available)
  invoiceSignals?: {
    invoice_count: number;
    price_distribution: { band: string; count: number }[];
    time_to_invoice: { band: string; count: number }[];
    status_distribution: { status: string; count: number }[];
    weekly_volume: { week: string; count: number }[];
  };
}

export interface WriteSnapshotParams {
  installation_id: string;
  snapshot_id: string;
  result_json: unknown;
}

export class MCPClient {
  private serverUrl: string;
  private authToken?: string;
  private timeout: number;

  constructor(options?: {
    serverUrl?: string;
    authToken?: string;
    timeout?: number;
  }) {
    this.serverUrl = options?.serverUrl || process.env.MCP_SERVER_URL || "";
    this.authToken = options?.authToken || process.env.MCP_SERVER_AUTH;
    this.timeout = options?.timeout || 10000; // 10s default

    if (!this.serverUrl) {
      throw new Error("MCP_SERVER_URL environment variable is required for MCP client");
    }
  }

  /**
   * Call an MCP tool and return parsed response
   */
  async callTool<T = unknown>(toolName: string, args: Record<string, unknown>): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (this.authToken) {
        headers.Authorization = `Bearer ${this.authToken}`;
      }

      const response = await fetch(`${this.serverUrl}/call-tool`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: toolName,
          arguments: args,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new Error(`MCP tool call failed (${response.status}): ${errorText}`);
      }

      const result: MCPToolResponse = await response.json();

      if (result.isError) {
        const errorMsg = result.content[0]?.text || "MCP tool returned error";
        throw new Error(`MCP tool error: ${errorMsg}`);
      }

      // Parse JSON response from text content
      const responseText = result.content[0]?.text;
      if (!responseText) {
        throw new Error("Empty response from MCP tool");
      }

      return JSON.parse(responseText) as T;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new Error(`MCP tool call timeout after ${this.timeout}ms: ${toolName}`);
        }
        throw error;
      }
      throw new Error(`MCP tool call failed: ${String(error)}`);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Get bucketed aggregates for a source
   * Returns bucket-only data (no raw estimates)
   */
  async getBucketedAggregates(installation_id: string, source_id: string): Promise<BucketedAggregates> {
    return this.callTool<BucketedAggregates>("get_bucketed_aggregates", {
      installation_id,
      source_id,
    });
  }

  /**
   * Write snapshot result to database via MCP
   */
  async writeSnapshotResult(params: WriteSnapshotParams): Promise<void> {
    await this.callTool("write_snapshot_result", params as unknown as Record<string, unknown>);
  }

  /**
   * List user sources (optional - for debugging)
   */
  async listSources(installation_id: string, limit = 10): Promise<unknown[]> {
    return this.callTool("list_sources", { installation_id, limit });
  }

  /**
   * List user snapshots (optional - for debugging)
   */
  async listSnapshots(installation_id: string, limit = 10): Promise<unknown[]> {
    return this.callTool("list_snapshots", { installation_id, limit });
  }
}

/**
 * Create MCP client instance
 * Server-side only
 */
export function createMCPClient(options?: { serverUrl?: string; authToken?: string; timeout?: number }): MCPClient {
  return new MCPClient(options);
}
