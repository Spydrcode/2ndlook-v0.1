# MCP Server Quick Start

## 1. Setup Environment

Create `mcp-server/.env`:

```bash
cp mcp-server/.env.example mcp-server/.env
```

Edit `.env` with your Supabase credentials:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

**⚠️ Security**: The service role key is powerful and bypasses Row Level Security. Keep it secret!

## 2. Run the Server

From project root:

```bash
npm run mcp:dev
```

You should see:
```
2ndlook MCP Server running on stdio
```

## 3. Test with Example Client

In a new terminal:

```bash
npm run mcp:test
```

Expected output:
```
🔗 Connecting to 2ndlook MCP Server...
✅ Connected!

📋 Listing available tools...
Found 4 tools:

  - get_bucketed_aggregates: Get bucketed aggregates for a source
  - write_snapshot_result: Write a SnapshotResult to the database
  - list_snapshots: List snapshots for a user
  - list_sources: List sources for a user

✨ Test complete!
```

## 4. Interactive Testing with MCP Inspector

Install the inspector:

```bash
npm install -g @modelcontextprotocol/inspector
```

Run:

```bash
mcp-inspector npx tsx mcp-server/index.ts
```

This opens a web UI at http://localhost:5173 where you can:
- See all available tools
- Test tools with custom inputs
- View responses in real-time

## 5. Use in Code

### Basic Usage

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// Connect to server
const transport = new StdioClientTransport({
  command: "npx",
  args: ["tsx", "mcp-server/index.ts"],
});

const client = new Client(
  { name: "my-app", version: "1.0.0" },
  { capabilities: {} }
);

await client.connect(transport);

// Call a tool
const result = await client.callTool({
  name: "get_bucketed_aggregates",
  arguments: {
    user_id: "your-user-id",
    source_id: "your-source-id",
  },
});

const data = JSON.parse((result.content[0] as { text: string }).text);
console.log("Buckets:", data.buckets);

// Cleanup
await client.close();
```

### With OpenAI Function Calling

```typescript
import OpenAI from "openai";

const openai = new OpenAI();

const tools = [
  {
    type: "function",
    function: {
      name: "get_bucketed_aggregates",
      description: "Get bucketed aggregates for a source",
      parameters: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "User UUID" },
          source_id: { type: "string", description: "Source UUID" },
        },
        required: ["user_id", "source_id"],
      },
    },
  },
];

const completion = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [
    {
      role: "user",
      content: "Analyze the estimates for source abc-123 (user xyz-789)",
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
  
  console.log("AI requested tool:", toolCall.function.name);
  console.log("Result:", (result.content[0] as { text: string }).text);
}
```

## 6. Verify Installation

Check that dependencies are installed:

```bash
# Check MCP SDK
npm list @modelcontextprotocol/sdk

# Should show: @modelcontextprotocol/sdk@0.6.0
```

Check TypeScript compiles:

```bash
cd mcp-server
npx tsc --noEmit
```

Should complete with no errors.

## Troubleshooting

### "Cannot find module '@modelcontextprotocol/sdk'"

Install dependencies:
```bash
npm install
```

### "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required"

Create `mcp-server/.env` file with your Supabase credentials.

### "Source not found or access denied"

- Check that the user_id owns the source
- Verify source exists in database
- Ensure you're using the correct UUIDs

### Server not responding

1. Check server is running: `npm run mcp:dev`
2. Verify it prints: "2ndlook MCP Server running on stdio"
3. Check for errors in stderr output

## Next Steps

1. **Read the docs**: See [mcp-server/README.md](mcp-server/README.md)
2. **Integration examples**: See [MCP_INTEGRATION.md](../MCP_INTEGRATION.md)
3. **Orchestrator integration**: See [ORCHESTRATOR_SUMMARY.md](../ORCHESTRATOR_SUMMARY.md)

## Available Tools

| Tool | Description |
|------|-------------|
| `get_bucketed_aggregates` | Get bucketed data for a source (no raw estimates) |
| `write_snapshot_result` | Update snapshot with result payload |
| `list_snapshots` | List user snapshots (metadata only) |
| `list_sources` | List user sources with status |

## Security Reminders

- ✅ Service role key is server-side only
- ✅ Never expose key in client code
- ✅ Add `.env` to `.gitignore` (already done)
- ✅ All tools verify user_id ownership
- ✅ No raw estimate data exposed

## Performance

- **Latency**: <100ms per tool call (local DB)
- **Throughput**: Limited by Supabase connection pool
- **Payload**: Small, bounded responses (<10KB)

## Production Deployment

For production, consider:
1. Running server as a daemon/service
2. Adding rate limiting per user
3. Monitoring tool usage metrics
4. Using connection pooling for Supabase
5. Implementing authentication tokens

See deployment guide in [mcp-server/README.md](mcp-server/README.md).

---

**Questions?** See the full documentation:
- [MCP Server README](mcp-server/README.md)
- [Integration Guide](../MCP_INTEGRATION.md)
- [Implementation Summary](../MCP_SERVER_SUMMARY.md)
