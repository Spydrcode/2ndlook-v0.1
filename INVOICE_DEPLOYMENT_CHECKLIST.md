# Invoice Integration - Deployment Checklist

## Pre-Deployment

### 1. Database Migration

- [ ] Review migration: [supabase/migrations/20260111_invoice_support.sql](supabase/migrations/20260111_invoice_support.sql)
- [ ] Apply to development database
- [ ] Verify tables created: `invoices_normalized`, `invoice_buckets`
- [ ] Verify indexes created
- [ ] Verify RLS policies applied

```bash
# Apply migration
psql $DATABASE_URL < supabase/migrations/20260111_invoice_support.sql

# Verify tables
psql $DATABASE_URL -c "\dt invoices_*"

# Test RLS
psql $DATABASE_URL -c "SELECT * FROM invoices_normalized LIMIT 1;"
```

### 2. Code Review

- [ ] Review type definitions in [src/types/2ndlook.ts](src/types/2ndlook.ts)
- [ ] Review connector interface in [src/lib/connectors/types.ts](src/lib/connectors/types.ts)
- [ ] Review API routes: ingest-invoices, bucket-invoices
- [ ] Review orchestrator changes in [src/lib/orchestrator/runSnapshot.ts](src/lib/orchestrator/runSnapshot.ts)
- [ ] Review MCP server updates in [mcp-server/index.ts](mcp-server/index.ts)
- [ ] Verify no TypeScript errors

```bash
# Check for TypeScript errors
npm run type-check

# Or with tsc directly
npx tsc --noEmit
```

### 3. Local Testing

#### Test Estimate-Only Mode (Baseline)

- [ ] Upload [src/demo-data/estimates-demo.csv](src/demo-data/estimates-demo.csv)
- [ ] Bucket estimates
- [ ] Generate snapshot
- [ ] Verify no `invoiceSignals` in result
- [ ] Verify logs show "Estimate-only mode"

#### Test Estimate + Invoice Mode

- [ ] Upload [src/demo-data/estimates-demo.csv](src/demo-data/estimates-demo.csv)
- [ ] Bucket estimates
- [ ] Upload [src/demo-data/invoices-demo.csv](src/demo-data/invoices-demo.csv)
- [ ] Bucket invoices
- [ ] Generate snapshot
- [ ] Verify `invoiceSignals` present in result
- [ ] Verify `invoice_count` in meta
- [ ] Verify logs show "Invoice signals available"

#### Test Error Handling

- [ ] Upload invoice CSV with invalid status → verify rejection
- [ ] Upload invoice CSV with missing headers → verify error message
- [ ] Call bucket-invoices with no invoices → verify "estimate-only mode" message
- [ ] Call bucket-invoices before ingest → verify graceful failure

### 4. Integration Testing

#### MCP Server

- [ ] Start MCP server: `cd mcp-server && npm start`
- [ ] Test `get_bucketed_aggregates` with source that has invoices
- [ ] Verify invoice signals in response
- [ ] Test `get_bucketed_aggregates` with source that has NO invoices
- [ ] Verify no invoice signals in response

#### Orchestrator

- [ ] Run orchestrator with invoice data
- [ ] Verify agent input includes `invoiceSignals`
- [ ] Verify snapshot result includes `invoiceSignals`
- [ ] Run orchestrator with estimate-only data
- [ ] Verify snapshot result omits `invoiceSignals`

---

## Deployment

### 1. Environment Variables

No new environment variables required. Existing setup continues to work.

### 2. Database Migration

```bash
# Production migration
psql $PRODUCTION_DATABASE_URL < supabase/migrations/20260111_invoice_support.sql
```

### 3. Code Deployment

- [ ] Merge feature branch to main
- [ ] Deploy to staging environment
- [ ] Run smoke tests on staging
- [ ] Deploy to production

---

## Post-Deployment

### 1. Smoke Tests

#### API Endpoints

