CREATE TYPE "MeetingStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

CREATE TABLE "prospecting_meetings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "manager_id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "agenda" TEXT,
    "location" VARCHAR(255),
    "meeting_url" VARCHAR(2048),
    "scheduled_at" TIMESTAMPTZ NOT NULL,
    "duration_minutes" SMALLINT NOT NULL,
    "status" "MeetingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "outcome" TEXT,
    "completion_notes" TEXT,
    "cancellation_reason" TEXT,
    "completed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "prospecting_meetings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "prospecting_meetings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "prospecting_meetings_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "prospecting_meetings_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "prospecting_meetings_manager_id_scheduled_at_idx" ON "prospecting_meetings"("manager_id", "scheduled_at");
CREATE INDEX "prospecting_meetings_agent_id_scheduled_at_idx" ON "prospecting_meetings"("agent_id", "scheduled_at");
CREATE INDEX "prospecting_meetings_company_id_scheduled_at_idx" ON "prospecting_meetings"("company_id", "scheduled_at");
CREATE INDEX "prospecting_meetings_status_scheduled_at_idx" ON "prospecting_meetings"("status", "scheduled_at");
