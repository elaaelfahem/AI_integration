-- Restore the omitted prerequisite before the historical assignee migration.
CREATE TYPE "TicketType" AS ENUM ('TECHNICAL', 'CONNECTION', 'COMPANY', 'REPORT', 'AI', 'VISIT', 'OTHER');
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "TicketStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'RESOLVED');
CREATE TABLE "tickets" (
 "id" UUID NOT NULL DEFAULT gen_random_uuid(), "number" SERIAL NOT NULL,
 "type" "TicketType" NOT NULL, "subject" VARCHAR(160) NOT NULL, "description" TEXT NOT NULL,
 "priority" "TicketPriority" NOT NULL DEFAULT 'MEDIUM', "status" "TicketStatus" NOT NULL DEFAULT 'NEW',
 "attachment_name" VARCHAR(255), "attachment_mime" VARCHAR(120), "attachment_data" BYTEA,
 "created_by_id" UUID NOT NULL, "resolved_at" TIMESTAMPTZ,
 "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ NOT NULL,
 CONSTRAINT "tickets_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "tickets_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "tickets_status_idx" ON "tickets"("status");
CREATE INDEX "tickets_created_by_id_idx" ON "tickets"("created_by_id");
CREATE TABLE "ticket_replies" (
 "id" UUID NOT NULL DEFAULT gen_random_uuid(), "ticket_id" UUID NOT NULL, "author_id" UUID NOT NULL,
 "message" TEXT NOT NULL, "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ticket_replies_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "ticket_replies_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "ticket_replies_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ticket_replies_ticket_id_created_at_idx" ON "ticket_replies"("ticket_id", "created_at");
