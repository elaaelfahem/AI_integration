-- Additive only. Applied via `prisma db execute`.

ALTER TABLE "users" ADD COLUMN "avatar_mime" VARCHAR(120);
ALTER TABLE "users" ADD COLUMN "avatar_data" BYTEA;
ALTER TABLE "users" ADD COLUMN "notify_analysis_results" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "superadmins" ADD COLUMN "avatar_mime" VARCHAR(120);
ALTER TABLE "superadmins" ADD COLUMN "avatar_data" BYTEA;
ALTER TABLE "superadmins" ADD COLUMN "notify_analysis_results" BOOLEAN NOT NULL DEFAULT true;
