-- Opt-out for work notification emails (assignments, visits, tickets).
ALTER TABLE "users" ADD COLUMN "notify_work_updates" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "superadmins" ADD COLUMN "notify_work_updates" BOOLEAN NOT NULL DEFAULT true;
