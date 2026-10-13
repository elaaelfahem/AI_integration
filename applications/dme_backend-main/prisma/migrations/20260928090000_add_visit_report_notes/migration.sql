-- Additive only. Applied via `prisma db execute`.

CREATE TABLE "visit_report_notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "report_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "visit_report_notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "visit_report_notes_report_id_created_at_idx" ON "visit_report_notes"("report_id", "created_at");

ALTER TABLE "visit_report_notes"
    ADD CONSTRAINT "visit_report_notes_report_id_fkey"
    FOREIGN KEY ("report_id") REFERENCES "visit_reports"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "visit_report_notes"
    ADD CONSTRAINT "visit_report_notes_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "accounts"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
