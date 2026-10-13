CREATE TABLE "mfa_codes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "account_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "method" "MfaType" NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_codes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_mfa_codes_account_id" ON "mfa_codes"("account_id");

ALTER TABLE "mfa_codes" ADD CONSTRAINT "mfa_codes_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
