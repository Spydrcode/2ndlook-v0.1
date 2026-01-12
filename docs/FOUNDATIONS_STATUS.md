# 2ndlook v0.1 Foundations Status

**Last Updated**: 2025-01-XX  
**Version**: 0.1  
**Status**: Complete

---

## Overview

This document explains what's **included** and **intentionally excluded** from 2ndlook v0.1 foundations. These choices establish a minimal, working foundation that can scale thoughtfully in future versions.

---

## ✅ What's Included

### 1. Internal Demo/Seed Data

**Purpose**: Repeatable test data for development and smoke testing without hunting for real sources.

**Implementation**:
- **Generator**: `scripts/generate-demo-estimates.ts`
- **Output**: `.demo/estimates-demo.csv` (gitignored)
- **Data characteristics**:
  - 60-80 estimates (deterministic randomness, seeded RNG)
  - All price bands covered (<$500, $500-$1500, $1500-$5000, $5000+)
  - Last 90 days window
  - Realistic lead times (7-150 days)
  - Mix of sent/accepted/declined/converted statuses
- **NPM script**: `npm run demo:generate`
- **Smoke test integration**: `scripts/smoke-run-snapshot.ts` uses `.demo/` data when available

**Why included**: Developers need reliable test data without external dependencies. Deterministic generation ensures consistent CI/CD behavior.

---

### 2. Prompt Pack System

**Purpose**: Centralized, maintainable AI prompt management with tool-aware language support.

**Implementation**:
- **Location**: `src/lib/ai/prompts/`
- **Structure**:
  - `system.ts` - `buildSystemPrompt()` - AI role and behavior definition
  - `snapshot.ts` - `buildSnapshotPrompt(aggregates, options)` - Context-aware snapshot prompts
  - `index.ts` - Public exports
- **Features**:
  - Tool-aware wording (e.g., "This data comes from Jobber" vs. generic language)
  - No schema changes (wording only)
  - Consistent formatting helpers (weekly volume, price distribution, latency)

**Why included**: Hard-coded prompts in `openaiClient.ts` were difficult to maintain and test. Centralizing prompts enables A/B testing, tool-specific customization, and easier iteration without touching core OpenAI logic.

**Example usage**:
```typescript
import { buildSystemPrompt, buildSnapshotPrompt } from "@/lib/ai/prompts";

const systemPrompt = buildSystemPrompt();
const userPrompt = buildSnapshotPrompt(aggregates, { tool: "jobber" });
```

---

### 3. OpenAI Model Configuration + Validation

**Purpose**: Safe, explicit model selection with validation and fallback behavior.

