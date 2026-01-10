# Snapshot Mode Rollout Guide

## Overview

The 2ndlook snapshot generation system supports three modes for safe production rollout of orchestrated (AI-powered) snapshot generation.

## Modes

### 1. Deterministic (Default)
```bash
SNAPSHOT_MODE=deterministic
```

**Behavior**: Always uses rule-based snapshot generation.

**When to use**:
- Initial deployment
- When OpenAI API is unavailable
- When maximum predictability is required
- As permanent fallback if AI approach doesn't work

**Characteristics**:
- ✅ 100% consistent results
- ✅ ~500ms generation time
- ✅ No external API dependencies
- ✅ $0 cost per snapshot

### 2. Orchestrated
```bash
SNAPSHOT_MODE=orchestrated
OPENAI_API_KEY=sk-proj-...
```

**Behavior**: Always attempts AI-powered generation, falls back to deterministic on failure.

**When to use**:
- Testing AI generation quality
- After validating API stability
- When prioritizing AI insights over speed

**Characteristics**:
- 🎯 AI-generated insights
- ⏱️ ~3-5s generation time
- 💰 ~$0.01 per snapshot
- 🔄 Auto-fallback on errors

### 3. Auto (Smart Default)
```bash
SNAPSHOT_MODE=auto
OPENAI_API_KEY=sk-proj-...
```

**Behavior**: Automatically chooses orchestrated or deterministic based on observed stability.

**Decision Logic**:
```
Use orchestrated IF:
  ✅ OpenAI API key is present
  AND
  ✅ At least 10 snapshots tracked
  AND
  ✅ Fallback rate < 20%

Otherwise:
  Use deterministic
```

**When to use**:
- Gradual rollout to production
- When you want system to self-regulate
- After initial testing phase

**Characteristics**:
- 🤖 Self-adjusting based on metrics
- 🛡️ Conservative (defaults to deterministic when uncertain)
- 📊 Requires tracking data to enable orchestrated

## Recommended Rollout Sequence

### Phase 1: Validation (Week 1)
```bash
# Development/Staging
SNAPSHOT_MODE=deterministic
```

**Goal**: Validate baseline performance

**Actions**:
1. Deploy with deterministic mode
2. Verify all snapshots generate successfully
3. Establish baseline metrics (latency, quality)

**Success Criteria**:
- ✅ 100% snapshot success rate
- ✅ Consistent generation times
- ✅ No errors in logs

### Phase 2: AI Testing (Week 2-3)
```bash
# Staging only
SNAPSHOT_MODE=orchestrated
OPENAI_API_KEY=sk-proj-...
```

**Goal**: Validate orchestrated mode quality and stability

**Actions**:
1. Enable orchestrated mode in staging
2. Generate 50+ test snapshots
3. Compare orchestrated vs deterministic outputs
4. Monitor fallback frequency
5. Validate OpenAI costs

**Success Criteria**:
- ✅ Fallback rate < 20%
- ✅ AI outputs match schema 100%
- ✅ Acceptable cost per snapshot
- ✅ Quality improvement vs deterministic

### Phase 3: Production Trial (Week 4)
```bash
# Production
SNAPSHOT_MODE=orchestrated
OPENAI_API_KEY=sk-proj-...
```

**Goal**: Validate orchestrated mode in production

**Actions**:
1. Enable orchestrated for subset of users (10-20%)
2. Monitor for 1 week
3. Track metrics:
   - Fallback rate
   - Error types
   - User feedback (if available)
   - Cost accumulation

**Success Criteria**:
- ✅ Fallback rate stable < 20%
- ✅ No user-reported issues
- ✅ Acceptable costs
- ✅ Similar or better snapshot quality

### Phase 4: Auto Mode (Week 5+)
```bash
# Production
SNAPSHOT_MODE=auto
OPENAI_API_KEY=sk-proj-...
```

**Goal**: Enable self-regulating production mode

**Actions**:
1. Switch to auto mode
2. Monitor mode decisions in logs
3. Verify system stays in orchestrated when stable
4. Verify system switches to deterministic during issues

**Success Criteria**:
- ✅ System predominantly uses orchestrated
- ✅ Automatic fallback to deterministic during issues
- ✅ Recovery to orchestrated after issues resolve

## Monitoring

### Key Metrics to Track

