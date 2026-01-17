-- Payment support for 2ndlook v0.1
-- Signal-only: no customer names, addresses, line items, notes, taxes, discounts

CREATE TABLE IF NOT EXISTS payments_normalized (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id TEXT NOT NULL,
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  payment_date TIMESTAMPTZ NOT NULL,
  payment_total NUMERIC(10, 2) NOT NULL,
  payment_type TEXT NOT NULL,
  invoice_id TEXT,
  client_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_normalized_source_id ON payments_normalized(source_id);
CREATE INDEX IF NOT EXISTS idx_payments_normalized_invoice_id ON payments_normalized(invoice_id);

ALTER TABLE payments_normalized ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own payments"
  ON payments_normalized
  FOR SELECT
  USING (
    source_id IN (
      SELECT id FROM sources WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own payments"
  ON payments_normalized
  FOR INSERT
  WITH CHECK (
    source_id IN (
      SELECT id FROM sources WHERE user_id = auth.uid()
    )
  );
