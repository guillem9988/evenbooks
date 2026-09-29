-- Add extractor configuration and API keys to organizations
ALTER TABLE "organizations"
  ADD COLUMN "extractor_mode" VARCHAR(20),
  ADD COLUMN "openai_api_key" TEXT,
  ADD COLUMN "document_ai_project_id" VARCHAR(100),
  ADD COLUMN "document_ai_processor_id" VARCHAR(100),
  ADD COLUMN "document_ai_location" VARCHAR(50),
  ADD COLUMN "document_ai_credentials_json" TEXT;
