CREATE TYPE "SuperadminStatus" AS ENUM ('PENDING', 'ACTIVE');

ALTER TABLE "superadmins" DROP COLUMN "mfa_enabled",
ADD COLUMN     "status" "SuperadminStatus" NOT NULL DEFAULT 'ACTIVE';
