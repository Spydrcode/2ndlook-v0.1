# Orchestrator MCP Integration

## Overview

The 2ndlook v0.1 orchestrator now uses the **Model Context Protocol (MCP)** server for all data access, replacing direct database queries. This ensures strict data safety: no raw estimate rows are ever exposed to AI agents.

## Architecture

```
┌─────────────────┐
│   Orchestrator  │
│  (runSnapshot)  │
└────────┬────────┘
         │
         │ MCP Tools
         ▼
┌─────────────────┐
│   MCP Server    │
│   (stdio/http)  │
└────────┬────────┘
         │
         │ Supabase
         ▼
┌─────────────────┐
│    Database     │
│  (bucket-only)  │
└─────────────────┘
```

## MCP Tools Used

### 1. `get_bucketed_aggregates`

**Purpose**: Fetch aggregated bucket data for a source (no raw estimates)

**Input**:
```typescript
{
  user_id: string,    // UUID for access control
  source_id: string   // UUID of source to fetch
}
```

**Output**:
```typescript
{
  source_id: string,
  estimate_count: number,
  weekly_volume: { week: string, count: number }[],
  price_distribution: { band: string, count: number }[],
  latency_distribution: { band: string, count: number }[]
}
```

**Safety**: Only returns aggregated counts per bucket. Never returns individual estimate records.

### 2. `write_snapshot_result`

**Purpose**: Write generated SnapshotResult to database

**Input**:
```typescript
{
  user_id: string,       // UUID for access control
  snapshot_id: string,   // UUID of snapshot to update
  result_json: object    // SnapshotResult payload
}
```

**Output**: Success confirmation

**Safety**: Validates user ownership before writing. Ensures SnapshotResult schema compliance.

## Required Environment Variables

### MCP Server Connection

```bash
# Required: MCP server URL
MCP_SERVER_URL=http://localhost:3001

# Optional: Authentication token (if MCP server requires it)
MCP_SERVER_AUTH=your-shared-secret-token
```

### MCP Server Environment

```bash
# Required: Supabase connection
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Optional: MCP server port
PORT=3001
```

### OpenAI (for orchestrated mode)

```bash
# Required for AI-powered snapshots
OPENAI_API_KEY=sk-proj-...
```

## Pipeline Flow

### 1. Create Snapshot Record
```typescript
// Create snapshot in DB to get snapshot_id
const { data: snapshot } = await supabase
  .from("snapshots")
  .insert({ source_id, user_id, ... })
  .single();
```

### 2. Fetch Bucketed Aggregates via MCP
```typescript
// No direct DB access - use MCP tool
const aggregates = await mcp.getBucketedAggregates(user_id, source_id);

// Validate structure
validateBucketedAggregates(aggregates);
```

### 3. Try Orchestrated Generation (OpenAI)
```typescript
try {
  // Max 1 LLM call per v0.1 constraint
  const result = await generateSnapshotResult(agentInput, {
    source_id,
    snapshot_id,
  });
  
  // Validate schema
  validateSnapshotResult(result);
} catch (llmError) {
  // Fallback to deterministic...
}
```

### 4. Fallback to Deterministic (if LLM fails)
```typescript
// Build snapshot from buckets without LLM
const result = buildDeterministicSnapshot(
  aggregates,
  source_id,
  snapshot_id
);
```

### 5. Write Result via MCP
```typescript
// Write via MCP (not direct DB)
await mcp.writeSnapshotResult({
  user_id,
  snapshot_id,
  result_json: result,
});
```

### 6. Update Metadata
```typescript
// Update snapshot record with counts
await supabase
  .from("snapshots")
  .update({
    estimate_count: result.meta.estimate_count,
    confidence_level: result.meta.confidence_level,
  })
  .eq("id", snapshot_id);
```

## Failure Handling

### MCP Connection Failure
```
Error: MCP_SERVER_URL environment variable is required
```
**Resolution**: Set `MCP_SERVER_URL` in environment

### MCP Tool Call Timeout
```
Error: MCP tool call timeout after 10000ms: get_bucketed_aggregates
```
**Resolution**: 
- Check MCP server is running
- Increase timeout in MCP client config
- Check network connectivity

### LLM Generation Failure
```
[Orchestrator] LLM generation failed, using deterministic fallback
```
**Behavior**: Automatically falls back to deterministic generation. Snapshot still succeeds.

**Common Causes**:
- Missing `OPENAI_API_KEY`
- Rate limits exceeded
- Network issues
- Schema validation failure

### Complete Failure (Both Paths)
```
Error: Snapshot generation failed: [error message]
```
**Behavior**: 
- Snapshot record is deleted (cleanup)
- Error thrown to caller
- User sees: "Unable to generate snapshot. Please try again."

## Safety Guarantees

### ✅ Enforced Constraints

