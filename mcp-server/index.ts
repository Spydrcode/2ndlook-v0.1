#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { createClient } from "@supabase/supabase-js";
import type {
  EstimateBucket,
  Snapshot,
  Source,
  SnapshotResult,
} from "./types.js";

/**
 * 2ndlook MCP Server
 * 
 * Provides safe, scoped tools for the orchestrator/agent:
 * - Reading bucketed aggregates (no raw estimates)
 * - Writing snapshot results
 * - Listing user sources/snapshots
 * 
 * SAFETY RULES:
 * 1. Never exposes raw estimate rows
 * 2. All access scoped to installation_id
 * 3. Small, bounded payloads
 * 4. Server-side only (service role key)
 */

// Initialize Supabase client with service role key
function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required"
    );
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// Tool definitions
const TOOLS: Tool[] = [
  {
    name: "get_bucketed_aggregates",
    description:
      "Get bucketed aggregates for a source (no raw estimates). Returns weekly volume, price distribution, and decision latency buckets.",
    inputSchema: {
      type: "object",
      properties: {
        installation_id: {
          type: "string",
          description: "Installation ID (UUID) for access control",
        },
        source_id: {
          type: "string",
          description: "Source ID (UUID) to get buckets for",
        },
      },
      required: ["installation_id", "source_id"],
    },
  },
  {
    name: "write_snapshot_result",
    description:
      "Write a SnapshotResult to the database. Updates existing snapshot with result payload.",
    inputSchema: {
      type: "object",
      properties: {
        installation_id: {
          type: "string",
          description: "Installation ID (UUID) for access control",
        },
        snapshot_id: {
          type: "string",
          description: "Snapshot ID (UUID) to update",
        },
        result_json: {
          type: "object",
          description: "SnapshotResult object matching the locked schema",
        },
      },
      required: ["installation_id", "snapshot_id", "result_json"],
    },
  },
  {
    name: "list_snapshots",
    description:
      "List snapshots for a user. Returns metadata only (no full result payload).",
    inputSchema: {
      type: "object",
      properties: {
        installation_id: {
          type: "string",
          description: "Installation ID (UUID) to list snapshots for",
        },
        limit: {
          type: "number",
          description: "Maximum number of snapshots to return (default: 10, max: 50)",
          default: 10,
        },
      },
      required: ["installation_id"],
    },
  },
  {
    name: "list_sources",
    description:
      "List sources for a user. Returns source metadata with status.",
    inputSchema: {
      type: "object",
      properties: {
        installation_id: {
          type: "string",
          description: "Installation ID (UUID) to list sources for",
        },
        limit: {
          type: "number",
          description: "Maximum number of sources to return (default: 10, max: 50)",
          default: 10,
        },
      },
      required: ["installation_id"],
    },
  },
];

// Tool handlers
async function handleGetBucketedAggregates(args: {
  installation_id: string;
  source_id: string;
}) {
  const supabase = getSupabaseClient();

  // Verify source ownership
  const { data: source, error: sourceError } = await supabase
    .from("sources")
    .select("id, installation_id, status")
    .eq("id", args.source_id)
    .eq("installation_id", args.installation_id)
    .single();

  if (sourceError || !source) {
    throw new Error(`Source not found or access denied: ${args.source_id}`);
  }

  // Get bucketed aggregates (NO RAW ESTIMATES)
  const { data: bucket, error: bucketError } = await supabase
    .from("estimate_buckets")
    .select("*")
    .eq("source_id", args.source_id)
    .single();

  if (bucketError || !bucket) {
    throw new Error(`No buckets found for source: ${args.source_id}`);
  }

  // Get estimate count for metadata
  const { count: estimateCount, error: countError } = await supabase
    .from("estimates_normalized")
    .select("*", { count: "exact", head: true })
    .eq("source_id", args.source_id);

  if (countError) {
    throw new Error(`Failed to get estimate count: ${countError.message}`);
  }

  // Get invoice buckets if available (optional - graceful degradation)
  const { data: invoiceBucket } = await supabase
    .from("invoice_buckets")
    .select("*")
    .eq("source_id", args.source_id)
    .single();

  // Get invoice count if buckets exist
  let invoiceCount = 0;
  if (invoiceBucket) {
    const { count, error: invoiceCountError } = await supabase
      .from("invoices_normalized")
      .select("*", { count: "exact", head: true })
      .eq("source_id", args.source_id);

    if (!invoiceCountError) {
      invoiceCount = count || 0;
    }
  }

  // Return safe bucketed data only
  const typedBucket = bucket as EstimateBucket;
  const result: any = {
    source_id: args.source_id,
    estimate_count: estimateCount || 0,
    status: source.status,
    weekly_volume: typedBucket.weekly_volume,
    price_distribution: [
      { band: "<500", count: typedBucket.price_band_lt_500 },
      { band: "500-1500", count: typedBucket.price_band_500_1500 },
      { band: "1500-5000", count: typedBucket.price_band_1500_5000 },
      { band: "5000+", count: typedBucket.price_band_5000_plus },
    ],
    latency_distribution: [
      { band: "0-2d", count: typedBucket.latency_band_0_2 },
      { band: "3-7d", count: typedBucket.latency_band_3_7 },
      { band: "8-21d", count: typedBucket.latency_band_8_21 },
      { band: "22+d", count: typedBucket.latency_band_22_plus },
    ],
  };

  // Add invoice signals if available (optional)
  if (invoiceBucket && invoiceCount > 0) {
    const typedInvoiceBucket = invoiceBucket as any;
    result.invoiceSignals = {
      invoice_count: invoiceCount,
      price_distribution: [
        { band: "<500", count: typedInvoiceBucket.price_band_lt_500 || 0 },
        { band: "500-1500", count: typedInvoiceBucket.price_band_500_1500 || 0 },
        { band: "1500-5000", count: typedInvoiceBucket.price_band_1500_5000 || 0 },
        { band: "5000+", count: typedInvoiceBucket.price_band_5000_plus || 0 },
      ],
      time_to_invoice: [
        { band: "0-7d", count: typedInvoiceBucket.time_to_invoice_0_7 || 0 },
        { band: "8-14d", count: typedInvoiceBucket.time_to_invoice_8_14 || 0 },
        { band: "15-30d", count: typedInvoiceBucket.time_to_invoice_15_30 || 0 },
        { band: "31+d", count: typedInvoiceBucket.time_to_invoice_31_plus || 0 },
      ],
      status_distribution: [
        { status: "draft", count: typedInvoiceBucket.status_draft || 0 },
        { status: "sent", count: typedInvoiceBucket.status_sent || 0 },
        { status: "void", count: typedInvoiceBucket.status_void || 0 },
        { status: "paid", count: typedInvoiceBucket.status_paid || 0 },
        { status: "unpaid", count: typedInvoiceBucket.status_unpaid || 0 },
        { status: "overdue", count: typedInvoiceBucket.status_overdue || 0 },
      ],
      weekly_volume: typedInvoiceBucket.weekly_volume || [],
    };
  }

  return result;
}