**Implementation**:
- **Environment variable**: `OPENAI_MODEL` (optional, defaults to `gpt-4o-2024-08-06`)
- **Allowlist**: `["gpt-4o-2024-08-06", "gpt-4.1", "gpt-4.1-mini"]`
- **Validation logic** (`src/lib/ai/openaiClient.ts`):
  - Invalid model → log warning (don't crash)
  - Fall back to default model
  - Never silently use untested models
- **Documentation**: `.env.example` includes model selection guidance

**Why included**: Hardcoding `gpt-4o-2024-08-06` was inflexible. As OpenAI releases new models, we need controlled rollout with validation to prevent surprise API errors or degraded performance.

**Safety guarantees**:
- No surprise model changes (explicit configuration)
- Invalid config doesn't crash production
- Telemetry captures model changes for debugging

---

## ❌ What's Intentionally Excluded

### 1. Vector Databases / Embeddings

**Why excluded**: 
- v0.1 doesn't need semantic search or RAG
- Agent receives bucketed aggregates only (no need to search)
- Adds complexity (infrastructure, cost, maintenance)
- No user-facing feature requires it yet

**When to reconsider**: v0.2+ if we add:
- Multi-source comparison ("find similar contractors")
- Historical pattern search ("show periods like this")
- Natural language queries over past snapshots

---

### 2. Web Scraping / Public Data Enrichment

**Why excluded**:
- Privacy/legal complexity (terms of service, GDPR)
- Rate limiting and anti-scraping measures
- Data quality and freshness concerns
- v0.1 focuses on user's own data only

**When to reconsider**: v0.2+ if we add:
- Industry benchmarking (requires third-party data)
- Competitive analysis features
- Market research capabilities

---

### 3. Multi-Agent Workflows

**Why excluded**:
- v0.1 constraint: max 1 agent call per snapshot
- Complexity increases exponentially with agents
- Cost and latency multiply
- Debugging becomes significantly harder

**When to reconsider**: v0.2+ if we need:
- Specialized agents (demand analyst, pricing analyst, etc.)
- Agent feedback loops or refinement
- Complex reasoning chains

**Current approach**: Single-agent call with deterministic fallback ensures reliability.

---

### 4. Custom Bucketing Strategies

**Why excluded**:
- v0.1 uses fixed buckets (price bands, latency bands, weekly volume)
- No user-facing customization needed yet
- Schema changes locked until v0.2

**When to reconsider**: v0.2+ if users need:
- Custom price bands for industry-specific ranges
- Hourly/daily granularity instead of weekly
- Regional or team-based bucketing

**Current approach**: Fixed buckets cover 80% of use cases. Flexibility can be added later without breaking existing snapshots.

---

### 5. Real-Time Streaming / Webhooks

**Why excluded**:
- Batch processing sufficient for v0.1
- Adds infrastructure complexity (WebSocket servers, event queues)
- No user-facing feature requires real-time updates

**When to reconsider**: v0.2+ if we add:
- Live dashboard updates
- Instant alerts/notifications
- Collaborative features

---

## 📋 Foundations Checklist

- ✅ Demo data generator with deterministic RNG
- ✅ Smoke test updated to use `.demo/` data
- ✅ Prompt pack system (`system.ts`, `snapshot.ts`, `index.ts`)
- ✅ OpenAI model configuration with validation
- ✅ `.env.example` updated with `OPENAI_MODEL` docs
- ✅ `openaiClient.ts` uses prompt pack
- ✅ Orchestrator passes tool context to prompts
- ✅ Documentation (this file)

---

## 🔄 Migration Notes

**For existing users (v0.0 → v0.1)**:
- No breaking changes
- `OPENAI_MODEL` is optional (defaults to current model)
- Demo data is dev-only (not committed to repo)
- Prompt pack changes are internal only (no API changes)

**For new users**:
1. Run `npm run demo:generate` to create test data
2. Run `npm run smoke:snapshot` to verify end-to-end pipeline
3. (Optional) Set `OPENAI_MODEL` in `.env.local` if not using default

---

## 📊 Foundation Metrics

**Lines of code added**:
- Demo data generator: ~150 LOC
- Prompt pack: ~100 LOC
- Model validation: ~40 LOC
- Documentation: ~200 LOC

**Complexity impact**: Low (additive only, no breaking changes)

**Test coverage**: Smoke test covers all foundation components

---

## 🚀 What's Next (v0.2 Planning)

**Potential additions** (not committed):
1. **Custom bucketing** - User-defined price bands and time granularity
2. **Multi-source comparison** - "How does this contractor compare to others?"
3. **Historical trend analysis** - Month-over-month, year-over-year patterns
4. **Industry benchmarking** - (requires third-party data, careful legal review)

**Guiding principle**: Add complexity only when user-facing value is clear.

---

## 📞 Questions?

See also:
- [docs/ORCHESTRATOR_MCP_INTEGRATION.md](./ORCHESTRATOR_MCP_INTEGRATION.md) - MCP architecture
- [docs/SNAPSHOT_MODE_ROLLOUT.md](./SNAPSHOT_MODE_ROLLOUT.md) - Auto mode rollout strategy
- [PRODUCT_POLISH_QUICKREF.md](../PRODUCT_POLISH_QUICKREF.md) - Connector landing pages

For issues or suggestions, file an issue in the repo.
