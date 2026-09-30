-- Add Gemini API key and extractor model preference to organizations
ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "gemini_api_key" TEXT,
  ADD COLUMN IF NOT EXISTS "extractor_model" VARCHAR(50);
