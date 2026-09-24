-- Enable pgcrypto and pg_trgm before objects that depend on them.
-- gen_random_uuid() is built into PostgreSQL 16; pgcrypto is still installed
-- so the database matches the project baseline. pg_trgm supplies gin_trgm_ops.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "invoice_status" AS ENUM ('UPLOADED', 'PROCESSING', 'PARSED', 'FAILED');

-- CreateEnum
CREATE TYPE "match_status" AS ENUM ('UNMATCHED', 'AUTO_MATCHED', 'MANUALLY_MATCHED', 'IGNORED');

-- CreateEnum
CREATE TYPE "tax_rate_type" AS ENUM ('GENERAL_21', 'REDUCED_10', 'SUPER_REDUCED_4', 'EXEMPT_0', 'UNKNOWN');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "legal_name" VARCHAR(255) NOT NULL,
    "tax_id" VARCHAR(50) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'EUR',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_statements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "source_bank" VARCHAR(100),
    "imported_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total_transactions" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "bank_statements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "statement_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "transaction_date" DATE NOT NULL,
    "value_date" DATE NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'EUR',
    "raw_description" TEXT NOT NULL,
    "normalized_merchant" VARCHAR(255),
    "match_status" "match_status" NOT NULL DEFAULT 'UNMATCHED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "storage_key" VARCHAR(500) NOT NULL,
    "original_filename" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "file_size_bytes" INTEGER NOT NULL,
    "status" "invoice_status" NOT NULL DEFAULT 'UPLOADED',
    "vendor_name" VARCHAR(255),
    "vendor_tax_id" VARCHAR(50),
    "invoice_number" VARCHAR(100),
    "invoice_date" DATE,
    "currency" VARCHAR(3) DEFAULT 'EUR',
    "base_amount_cents" BIGINT,
    "tax_amount_cents" BIGINT,
    "total_amount_cents" BIGINT,
    "tax_rate" "tax_rate_type" DEFAULT 'UNKNOWN',
    "is_simplified" BOOLEAN DEFAULT false,
    "ocr_raw_response" JSONB,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_matches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "confidence_score" DECIMAL(5,4) NOT NULL,
    "is_auto_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "matching_breakdown" JSONB NOT NULL,
    "confirmed_by_user_id" UUID,
    "confirmed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reconciliation_matches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_transactions_org_status" ON "bank_transactions"("organization_id", "match_status");

-- CreateIndex
CREATE INDEX "idx_transactions_amount" ON "bank_transactions"("amount_cents");

-- CreateIndex
CREATE INDEX "idx_transactions_date" ON "bank_transactions"("transaction_date");

-- CreateIndex
CREATE INDEX "idx_transactions_desc_trgm" ON "bank_transactions" USING GIN ("raw_description" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "idx_invoices_total_amount" ON "invoices"("total_amount_cents");

-- CreateIndex
CREATE INDEX "idx_invoices_date" ON "invoices"("invoice_date");

-- CreateIndex
CREATE INDEX "idx_invoices_vendor_trgm" ON "invoices" USING GIN ("vendor_name" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "reconciliation_matches_transaction_id_key" ON "reconciliation_matches"("transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "reconciliation_matches_invoice_id_key" ON "reconciliation_matches"("invoice_id");

-- AddForeignKey
ALTER TABLE "bank_statements" ADD CONSTRAINT "bank_statements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "bank_statements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_matches" ADD CONSTRAINT "reconciliation_matches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_matches" ADD CONSTRAINT "reconciliation_matches_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "bank_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_matches" ADD CONSTRAINT "reconciliation_matches_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
