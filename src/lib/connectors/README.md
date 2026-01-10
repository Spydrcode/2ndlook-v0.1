# Universal Connector System

Internal contract layer for normalizing data from multiple sources (tools, APIs, files) into canonical shapes for 2ndlook v0.1.

## Overview

The Universal Connector system provides:
- **Canonical types** for estimates, calendar signals, and CRM signals
- **Unified interface** that all connectors must implement
- **Registry pattern** for discovering and accessing connectors
- **Type safety** throughout the data pipeline

## Architecture

```
/src/lib/connectors/
├── types.ts              # Canonical data shapes
├── connector.ts          # Interface + registry
├── index.ts              # Registry initialization & exports
├── sanity-check.ts       # Runtime validation
└── estimates/
    ├── fileConnector.ts      # ✅ Implemented (v0.1)
    ├── servicetitan.ts       # ⏳ Stub (future)
    ├── jobber.ts             # ⏳ Stub (future)
    ├── quickbooks.ts         # ⏳ Stub (future)
    ├── square.ts             # ⏳ Stub (future)
    ├── joist.ts              # ⏳ Stub (future)
    └── housecallpro.ts       # ⏳ Stub (future)
```

## Canonical Types

### EstimateCanonicalRow
All estimate connectors normalize to this shape:
```typescript
{
  estimate_id: string;      // Unique identifier
  created_at: string;       // ISO 8601 timestamp
  closed_at: string;        // ISO 8601 timestamp
  amount: number;           // Dollar amount
  status: "closed" | "accepted";
  job_type?: string | null; // Optional category
}
```

### CalendarSignals (v0.2+)
Aggregated busy/free patterns (no individual events):
```typescript
{
  window_start: string;     // ISO 8601
  window_end: string;       // ISO 8601
  busy_blocks_by_week: Array<{ week: string; blocks: number }>;
  confidence: "low" | "medium" | "high";
}
```

### CrmSignals (v0.2+)
Aggregated follow-up patterns (no individual contacts):
```typescript
{
  window_start: string;     // ISO 8601
  window_end: string;       // ISO 8601
  followups_by_latency_band: Array<{ band: "0-2" | "3-7" | "8-21" | "22+"; count: number }>;
  confidence: "low" | "medium" | "high";
}
```

## Usage

### Listing Connectors
```typescript
import { listConnectors, listConnectorsByCategory } from "@/lib/connectors";

// Get all connectors
const all = listConnectors();

// Get connectors by category
const estimateConnectors = listConnectorsByCategory("estimates");
```

### Getting a Specific Connector
```typescript
import { getConnector } from "@/lib/connectors";

const connector = getConnector("estimates", "file");
console.log(connector.getDisplayName()); // "File Upload"
console.log(connector.isImplemented);    // true
```

### Checking Implementation Status
```typescript
import { isConnectorImplemented } from "@/lib/connectors";

if (isConnectorImplemented("estimates", "servicetitan")) {
  // OAuth flow available
} else {
  // Show "Coming Soon"
}
```

### Using the File Connector
```typescript
import { getConnector } from "@/lib/connectors";

const fileConnector = getConnector("estimates", "file");
const file = /* ... File object from upload ... */;

try {
  const canonicalRows = await fileConnector.normalizeEstimatesFromFile!(file);
  // canonicalRows: EstimateCanonicalRow[]
  // Ready to pass to /api/ingest
} catch (error) {
  console.error("Normalization failed:", error);
}
```

### Handling Unimplemented Connectors
```typescript
import { getConnector, NotImplementedError } from "@/lib/connectors";

const stub = getConnector("estimates", "servicetitan");

try {
  await stub.fetchEstimates!();
} catch (error) {
  if (error instanceof NotImplementedError) {
    console.log("This connector is not yet implemented");
  }
}
```

## Implementation Status

| Connector       | Category   | Status         | Methods Available                |
|-----------------|------------|----------------|----------------------------------|
| File Upload     | estimates  | ✅ Implemented | `normalizeEstimatesFromFile`     |
| ServiceTitan    | estimates  | ⏳ Stub        | None (throws NotImplementedError)|
| Jobber          | estimates  | ⏳ Stub        | None (throws NotImplementedError)|
| QuickBooks      | estimates  | ⏳ Stub        | None (throws NotImplementedError)|
| Square          | estimates  | ⏳ Stub        | None (throws NotImplementedError)|
| Joist           | estimates  | ⏳ Stub        | None (throws NotImplementedError)|
| Housecall Pro   | estimates  | ⏳ Stub        | None (throws NotImplementedError)|

## Testing

Run the sanity check to validate the registry:
```bash
npx ts-node src/lib/connectors/sanity-check.ts
```

Expected output:
```
🔍 Running connector registry sanity checks...

✅ Total connectors registered: 7

📋 Validating connector properties:
  ✓ File Upload (estimates:file) - implemented
  ✓ ServiceTitan (estimates:servicetitan) - stub
  ...

✅ All sanity checks passed!
```

## Adding a New Connector

1. Create the connector class in the appropriate category folder
2. Implement the `UniversalConnector` interface
3. Register it in `index.ts`
4. Run sanity checks to verify

Example:
```typescript
// src/lib/connectors/estimates/mynewconnector.ts
import type { UniversalConnector } from "../connector";
import type { EstimateCanonicalRow } from "../types";
import { NotImplementedError } from "../connector";

export class MyNewConnector implements UniversalConnector {
  category = "estimates" as const;
  tool = "mynewconnector" as const;
  isImplemented = false;

  getDisplayName(): string {
    return "My New Connector";
  }

  async fetchEstimates(): Promise<EstimateCanonicalRow[]> {
    throw new NotImplementedError(this.tool, "fetchEstimates");
  }
}
```

Then register in `index.ts`:
```typescript
import { MyNewConnector } from "./estimates/mynewconnector";
registerConnector(new MyNewConnector());
```

## Design Principles

1. **Canonical, not raw**: Connectors must output normalized shapes, never raw API responses
2. **Aggregated, not detailed**: Calendar/CRM connectors provide patterns, not individual records
3. **Typed, not loose**: All data shapes are strictly typed
4. **Future-proof**: Interface supports both file and API methods
5. **Internal only**: This system is not exposed in UI (v0.1)

## Future Work (v0.2+)

- OAuth flows for estimate tool APIs
- Calendar connector implementations
- CRM connector implementations
- Webhook support for real-time updates
- Connector configuration UI
