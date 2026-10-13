-- CreateEnum
CREATE TYPE "ProspectionStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'VISITED', 'FOLLOW_UP', 'CONVERTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ReportVerdict" AS ENUM ('QUALIFIED_FOLLOW_UP', 'PENDING_INFORMATION', 'NOT_ELIGIBLE', 'CONVERTED');

-- CreateEnum
CREATE TYPE "ReportProcessingStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "prospections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "assignment_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "manager_id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "status" "ProspectionStatus" NOT NULL DEFAULT 'PLANNED',
    "notes" TEXT,
    "next_action" VARCHAR(1000),
    "follow_up_at" TIMESTAMPTZ,
    "started_at" TIMESTAMPTZ,
    "visited_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prospections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "prospection_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "original_payload" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "needs" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "objections" TEXT,
    "suggested_offer" TEXT,
    "next_action" VARCHAR(1000),
    "follow_up_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_processing_results" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "field_report_id" UUID NOT NULL,
    "status" "ReportProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "customer_context" TEXT,
    "structured_needs" TEXT,
    "objections" TEXT,
    "suggested_offer" TEXT,
    "visit_outcome" TEXT,
    "next_action" VARCHAR(1000),
    "follow_up_at" TIMESTAMPTZ,
    "verdict" "ReportVerdict",
    "reasons" TEXT,
    "failure_message" VARCHAR(1000),
    "processed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_processing_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "prospections_assignment_id_key" ON "prospections"("assignment_id");
CREATE INDEX "prospections_manager_id_status_updated_at_idx" ON "prospections"("manager_id", "status", "updated_at");
CREATE INDEX "prospections_agent_id_status_updated_at_idx" ON "prospections"("agent_id", "status", "updated_at");
CREATE INDEX "prospections_company_id_updated_at_idx" ON "prospections"("company_id", "updated_at");
CREATE UNIQUE INDEX "field_reports_prospection_id_key" ON "field_reports"("prospection_id");
CREATE INDEX "field_reports_created_by_id_created_at_idx" ON "field_reports"("created_by_id", "created_at");
CREATE UNIQUE INDEX "report_processing_results_field_report_id_key" ON "report_processing_results"("field_report_id");

-- AddForeignKey
ALTER TABLE "prospections" ADD CONSTRAINT "prospections_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prospections" ADD CONSTRAINT "prospections_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prospections" ADD CONSTRAINT "prospections_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "prospections" ADD CONSTRAINT "prospections_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "field_reports" ADD CONSTRAINT "field_reports_prospection_id_fkey" FOREIGN KEY ("prospection_id") REFERENCES "prospections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "field_reports" ADD CONSTRAINT "field_reports_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "report_processing_results" ADD CONSTRAINT "report_processing_results_field_report_id_fkey" FOREIGN KEY ("field_report_id") REFERENCES "field_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
