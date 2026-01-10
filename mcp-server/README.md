# 2ndlook MCP Server

Model Context Protocol server that provides safe, scoped tools for the 2ndlook orchestrator and agent systems.

## Overview

This MCP server exposes tools for interacting with 2ndlook data without ever exposing raw estimate rows. All access is scoped to a specific user_id for security.

## Safety Rules

1. ✅ **Never exposes raw estimate rows** - Only bucketed aggregates
2. ✅ **All access scoped to user_id** - Built-in access control
3. ✅ **Small, bounded payloads** - Limits on list operations
4. ✅ **Server-side only** - Uses Supabase service role key

## Available Tools

### 1. get_bucketed_aggregates

Get bucketed aggregates for a source (no raw estimates).

**Input**:
```json
{
  "user_id": "uuid",
  "source_id": "uuid"
}
```

**Output**:
```json
{
  "source_id": "uuid",
  "estimate_count": 35,
  "status": "bucketed",
  "buckets": {
    "weekly_volume": [
      { "week": "2026-W01", "count": 15 },
      { "week": "2026-W02", "count": 20 }
    ],
    "price_distribution": [
      { "band": "<500", "count": 10 },
      { "band": "500-1500", "count": 15 },
      { "band": "1500-5000", "count": 8 },
      { "band": "5000+", "count": 2 }
    ],
    "decision_latency": [
      { "band": "0-2d", "count": 20 },
      { "band": "3-7d", "count": 10 },
      { "band": "8-21d", "count": 3 },
      { "band": "22+d", "count": 2 }
    ]
  }
}
```

### 2. write_snapshot_result

Write a SnapshotResult to the database.

**Input**:
```json
{
  "user_id": "uuid",
  "snapshot_id": "uuid",
  "result_json": {
    "meta": { ... },
    "demand": { ... },
    "decision_latency": { ... }
  }
}
```

**Output**:
```json
{
  "snapshot_id": "uuid",
  "updated": true
}
```

### 3. list_snapshots

List snapshots for a user (metadata only).

**Input**:
```json
{
  "user_id": "uuid",
  "limit": 10
}
```

**Output**:
```json
{
  "user_id": "uuid",
  "snapshots": [
    {
      "snapshot_id": "uuid",
      "source_id": "uuid",
      "estimate_count": 35,
      "confidence_level": "low",
      "generated_at": "2026-01-10T12:00:00Z"
    }
  ],
  "count": 1
}
```

### 4. list_sources

List sources for a user.

**Input**:
```json
{
  "user_id": "uuid",
  "limit": 10
}
```

**Output**:
```json
{
  "user_id": "uuid",
  "sources": [
    {
      "source_id": "uuid",
      "source_type": "csv",
      "source_name": "Q1 Estimates",
      "status": "bucketed",
      "created_at": "2026-01-10T10:00:00Z"
    }
  ],
  "count": 1
}
```

## Environment Variables

Create a `.env` file in the `mcp-server` directory:

```bash
# Supabase Configuration (Service Role Key - Server Only!)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...  # DO NOT COMMIT!
```

**⚠️ Security Warning**: The service role key bypasses Row Level Security. Only use it server-side and never expose it to clients.

## Installation

From the project root:

```bash
npm install
```

## Running the Server

### Development Mode

```bash
cd mcp-server
npx tsx index.ts
```

The server runs on stdio and communicates via JSON-RPC.

### Production Mode

Compile TypeScript first:

```bash
cd mcp-server
npx tsc
node dist/index.js
```

## Testing the Server

### Using MCP Inspector (Recommended)

Install the MCP Inspector:

```bash
npm install -g @modelcontextprotocol/inspector
```

Run the inspector:

```bash
mcp-inspector npx tsx mcp-server/index.ts
```

This opens a web UI to test tools interactively.

### Manual Testing with stdio

Create a test script:

```typescript
// test-mcp.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "npx",
  args: ["tsx", "mcp-server/index.ts"],
});

const client = new Client({
  name: "test-client",
  version: "1.0.0",
}, {
  capabilities: {},
});

await client.connect(transport);

// List tools
const tools = await client.listTools();
console.log("Available tools:", tools);

// Call a tool
const result = await client.callTool({
  name: "list_sources",
  arguments: {
    user_id: "your-user-id",
    limit: 5,
  },
});

console.log("Result:", result);
```

Run:
```bash
npx tsx test-mcp.ts
```

## Integration with Orchestrator

The MCP server can be used by the orchestrator for AI agent interactions:

```typescript
// Example: Agent using MCP tools
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

// Connect to MCP server
const mcpClient = new Client(...);

// Get bucketed data
const buckets = await mcpClient.callTool({
  name: "get_bucketed_aggregates",
  arguments: { user_id, source_id },
});

// Process with AI agent
const analysis = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [
    { role: "system", content: "Analyze bucketed data..." },
    { role: "user", content: JSON.stringify(buckets) },
  ],
});

// Write result back
await mcpClient.callTool({
  name: "write_snapshot_result",
  arguments: { user_id, snapshot_id, result_json: analysis },
});
```

## Architecture

```
┌─────────────────┐
│  Orchestrator   │
│   / Agent       │
└────────┬────────┘
         │
         │ stdio (JSON-RPC)
         │
┌────────▼────────┐
│   MCP Server    │
│  (index.ts)     │
└────────┬────────┘
         │
         │ Supabase Client
         │ (Service Role Key)
         │
┌────────▼────────┐
│   Supabase DB   │
│  - sources      │
│  - buckets      │
│  - snapshots    │
└─────────────────┘
```

## Security

### Access Control
- Every tool requires `user_id`
- All database queries verify ownership
- Service role key used server-side only

### Data Safety
- Never queries `estimates_normalized` for row data
- Only returns bucketed aggregates
- No customer PII exposed

### Rate Limiting
- List operations limited to 50 items max
- Bounded payload sizes
- No unbounded queries

## Error Handling

The server returns clear error messages:

```json
{
  "content": [
    { "type": "text", "text": "Error: Source not found or access denied: uuid" }
  ],
  "isError": true
}
```

Common errors:
- `Source not found or access denied` - Invalid source_id or wrong user_id
- `No buckets found for source` - Source not bucketed yet
- `Snapshot not found or access denied` - Invalid snapshot_id or wrong user_id
- `SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required` - Missing env vars

## Debugging

Enable verbose logging:

```bash
DEBUG=* npx tsx mcp-server/index.ts
```

Check stderr for server logs (stdout is reserved for MCP protocol).

## Limitations (v0.1)

- No authentication beyond user_id scoping
- No rate limiting (handle at orchestrator level)
- No caching (direct DB queries)
- No batch operations
- No webhook/async operations

## Future Enhancements (v0.2+)

- [ ] Authentication tokens instead of user_id strings
- [ ] Rate limiting per user
- [ ] Caching layer for frequently accessed buckets
- [ ] Batch operations for multiple sources
- [ ] Webhook support for async processing
- [ ] Tool usage metrics and logging

## Troubleshooting

### "Cannot find module" errors

Make sure you're in the project root and dependencies are installed:
```bash
npm install
```

### "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required"

Create a `.env` file in `mcp-server/` with your Supabase credentials:
```bash
cp mcp-server/.env.example mcp-server/.env
# Edit .env with your values
```

### Server not responding

Check that it's running correctly:
```bash
cd mcp-server
npx tsx index.ts
# Should print: "2ndlook MCP Server running on stdio"
```

## License

Same as parent project.
