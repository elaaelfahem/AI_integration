CREATE TYPE "CompanyStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "AssignmentStatus" AS ENUM ('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "AssignmentPriority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');
CREATE TYPE "VisitType" AS ENUM ('FIRST_VISIT', 'FOLLOW_UP', 'DEMONSTRATION', 'CONTRACT', 'OTHER');

CREATE TABLE "companies" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(255) NOT NULL,
  "sector" VARCHAR(120),
  "contact_name" VARCHAR(160),
  "phone" VARCHAR(30),
  "email" VARCHAR(255),
  "address" VARCHAR(500),
  "notes" TEXT,
  "ai_score" SMALLINT,
  "status" "CompanyStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_by_id" UUID NOT NULL,
  "manager_id" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "companies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "companies_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "companies_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "assignments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "company_id" UUID NOT NULL,
  "manager_id" UUID NOT NULL,
  "agent_id" UUID NOT NULL,
  "scheduled_at" TIMESTAMPTZ NOT NULL,
  "duration_minutes" SMALLINT NOT NULL DEFAULT 60,
  "visit_type" "VisitType" NOT NULL DEFAULT 'FIRST_VISIT',
  "priority" "AssignmentPriority" NOT NULL DEFAULT 'MEDIUM',
  "objectives" TEXT,
  "status" "AssignmentStatus" NOT NULL DEFAULT 'PENDING',
  "cancellation_reason" TEXT,
  "completed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "assignments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "assignments_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "assignments_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "companies_name_idx" ON "companies"("name");
CREATE INDEX "companies_status_idx" ON "companies"("status");
CREATE INDEX "assignments_manager_id_status_idx" ON "assignments"("manager_id", "status");
CREATE INDEX "assignments_agent_id_scheduled_at_idx" ON "assignments"("agent_id", "scheduled_at");
CREATE INDEX "assignments_company_id_scheduled_at_idx" ON "assignments"("company_id", "scheduled_at");
