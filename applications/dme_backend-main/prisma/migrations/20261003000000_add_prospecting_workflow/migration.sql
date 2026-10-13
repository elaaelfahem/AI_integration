CREATE TYPE "ProspectingEntryStatus" AS ENUM ('SURFACED', 'SHORTLISTED', 'ASSIGNED', 'REMOVED');

CREATE TYPE "ProspectingRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

CREATE TABLE "prospecting_criteria" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "account_id" UUID NOT NULL,
    "sector" VARCHAR(120),
    "governorate" VARCHAR(60),
    "employee_range" VARCHAR(40),
    "query" VARCHAR(255),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prospecting_criteria_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "prospecting_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "requested_by_id" UUID NOT NULL,
    "status" "ProspectingRunStatus" NOT NULL DEFAULT 'RUNNING',
    "criteria" JSONB,
    "discovered_count" INTEGER NOT NULL DEFAULT 0,
    "qualified_count" INTEGER NOT NULL DEFAULT 0,
    "failure_message" VARCHAR(1000),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ,

    CONSTRAINT "prospecting_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "prospecting_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "added_by_id" UUID NOT NULL,
    "run_id" UUID,
    "status" "ProspectingEntryStatus" NOT NULL DEFAULT 'SURFACED',
    "score_snapshot" SMALLINT,
    "recommendation" VARCHAR(1000),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMPTZ,

    CONSTRAINT "prospecting_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "prospecting_criteria_account_id_key" ON "prospecting_criteria"("account_id");
CREATE INDEX "prospecting_runs_requested_by_id_created_at_idx" ON "prospecting_runs"("requested_by_id", "created_at");
CREATE INDEX "prospecting_runs_status_created_at_idx" ON "prospecting_runs"("status", "created_at");
CREATE UNIQUE INDEX "prospecting_entries_company_id_added_by_id_key" ON "prospecting_entries"("company_id", "added_by_id");
CREATE INDEX "prospecting_entries_added_by_id_status_updated_at_idx" ON "prospecting_entries"("added_by_id", "status", "updated_at");
CREATE INDEX "prospecting_entries_run_id_idx" ON "prospecting_entries"("run_id");

ALTER TABLE "prospecting_criteria" ADD CONSTRAINT "prospecting_criteria_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prospecting_runs" ADD CONSTRAINT "prospecting_runs_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prospecting_entries" ADD CONSTRAINT "prospecting_entries_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prospecting_entries" ADD CONSTRAINT "prospecting_entries_added_by_id_fkey" FOREIGN KEY ("added_by_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prospecting_entries" ADD CONSTRAINT "prospecting_entries_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "prospecting_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