1. **No Raw Estimates**: MCP server only exposes bucketed aggregates
2. **User Scoping**: All MCP calls validate `user_id` ownership
3. **Max 1 LLM Call**: Orchestrator enforces v0.1 constraint
4. **Schema Validation**: Runtime validation of all LLM outputs
5. **No Schema Changes**: Uses existing database tables

### 🔒 Data Protection

- **MCP Server**: Uses service role key (server-side only)
- **Orchestrator**: Never imported on client
- **Logging**: Only metadata logged (no payloads)
- **Error Messages**: Generic messages to users (no internals)

## Testing

### Start MCP Server
```bash
cd mcp-server
npm install
npm run build
npm start
```

### Run Orchestrator
```bash
# In main project
npm run dev

# Make snapshot API call
curl -X POST http://localhost:3000/api/snapshot \
  -H "Content-Type: application/json" \
  -d '{"source_id": "your-source-uuid"}'
```

### Test Fallback Behavior
```bash
# Test without OpenAI key (forces deterministic)
unset OPENAI_API_KEY
npm run dev
```

## Monitoring

### Key Metrics

- **MCP call latency**: `get_bucketed_aggregates` response time
- **LLM success rate**: % of snapshots using OpenAI vs deterministic
- **Fallback frequency**: How often deterministic fallback triggers
- **Error rates**: MCP failures vs total calls

### Log Patterns

**Success**:
```
[Orchestrator] Fetching bucketed aggregates via MCP: { source_id, snapshot_id }
[Orchestrator] Calling OpenAI for snapshot generation: { snapshot_id, estimate_count }
[Orchestrator] OpenAI generation successful: { snapshot_id }
[Orchestrator] Writing snapshot result via MCP: { snapshot_id }
[Orchestrator] Snapshot pipeline complete: { snapshot_id, source_id, ... }
```

**Fallback**:
```
[Orchestrator] LLM generation failed, using deterministic fallback: { snapshot_id, error }
```

**Failure**:
```
[Orchestrator] Fatal error - both paths failed: { snapshot_id, source_id, error }
```

## Troubleshooting

### Issue: "MCP_SERVER_URL environment variable is required"

**Cause**: MCP server URL not configured

**Fix**:
```bash
# .env.local
MCP_SERVER_URL=http://localhost:3001
```

### Issue: MCP tool calls timing out

**Cause**: MCP server not running or slow database queries

**Fix**:
1. Verify MCP server is running: `curl http://localhost:3001/health`
2. Check database indexes on `estimate_buckets` table
3. Increase timeout in MCP client constructor

### Issue: All snapshots using deterministic fallback

**Cause**: OpenAI API key missing or invalid

**Fix**:
```bash
# .env.local
OPENAI_API_KEY=sk-proj-your-key-here
```

### Issue: "Failed to create snapshot record"

**Cause**: Database connection issue or missing user authentication

**Fix**:
1. Verify Supabase connection
2. Check user is authenticated
3. Verify user_id exists in `users` table

## Performance Considerations

### Latency Breakdown

- **Create snapshot record**: ~50ms
- **MCP get_bucketed_aggregates**: ~200ms
- **OpenAI generation**: 2-4 seconds
- **MCP write_snapshot_result**: ~100ms
- **Update metadata**: ~50ms

**Total (orchestrated)**: ~3-5 seconds
**Total (deterministic)**: ~500ms

### Optimization Tips

1. **Cache buckets**: If source hasn't changed, cache `get_bucketed_aggregates` result
2. **Parallel updates**: Run metadata updates in parallel with MCP write
3. **Reduce LLM latency**: Use streaming or lower max_tokens
4. **Database indexes**: Ensure indexes on `source_id`, `user_id` columns

## Migration Notes

### Changed Components

**Before (Direct DB)**:
```typescript
// Old: Direct database query
const { data: bucket } = await supabase
  .from("estimate_buckets")
  .select("*")
  .eq("source_id", source_id)
  .single();
```

**After (MCP Tools)**:
```typescript
// New: MCP tool call
const aggregates = await mcp.getBucketedAggregates(user_id, source_id);
```

### Backward Compatibility

- ✅ API contract unchanged
- ✅ SnapshotResult schema unchanged
- ✅ Database schema unchanged
- ✅ Existing snapshots still valid

### Breaking Changes

- ❌ None - fully backward compatible

## Related Documentation

- [ORCHESTRATOR_SUMMARY.md](../ORCHESTRATOR_SUMMARY.md) - Original orchestrator design
- [MCP_SERVER_SUMMARY.md](../MCP_SERVER_SUMMARY.md) - MCP server implementation
- [INTEGRATION_SUMMARY.md](../INTEGRATION_SUMMARY.md) - Production integration guide

---

**Version**: 0.1.0  
**Last Updated**: January 10, 2026  
**Status**: Production Ready
