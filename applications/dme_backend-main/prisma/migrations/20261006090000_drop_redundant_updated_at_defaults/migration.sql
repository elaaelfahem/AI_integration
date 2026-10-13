-- Prisma's @updatedAt sets these columns on every write, so the database
-- defaults added by the prospection migrations are redundant and made the
-- live schema drift from schema.prisma.
ALTER TABLE "field_reports" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "prospecting_criteria" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "prospecting_entries" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "prospections" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "report_processing_results" ALTER COLUMN "updated_at" DROP DEFAULT;
