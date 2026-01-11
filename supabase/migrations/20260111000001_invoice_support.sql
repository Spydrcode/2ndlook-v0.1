-- Invoice support for 2ndlook v0.1
-- Add tables for invoice data normalization and bucketing
-- Signal-only: no customer names, addresses, line items, notes, taxes, discounts, or payments

-- Normalized invoice records table
CREATE TABLE IF NOT EXISTS invoices_normalized (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id TEXT NOT NULL,
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  invoice_date TIMESTAMPTZ NOT NULL,
  invoice_total NUMERIC(10, 2) NOT NULL,
  invoice_status TEXT NOT NULL CHECK (invoice_status IN ('draft', 'sent', 'void', 'paid', 'unpaid', 'overdue')),
  linked_estimate_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_invoices_normalized_source_id ON invoices_normalized(source_id);
CREATE INDEX IF NOT EXISTS idx_invoices_normalized_linked_estimate ON invoices_normalized(linked_estimate_id);

-- Invoice buckets table (aggregated signals only)
CREATE TABLE IF NOT EXISTS invoice_buckets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL UNIQUE REFERENCES sources(id) ON DELETE CASCADE,
  
  -- Price bands (same as estimates)
  price_band_lt_500 INTEGER DEFAULT 0,
  price_band_500_1500 INTEGER DEFAULT 0,
  price_band_1500_5000 INTEGER DEFAULT 0,
  price_band_5000_plus INTEGER DEFAULT 0,
  
  -- Time from estimate to invoice (for linked invoices only)
  time_to_invoice_0_7 INTEGER DEFAULT 0,
  time_to_invoice_8_14 INTEGER DEFAULT 0,
  time_to_invoice_15_30 INTEGER DEFAULT 0,
  time_to_invoice_31_plus INTEGER DEFAULT 0,
  
  -- Status distribution
  status_draft INTEGER DEFAULT 0,
  status_sent INTEGER DEFAULT 0,
  status_void INTEGER DEFAULT 0,
  status_paid INTEGER DEFAULT 0,
  status_unpaid INTEGER DEFAULT 0,
  status_overdue INTEGER DEFAULT 0,
  
  -- Volume over time
  weekly_volume JSONB DEFAULT '[]'::jsonb,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_invoice_buckets_source_id ON invoice_buckets(source_id);

-- Enable Row Level Security
ALTER TABLE invoices_normalized ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_buckets ENABLE ROW LEVEL SECURITY;

-- RLS Policies for invoices_normalized
CREATE POLICY "Users can view their own invoices"
  ON invoices_normalized
  FOR SELECT
  USING (
    source_id IN (
      SELECT id FROM sources WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own invoices"
  ON invoices_normalized
  FOR INSERT
  WITH CHECK (
    source_id IN (
      SELECT id FROM sources WHERE user_id = auth.uid()
    )
  );

-- RLS Policies for invoice_buckets
CREATE POLICY "Users can view their own invoice buckets"
  ON invoice_buckets
  FOR SELECT
  USING (
    source_id IN (
      SELECT id FROM sources WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own invoice buckets"
  ON invoice_buckets
  FOR INSERT
  WITH CHECK (
    source_id IN (
      SELECT id FROM sources WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own invoice buckets"
  ON invoice_buckets
  FOR UPDATE
  USING (
    source_id IN (
      SELECT id FROM sources WHERE user_id = auth.uid()
    )
  );
