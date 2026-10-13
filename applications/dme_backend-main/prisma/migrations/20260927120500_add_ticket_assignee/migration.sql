-- Additive only. Applied via `prisma db execute`.

ALTER TABLE "tickets" ADD COLUMN "assigned_to_id" UUID;
CREATE INDEX "tickets_assigned_to_id_idx" ON "tickets"("assigned_to_id");
ALTER TABLE "tickets"
    ADD CONSTRAINT "tickets_assigned_to_id_fkey"
    FOREIGN KEY ("assigned_to_id") REFERENCES "accounts"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
