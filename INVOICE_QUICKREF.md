# Invoice Integration Quick Reference

## File Locations

### Types
- [src/types/2ndlook.ts](src/types/2ndlook.ts) - InvoiceStatus, InvoiceNormalized, InvoiceBucket
- [src/lib/connectors/types.ts](src/lib/connectors/types.ts) - InvoiceCanonicalRow, InvoiceConnectorTool

### Connectors
- [src/lib/connectors/invoices/fileConnector.ts](src/lib/connectors/invoices/fileConnector.ts) - File upload (implemented)
- [src/lib/connectors/invoices/jobber.ts](src/lib/connectors/invoices/jobber.ts) - Jobber stub
- [src/lib/connectors/invoices/quickbooks.ts](src/lib/connectors/invoices/quickbooks.ts) - QuickBooks stub
- [src/lib/connectors/invoices/servicetitan.ts](src/lib/connectors/invoices/servicetitan.ts) - ServiceTitan stub
- [src/lib/connectors/invoices/square.ts](src/lib/connectors/invoices/square.ts) - Square stub

### API Routes
- [src/app/api/ingest-invoices/route.ts](src/app/api/ingest-invoices/route.ts) - Upload invoice CSV
- [src/app/api/bucket-invoices/route.ts](src/app/api/bucket-invoices/route.ts) - Bucket invoice data

### Orchestrator
- [src/lib/orchestrator/runSnapshot.ts](src/lib/orchestrator/runSnapshot.ts) - Passes invoice signals to agent
- [src/lib/orchestrator/deterministicSnapshot.ts](src/lib/orchestrator/deterministicSnapshot.ts) - Includes invoice signals in fallback

### MCP Server
- [mcp-server/index.ts](mcp-server/index.ts) - Returns invoice signals from get_bucketed_aggregates
- [mcp-server/types.ts](mcp-server/types.ts) - Updated SnapshotResult schema

### Database
- [supabase/migrations/20260111_invoice_support.sql](supabase/migrations/20260111_invoice_support.sql) - Tables and RLS policies

### Documentation
- [INVOICE_INTEGRATION_README.md](INVOICE_INTEGRATION_README.md) - Full integration guide

---

## Quick Start

### 1. Run Migration

```bash
# Apply invoice tables to your Supabase database
psql $DATABASE_URL < supabase/migrations/20260111_invoice_support.sql
```

### 2. Upload Invoice Data

```typescript
// Client-side or API call
const formData = new FormData();
formData.append("source_id", sourceId);
formData.append("file", invoiceFile);

await fetch("/api/ingest-invoices", {
  method: "POST",
  body: formData,
});
```

### 3. Bucket Invoice Data

```typescript
await fetch("/api/bucket-invoices", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ source_id: sourceId }),
});
```

### 4. Generate Snapshot

```typescript
// Snapshot will include invoiceSignals if available
await fetch("/api/snapshot", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ source_id: sourceId }),
});
```

---

## Invoice CSV Format

```csv
invoice_id,invoice_date,invoice_total,invoice_status,linked_estimate_id
INV-001,2026-01-01,1500.00,paid,EST-001
INV-002,2026-01-05,800.00,sent,EST-002
```

**Required**: invoice_id, invoice_date, invoice_total, invoice_status  
**Optional**: linked_estimate_id (for time-to-invoice analysis)

---

## Snapshot Schema Changes

### Before (Estimate-Only)

```typescript
{
  meta: {
    snapshot_id: "...",
    estimate_count: 50,
    confidence_level: "medium"
  },
  demand: { ... },
  decision_latency: { ... }
}
```

### After (With Invoices)

```typescript
{
  meta: {
    snapshot_id: "...",
    estimate_count: 50,
    invoice_count: 30,  // NEW
    confidence_level: "medium"
  },
  demand: { ... },
  decision_latency: { ... },
  invoiceSignals: {  // NEW (optional)
    price_distribution: [{ band: "<500", count: 10 }, ...],
    time_to_invoice: [{ band: "0-7d", count: 15 }, ...],
    status_distribution: [{ status: "paid", count: 20 }, ...],
    weekly_volume: [{ week: "2026-W01", count: 8 }, ...]
  }
}
```

---

## Agent Input Changes

### Before

```typescript
{
  source_id: "...",
  demand: { ... },
  decision_latency: { ... },
  estimate_count: 50,
  confidence_level: "medium"
}
```

### After (With Invoices)

```typescript
{
  source_id: "...",
  demand: { ... },
  decision_latency: { ... },
  estimate_count: 50,
  confidence_level: "medium",
  invoiceSignals: {  // NEW (optional)
    invoice_count: 30,
    price_distribution: [...],
    time_to_invoice: [...],
    status_distribution: [...],
    weekly_volume: [...]
  }
}
```

---

## Testing Checklist

- [ ] Migration applied to database
- [ ] Invoice CSV uploads successfully
- [ ] Invoice bucketing completes
- [ ] Snapshot includes invoiceSignals
- [ ] Estimate-only mode still works (no invoices)
- [ ] MCP server returns invoice signals
- [ ] Agent receives invoice signals in input

---

## Key Rules

✅ **DO**:
- Use invoice data for pattern analysis (price, timing, status)
- Fail gracefully if invoices unavailable
- Apply 90-day / 100-invoice limits
- Link invoices to estimates via linked_estimate_id

❌ **DON'T**:
- Expose raw invoice records to agents
- Require invoices for analysis
- Add payment, bank, expense logic
- Store customer names, addresses, line items

---

## Troubleshooting

### No invoice signals in snapshot?

1. Check if invoices were ingested: `SELECT COUNT(*) FROM invoices_normalized WHERE source_id = '...'`
2. Check if invoices were bucketed: `SELECT * FROM invoice_buckets WHERE source_id = '...'`
3. Check orchestrator logs for "Invoice signals available" or "Estimate-only mode"

### Invoice ingest fails?

- Verify CSV headers match required format
- Check invoice_status is valid (draft, sent, void, paid, unpaid, overdue)
- Ensure dates are ISO 8601 format

### Bucket-invoices returns "No invoices found"?

- Normal if source has no invoices
- Analysis will continue in estimate-only mode
- Check response message for confirmation

---

## Next Steps

1. Test with sample invoice data
2. Add vendor-specific connectors (Jobber, QuickBooks, etc.)
3. Update UI to show invoice-based insights
4. Add invoice upload flow to dashboard

---

## Reference

See [INVOICE_INTEGRATION_README.md](INVOICE_INTEGRATION_README.md) for complete documentation.
