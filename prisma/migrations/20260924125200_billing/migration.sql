-- Contacts, issued invoices, quotes, and expense categories.

CREATE TYPE "contact_role" AS ENUM ('CLIENT', 'SUPPLIER');
CREATE TYPE "expense_category" AS ENUM ('OFFICE', 'TRAVEL', 'SOFTWARE', 'MEALS', 'OTHER');
CREATE TYPE "issued_invoice_status" AS ENUM ('UNPAID', 'PAID');
CREATE TYPE "quote_status" AS ENUM ('OPEN', 'CONVERTED');

ALTER TABLE "invoices" ADD COLUMN "expense_category" "expense_category";

CREATE TABLE "contacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_name" VARCHAR(255) NOT NULL,
    "tax_id" VARCHAR(50) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "role" "contact_role" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "issued_invoices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "series_number" VARCHAR(100) NOT NULL,
    "invoice_date" DATE NOT NULL,
    "status" "issued_invoice_status" NOT NULL DEFAULT 'UNPAID',
    "base_amount_cents" BIGINT NOT NULL,
    "tax_amount_cents" BIGINT NOT NULL,
    "total_amount_cents" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "issued_invoices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "issued_invoice_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "issued_invoice_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_amount_cents" BIGINT NOT NULL,
    "tax_rate" "tax_rate_type" NOT NULL,
    "base_amount_cents" BIGINT NOT NULL,
    "tax_amount_cents" BIGINT NOT NULL,
    "total_amount_cents" BIGINT NOT NULL,

    CONSTRAINT "issued_invoice_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quotes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "series_number" VARCHAR(100) NOT NULL,
    "quote_date" DATE NOT NULL,
    "status" "quote_status" NOT NULL DEFAULT 'OPEN',
    "base_amount_cents" BIGINT NOT NULL,
    "tax_amount_cents" BIGINT NOT NULL,
    "total_amount_cents" BIGINT NOT NULL,
    "issued_invoice_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quote_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "quote_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_amount_cents" BIGINT NOT NULL,
    "tax_rate" "tax_rate_type" NOT NULL,
    "base_amount_cents" BIGINT NOT NULL,
    "tax_amount_cents" BIGINT NOT NULL,
    "total_amount_cents" BIGINT NOT NULL,

    CONSTRAINT "quote_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "issued_invoices_org_series_key" ON "issued_invoices"("organization_id", "series_number");
CREATE INDEX "idx_issued_invoices_org_date" ON "issued_invoices"("organization_id", "invoice_date");
CREATE UNIQUE INDEX "quotes_org_series_key" ON "quotes"("organization_id", "series_number");
CREATE UNIQUE INDEX "quotes_issued_invoice_id_key" ON "quotes"("issued_invoice_id");

ALTER TABLE "contacts" ADD CONSTRAINT "contacts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "issued_invoices" ADD CONSTRAINT "issued_invoices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "issued_invoices" ADD CONSTRAINT "issued_invoices_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "issued_invoice_lines" ADD CONSTRAINT "issued_invoice_lines_issued_invoice_id_fkey" FOREIGN KEY ("issued_invoice_id") REFERENCES "issued_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_issued_invoice_id_fkey" FOREIGN KEY ("issued_invoice_id") REFERENCES "issued_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