```bash
# Test ingest-invoices endpoint
curl -X POST https://your-app.com/api/ingest-invoices \
  -H "Authorization: Bearer $TOKEN" \
  -F "source_id=$SOURCE_ID" \
  -F "file=@invoices-demo.csv"

# Expected: { received: 25, kept: 25, rejected: 0, source_id: "..." }

# Test bucket-invoices endpoint
curl -X POST https://your-app.com/api/bucket-invoices \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"source_id\":\"$SOURCE_ID\"}"

# Expected: { source_id: "...", bucketed: true }
```

#### Snapshot Generation

```bash
# Generate snapshot with invoices
curl -X POST https://your-app.com/api/snapshot \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"source_id\":\"$SOURCE_ID\"}"

# Verify response includes invoiceSignals
```

### 2. Database Verification

```sql
-- Check invoice tables exist
SELECT COUNT(*) FROM invoices_normalized;
SELECT COUNT(*) FROM invoice_buckets;

-- Verify data integrity
SELECT 
  source_id,
  COUNT(*) as invoice_count,
  MIN(invoice_date) as earliest,
  MAX(invoice_date) as latest
FROM invoices_normalized
GROUP BY source_id;

-- Check bucket aggregates
SELECT 
  source_id,
  price_band_lt_500 + price_band_500_1500 + 
    price_band_1500_5000 + price_band_5000_plus as total_invoices
FROM invoice_buckets;
```

### 3. Monitoring

#### Application Logs

Monitor for:
- `[Invoice Bucket] No invoices found` - Expected for estimate-only sources
- `[Orchestrator] Invoice signals available` - Confirms invoice data present
- `[Orchestrator] Estimate-only mode` - Confirms graceful degradation

#### Error Tracking

Watch for:
- Failed invoice ingests (invalid status, malformed CSV)
- Bucketing failures
- MCP server errors fetching invoice buckets

#### Performance

Monitor:
- Invoice ingest latency (should be <2s for 100 invoices)
- Invoice bucketing latency (should be <1s)
- Snapshot generation with invoices (should be similar to estimate-only)

---

## Rollback Plan

### If Issues Arise

1. **Disable invoice routes** (fastest):
   - Remove or disable `/api/ingest-invoices` and `/api/bucket-invoices` routes
   - System reverts to estimate-only mode
   - No data loss

2. **Revert code changes**:
   ```bash
   git revert <commit-hash>
   git push origin main
   ```

3. **Database rollback** (if necessary):
   ```sql
   DROP TABLE IF EXISTS invoice_buckets CASCADE;
   DROP TABLE IF EXISTS invoices_normalized CASCADE;
   ```

---

## Success Criteria

- [ ] Database migration applied successfully
- [ ] All TypeScript errors resolved
- [ ] Local tests pass (estimate-only and estimate+invoice modes)
- [ ] Smoke tests pass on staging
- [ ] Smoke tests pass on production
- [ ] No increase in error rate
- [ ] Snapshot generation latency unchanged
- [ ] Graceful degradation works (estimate-only mode)

---

## Documentation Links

- **Full Integration Guide**: [INVOICE_INTEGRATION_README.md](INVOICE_INTEGRATION_README.md)
- **Quick Reference**: [INVOICE_QUICKREF.md](INVOICE_QUICKREF.md)
- **Implementation Summary**: [INVOICE_IMPLEMENTATION_SUMMARY.md](INVOICE_IMPLEMENTATION_SUMMARY.md)

---

## Support

### Common Issues

**Issue**: Invoice ingest returns "Invalid invoice_status"
- **Solution**: Check CSV for valid statuses: draft, sent, void, paid, unpaid, overdue

**Issue**: Snapshot does not include invoiceSignals
- **Solution**: Verify invoices were bucketed. Check `invoice_buckets` table.

**Issue**: "No buckets found for source"
- **Solution**: Run `/api/bucket-invoices` before generating snapshot

**Issue**: MCP server error fetching invoice buckets
- **Solution**: Verify RLS policies allow service role to read invoice_buckets

---

## Contact

For questions or issues, contact the 2ndlook engineering team.
