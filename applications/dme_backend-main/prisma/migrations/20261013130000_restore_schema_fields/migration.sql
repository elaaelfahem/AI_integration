-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('SUCCESS', 'MFA_REQUIRED', 'FAILED', 'PASSWORD_CHANGED');

-- CreateEnum
CREATE TYPE "ClientCategory" AS ENUM ('BRONZE', 'SILVER', 'GOLD', 'DIAMOND');

-- AlterEnum
ALTER TYPE "UserStatus" ADD VALUE 'DELETED';

-- DropIndex
DROP INDEX "idx_users_password_reset_required";

-- AlterTable
ALTER TABLE "assignments" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "client_category" "ClientCategory",
ADD COLUMN     "delegation" VARCHAR(80),
ADD COLUMN     "governorate" VARCHAR(60),
ADD COLUMN     "mobile_lines" SMALLINT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "data_sources" ADD COLUMN     "description" TEXT,
ADD COLUMN     "logo_url" VARCHAR(500);

-- AlterTable
ALTER TABLE "prospecting_meetings" ADD COLUMN     "visit_type" "VisitType" NOT NULL DEFAULT 'FIRST_VISIT';

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "previous_refresh_token_hash" TEXT,
ADD COLUMN     "previous_token_expires_at" TIMESTAMPTZ;

-- CreateTable
CREATE TABLE "connection_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "account_id" UUID NOT NULL,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "status" "ConnectionStatus" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "connection_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_connection_events_account_id_created_at" ON "connection_events"("account_id", "created_at");

-- CreateIndex
CREATE INDEX "companies_governorate_idx" ON "companies"("governorate");

-- CreateIndex
CREATE INDEX "companies_client_category_idx" ON "companies"("client_category");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_previous_refresh_token_hash_key" ON "sessions"("previous_refresh_token_hash");

-- AddForeignKey
ALTER TABLE "connection_events" ADD CONSTRAINT "connection_events_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

