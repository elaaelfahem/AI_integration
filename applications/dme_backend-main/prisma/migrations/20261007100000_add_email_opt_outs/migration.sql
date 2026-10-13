-- Email preference keys a user turned off (see EMAIL_PREFERENCES in notification.types.ts).
ALTER TABLE "users" ADD COLUMN "email_opt_outs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "superadmins" ADD COLUMN "email_opt_outs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
