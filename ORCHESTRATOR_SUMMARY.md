# 2ndlook Snapshot Orchestrator - Implementation Summary

## ✅ Deliverables Complete

### A) Orchestrator Module
**File**: [src/lib/orchestrator/runSnapshot.ts](src/lib/orchestrator/runSnapshot.ts)

**Exports**:
- `runSnapshotOrchestrator(params: { source_id: string; user_id: string }): Promise<{ snapshot_id: string }>`

**Behavior**:
1. ✅ Verifies buckets exist for source_id
2. ✅ Reads from estimate_buckets table (fails if missing)
3. ✅ Builds agent_input with bucketed aggregates only (no raw estimates)
4. ✅ Calls OpenAI via wrapper to produce SnapshotResult JSON
5. ✅ Stores snapshot in existing snapshots table
6. ✅ Updates source status to "snapshot_generated"
7. ✅ Returns snapshot_id

### B) OpenAI Wrapper with Schema Enforcement
**File**: [src/lib/ai/openaiClient.ts](src/lib/ai/openaiClient.ts)

**Exports**:
- `generateSnapshotResult(input: AgentInput, options: GenerateSnapshotOptions): Promise<SnapshotResult>`

**Features**:
- ✅ Uses official OpenAI SDK (openai npm package)
- ✅ Server environment variables (OPENAI_API_KEY)
- ✅ Structured outputs via `json_schema` mode
- ✅ Rejects invalid JSON or schema violations
- ✅ Throws clear errors (no retries in v0.1)
- ✅ Uses gpt-4o-2024-08-06 (supports structured outputs)

### C) SnapshotResult Type Import
**Source**: [src/types/2ndlook.ts](src/types/2ndlook.ts)
- ✅ Uses existing locked SnapshotResult type
- ✅ No type modifications required

### D) Safety + Logging
**Implemented**:
- ✅ Logs minimal metadata: snapshot_id, estimate_count, confidence_level
- ✅ Logs token usage in development mode only
- ✅ Never logs bucket contents in production mode
- ✅ All logging to server console only

## 📦 Additional Files Created

### Supporting Modules
1. **[src/lib/config/environment.ts](src/lib/config/environment.ts)** - Environment validation
2. **[src/server/snapshot-actions.ts](src/server/snapshot-actions.ts)** - Server action example
3. **[src/lib/orchestrator/validate.ts](src/lib/orchestrator/validate.ts)** - Module validation script

### Documentation
1. **[src/lib/orchestrator/README.md](src/lib/orchestrator/README.md)** - Comprehensive orchestrator docs
2. **[ORCHESTRATOR_INTEGRATION.md](ORCHESTRATOR_INTEGRATION.md)** - Integration examples and migration guide

## 🔒 Non-Negotiable Rules: ENFORCED

### 1. Agent Never Sees Raw Estimate Rows ✅
- ✅ Orchestrator loads from `estimate_buckets` table only
- ✅ Never queries `estimates_normalized` for row data
- ✅ Agent input contains only bucketed aggregates

### 2. Agent Input is Bucketed Aggregates Only ✅
```typescript
{
  demand: {
    weekly_volume: [{ week: "2026-W01", count: 15 }],
    price_distribution: [{ band: "<500", count: 10 }]
  },
  decision_latency: {
    distribution: [{ band: "0-2d", count: 20 }]
  },
  estimate_count: 35,
  confidence_level: "low"
}
```

### 3. Agent Output is JSON-Only ✅
- ✅ Uses OpenAI `json_schema` mode (strict=true)
- ✅ JSON.parse() validates syntax
- ✅ Runtime checks for required fields
- ✅ Throws error if invalid

### 4. Max 1 Agent Call Per Snapshot ✅
- ✅ Single call to `generateSnapshotResult()`
- ✅ No retry logic (v0.1 constraint)
- ✅ Fails fast on errors

### 5. No DB Schema Changes ✅
- ✅ Uses existing `snapshots` table
- ✅ Stores in existing `result` JSONB column
- ✅ No new tables or columns

### 6. No UI Changes ✅
- ✅ Server-only modules
- ✅ No UI modifications in this implementation
- ✅ Integration left to future work

## 🚀 Usage

### Basic Usage
```typescript
import { runSnapshotOrchestrator } from "@/lib/orchestrator/runSnapshot";

const result = await runSnapshotOrchestrator({
  source_id: "source-uuid",
  user_id: "user-uuid",
});

console.log("Snapshot ID:", result.snapshot_id);
```

### Server Action (Recommended)
```typescript
import { generateSnapshotAction } from "@/server/snapshot-actions";

const result = await generateSnapshotAction(sourceId);
if (result.error) {
  console.error(result.error);
} else {
  console.log("Snapshot ID:", result.snapshot_id);
}
```

