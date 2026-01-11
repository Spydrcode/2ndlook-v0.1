# Invoice Connector Integration - 2ndlook v0.1

## Overview

2ndlook v0.1 now supports **invoice-based data connectors** for pattern analysis alongside estimates. This is a **signal-only integration** - no accounting, payments, CRM dependency, or raw invoice records exposed to agents.

## Core Principles

✅ **Signal-Only**: Aggregated invoice patterns (price bands, timing, status)  
✅ **Optional**: Estimate-only analysis continues to work when invoices are missing  
✅ **Graceful Degradation**: Missing invoice data logged as "estimate-only mode"  
✅ **Early Bucketing**: Invoice data bucketed before agent calls  
✅ **Tool-Agnostic**: Vendor adapters normalize to canonical schema  
✅ **Safety Limits**: Last 90 days OR max 100 invoices  

❌ **Not Included**: Customer names, addresses, line items, notes, taxes, discounts, payments  
❌ **Not Required**: CRM data  

---

## Invoice Connector Interface

### Canonical Schema

All invoice connectors normalize to this shape:

```typescript
interface InvoiceCanonicalRow {
  invoice_id: string;           // Opaque identifier
  invoice_date: string;          // ISO 8601
  invoice_total: number;         // Dollar amount
  invoice_status: "draft" | "sent" | "void" | "paid" | "unpaid" | "overdue";
  linked_estimate_id?: string;   // Optional link to estimate
}
```

### Supported Vendors

- **File Upload** (implemented)
- Jobber (stub)
- QuickBooks (stub)
- ServiceTitan (stub)
- Square (stub)

All vendor connectors map to the same canonical schema.

---

## Early Bucketing & Signal Extraction

Before any agent calls, invoice data is bucketed into:

### 1. Invoice Totals by Price Band
Uses same bands as estimates:
- `<500`
- `500-1500`
- `1500-5000`
- `5000+`

### 2. Time-to-Invoice Buckets
(For linked invoices only - estimate_date → invoice_date):
- `0-7d`
- `8-14d`
- `15-30d`
- `31+d`

### 3. Invoice Status Distribution
- `draft`
- `sent`
- `void`
- `paid`
- `unpaid`
- `overdue`

### 4. Invoice Volume Over Time
Weekly aggregates (ISO week format)

**IMPORTANT**: Only aggregated buckets are passed to agents. Agents never see raw invoice records.

---

## Integration with Analysis Flow

### Snapshot Schema Extension

```typescript
interface SnapshotResult {
  meta: {
    snapshot_id: string;
    source_id: string;
    generated_at: string;
    estimate_count: number;
    confidence_level: ConfidenceLevel;
    invoice_count?: number;  // Optional: present when invoices available
  };
  demand: { ... };
  decision_latency: { ... };
  invoiceSignals?: {  // Optional
    price_distribution: { band: string; count: number }[];
    time_to_invoice: { band: string; count: number }[];
    status_distribution: { status: string; count: number }[];
    weekly_volume: { week: string; count: number }[];
  };
}
```

### Agent Reasoning

When invoices are present, agents can reason about:
- **Estimated value vs invoiced value** (price band comparison)
- **Conversion timing friction** (time-to-invoice distribution)
- **Drop-off between estimate and commitment** (status patterns)

### Estimate-Only Fallback

If invoices are unavailable:
- Analysis continues normally with estimates only
- `invoiceSignals` field is omitted from snapshot
- Logged as "estimate-only mode"

---

## API Routes

### POST /api/ingest-invoices

Upload invoice CSV file.

**Request**:
```typescript
{
  source_id: string;
  file: File;  // CSV with headers: invoice_id, invoice_date, invoice_total, invoice_status, linked_estimate_id (optional)
}
```

**Response**:
```typescript
{
  received: number;
  kept: number;
  rejected: number;
  source_id: string;
}
```

**Safety Limits**:
- Last 90 days OR max 100 invoices
- Invalid statuses rejected
- Graceful error handling

### POST /api/bucket-invoices

Bucket normalized invoices into aggregates.

**Request**:
```typescript
{
  source_id: string;
}
```

**Response**:
```typescript
{
  source_id: string;
  bucketed: boolean;
  message?: string;  // e.g., "No invoices found - estimate-only mode"
}
```

**Behavior**:
- Fails gracefully if no invoices found
- Logs absence as "estimate-only mode"
- Does not block subsequent snapshot generation

---

## Database Schema

### invoices_normalized

Stores normalized invoice records (raw data, not exposed to agents).

