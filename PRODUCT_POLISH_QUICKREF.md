# Product Polish Quick Reference

## Part A: Connector Landing Pages

### Routes
- `/connectors/jobber`
- `/connectors/servicetitan`
- `/connectors/quickbooks`
- `/connectors/square`
- `/connectors/joist`
- `/connectors/housecall-pro`

### Files
- **Page**: `src/app/connectors/[tool]/page.tsx`
- **Copy**: `src/config/connector-copy.ts`

### CTAs
- Primary: "Get a free 2nd Look" → `/dashboard/connect`
- Secondary: "Go to dashboard" → `/dashboard`

## Part B: Snapshot Modes

### Environment Variable
```bash
SNAPSHOT_MODE=deterministic|orchestrated|auto
```

### Modes

**deterministic** (default):
- Rule-based only
- ~500ms, $0 cost
- No OpenAI needed

**orchestrated**:
- AI-powered with fallback
- ~3-5s, ~$0.01 cost
- Requires OPENAI_API_KEY

**auto** (smart):
- Self-regulating
- Uses orchestrated when stable (< 20% fallback rate)
- Requires OPENAI_API_KEY

### Files
- **Mode Selection**: `src/lib/snapshot/modeSelection.ts`
- **Telemetry**: `src/lib/telemetry/snapshotLog.ts`
- **API Route**: `src/app/api/snapshot/route.ts`
- **Docs**: `docs/SNAPSHOT_MODE_ROLLOUT.md`

### Telemetry

**Logs** (JSON lines in stdout):
```json
{
  "_type": "snapshot_telemetry",
  "mode_attempted": "orchestrated",
  "mode_used": "deterministic",
  "fallback_used": true,
  "error_code": "E_OPENAI",
  "duration_ms": 1234
}
```

**Error Codes**:
- `E_OPENAI` - OpenAI API issues
- `E_SCHEMA` - Schema validation failures
- `E_MCP` - MCP server issues
- `E_UNKNOWN` - Other errors

### Monitoring

**Fallback rate**:
```bash
grep snapshot_telemetry logs | \
  jq -r '.fallback_used' | \
  awk '{sum+=$1; n++} END {print sum/n*100 "%"}'
```

**Auto mode decisions**:
```bash
grep "Auto Mode" logs
```

### Rollout Sequence

1. **Week 1**: `deterministic` (baseline)
2. **Week 2-3**: `orchestrated` in staging (testing)
3. **Week 4**: `orchestrated` for 10-20% users (trial)
4. **Week 5+**: `auto` (production)

### Quick Commands

**Test landing pages**:
```bash
npm run dev
# Visit http://localhost:3000/connectors/jobber
```

**Test deterministic mode**:
```bash
SNAPSHOT_MODE=deterministic npm run dev
```

**Test orchestrated mode**:
```bash
SNAPSHOT_MODE=orchestrated OPENAI_API_KEY=sk-proj-... npm run dev
```

**Test auto mode**:
```bash
SNAPSHOT_MODE=auto OPENAI_API_KEY=sk-proj-... npm run dev
```

**View telemetry**:
```bash
npm run dev 2>&1 | grep snapshot_telemetry
```

## Key Principles

### Copy Guidelines (Landing Pages)
✅ Tool-specific recognition language  
✅ Quiet Founder tone (calm, no hype)  
✅ No AI/LLM/agent mentions  
✅ Problem/solution clarity  

### Rollout Guidelines (Snapshot Modes)
✅ Start deterministic (safe default)  
✅ Test orchestrated thoroughly  
✅ Monitor fallback rate (target < 20%)  
✅ Use auto mode for self-regulation  
✅ Always have fallback mechanism  

## Troubleshooting

### Landing Pages

**Issue**: Page not rendering  
**Check**: Verify route at `/connectors/[tool]/page.tsx`

**Issue**: Wrong copy showing  
**Check**: Verify tool name matches key in `connectorLandingCopy`

**Issue**: CTA not working  
**Check**: Verify `/dashboard/connect` route exists

### Snapshot Modes

**Issue**: Always using deterministic (in auto mode)  
**Check**: 
1. OpenAI key set? `echo $OPENAI_API_KEY`
2. Enough data? Need 10+ snapshots
3. Fallback rate? Check logs

**Issue**: High fallback rate (> 30%)  
**Check**: Error codes in telemetry logs  
**Action**: Switch to deterministic, investigate errors

**Issue**: Costs too high  
**Check**: Count orchestrated snapshots in logs  
**Action**: Reduce snapshot frequency or use deterministic

## Documentation

- **Landing Pages**: Implemented, no docs needed
- **Snapshot Modes**: `docs/SNAPSHOT_MODE_ROLLOUT.md`
- **Full Summary**: `PRODUCT_POLISH_SUMMARY.md`

---

**Quick Start**: Deploy with `SNAPSHOT_MODE=deterministic`, test landing pages, monitor baseline metrics.
