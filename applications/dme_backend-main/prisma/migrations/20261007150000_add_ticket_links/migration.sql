-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "related_company_id" UUID,
ADD COLUMN     "related_meeting_id" UUID;

-- CreateIndex
CREATE INDEX "tickets_related_company_id_idx" ON "tickets"("related_company_id");

-- CreateIndex
CREATE INDEX "tickets_created_at_idx" ON "tickets"("created_at");

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_related_company_id_fkey" FOREIGN KEY ("related_company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_related_meeting_id_fkey" FOREIGN KEY ("related_meeting_id") REFERENCES "prospecting_meetings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

