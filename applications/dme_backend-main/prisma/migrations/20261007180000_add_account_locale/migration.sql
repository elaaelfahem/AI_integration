-- Language of emails and notifications. Everyone starts in French.
ALTER TABLE "users" ADD COLUMN "locale" VARCHAR(5) NOT NULL DEFAULT 'fr';

ALTER TABLE "superadmins" ADD COLUMN "locale" VARCHAR(5) NOT NULL DEFAULT 'fr';