```sql
CREATE TABLE invoices_normalized (
  id UUID PRIMARY KEY,
  invoice_id TEXT NOT NULL,
  source_id UUID REFERENCES sources(id),
  invoice_date TIMESTAMPTZ NOT NULL,
  invoice_total NUMERIC(10, 2) NOT NULL,
  invoice_status TEXT NOT NULL,
  linked_estimate_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### invoice_buckets

Stores aggregated invoice signals (passed to agents).

```sql
CREATE TABLE invoice_buckets (
  id UUID PRIMARY KEY,
  source_id UUID UNIQUE REFERENCES sources(id),
  price_band_lt_500 INTEGER,
  price_band_500_1500 INTEGER,
  price_band_1500_5000 INTEGER,
  price_band_5000_plus INTEGER,
  time_to_invoice_0_7 INTEGER,
  time_to_invoice_8_14 INTEGER,
  time_to_invoice_15_30 INTEGER,
  time_to_invoice_31_plus INTEGER,
  status_draft INTEGER,
  status_sent INTEGER,
  status_void INTEGER,
  status_paid INTEGER,
  status_unpaid INTEGER,
  status_overdue INTEGER,
  weekly_volume JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## Usage Example

### 1. Upload Estimates

```bash
curl -X POST https://your-app.com/api/ingest \
  -F "source_id=uuid" \
  -F "file=@estimates.csv"
```

### 2. Bucket Estimates

```bash
curl -X POST https://your-app.com/api/bucket \
  -H "Content-Type: application/json" \
  -d '{"source_id":"uuid"}'
```

### 3. Upload Invoices (Optional)

```bash
curl -X POST https://your-app.com/api/ingest-invoices \
  -F "source_id=uuid" \
  -F "file=@invoices.csv"
```

### 4. Bucket Invoices (Optional)

```bash
curl -X POST https://your-app.com/api/bucket-invoices \
  -H "Content-Type: application/json" \
  -d '{"source_id":"uuid"}'
```

### 5. Generate Snapshot

```bash
curl -X POST https://your-app.com/api/snapshot \
  -H "Content-Type: application/json" \
  -d '{"source_id":"uuid"}'
```

**Result**: Snapshot includes `invoiceSignals` if invoices were provided, otherwise estimate-only.

---

## CSV Format

### Invoice File Format

```csv
invoice_id,invoice_date,invoice_total,invoice_status,linked_estimate_id
INV-001,2026-01-01,1500.00,paid,EST-001
INV-002,2026-01-05,800.00,sent,EST-002
INV-003,2026-01-10,3200.00,overdue,EST-003
```

**Required Headers**:
- `invoice_id`
- `invoice_date`
- `invoice_total`
- `invoice_status`

**Optional Headers**:
- `linked_estimate_id` (for time-to-invoice analysis)

**Valid Statuses**:
- `draft`, `sent`, `void`, `paid`, `unpaid`, `overdue`

---

## Connector Implementation

### File Connector (Implemented)

```typescript
import { FileInvoiceConnector } from "@/lib/connectors/invoices/fileConnector";

const connector = new FileInvoiceConnector();
const file = // ... File object from upload ...

const invoices = await connector.normalizeInvoicesFromFile(file);
// invoices: InvoiceCanonicalRow[]
```

### Vendor Stubs (Future)

Adapter pattern for OAuth-based vendors:

```typescript
// Future: Jobber adapter
const jobberConnector = getConnector("invoices", "jobber");
const invoices = await jobberConnector.fetchInvoices();
```

All vendor data normalizes to the same `InvoiceCanonicalRow` schema.

---

## Safety & Performance

### Data Limits
- **Last 90 days OR max 100 invoices** (whichever is smaller)
- Enforced during ingest
- Prevents payload bloat

### Graceful Degradation
- Missing invoice data does not block analysis
- Logged as "estimate-only mode"
- `invoiceSignals` omitted from snapshot

### Error Handling
- Invalid statuses rejected during ingest
- Malformed rows skipped with count in response
- Source ownership verified

---

## MCP Server Support

The MCP server automatically includes invoice signals when available:

```typescript
// MCP tool: get_bucketed_aggregates
{
  source_id: "uuid",
  estimate_count: 35,
  weekly_volume: [...],
  price_distribution: [...],
  latency_distribution: [...],
  invoiceSignals?: {  // Optional
    invoice_count: 20,
    price_distribution: [...],
    time_to_invoice: [...],
    status_distribution: [...],
    weekly_volume: [...]
  }
}
```

---

## Testing

### Test with Invoice Data

```typescript
import { runSnapshotOrchestrator } from "@/lib/orchestrator/runSnapshot";

// Assumes source has both estimates and invoices bucketed
const result = await runSnapshotOrchestrator({
  source_id: "your-source-id",
  user_id: "your-user-id",
});

console.log("Invoice signals included:", result.invoiceSignals);
```

### Test Estimate-Only Mode

```typescript
// Assumes source has estimates but NO invoices
const result = await runSnapshotOrchestrator({
  source_id: "your-source-id",
  user_id: "your-user-id",
});

console.log("Invoice signals:", result.invoiceSignals); // undefined
```

---

## Future Enhancements

- [ ] Stripe Invoicing connector
- [ ] Additional time-to-invoice bands
- [ ] Invoice conversion rate metrics
- [ ] Payment timing analysis (requires payment data - out of scope for v0.1)

---

## Summary

2ndlook v0.1 can now analyze **demand-to-commitment patterns** using estimates + invoices, without introducing CRM dependency or accounting complexity.

**Key Benefits**:
- ✅ Pattern analysis across estimate → invoice lifecycle
- ✅ Graceful degradation when invoices unavailable
- ✅ No raw invoice records exposed to agents
- ✅ Tool-agnostic vendor support
- ✅ Safe data limits and error handling
