-- Allow nullable password_hash for OAuth users and add Google ID and avatar
ALTER TABLE "users"
  ALTER COLUMN "password_hash" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "google_id" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "avatar_url" VARCHAR(1024);

CREATE UNIQUE INDEX IF NOT EXISTS "users_google_id_key" ON "users"("google_id");
