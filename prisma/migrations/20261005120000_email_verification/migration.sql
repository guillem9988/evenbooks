-- Email verification for password sign-ups
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "email_verified_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "email_verification_token_hash" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "email_verification_expires_at" TIMESTAMPTZ(6);

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_verification_token_hash_key" ON "users"("email_verification_token_hash");

-- Accounts that existed before verification was introduced keep working as before.
UPDATE "users" SET "email_verified_at" = "created_at" WHERE "email_verified_at" IS NULL;
