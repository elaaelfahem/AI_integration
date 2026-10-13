-- Additive only: creates visit_reports / visit_report_attachments and their enums.
-- Applied via `prisma db execute` (not `db push`) to avoid diffing against
-- unrelated drift already present in the shared dev database.

CREATE TYPE "VisitReportStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'VALIDATED');
CREATE TYPE "VisitReportNeed" AS ENUM ('CONNECTIVITY', 'CLOUD', 'SECURITY', 'SD_WAN', 'OTHER');
CREATE TYPE "VisitReportSolution" AS ENUM ('ORANGE_BUSINESS_VPN', 'FLEXIBLE_ENGINE_CLOUD', 'ORANGE_CYBERDEFENSE', 'OTHER');
CREATE TYPE "VisitReportInterestLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
CREATE TYPE "VisitReportOutcome" AS ENUM ('INTERESTED', 'TO_FOLLOW_UP', 'NEGOTIATION', 'OPPORTUNITY_WON', 'OPPORTUNITY_LOST', 'NOT_INTERESTED');

CREATE TABLE "visit_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "meeting_id" UUID NOT NULL,
    "status" "VisitReportStatus" NOT NULL DEFAULT 'DRAFT',
    "summary" TEXT,
    "needs" "VisitReportNeed"[] NOT NULL DEFAULT ARRAY[]::"VisitReportNeed"[],
    "solutions" "VisitReportSolution"[] NOT NULL DEFAULT ARRAY[]::"VisitReportSolution"[],
    "interest_level" "VisitReportInterestLevel",
    "outcome_result" "VisitReportOutcome",
    "submitted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "visit_reports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "visit_reports_meeting_id_key" ON "visit_reports"("meeting_id");
CREATE INDEX "visit_reports_status_idx" ON "visit_reports"("status");

ALTER TABLE "visit_reports"
    ADD CONSTRAINT "visit_reports_meeting_id_fkey"
    FOREIGN KEY ("meeting_id") REFERENCES "prospecting_meetings"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "visit_report_attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "report_id" UUID NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "file_mime" VARCHAR(120) NOT NULL,
    "file_data" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "visit_report_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "visit_report_attachments_report_id_idx" ON "visit_report_attachments"("report_id");

ALTER TABLE "visit_report_attachments"
    ADD CONSTRAINT "visit_report_attachments_report_id_fkey"
    FOREIGN KEY ("report_id") REFERENCES "visit_reports"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
