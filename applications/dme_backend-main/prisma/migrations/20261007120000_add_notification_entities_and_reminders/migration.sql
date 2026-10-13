-- AlterTable
ALTER TABLE "assignments" ADD COLUMN     "reminder_enabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "entity_id" UUID,
ADD COLUMN     "entity_type" VARCHAR(30);

-- AlterTable
ALTER TABLE "prospecting_meetings" ADD COLUMN     "reminder_enabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "scheduled_notification_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" VARCHAR(40) NOT NULL,
    "entity_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "occurrence" VARCHAR(60) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduled_notification_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scheduled_notification_log_created_at_idx" ON "scheduled_notification_log"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_notification_log_kind_entity_id_account_id_occurr_key" ON "scheduled_notification_log"("kind", "entity_id", "account_id", "occurrence");