**Telemetry Logs** (JSON lines in stdout):
```json
{
  "_type": "snapshot_telemetry",
  "timestamp": "2026-01-10T12:34:56.789Z",
  "source_id": "...",
  "snapshot_id": "...",
  "mode_attempted": "orchestrated",
  "mode_used": "orchestrated",
  "fallback_used": false,
  "duration_ms": 3245
}
```

**Metrics to Monitor**:

1. **Fallback Rate**
   ```
   fallback_rate = (snapshots with fallback_used=true) / (total snapshots)
   ```
   - Target: < 20%
   - Alert if: > 30% over 1 hour
   - Action: Investigate error logs, consider switching to deterministic

2. **Mode Distribution** (for auto mode)
   ```
   orchestrated_pct = (mode_used="orchestrated") / (total snapshots)
   ```
   - Expected: 70-90% in auto mode (if stable)
   - Alert if: < 50% (indicates stability issues)

3. **Error Codes**
   - `E_OPENAI`: OpenAI API issues (rate limits, network)
   - `E_SCHEMA`: Schema validation failures
   - `E_MCP`: MCP server issues
   - `E_UNKNOWN`: Other errors
   
   Track distribution to identify root causes.

4. **Generation Time**
   - Orchestrated: 2-5s (target)
   - Deterministic: 300-700ms (target)
   - Alert if: p95 > 10s

5. **Cost per Snapshot**
   - Track OpenAI API usage
   - Expected: ~$0.01 per orchestrated snapshot
   - Monitor monthly spend

### Log Patterns

**Orchestrated Success**:
```
[Snapshot API] Attempting orchestrated generation: { source_id, mode: "orchestrated" }
[Snapshot API] Orchestrated generation successful: { snapshot_id, source_id }
```

**Fallback**:
```
[Snapshot API] Orchestrator failed, falling back to deterministic: { source_id, error, errorCode }
[Snapshot API] Deterministic fallback successful: { snapshot_id, source_id }
```

**Auto Mode Decision**:
```
[Auto Mode] Stable metrics (15.2% fallback) → orchestrated
```
or
```
[Auto Mode] Fallback rate too high (28.5%) → deterministic
```

### Monitoring Queries

**Parse telemetry logs**:
```bash
# Get fallback rate (last 1000 snapshots)
cat logs/app.log | \
  grep snapshot_telemetry | \
  tail -1000 | \
  jq -r '.fallback_used' | \
  awk '{sum+=$1} END {print sum/NR*100 "%"}'

# Get error code distribution
cat logs/app.log | \
  grep snapshot_telemetry | \
  jq -r 'select(.error_code) | .error_code' | \
  sort | uniq -c

# Get average duration by mode
cat logs/app.log | \
  grep snapshot_telemetry | \
  jq -r '[.mode_used, .duration_ms] | @tsv' | \
  awk '{sum[$1]+=$2; count[$1]++} END {for(m in sum) print m, sum[m]/count[m] "ms"}'
```

## Rollback Procedures

### Immediate Rollback
```bash
# Switch to deterministic immediately
SNAPSHOT_MODE=deterministic
```

**When to rollback**:
- Fallback rate > 50%
- Consistent schema validation failures
- OpenAI API outage
- Unexpected costs

**Actions**:
1. Update environment variable
2. Restart application (or wait for serverless cold start)
3. Verify snapshots generating successfully
4. Investigate root cause

### Gradual Rollback
```bash
# Let auto mode handle it
SNAPSHOT_MODE=auto
```

**When to use**:
- Intermittent issues (not critical)
- Temporary rate limits
- Testing stability recovery

**Behavior**: Auto mode will detect elevated fallback rate and switch to deterministic automatically.

## Troubleshooting

### Issue: All snapshots using deterministic (in auto mode)

**Possible Causes**:
1. OpenAI API key missing or invalid
2. Insufficient tracking data (< 10 snapshots)
3. Fallback rate > 20%

**Check**:
```bash
# Verify OpenAI key is set
echo $OPENAI_API_KEY

# Check auto mode decision
grep "Auto Mode" logs/app.log | tail -10
```

**Resolution**:
- If key missing: Add `OPENAI_API_KEY` to environment
- If insufficient data: Wait for 10+ snapshots to accumulate
- If high fallback rate: Investigate error logs, may need to stay deterministic

### Issue: High fallback rate (> 30%)