### API Route Integration
See [ORCHESTRATOR_INTEGRATION.md](ORCHESTRATOR_INTEGRATION.md) for complete examples.

## 📋 Preconditions

The orchestrator validates these preconditions:
1. ✅ Source exists and belongs to user
2. ✅ Source status is "bucketed"
3. ✅ Buckets exist in `estimate_buckets` table
4. ✅ Estimate count ≥ 25
5. ✅ OPENAI_API_KEY is set

If any fail, throws a clear error message.

## 🔧 Environment Setup

Required in `.env.local`:
```bash
OPENAI_API_KEY=sk-proj-...
```

Get your API key at: https://platform.openai.com/api-keys

## 📊 OpenAI Configuration

- **Model**: gpt-4o-2024-08-06 (structured outputs)
- **Temperature**: 0.1 (consistency)
- **Max Tokens**: 2000
- **Response Format**: json_schema (strict mode)

## 💰 Cost Estimate

Typical snapshot:
- **Prompt**: 400-600 tokens
- **Completion**: 150-250 tokens
- **Total**: 550-850 tokens
- **Cost**: ~$0.01 per snapshot (gpt-4o pricing)

## ⚡ Performance

Expected execution time:
- Bucket loading: <100ms
- OpenAI call: 1-3 seconds
- DB insert: <100ms
- **Total**: 1-4 seconds

## 🧪 Testing

### Validate Setup
```bash
npx ts-node --compiler-options '{"module":"CommonJS"}' src/lib/orchestrator/validate.ts
```

### Test with Existing Data
```typescript
// Requires existing source with bucketed data
const result = await runSnapshotOrchestrator({
  source_id: "your-source-id",
  user_id: "your-user-id",
});
```

### Verify in Database
```sql
SELECT id, estimate_count, confidence_level, result
FROM snapshots
WHERE id = 'snapshot-id';
```

## 🛡️ Error Handling

Clear error messages for common issues:
- `"Invalid source_id: not found"`
- `"Source must be bucketed before snapshot generation"`
- `"No buckets found for source: missing"`
- `"Minimum 25 estimates required for snapshot"`
- `"OPENAI_API_KEY environment variable is required"`
- `"OpenAI API error (429): Rate limit exceeded"`

## 📝 TypeScript Status

All new files are TypeScript-clean:
- ✅ src/lib/ai/openaiClient.ts
- ✅ src/lib/orchestrator/runSnapshot.ts
- ✅ src/lib/config/environment.ts
- ✅ src/server/snapshot-actions.ts

## 🔄 Migration Path

The orchestrator can replace the existing `/api/snapshot` route:

**Before (Deterministic)**:
- Direct bucket-to-result mapping
- No external API calls
- Instant generation (~200ms)

**After (AI-Powered)**:
- OpenAI analysis of bucketed data
- Structured JSON output
- Slower but more insightful (2-4s)

See [ORCHESTRATOR_INTEGRATION.md](ORCHESTRATOR_INTEGRATION.md) for migration examples.

## 🎯 Next Steps

1. ✅ **DONE**: Orchestrator implemented and tested
2. ⏳ **Optional**: Update existing `/api/snapshot` route to use orchestrator
3. ⏳ **Future**: Add retry logic for transient failures
4. ⏳ **Future**: Implement async job queue for background processing
5. ⏳ **Future**: Add cost tracking per user
6. ⏳ **Future**: A/B test deterministic vs AI snapshots

## 📦 Package Changes

**Added**:
- `openai` (latest) - Official OpenAI SDK

**No Breaking Changes**: All existing dependencies unchanged.

## 🔐 Security Notes

- API keys never logged (only prefix in debug mode)
- All orchestrator modules are server-only
- No client-side OpenAI calls possible
- Agent sees only aggregated data (no PII)

## 📚 Documentation

- **[src/lib/orchestrator/README.md](src/lib/orchestrator/README.md)** - Complete API reference
- **[ORCHESTRATOR_INTEGRATION.md](ORCHESTRATOR_INTEGRATION.md)** - Integration guide
- **This file** - Implementation summary

---

**Status**: ✅ **COMPLETE** - All deliverables implemented and tested.

**Ready for**: Production use with `OPENAI_API_KEY` configured.

**No UI changes**: Integration into UI left for future work per requirements.
## Prompt Pack (v0.1+)

- System prompt enforces doctrine (not a dashboard), bucket-only inputs, max 3 findings + 3 next steps + 1 deprioritize, and zero PII beyond city/postal prefix.
- User prompt feeds bucketed aggregates (price, latency, repeat ratio, geo distributions, invoices if present) and asks for finite conclusions and ranked actions.
- Deterministic snapshot remains fallback; prompts are additive, not required for pipeline health.
