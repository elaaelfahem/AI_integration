ALTER TABLE "users"
ADD COLUMN "failed_login_attempts" SMALLINT NOT NULL DEFAULT 0,
ADD COLUMN "locked_until" TIMESTAMPTZ;

ALTER TABLE "superadmins"
ADD COLUMN "failed_login_attempts" SMALLINT NOT NULL DEFAULT 0,
ADD COLUMN "locked_until" TIMESTAMPTZ;

CREATE TYPE "TokenType" AS ENUM ('MFA', 'PASSWORD_RESET', 'INVITE');

CREATE TABLE "tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "token_type" "TokenType" NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tokens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invite_tokens" (
    "id" UUID NOT NULL,
    "invited_email" VARCHAR(255) NOT NULL,
    "account_id" UUID,
    "invited_by_id" UUID NOT NULL,
    "role_to_assign" "UserRole" NOT NULL,
    "attempts" SMALLINT NOT NULL DEFAULT 0,

    CONSTRAINT "invite_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tokens_token_hash_key" ON "tokens"("token_hash");
CREATE INDEX "idx_tokens_expires_at" ON "tokens"("expires_at");
CREATE INDEX "idx_tokens_type" ON "tokens"("token_type");
CREATE INDEX "idx_invite_tokens_invited_email" ON "invite_tokens"("invited_email");
CREATE INDEX "idx_invite_tokens_invited_by_id" ON "invite_tokens"("invited_by_id");

ALTER TABLE "invite_tokens" ADD CONSTRAINT "invite_tokens_id_fkey" FOREIGN KEY ("id") REFERENCES "tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invite_tokens" ADD CONSTRAINT "invite_tokens_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invite_tokens" ADD CONSTRAINT "invite_tokens_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
