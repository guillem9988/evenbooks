-- Product catalog and credit notes (rectificatives) linked to one issued invoice.

CREATE TABLE "catalog_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "unit_amount_cents" BIGINT NOT NULL,
    "tax_rate" "tax_rate_type" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalog_items_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "issued_invoices" ADD COLUMN "rectifies_issued_invoice_id" UUID;

CREATE UNIQUE INDEX "issued_invoices_rectifies_issued_invoice_id_key" ON "issued_invoices"("rectifies_issued_invoice_id");
CREATE INDEX "idx_catalog_items_org" ON "catalog_items"("organization_id");

ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "issued_invoices" ADD CONSTRAINT "issued_invoices_rectifies_issued_invoice_id_fkey" FOREIGN KEY ("rectifies_issued_invoice_id") REFERENCES "issued_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
