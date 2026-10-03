-- Allow nullable invoice_id and add issued_invoice_id to reconciliation_matches
ALTER TABLE "reconciliation_matches" ALTER COLUMN "invoice_id" DROP NOT NULL;
ALTER TABLE "reconciliation_matches" ADD COLUMN IF NOT EXISTS "issued_invoice_id" UUID REFERENCES "issued_invoices"("id") ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS "reconciliation_matches_issued_invoice_id_key" ON "reconciliation_matches"("issued_invoice_id");
