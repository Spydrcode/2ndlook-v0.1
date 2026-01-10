# Orchestrator Quick Reference

## 🚀 Quick Start

### 1. Setup
```bash
# Add to .env.local
OPENAI_API_KEY=sk-proj-...
```

### 2. Basic Usage
```typescript
import { runSnapshotOrchestrator } from "@/lib/orchestrator/runSnapshot";

const result = await runSnapshotOrchestrator({
  source_id: "source-uuid",
  user_id: "user-uuid",
});
// Returns: { snapshot_id: "snapshot-uuid" }
```

### 3. Server Action
```typescript
import { generateSnapshotAction } from "@/server/snapshot-actions";

const result = await generateSnapshotAction(sourceId);
```

## 📁 File Structure

```
src/
├── lib/
│   ├── ai/
│   │   └── openaiClient.ts           # OpenAI wrapper
│   ├── orchestrator/
│   │   ├── runSnapshot.ts            # Main orchestrator
│   │   ├── validate.ts               # Validation script
│   │   └── README.md                 # Full documentation
│   └── config/
│       └── environment.ts            # Env validation
└── server/
    └── snapshot-actions.ts           # Server action example
```

## 🔒 Safety Rules

| Rule | Status |
|------|--------|
| Agent never sees raw estimates | ✅ Enforced |
| Only bucketed aggregates as input | ✅ Enforced |
| JSON output matching schema | ✅ Enforced |
| Max 1 agent call per snapshot | ✅ Enforced |
| No DB schema changes | ✅ Enforced |

## 📊 What Agent Sees

**Input (Bucketed Aggregates)**:
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

**Output (SnapshotResult)**:
```typescript
{
  meta: { snapshot_id, source_id, generated_at, estimate_count, confidence_level },
  demand: { weekly_volume, price_distribution },
  decision_latency: { distribution }
}
```

## ⚡ Performance

- **Latency**: 1-4 seconds
- **Cost**: ~$0.01 per snapshot
- **Tokens**: 550-850 per snapshot

## 🛡️ Error Messages

| Error | Meaning | Solution |
|-------|---------|----------|
| `Invalid source_id` | Source not found or wrong user | Check source exists |
| `Source must be bucketed` | Status not "bucketed" | Call /api/bucket first |
| `No buckets found` | estimate_buckets missing | Run bucketing |
| `Minimum 25 estimates required` | Not enough data | Upload more estimates |
| `OPENAI_API_KEY is required` | Missing env var | Add to .env.local |
| `OpenAI API error (429)` | Rate limit | Wait or upgrade plan |

## 🧪 Testing

```bash
# Validate setup
npx ts-node --compiler-options '{"module":"CommonJS"}' \
  src/lib/orchestrator/validate.ts

# Test with existing source
# (requires source with bucketed data)
```

## 📚 Documentation

- **[ORCHESTRATOR_SUMMARY.md](../ORCHESTRATOR_SUMMARY.md)** - Implementation summary
- **[ORCHESTRATOR_INTEGRATION.md](../ORCHESTRATOR_INTEGRATION.md)** - Integration guide
- **[src/lib/orchestrator/README.md](README.md)** - Full API reference

## 🔧 OpenAI Config

- **Model**: gpt-4o-2024-08-06
- **Temperature**: 0.1
- **Max Tokens**: 2000
- **Mode**: json_schema (strict)

## 💡 Common Patterns

### Pattern 1: API Route
```typescript
import { runSnapshotOrchestrator } from "@/lib/orchestrator/runSnapshot";

export async function POST(request: NextRequest) {
  const { source_id } = await request.json();
  const result = await runSnapshotOrchestrator({ source_id, user_id });
  return NextResponse.json(result);
}
```

### Pattern 2: Server Action
```typescript
"use server";
import { generateSnapshotAction } from "@/server/snapshot-actions";

export async function handleGenerate(sourceId: string) {
  return await generateSnapshotAction(sourceId);
}
```

### Pattern 3: Background Job
```typescript
import { runSnapshotOrchestrator } from "@/lib/orchestrator/runSnapshot";

async function processQueue(job: { source_id: string; user_id: string }) {
  const result = await runSnapshotOrchestrator(job);
  await notifyUser(job.user_id, result.snapshot_id);
}
```

## ✅ Checklist

Before using the orchestrator:
- [ ] OPENAI_API_KEY in .env.local
- [ ] Source exists and belongs to user
- [ ] Source status is "bucketed"
- [ ] Estimate count ≥ 25
- [ ] estimate_buckets row exists

After calling:
- [ ] Check snapshot_id returned
- [ ] Verify snapshot in database
- [ ] Check source status = "snapshot_generated"

## 🎯 Next Steps

1. Add OPENAI_API_KEY to .env.local
2. Test with existing bucketed source
3. Integrate into UI (optional)
4. Monitor cost and latency
5. Consider async processing for scale
