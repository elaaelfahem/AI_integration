ALTER TABLE "accounts" ADD COLUMN "active_session_id" UUID;

ALTER TABLE "sessions" ADD COLUMN "ip_address" VARCHAR(45);

CREATE UNIQUE INDEX "accounts_active_session_id_key" ON "accounts"("active_session_id");

ALTER TABLE "accounts" ADD CONSTRAINT "accounts_active_session_id_fkey" FOREIGN KEY ("active_session_id") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
