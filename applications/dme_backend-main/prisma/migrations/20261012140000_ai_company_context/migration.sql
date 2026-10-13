ALTER TABLE "companies" ADD COLUMN "ai_source_id" VARCHAR(255), ADD COLUMN "ai_context" JSONB;
CREATE UNIQUE INDEX "companies_created_by_id_ai_source_id_key" ON "companies"("created_by_id", "ai_source_id");
