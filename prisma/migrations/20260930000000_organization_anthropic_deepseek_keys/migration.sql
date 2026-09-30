-- Add Anthropic and DeepSeek API keys to organizations
ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "anthropic_api_key" TEXT,
  ADD COLUMN IF NOT EXISTS "deepseek_api_key" TEXT;
