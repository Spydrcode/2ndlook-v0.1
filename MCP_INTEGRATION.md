# MCP Server Integration Guide

## Overview

The 2ndlook MCP server provides a safe interface for AI agents to interact with bucketed estimate data without ever accessing raw estimate rows.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    AI Agent / LLM                        │
│         (OpenAI, Claude, or custom agent)                │
└───────────────────────┬──────────────────────────────────┘
                        │
                        │ Function Calling / Tool Use
                        │
┌───────────────────────▼──────────────────────────────────┐
│               MCP Client (Orchestrator)                  │
│         Translates LLM requests → MCP calls              │
└───────────────────────┬──────────────────────────────────┘
                        │
                        │ JSON-RPC over stdio
                        │
┌───────────────────────▼──────────────────────────────────┐
│                  MCP Server (index.ts)                   │
│  Tools: get_bucketed_aggregates, write_snapshot_result   │
│         list_snapshots, list_sources                     │
└───────────────────────┬──────────────────────────────────┘
                        │
                        │ Supabase Client (Service Role)
                        │
┌───────────────────────▼──────────────────────────────────┐
│                   Supabase Database                      │
│  Tables: sources, estimate_buckets, snapshots            │
│  (estimates_normalized never accessed by MCP)            │
└──────────────────────────────────────────────────────────┘
```

## Use Cases

### Use Case 1: Agent-Powered Snapshot Generation

An AI agent analyzes bucketed data and generates insights:

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import OpenAI from "openai";

// 1. Connect to MCP server
const transport = new StdioClientTransport({
  command: "npx",
  args: ["tsx", "mcp-server/index.ts"],
});

const mcpClient = new Client({ name: "orchestrator", version: "1.0.0" }, { capabilities: {} });
await mcpClient.connect(transport);

// 2. Get bucketed data via MCP
const bucketResult = await mcpClient.callTool({
  name: "get_bucketed_aggregates",
  arguments: { user_id, source_id },
});

const buckets = JSON.parse(bucketResult.content[0].text);

// 3. Call OpenAI with bucketed data (no raw estimates)
const openai = new OpenAI();
const completion = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [
    {
      role: "system",
      content: "Analyze bucketed estimate data and generate insights.",
    },
    {
      role: "user",
      content: JSON.stringify(buckets),
    },
  ],
  response_format: { type: "json_object" },
});

// 4. Write result back via MCP
const snapshotResult = JSON.parse(completion.choices[0].message.content);
await mcpClient.callTool({
  name: "write_snapshot_result",
  arguments: { user_id, snapshot_id, result_json: snapshotResult },
});

await mcpClient.close();
```

### Use Case 2: Interactive Agent with Tool Calling

Use OpenAI function calling to let the agent decide which tools to use:

```typescript
const tools = [
  {
    type: "function",
    function: {
      name: "get_bucketed_aggregates",
      description: "Get bucketed aggregates for a source (no raw estimates)",
      parameters: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "User ID (UUID)" },
          source_id: { type: "string", description: "Source ID (UUID)" },
        },
        required: ["user_id", "source_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_sources",
      description: "List sources for a user",
      parameters: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "User ID (UUID)" },
          limit: { type: "number", description: "Max sources to return" },
        },
        required: ["user_id"],
      },
    },
  },
];

// Let the agent call MCP tools dynamically
const completion = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [
    {
      role: "user",
      content: `Analyze all my sources and generate snapshots for the top 3 by estimate count. My user_id is ${user_id}.`,
    },
  ],
  tools,
  tool_choice: "auto",
});

// Handle tool calls
for (const toolCall of completion.choices[0].message.tool_calls || []) {
  const args = JSON.parse(toolCall.function.arguments);
  
  const result = await mcpClient.callTool({
    name: toolCall.function.name,
    arguments: args,
  });
  
  console.log(`Tool ${toolCall.function.name} result:`, result.content[0].text);
}
```

### Use Case 3: Autonomous Agent Loop

Agent iterates over sources and generates snapshots:

```typescript
async function autonomousSnapshotGeneration(user_id: string) {
  const mcpClient = await connectToMCPServer();
  
  // 1. List user sources
  const sourcesResult = await mcpClient.callTool({
    name: "list_sources",
    arguments: { user_id, limit: 50 },
  });
  
  const sources = JSON.parse(sourcesResult.content[0].text);
  
  // 2. Filter to bucketed sources
  const bucketedSources = sources.sources.filter(
    (s: any) => s.status === "bucketed"
  );
  
  console.log(`Found ${bucketedSources.length} bucketed sources`);
  
  // 3. Generate snapshot for each
  for (const source of bucketedSources) {
    console.log(`Processing source ${source.source_id}...`);
    
    // Get bucketed data
    const bucketResult = await mcpClient.callTool({
      name: "get_bucketed_aggregates",
      arguments: { user_id, source_id: source.source_id },
    });
    
    const buckets = JSON.parse(bucketResult.content[0].text);
    
    // Create snapshot (triggers orchestrator)
    const snapshotResult = await runSnapshotOrchestrator({
      source_id: source.source_id,
      user_id,
    });
    
    console.log(`✅ Snapshot ${snapshotResult.snapshot_id} generated`);
  }
  
  await mcpClient.close();
}
```

## Integration with Existing Orchestrator

Update the orchestrator to optionally use MCP tools:

