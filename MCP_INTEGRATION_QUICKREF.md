# MCP Integration - Quick Reference

## 🚀 Quick Start

### 1. Start MCP Server
```bash
cd mcp-server
npm install
npm run build
npm start
```

### 2. Configure Environment
```bash
# .env.local
MCP_SERVER_URL=http://localhost:3001
OPENAI_API_KEY=sk-proj-your-key
SNAPSHOT_MODE=orchestrated
```

### 3. Run Application
```bash
npm run dev
```

## 📦 New Modules

### MCP Client (`src/lib/mcp/client.ts`)
```typescript
import { createMCPClient } from "@/lib/mcp/client";

const mcp = createMCPClient();

// Get bucketed aggregates (no raw estimates)
const agg = await mcp.getBucketedAggregates(user_id, source_id);

// Write snapshot result
await mcp.writeSnapshotResult({
  user_id,
  snapshot_id,
  result_json: snapshotResult,
});
```

### Deterministic Builder (`src/lib/orchestrator/deterministicSnapshot.ts`)
```typescript
import { 
  buildDeterministicSnapshot,
  getConfidenceLevel,
  validateBucketedAggregates 
} from "@/lib/orchestrator/deterministicSnapshot";

// Validate aggregates
validateBucketedAggregates(aggregates);

// Get confidence level
const confidence = getConfidenceLevel(estimateCount);

// Build snapshot result
const result = buildDeterministicSnapshot(
  aggregates,
  source_id,
  snapshot_id
);
```

### Schema Validator (`src/lib/orchestrator/validator.ts`)
```typescript
import { 
  validateSnapshotResult,
  isValidSnapshotResult 
} from "@/lib/orchestrator/validator";

// Assert validation (throws on error)
validateSnapshotResult(llmOutput);

// Boolean check
if (isValidSnapshotResult(llmOutput)) {
  // Valid
}
```

### Updated Orchestrator (`src/lib/orchestrator/runSnapshot.ts`)
```typescript
import { runSnapshotOrchestrator } from "@/lib/orchestrator/runSnapshot";

const result = await runSnapshotOrchestrator({
  source_id: "uuid",
  user_id: "uuid",
});

console.log(result.snapshot_id);
```

## 🔧 Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MCP_SERVER_URL` | Yes | - | MCP server URL (e.g., http://localhost:3001) |
| `MCP_SERVER_AUTH` | No | - | Optional auth token for MCP server |
| `OPENAI_API_KEY` | No* | - | Required for orchestrated mode |
| `SNAPSHOT_MODE` | No | deterministic | "deterministic" or "orchestrated" |

\* Required if `SNAPSHOT_MODE=orchestrated`

## 🎯 Pipeline Flow

```
┌──────────────────────────────────────────────────────┐
│ 1. Create snapshot record → snapshot_id             │
└───────────────────┬──────────────────────────────────┘
                    │
┌───────────────────▼──────────────────────────────────┐
│ 2. MCP: get_bucketed_aggregates(user_id, source_id) │
└───────────────────┬──────────────────────────────────┘
                    │
┌───────────────────▼──────────────────────────────────┐
│ 3. Validate aggregates structure                     │
└───────────────────┬──────────────────────────────────┘
                    │
┌───────────────────▼──────────────────────────────────┐
│ 4. Try OpenAI generation (max 1 call)               │
│    ✅ Success → use LLM result                       │
│    ❌ Failure → deterministic fallback               │
└───────────────────┬──────────────────────────────────┘
                    │
┌───────────────────▼──────────────────────────────────┐
│ 5. Validate result schema                            │
└───────────────────┬──────────────────────────────────┘
                    │
┌───────────────────▼──────────────────────────────────┐
│ 6. MCP: write_snapshot_result(snapshot_id, result)   │
└───────────────────┬──────────────────────────────────┘
                    │
┌───────────────────▼──────────────────────────────────┐
│ 7. Update snapshot metadata                          │
└───────────────────┬──────────────────────────────────┘
                    │
┌───────────────────▼──────────────────────────────────┐
│ 8. Return snapshot_id                                │
└──────────────────────────────────────────────────────┘
```

## 🛡️ Safety Constraints

| Constraint | How Enforced |
|------------|--------------|
| No raw estimates | MCP server only exposes bucketed aggregates |
| Max 1 agent call | Orchestrator enforces single `generateSnapshotResult` call |
| Fixed schema | Runtime validator rejects non-conforming outputs |
| User scoping | MCP validates user_id ownership on all calls |
| No DB changes | Uses existing tables (no migrations) |

