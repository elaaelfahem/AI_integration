CREATE TYPE "DataSourceType" AS ENUM ('OFFICIAL_REGISTRY', 'BUSINESS_DIRECTORY', 'MAPS', 'SOCIAL_NETWORK', 'COMPANY_WEBSITE', 'JOB_PLATFORM', 'OTHER');
CREATE TYPE "CollectionMethod" AS ENUM ('API', 'CRAWLING', 'IMPORT', 'MANUAL');
CREATE TYPE "CollectionJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE "CompanyHistoryAction" AS ENUM ('CREATED', 'UPDATED', 'ENRICHED');

CREATE TABLE "data_sources" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(160) NOT NULL,
    "type" "DataSourceType" NOT NULL,
    "collection_method" "CollectionMethod" NOT NULL,
    "configuration_reference" VARCHAR(255),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "retired_at" TIMESTAMPTZ,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "data_sources_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "data_sources_name_key" UNIQUE ("name"),
    CONSTRAINT "data_sources_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "collection_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "requested_by_id" UUID NOT NULL,
    "status" "CollectionJobStatus" NOT NULL DEFAULT 'QUEUED',
    "filters" JSONB,
    "discovered_count" INTEGER NOT NULL DEFAULT 0,
    "created_count" INTEGER NOT NULL DEFAULT 0,
    "enriched_count" INTEGER NOT NULL DEFAULT 0,
    "failure_message" VARCHAR(1000),
    "started_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "collection_jobs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "collection_jobs_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "data_source_collection_jobs" (
    "data_source_id" UUID NOT NULL,
    "collection_job_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "data_source_collection_jobs_pkey" PRIMARY KEY ("data_source_id", "collection_job_id"),
    CONSTRAINT "data_source_collection_jobs_data_source_id_fkey" FOREIGN KEY ("data_source_id") REFERENCES "data_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "data_source_collection_jobs_collection_job_id_fkey" FOREIGN KEY ("collection_job_id") REFERENCES "collection_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "company_source_evidence" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "data_source_id" UUID NOT NULL,
    "collection_job_id" UUID NOT NULL,
    "field_name" VARCHAR(100) NOT NULL,
    "field_value" VARCHAR(1000),
    "reference_label" VARCHAR(255),
    "collected_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "company_source_evidence_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "company_source_evidence_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "company_source_evidence_data_source_id_fkey" FOREIGN KEY ("data_source_id") REFERENCES "data_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "company_source_evidence_collection_job_id_fkey" FOREIGN KEY ("collection_job_id") REFERENCES "collection_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "company_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "actor_id" UUID,
    "action" "CompanyHistoryAction" NOT NULL,
    "summary" VARCHAR(500) NOT NULL,
    "details" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "company_history_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "company_history_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "company_history_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "idx_data_sources_available" ON "data_sources"("enabled", "retired_at");
CREATE INDEX "idx_data_sources_type" ON "data_sources"("type");
CREATE INDEX "idx_collection_jobs_status_created_at" ON "collection_jobs"("status", "created_at");
CREATE INDEX "idx_collection_jobs_requester_created_at" ON "collection_jobs"("requested_by_id", "created_at");
CREATE INDEX "idx_data_source_collection_jobs_job" ON "data_source_collection_jobs"("collection_job_id");
CREATE INDEX "idx_company_source_evidence_company_collected_at" ON "company_source_evidence"("company_id", "collected_at");
CREATE INDEX "idx_company_source_evidence_job" ON "company_source_evidence"("collection_job_id");
CREATE INDEX "idx_company_history_company_created_at" ON "company_history"("company_id", "created_at");