```typescript
// src/lib/orchestrator/runSnapshot.ts

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export async function runSnapshotOrchestratorWithMCP(params: {
  source_id: string;
  user_id: string;
  useMCP?: boolean;
}) {
  if (params.useMCP) {
    // Use MCP server for data access
    const mcpClient = await connectToMCPServer();
    
    const bucketResult = await mcpClient.callTool({
      name: "get_bucketed_aggregates",
      arguments: { user_id: params.user_id, source_id: params.source_id },
    });
    
    const buckets = JSON.parse(bucketResult.content[0].text);
    
    // Continue with AI generation...
    const snapshotResult = await generateSnapshotResult(buckets, {
      source_id: params.source_id,
    });
    
    // Write result via MCP
    await mcpClient.callTool({
      name: "write_snapshot_result",
      arguments: {
        user_id: params.user_id,
        snapshot_id: "...",
        result_json: snapshotResult,
      },
    });
    
    await mcpClient.close();
  } else {
    // Use direct Supabase access (existing code)
    // ...
  }
}
```

## Security Considerations

### Access Control
- Every MCP tool requires `user_id` parameter
- Server verifies ownership before returning data
- Service role key never exposed to client

### Data Safety
- MCP tools **never** access `estimates_normalized` table
- Only bucketed aggregates returned
- No customer PII in responses

### Rate Limiting
- List operations capped at 50 items
- No unbounded queries
- Orchestrator should implement per-user rate limits

## Testing

### Unit Testing MCP Tools

```typescript
// test/mcp-tools.test.ts
import { describe, it, expect } from "vitest";

describe("MCP Tools", () => {
  it("should return bucketed aggregates without raw estimates", async () => {
    const result = await mcpClient.callTool({
      name: "get_bucketed_aggregates",
      arguments: { user_id: testUserId, source_id: testSourceId },
    });
    
    const data = JSON.parse(result.content[0].text);
    
    expect(data.buckets).toBeDefined();
    expect(data.buckets.weekly_volume).toBeInstanceOf(Array);
    expect(data.buckets.price_distribution).toBeInstanceOf(Array);
    expect(data.estimate_count).toBeGreaterThan(0);
    
    // Ensure no raw estimates
    expect(data.estimates).toBeUndefined();
    expect(data.rows).toBeUndefined();
  });
  
  it("should enforce user_id scoping", async () => {
    await expect(
      mcpClient.callTool({
        name: "get_bucketed_aggregates",
        arguments: { user_id: "wrong-user-id", source_id: testSourceId },
      })
    ).rejects.toThrow("access denied");
  });
});
```

### Integration Testing with Agent

```typescript
// test/agent-integration.test.ts
import { describe, it, expect } from "vitest";

describe("Agent + MCP Integration", () => {
  it("should generate snapshot using MCP tools", async () => {
    const mcpClient = await connectToMCPServer();
    
    // Agent workflow
    const sources = await mcpClient.callTool({
      name: "list_sources",
      arguments: { user_id: testUserId, limit: 1 },
    });
    
    const sourceId = JSON.parse(sources.content[0].text).sources[0].source_id;
    
    const buckets = await mcpClient.callTool({
      name: "get_bucketed_aggregates",
      arguments: { user_id: testUserId, source_id: sourceId },
    });
    
    // Mock AI generation
    const snapshotResult = generateMockSnapshot(JSON.parse(buckets.content[0].text));
    
    const writeResult = await mcpClient.callTool({
      name: "write_snapshot_result",
      arguments: {
        user_id: testUserId,
        snapshot_id: testSnapshotId,
        result_json: snapshotResult,
      },
    });
    
    expect(JSON.parse(writeResult.content[0].text).updated).toBe(true);
    
    await mcpClient.close();
  });
});
```

## Deployment

### Local Development
```bash
cd mcp-server
npm install
npx tsx index.ts
```

### Production (Docker)
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY mcp-server/package*.json ./
RUN npm ci --only=production
COPY mcp-server/ ./
RUN npm run build
CMD ["node", "dist/index.js"]
```

### Environment Variables
```bash
# Required
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...

# Optional
NODE_ENV=production
LOG_LEVEL=info
```

## Monitoring

### Logging
The MCP server logs to stderr (stdout is reserved for MCP protocol):

```typescript
// In index.ts
console.error("[MCP Server] Tool called:", toolName);
console.error("[MCP Server] User:", user_id);
console.error("[MCP Server] Result size:", resultSize);
```

### Metrics
Track tool usage in production:

```typescript
// Add to handlers
const toolMetrics = {
  get_bucketed_aggregates: { calls: 0, errors: 0 },
  write_snapshot_result: { calls: 0, errors: 0 },
  list_snapshots: { calls: 0, errors: 0 },
  list_sources: { calls: 0, errors: 0 },
};

function recordMetric(toolName: string, success: boolean) {
  toolMetrics[toolName].calls++;
  if (!success) toolMetrics[toolName].errors++;
}
```

## Troubleshooting

### "Cannot connect to MCP server"
- Check server is running: `npx tsx mcp-server/index.ts`
- Verify stdio transport configuration
- Check environment variables are set

### "Source not found or access denied"
- Verify user_id matches source owner
- Check source exists in database
- Ensure source status is "bucketed" for aggregate queries

### "No buckets found for source"
- Run bucketing: `POST /api/bucket` with `{ source_id }`
- Verify `estimate_buckets` table has row for source
- Check source has at least 25 estimates

## Future Enhancements

- [ ] Batch operations (get multiple sources)
- [ ] Streaming responses for large datasets
- [ ] WebSocket transport for persistent connections
- [ ] Authentication tokens instead of user_id strings
- [ ] Webhook support for async operations
- [ ] Tool usage quotas per user

## Resources

- [Model Context Protocol Spec](https://modelcontextprotocol.io)
- [MCP SDK Documentation](https://github.com/modelcontextprotocol/sdk)
- [2ndlook Orchestrator README](../src/lib/orchestrator/README.md)
- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)
