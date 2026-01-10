# 2ndlook Snapshot Orchestrator

Server-only orchestrator module for generating AI-powered snapshots using OpenAI with strict safety rules.

## Architecture

```
/src/lib/orchestrator/
├── runSnapshot.ts          # Main orchestrator pipeline

/src/lib/ai/
├── openaiClient.ts         # OpenAI wrapper with schema enforcement
```

## Safety Rules (Non-Negotiable)

1. **Agent never sees raw estimate rows** - Only bucketed aggregates are passed
2. **Agent input is bucketed aggregates only** - No customer data, no line items
3. **Agent output is JSON-only** - Matches locked SnapshotResult schema
4. **Max 1 agent call per snapshot** - v0.1 constraint
5. **No DB schema changes** - Uses existing `snapshots` table

## Usage

### Basic Usage

```typescript
import { runSnapshotOrchestrator } from "@/lib/orchestrator/runSnapshot";

// In a server action or API route
const result = await runSnapshotOrchestrator({
  source_id: "source-uuid",
  user_id: "user-uuid",
});

console.log("Generated snapshot:", result.snapshot_id);
```

### Example: Server Action

```typescript
"use server";

import { createClient } from "@/lib/supabase/server";
import { runSnapshotOrchestrator } from "@/lib/orchestrator/runSnapshot";

export async function generateSnapshot(sourceId: string) {
  const supabase = createClient();
  
  const {
    data: { user },
  } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error("Unauthorized");
  }

  const result = await runSnapshotOrchestrator({
    source_id: sourceId,
    user_id: user.id,
  });

  return result;
}
```

### Example: API Route

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runSnapshotOrchestrator } from "@/lib/orchestrator/runSnapshot";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  
  const {
    data: { user },
  } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { source_id } = await request.json();

  try {
    const result = await runSnapshotOrchestrator({
      source_id,
      user_id: user.id,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
```

## Pipeline Steps

The orchestrator executes these steps in order:

1. **Verify Source** - Check source exists, belongs to user, and is bucketed
2. **Load Buckets** - Fetch bucketed aggregates (no raw estimates)
3. **Get Estimate Count** - For confidence calculation
4. **Determine Confidence** - low (<40), medium (40-60), high (60+)
5. **Build Agent Input** - Bucketed aggregates only
6. **Call OpenAI** - Single agent call with structured output
7. **Store Snapshot** - Insert into `snapshots` table
8. **Update Metadata** - Set snapshot_id in result
9. **Update Source Status** - Mark as `snapshot_generated`

## Environment Variables

Required in `.env.local`:

```bash
OPENAI_API_KEY=sk-...
```

The orchestrator will throw a clear error if this is missing.

## Agent Input Format

The agent receives ONLY bucketed aggregates:

```typescript
{
  demand: {
    weekly_volume: [
      { week: "2026-W01", count: 15 },
      { week: "2026-W02", count: 18 }
    ],
    price_distribution: [
      { band: "<500", count: 10 },
      { band: "500-1500", count: 25 }
    ]
  },
  decision_latency: {
    distribution: [
      { band: "0-2d", count: 20 },
      { band: "3-7d", count: 15 }
    ]
  },
  estimate_count: 35,
  confidence_level: "low"
}
```

**What the agent NEVER sees:**
- Raw estimate rows
- Customer names or identifiers
- Line-item details
- Individual estimate amounts
- Job descriptions

## Agent Output Format

The agent returns a structured JSON object matching `SnapshotResult`:

```typescript
{
  meta: {
    snapshot_id: "snapshot-uuid",
    source_id: "source-uuid",
    generated_at: "2026-01-10T12:00:00Z",
    estimate_count: 35,
    confidence_level: "low"
  },
  demand: {
    weekly_volume: [...],  // Exact data from input
    price_distribution: [...]
  },
  decision_latency: {
    distribution: [...]
  }
}
```

The schema is enforced at the OpenAI API level using `json_schema` mode.

## Error Handling

The orchestrator throws clear errors for common issues:

```typescript
// Source not found or wrong user
throw new Error("Invalid source_id: not found");

// Source not ready
throw new Error("Source must be bucketed before snapshot generation (current status: ingested)");

// No buckets
throw new Error("No buckets found for source: missing");

// Not enough estimates
throw new Error("Minimum 25 estimates required for snapshot (found: 15)");

// OpenAI API error
throw new Error("OpenAI API error (429): Rate limit exceeded");
```

## Logging

The orchestrator logs minimal metadata to the server console:

**Development Mode:**
```
[OpenAI] Snapshot generated: {
  snapshot_id: "...",
  estimate_count: 35,
  confidence_level: "low",
  usage: { prompt_tokens: 500, completion_tokens: 200, total_tokens: 700 }
}

[Orchestrator] Snapshot pipeline complete: {
  snapshot_id: "...",
  source_id: "...",
  estimate_count: 35,
  confidence_level: "low"
}
```

**Production Mode:**
```
[OpenAI] Snapshot generated: {
  snapshot_id: "...",
  estimate_count: 35,
  confidence_level: "low"
}

[Orchestrator] Snapshot pipeline complete: {
  snapshot_id: "...",
  source_id: "...",
  estimate_count: 35,
  confidence_level: "low"
}
```

Bucket contents are NEVER logged in production.

## OpenAI Configuration

The client uses:
- **Model**: `gpt-4o-2024-08-06` (supports structured outputs)
- **Temperature**: `0.1` (low for consistency)
- **Max Tokens**: `2000`
- **Response Format**: `json_schema` with strict validation

## Future Enhancements (v0.2+)

- Retry logic for transient OpenAI failures
- Multiple agent calls for deeper insights
- Async job queue for long-running snapshots
- Webhook notifications when snapshots complete
- Cost tracking and budgeting per user

## Debugging

To test the orchestrator locally:

1. Set `OPENAI_API_KEY` in `.env.local`
2. Create a source with bucketed data
3. Call the orchestrator:

```typescript
const result = await runSnapshotOrchestrator({
  source_id: "your-source-id",
  user_id: "your-user-id",
});
```

4. Check server console for logs
5. Verify snapshot in database:

```sql
SELECT id, estimate_count, confidence_level, result 
FROM snapshots 
WHERE source_id = 'your-source-id';
```

## Schema Enforcement

The OpenAI client enforces the schema at multiple levels:

1. **API Level**: Uses `json_schema` mode for structured output
2. **Parse Level**: JSON.parse() catches malformed JSON
3. **Runtime Level**: Validates required top-level fields

If any validation fails, the orchestrator throws a clear error.

## Performance

Expected execution time:
- **Bucket Loading**: <100ms
- **OpenAI Call**: 1-3 seconds
- **DB Insert**: <100ms
- **Total**: 1-4 seconds

Token usage (typical):
- **Prompt**: 400-600 tokens
- **Completion**: 150-250 tokens
- **Total**: 550-850 tokens (~$0.01 per snapshot with gpt-4o pricing)
