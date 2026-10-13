ALTER TABLE "superadmins" DROP COLUMN "mfa_hash",
ALTER COLUMN "status" SET DEFAULT 'PENDING';

ALTER TABLE "users" DROP COLUMN "mfa_hash";