**Possible Causes**:
1. OpenAI rate limits
2. Schema validation failures (LLM output doesn't match spec)
3. MCP server issues
4. Network problems

**Check error codes**:
```bash
# See error distribution
cat logs/app.log | \
  grep snapshot_telemetry | \
  jq -r 'select(.error_code) | .error_code' | \
  sort | uniq -c
```

**Resolution by Error Code**:
- `E_OPENAI`: Check OpenAI dashboard for rate limits, increase quota, or reduce snapshot frequency
- `E_SCHEMA`: Review LLM prompt, validate schema definition, may need prompt tuning
- `E_MCP`: Check MCP server logs, verify connectivity, restart MCP server
- `E_UNKNOWN`: Review full error logs for root cause

### Issue: Costs higher than expected

**Check**:
```bash
# Count orchestrated snapshots
cat logs/app.log | \
  grep snapshot_telemetry | \
  grep '"mode_used":"orchestrated"' | \
  wc -l

# Calculate estimated cost (assuming $0.01 per snapshot)
# orchestrated_count * 0.01 = total_cost
```

**Resolution**:
1. Verify rate is as expected
2. Check OpenAI usage dashboard
3. Consider switching to deterministic or limiting snapshot frequency

## Auto Mode Behavior Details

### In-Memory Tracking

Auto mode tracks the last 100 snapshot events in process memory (per instance).

**Limitations**:
- Data lost on restart/redeploy
- Each serverless instance tracks independently
- Conservative by default (if uncertain, use deterministic)

**Implications**:
- After deployment, auto mode starts in deterministic
- Transitions to orchestrated after 10+ successful snapshots
- Falls back to deterministic if orchestrated becomes unstable

### Decision Thresholds

**Configurable in code** (`src/lib/snapshot/modeSelection.ts`):
```typescript
const AUTO_MODE_CONFIG = {
  maxFallbackRate: 0.2,    // 20%
  minEvents: 10,            // Need 10+ events
  requiresOpenAI: true,
};
```

**Tuning Guidance**:
- `maxFallbackRate`: Lower = more conservative (switch to deterministic sooner)
- `minEvents`: Higher = more data required before using orchestrated
- Keep conservative for production

## Cost Analysis

### Per-Snapshot Cost

| Mode | Cost | Time | Notes |
|------|------|------|-------|
| Deterministic | $0 | ~500ms | No external API |
| Orchestrated | ~$0.01 | ~3-5s | OpenAI gpt-4o call |

### Monthly Cost Estimate

**Assumptions**:
- 100 active users
- 4 snapshots per user per month (weekly + ad-hoc)
- 80% orchestrated mode usage

**Calculation**:
```
Monthly snapshots = 100 users × 4 snapshots = 400 snapshots
Orchestrated snapshots = 400 × 0.8 = 320 snapshots
Monthly cost = 320 × $0.01 = $3.20
```

**At scale** (1,000 users):
```
Monthly snapshots = 1,000 users × 4 snapshots = 4,000 snapshots
Orchestrated snapshots = 4,000 × 0.8 = 3,200 snapshots
Monthly cost = 3,200 × $0.01 = $32.00
```

## Best Practices

### Do's ✅

- Start with deterministic in production
- Test orchestrated thoroughly in staging
- Monitor fallback rate closely
- Use auto mode for self-regulation
- Track costs monthly
- Keep OpenAI API key secure (never commit)
- Log telemetry for debugging

### Don'ts ❌

- Don't enable orchestrated without testing
- Don't ignore high fallback rates
- Don't expose mode to users (internal only)
- Don't disable fallback mechanism
- Don't skip monitoring during rollout

## FAQ

**Q: Can I switch modes without restart?**
A: Yes, environment variable changes take effect on next serverless invocation (usually immediate in practice).

**Q: What happens if OpenAI API goes down?**
A: Automatic fallback to deterministic. Snapshots continue to work.

**Q: How long does auto mode take to enable orchestrated?**
A: After 10 successful snapshots (could be minutes or days depending on usage).

**Q: Can I force deterministic for specific users?**
A: Not currently. Mode is global. Could add user-level override if needed.

**Q: Do I need MCP server for deterministic mode?**
A: No. Deterministic mode works standalone. MCP server only used in orchestrated mode.

**Q: What's the recommended production mode?**
A: Start with `deterministic`, test `orchestrated`, then enable `auto` for self-regulating production.

---

**Last Updated**: January 10, 2026  
**Version**: 0.1.0  
**Status**: Production Ready