## 🐛 Troubleshooting

### "MCP_SERVER_URL environment variable is required"
```bash
# Add to .env.local
MCP_SERVER_URL=http://localhost:3001
```

### "MCP tool call timeout after 10000ms"
1. Check MCP server is running: `curl http://localhost:3001/health`
2. Check database connection in MCP server
3. Increase timeout in MCP client if needed

### All snapshots using deterministic fallback
```bash
# Verify OpenAI key is set
echo $OPENAI_API_KEY

# Add to .env.local if missing
OPENAI_API_KEY=sk-proj-your-key
```

### "Failed to create snapshot record"
1. Verify Supabase connection
2. Check user authentication
3. Verify source exists and belongs to user

## 📊 Performance

| Operation | Latency | Notes |
|-----------|---------|-------|
| Create snapshot record | ~50ms | Database insert |
| MCP get_bucketed_aggregates | ~200ms | Database query via MCP |
| OpenAI generation | 2-4s | External API call |
| MCP write_snapshot_result | ~100ms | Database update via MCP |
| Update metadata | ~50ms | Database update |
| **Total (orchestrated)** | **3-5s** | With LLM |
| **Total (deterministic)** | **~500ms** | Without LLM |

## 📝 Code Examples

### Complete Pipeline Example
```typescript
import { runSnapshotOrchestrator } from "@/lib/orchestrator/runSnapshot";

async function generateSnapshot(source_id: string, user_id: string) {
  try {
    const result = await runSnapshotOrchestrator({
      source_id,
      user_id,
    });
    
    console.log("✅ Snapshot generated:", result.snapshot_id);
    return result;
  } catch (error) {
    console.error("❌ Snapshot generation failed:", error);
    throw error;
  }
}
```

### Testing Deterministic Builder
```typescript
import { buildDeterministicSnapshot } from "@/lib/orchestrator/deterministicSnapshot";

const mockAggregates = {
  source_id: "test-source",
  estimate_count: 50,
  weekly_volume: [
    { week: "2026-W01", count: 10 },
    { week: "2026-W02", count: 15 },
  ],
  price_distribution: [
    { band: "<500", count: 20 },
    { band: "500-1500", count: 30 },
  ],
  latency_distribution: [
    { band: "0-2d", count: 25 },
    { band: "3-7d", count: 25 },
  ],
};

const result = buildDeterministicSnapshot(
  mockAggregates,
  "source-uuid",
  "snapshot-uuid"
);

console.log(result);
// {
//   meta: { snapshot_id, source_id, generated_at, estimate_count, confidence_level },
//   demand: { weekly_volume, price_distribution },
//   decision_latency: { distribution }
// }
```

### Validating LLM Output
```typescript
import { validateSnapshotResult } from "@/lib/orchestrator/validator";

try {
  validateSnapshotResult(llmOutput);
  console.log("✅ Valid SnapshotResult");
} catch (error) {
  console.error("❌ Invalid:", error.message);
  // Example: "SnapshotResult.meta.confidence_level must be 'low', 'medium', or 'high'"
}
```

## 📚 Documentation

- **[MCP_INTEGRATION_SUMMARY.md](MCP_INTEGRATION_SUMMARY.md)** - This document
- **[docs/ORCHESTRATOR_MCP_INTEGRATION.md](docs/ORCHESTRATOR_MCP_INTEGRATION.md)** - Full integration guide
- **[ORCHESTRATOR_SUMMARY.md](ORCHESTRATOR_SUMMARY.md)** - Original orchestrator design
- **[MCP_SERVER_SUMMARY.md](MCP_SERVER_SUMMARY.md)** - MCP server implementation

## ✅ Validation

All integration deliverables complete:

- [x] MCP client with timeout handling
- [x] Deterministic snapshot builder (bucket-only)
- [x] Runtime validator for SnapshotResult
- [x] Orchestrator updated to use MCP tools
- [x] Fallback to deterministic if LLM fails
- [x] Error handling and cleanup
- [x] Environment variables documented
- [x] Integration documentation
- [x] TypeScript compilation clean
- [x] No direct database access
- [x] Max 1 LLM call enforced
- [x] Schema validation on all outputs

---

**Status**: ✅ Complete  
**Version**: 0.1.0  
**Date**: January 10, 2026
