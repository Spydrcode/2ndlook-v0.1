-- Expand estimate/invoice statuses and allow optional timestamps

-- Estimates: allow nullable closed_at, add updated_at, expand status enum
ALTER TABLE estimates_normalized
  ALTER COLUMN closed_at DROP NOT NULL;

ALTER TABLE estimates_normalized
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

DO $$
BEGIN
  ALTER TABLE estimates_normalized DROP CONSTRAINT IF EXISTS estimates_normalized_status_check;
  ALTER TABLE estimates_normalized ADD CONSTRAINT estimates_normalized_status_check
    CHECK (status IN ('draft', 'sent', 'accepted', 'declined', 'expired', 'cancelled', 'converted', 'unknown'));
END $$;

-- Invoices: expand status enum
DO $$
BEGIN
  ALTER TABLE invoices_normalized DROP CONSTRAINT IF EXISTS invoices_normalized_invoice_status_check;
  ALTER TABLE invoices_normalized ADD CONSTRAINT invoices_normalized_invoice_status_check
    CHECK (invoice_status IN ('draft', 'sent', 'void', 'paid', 'unpaid', 'overdue', 'refunded', 'partial', 'unknown'));
END $$;

-- Invoice buckets: add new status counters
ALTER TABLE invoice_buckets
  ADD COLUMN IF NOT EXISTS status_refunded INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status_partial INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status_unknown INTEGER DEFAULT 0;
