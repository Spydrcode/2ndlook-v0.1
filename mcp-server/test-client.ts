#!/usr/bin/env node

/**
 * Test client for 2ndlook MCP Server
 * 
 * Usage:
 *   npx tsx mcp-server/test-client.ts
 * 
 * This script demonstrates how to connect to the MCP server
 * and call its tools programmatically.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function main() {
  console.log("🔗 Connecting to 2ndlook MCP Server...\n");

  // Create transport (connects to server via stdio)
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", "mcp-server/index.ts"],
  });

  // Create client
  const client = new Client(
    {
      name: "test-client",
      version: "1.0.0",
    },
    {
      capabilities: {},
    }
  );

  // Connect
  await client.connect(transport);
  console.log("✅ Connected!\n");

  // List available tools
  console.log("📋 Listing available tools...");
  const { tools } = await client.listTools();
  console.log(`Found ${tools.length} tools:\n`);
  
  for (const tool of tools) {
    console.log(`  - ${tool.name}: ${tool.description}`);
  }
  console.log();

  // Example: List sources for a user
  console.log("🔍 Example: Listing sources for a user...");
  console.log("(This will fail if you don't have test data - that's expected)\n");

  try {
    const result = await client.callTool({
      name: "list_sources",
      arguments: {
        user_id: "00000000-0000-0000-0000-000000000000", // Replace with real user_id
        limit: 5,
      },
    });

    console.log("Result:");
    if (result.content && Array.isArray(result.content) && result.content[0]) {
      console.log((result.content[0] as { text: string }).text);
    }
  } catch (error) {
    console.error("Error (expected if no test data):", error);
  }

  console.log("\n✨ Test complete!");
  console.log("\nNext steps:");
  console.log("1. Add real user_id to test-client.ts");
  console.log("2. Create test data in Supabase");
  console.log("3. Try calling other tools (get_bucketed_aggregates, etc.)");
  console.log("4. Use MCP Inspector for interactive testing:");
  console.log("   npm install -g @modelcontextprotocol/inspector");
  console.log("   mcp-inspector npx tsx mcp-server/index.ts");

  // Cleanup
  await client.close();
  process.exit(0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
