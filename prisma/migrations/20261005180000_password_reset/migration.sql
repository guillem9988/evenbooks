-- Password reset tokens (stored hashed)
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "password_reset_token_hash" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "password_reset_expires_at" TIMESTAMPTZ(6);

CREATE UNIQUE INDEX IF NOT EXISTS "users_password_reset_token_hash_key" ON "users"("password_reset_token_hash");