async function handleWriteSnapshotResult(args: {
  installation_id: string;
  snapshot_id: string;
  result_json: SnapshotResult;
}) {
  const supabase = getSupabaseClient();

  // Verify snapshot ownership
  const { data: snapshot, error: snapshotError } = await supabase
    .from("snapshots")
    .select("id, source_id, sources!inner(installation_id)")
    .eq("id", args.snapshot_id)
    .eq("sources.installation_id", args.installation_id)
    .single();

  if (snapshotError || !snapshot) {
    throw new Error(
      `Snapshot not found or access denied: ${args.snapshot_id}`
    );
  }

  // Update snapshot with result
  const { error: updateError } = await supabase
    .from("snapshots")
    .update({ result: args.result_json })
    .eq("id", args.snapshot_id);

  if (updateError) {
    throw new Error(`Failed to update snapshot: ${updateError.message}`);
  }

  return {
    snapshot_id: args.snapshot_id,
    updated: true,
  };
}

async function handleListSnapshots(args: { installation_id: string; limit?: number }) {
  const supabase = getSupabaseClient();
  const limit = Math.min(args.limit || 10, 50);

  const { data: snapshots, error } = await supabase
    .from("snapshots")
    .select("id, source_id, estimate_count, confidence_level, generated_at, sources!inner(installation_id)")
    .eq("sources.installation_id", args.installation_id)
    .order("generated_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to list snapshots: ${error.message}`);
  }

  return {
    installation_id: args.installation_id,
    snapshots: (snapshots || []).map((s: any) => ({
      snapshot_id: s.id,
      source_id: s.source_id,
      estimate_count: s.estimate_count,
      confidence_level: s.confidence_level,
      generated_at: s.generated_at,
    })),
    count: snapshots?.length || 0,
  };
}

async function handleListSources(args: { installation_id: string; limit?: number }) {
  const supabase = getSupabaseClient();
  const limit = Math.min(args.limit || 10, 50);

  const { data: sources, error } = await supabase
    .from("sources")
    .select("id, source_type, source_name, status, created_at")
    .eq("installation_id", args.installation_id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to list sources: ${error.message}`);
  }

  return {
    installation_id: args.installation_id,
    sources: (sources || []).map((s: any) => ({
      source_id: s.id,
      source_type: s.source_type,
      source_name: s.source_name,
      status: s.status,
      created_at: s.created_at,
    })),
    count: sources?.length || 0,
  };
}

// Main server setup
async function main() {
  const server = new Server(
    {
      name: "2ndlook-mcp-server",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const { name, arguments: args } = request.params;

      switch (name) {
        case "get_bucketed_aggregates": {
          const result = await handleGetBucketedAggregates(
            args as { installation_id: string; source_id: string }
          );
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        case "write_snapshot_result": {
          const result = await handleWriteSnapshotResult(
            args as {
              installation_id: string;
              snapshot_id: string;
              result_json: SnapshotResult;
            }
          );
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        case "list_snapshots": {
          const result = await handleListSnapshots(
            args as { installation_id: string; limit?: number }
          );
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        case "list_sources": {
          const result = await handleListSources(
            args as { installation_id: string; limit?: number }
          );
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return {
        content: [{ type: "text", text: `Error: ${errorMessage}` }],
        isError: true,
      };
    }
  });

  // Start server
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("2ndlook MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
