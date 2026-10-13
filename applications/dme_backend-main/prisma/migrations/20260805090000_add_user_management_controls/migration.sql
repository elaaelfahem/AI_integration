ALTER TABLE "users"
ADD COLUMN "password_reset_required" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "password_reset_required_at" TIMESTAMPTZ,
ADD COLUMN "password_reset_required_by_id" UUID;

CREATE INDEX "idx_users_password_reset_required" ON "users"("password_reset_required");
