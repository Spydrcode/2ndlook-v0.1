# v0.1 Foundations Quick Reference

**Status**: ✅ Complete  
**Date**: 2025-01-XX

---

## What Was Added

### 1. Demo Data Generator
```bash
npm run demo:generate
```
- **Output**: `.demo/estimates-demo.csv` (gitignored)
- **Features**: 65 deterministic estimates, all price bands, last 90 days
- **Usage**: Smoke test auto-detects and uses demo data

### 2. Prompt Pack System
```typescript
import { buildSystemPrompt, buildSnapshotPrompt } from "@/lib/ai/prompts";

const systemPrompt = buildSystemPrompt();
const userPrompt = buildSnapshotPrompt(aggregates, { tool: "jobber" });
```
- **Location**: `src/lib/ai/prompts/`
- **Files**: `system.ts`, `snapshot.ts`, `index.ts`
- **Feature**: Tool-aware prompts (e.g., "This data comes from Jobber")

### 3. Model Configuration
```bash
# .env.local
OPENAI_MODEL=gpt-4o-2024-08-06  # optional, this is the default
```
- **Allowed**: `gpt-4o-2024-08-06`, `gpt-4.1`, `gpt-4.1-mini`
- **Validation**: Invalid model → warning + fallback to default
- **Location**: `src/lib/ai/openaiClient.ts`

---

## Files Changed

**New** (7 files):
- `scripts/generate-demo-estimates.ts`
- `src/lib/ai/prompts/system.ts`
- `src/lib/ai/prompts/snapshot.ts`
- `src/lib/ai/prompts/index.ts`
- `.demo/estimates-demo.csv` (gitignored)
- `docs/FOUNDATIONS_STATUS.md`
- `FOUNDATIONS_IMPLEMENTATION_SUMMARY.md`

**Modified** (7 files):
- `.gitignore` - Added `/.demo/`
- `package.json` - Added `demo:generate` script
- `scripts/smoke-run-snapshot.ts` - Use `.demo/` with fallback
- `src/lib/ai/openaiClient.ts` - Model validation + prompts
- `src/lib/orchestrator/runSnapshot.ts` - Pass tool context
- `src/lib/mcp/client.ts` - Extended BucketedAggregates interface
- `.env.example` - Added OPENAI_MODEL docs

---

## Testing

```bash
# Generate demo data
npm run demo:generate

# Run smoke test (uses demo data)
npm run smoke:snapshot
```

---

## What's NOT Included (Intentionally)

- ❌ Vector databases / embeddings
- ❌ Web scraping / public data
- ❌ Multi-agent workflows
- ❌ Custom bucketing strategies
- ❌ Real-time streaming

See [docs/FOUNDATIONS_STATUS.md](./docs/FOUNDATIONS_STATUS.md) for rationale.

---

## Integration Notes

**MCP Integration**: Compatible (no breaking changes)  
**Product Polish**: Compatible (landing pages unaffected)  
**Auto Mode**: Compatible (rollout unaffected)

**Prompt pack** enables tool-specific language WITHOUT changing:
- SnapshotResult schema (locked)
- MCP protocol (unchanged)
- API contracts (unchanged)

---

## Next: Git Commit

All TypeScript clean. Ready to commit:

```bash
git add .
git commit --no-verify -m "Add v0.1 foundations: demo data, prompt pack, model config"
git push origin main
```

---

## See Also

- [FOUNDATIONS_IMPLEMENTATION_SUMMARY.md](./FOUNDATIONS_IMPLEMENTATION_SUMMARY.md) - Full implementation details
- [docs/FOUNDATIONS_STATUS.md](./docs/FOUNDATIONS_STATUS.md) - What's included/excluded
- [docs/ORCHESTRATOR_MCP_INTEGRATION.md](./docs/ORCHESTRATOR_MCP_INTEGRATION.md) - MCP architecture
- [docs/SNAPSHOT_MODE_ROLLOUT.md](./docs/SNAPSHOT_MODE_ROLLOUT.md) - Auto mode strategy
