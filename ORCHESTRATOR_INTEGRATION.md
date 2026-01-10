# Orchestrator Integration Examples

This document shows how to integrate the orchestrator into existing 2ndlook flows.

## Option 1: Replace Existing Snapshot API Route

Update `/src/app/api/snapshot/route.ts` to use the orchestrator:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runSnapshotOrchestrator } from "@/lib/orchestrator/runSnapshot";
import type { SnapshotRequest, SnapshotResponse } from "@/types/2ndlook";

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();

    // Verify auth
    const {
      data: { user },
    } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: SnapshotRequest = await request.json();
    const { source_id } = body;

    if (!source_id) {
      return NextResponse.json(
        { error: "source_id is required" },
        { status: 400 }
      );
    }

    // Run the orchestrator (handles all validation, agent call, DB storage)
    const result = await runSnapshotOrchestrator({
      source_id,
      user_id: user.id,
    });

    const response: SnapshotResponse = {
      snapshot_id: result.snapshot_id,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error("[Snapshot API] Error:", error);
    
    return NextResponse.json(
      { 
        error: error instanceof Error 
          ? error.message 
          : "Internal server error" 
      },
      { status: 500 }
    );
  }
}
```

## Option 2: Server Action (Recommended for New Code)

Use the provided server action in React Server Components:

```typescript
// In a page or component
import { generateSnapshotAction } from "@/server/snapshot-actions";

export default async function SnapshotGeneratorPage({ 
  params 
}: { 
  params: { sourceId: string } 
}) {
  async function handleGenerate() {
    "use server";
    
    const result = await generateSnapshotAction(params.sourceId);
    
    if (result.error) {
      console.error("Failed to generate snapshot:", result.error);
      return;
    }
    
    console.log("Snapshot generated:", result.snapshot_id);
  }

  return (
    <form action={handleGenerate}>
      <button type="submit">Generate Snapshot</button>
    </form>
  );
}
```

## Option 3: Direct Orchestrator Call

For custom logic or background jobs:

```typescript
import { runSnapshotOrchestrator } from "@/lib/orchestrator/runSnapshot";

async function customSnapshotFlow(sourceId: string, userId: string) {
  try {
    // Pre-validation or custom logic here
    
    const result = await runSnapshotOrchestrator({
      source_id: sourceId,
      user_id: userId,
    });
    
    // Post-processing or notifications here
    
    return result.snapshot_id;
  } catch (error) {
    // Custom error handling
    throw error;
  }
}
```

## Testing the Orchestrator

### 1. Environment Setup

Create `.env.local`:
```bash
OPENAI_API_KEY=sk-proj-...
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 2. Test with Existing Flow

If you have existing sources with bucketed data:

```typescript
// In a test script or API route
import { runSnapshotOrchestrator } from "@/lib/orchestrator/runSnapshot";

const result = await runSnapshotOrchestrator({
  source_id: "your-existing-source-id",
  user_id: "your-user-id",
});

console.log("Success! Snapshot ID:", result.snapshot_id);
```

### 3. Verify in Database

```sql
-- Check the generated snapshot
SELECT 
  id,
  estimate_count,
  confidence_level,
  result->>'meta' as meta,
  generated_at
FROM snapshots
WHERE id = 'your-snapshot-id';
```

## Error Scenarios

The orchestrator provides clear error messages for common issues:

### Source Not Bucketed
```
Error: Source must be bucketed before snapshot generation (current status: ingested)
```
**Solution**: Call `/api/bucket` first to bucket the estimates.

### Missing OpenAI Key
```
Error: OPENAI_API_KEY environment variable is required. Add it to your .env.local file.
```
**Solution**: Add `OPENAI_API_KEY=sk-...` to `.env.local`.

### Insufficient Estimates
```
Error: Minimum 25 estimates required for snapshot (found: 15)
```
**Solution**: Upload more estimates to reach the minimum threshold.

### OpenAI API Error
```
Error: OpenAI API error (429): Rate limit exceeded
```
**Solution**: Wait for rate limit to reset or upgrade OpenAI plan.

## Migration from Old Snapshot API

If you want to keep the old deterministic snapshot generation for testing:

### Old Route (Deterministic)
```typescript
// src/app/api/snapshot/deterministic/route.ts
import { NextRequest, NextResponse } from "next/server";
// ... keep existing generateSnapshotResult logic
```

### New Route (AI-Powered)
```typescript
// src/app/api/snapshot/route.ts
import { runSnapshotOrchestrator } from "@/lib/orchestrator/runSnapshot";
// ... use orchestrator
```

This allows A/B testing between deterministic and AI-generated snapshots.

## Performance Considerations

### Expected Latency
- **Deterministic**: ~200ms (bucket read + DB insert)
- **AI-Powered**: ~2-4s (bucket read + OpenAI call + DB insert)

### Cost
- **Deterministic**: $0 (no external API)
- **AI-Powered**: ~$0.01 per snapshot (gpt-4o pricing)

For high-volume users, consider:
1. Async job queue for background processing
2. Rate limiting on snapshot generation
3. Caching for frequently accessed snapshots

## Next Steps

1. ✅ Orchestrator is implemented and tested
2. ⏳ Update existing snapshot API route (optional)
3. ⏳ Add UI toggle for AI vs deterministic (future)
4. ⏳ Implement retry logic for OpenAI failures (future)
5. ⏳ Add cost tracking per user (future)
